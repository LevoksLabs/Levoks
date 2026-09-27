import test from "node:test";
import assert from "node:assert/strict";
import { mkdir, writeFile } from "node:fs/promises";
import { spawn, type ChildProcess } from "node:child_process";
import { createServer } from "node:net";
import { createRequire } from "node:module";
import { randomBytes } from "node:crypto";
import path from "node:path";
import { MongoMemoryServer } from "mongodb-memory-server";
import { MongoClient } from "mongodb";
import { block, programFixture } from "../helpers/program-fixture";
import { emptyProject } from "../../src/lib/project/workspace";
import { parseProject, serviceSlug } from "../../src/lib/project/schema";
import { compileProject } from "../../src/lib/project/compiler";

test(
  "generated servers enforce endpoint, service and backend quotas with HTTP retry headers and recovery",
  { timeout: 120000 },
  async () => {
    const root = path.resolve(".verification/runtime-test/rate-limit-test");
    const secret = randomBytes(32).toString("hex");
    const jwt = createRequire(path.join(root, "entry.cjs"))("jsonwebtoken");
    const base = programFixture();
    const services = [
      {
        ...base,
        id: "limited",
        name: "Limited API",
        blocks: [
          block("limit", "middleware", {
            middlewareType: "rateLimit",
            scope: "endpoints",
            rateLimit: 2,
            rateLimitWindow: 1 / 60,
            rateLimitMessage: "Report quota exceeded",
          }),
          block("one", "rest_endpoint", {
            route: "/limited",
            middlewareIds: ["limit"],
          }),
          block("two", "rest_endpoint", {
            route: "/limited/:name",
            middlewareIds: ["limit"],
          }),
          block("public", "rest_endpoint", { route: "/public" }),
          block("post", "rest_endpoint", { route: "/limited", method: "POST" }),
        ],
      },
      {
        ...base,
        id: "service",
        name: "Service API",
        port: 3002,
        blocks: [
          block("local-limit", "middleware", {
            middlewareType: "rateLimit",
            scope: "service",
            rateLimit: 1,
            rateLimitWindow: 1,
          }),
          block("local-one", "rest_endpoint", { route: "/one" }),
          block("local-two", "rest_endpoint", { route: "/two" }),
        ],
      },
      {
        ...base,
        id: "global",
        name: "Global API",
        port: 3003,
        blocks: [
          // Block IDs are service-local; the imported global block must not
          // shadow the identically named endpoint limiter in Limited API.
          block("limit", "middleware", {
            middlewareType: "rateLimit",
            scope: "backend",
            rateLimit: 12,
            rateLimitWindow: 1,
            rateLimitMessage: "Backend quota exceeded",
          }),
          block("global-one", "rest_endpoint", { route: "/one" }),
        ],
      },
    ];
    services.push({
      ...base,
      id: "replicas",
      name: "Replica API",
      port: 3004,
      blocks: [
        block("shared-limit", "middleware", {
          middlewareType: "rateLimit",
          scope: "endpoints",
          rateLimit: 3,
          rateLimitWindow: 1,
          rateLimitStore: "mongodb",
          rateLimitMessage: "Shared quota exceeded",
        }),
        block("shared-one", "rest_endpoint", {
          route: "/shared",
          middlewareIds: ["shared-limit"],
        }),
      ],
    });
    services.push({
      ...base,
      id: "identities",
      name: "Identity Quota API",
      port: 3005,
      blocks: [
        block("user-limit", "middleware", {
          middlewareType: "rateLimit",
          scope: "endpoints",
          rateLimitKey: "identity",
          rateLimit: 1,
          rateLimitWindow: 1,
          rateLimitStore: "mongodb",
          rateLimitMessage: "User quota exceeded",
        }),
        block("user-route", "rest_endpoint", {
          route: "/report",
          authRequired: true,
          middlewareIds: ["user-limit"],
        }),
      ],
    });
    const project = emptyProject();
    const output = compileProject(
      parseProject({ ...project, backend: { ...project.backend, services } }),
    );
    assert.deepEqual(
      output.diagnostics.filter((issue) => issue.severity === "error"),
      [],
    );
    for (const [file, source] of Object.entries(output.files))
      if (file.startsWith("backend/")) {
        const target = path.join(root, file.slice(8));
        await mkdir(path.dirname(target), { recursive: true });
        await writeFile(target, source);
      }
    const mongo = await MongoMemoryServer.create({
      binary: { downloadDir: path.resolve(".verification/mongodb-bin") },
      instance: { ip: "127.0.0.1" },
    });
    const children: ChildProcess[] = [];
    try {
      const origins: string[] = [];
      const start = async (service: (typeof services)[number]) => {
        const reservation = createServer();
        await new Promise<void>((resolve) =>
          reservation.listen(0, "127.0.0.1", resolve),
        );
        const port = (reservation.address() as { port: number }).port;
        await new Promise<void>((resolve) =>
          reservation.close(() => resolve()),
        );
        const child = spawn(
          process.execPath,
          [path.join(root, serviceSlug(service.name), "server.js")],
          {
            env: {
              ...process.env,
              PORT: String(port),
              MONGO_URI: mongo.getUri(service.id),
              JWT_SECRET: secret,
              NODE_ENV: "production",
            },
            windowsHide: true,
            stdio: ["ignore", "pipe", "pipe"],
          },
        );
        children.push(child);
        let logs = "";
        child.stdout!.on("data", (data) => {
          logs += data.toString();
        });
        child.stderr!.on("data", (data) => {
          logs += data.toString();
        });
        const origin = `http://127.0.0.1:${port}`;
        let ready = false;
        for (let attempt = 0; attempt < 100; attempt++) {
          try {
            const response = await fetch(origin + "/health", {
              signal: AbortSignal.timeout(1000),
            });
            await response.body?.cancel();
            if (response.ok) {
              ready = true;
              break;
            }
          } catch {}
          if (child.exitCode !== null) break;
          await new Promise((resolve) => setTimeout(resolve, 100));
        }
        assert.ok(ready, logs);
        return origin;
      };
      for (const service of services) origins.push(await start(service));
      const request = async (origin: string, route: string, method = "GET") => {
        const response = await fetch(origin + route, { method });
        return {
          status: response.status,
          headers: response.headers,
          body: await response.json(),
        };
      };
      assert.equal((await request(origins[0], "/limited")).status, 200);
      assert.equal((await request(origins[0], "/limited/report")).status, 200);
      const limited = await request(origins[0], "/limited");
      assert.equal(limited.status, 429);
      assert.deepEqual(limited.body, { error: "Report quota exceeded" });
      assert.ok(Number(limited.headers.get("retry-after")) >= 1);
      assert.match(limited.headers.get("ratelimit") || "", /remaining=0/);
      assert.equal((await request(origins[0], "/public")).status, 200);
      assert.equal((await request(origins[0], "/limited", "POST")).status, 200);
      await new Promise((resolve) => setTimeout(resolve, 1100));
      assert.equal((await request(origins[0], "/limited")).status, 200);
      assert.equal((await request(origins[1], "/one")).status, 200);
      assert.equal((await request(origins[1], "/two")).status, 429);
      assert.equal((await request(origins[2], "/one")).status, 200);
      // Backend policy is installed in the first service as well as its owner.
      let exhausted;
      for (let attempt = 0; attempt < 13; attempt++) {
        exhausted = await request(origins[0], "/public");
        if (exhausted.status === 429) break;
      }
      assert.equal(exhausted?.status, 429);
      assert.deepEqual(exhausted?.body, { error: "Backend quota exceeded" });
      assert.equal(
        (await request(origins[2], "/one")).status,
        200,
        "backend policy has independent counters per process",
      );
      assert.equal(
        (await request(origins[0], "/health")).status,
        200,
        "health probes are not throttled",
      );
      const byUser = async (
        claims?: object,
        headers: Record<string, string> = {},
        key = secret,
      ) => {
        const response = await fetch(origins[4] + "/report", {
          headers: {
            ...(claims
              ? {
                  Authorization: `Bearer ${jwt.sign(claims, key, { algorithm: "HS256", expiresIn: "5m" })}`,
                }
              : {}),
            ...headers,
          },
        });
        return { status: response.status, body: await response.json() };
      };
      assert.equal((await byUser()).status, 401);
      assert.equal(
        (await byUser({ sub: "alice", tenantId: "A" }, {}, "wrong-signing-key"))
          .status,
        401,
      );
      assert.equal((await byUser({ sub: 123, tenantId: "A" })).status, 401);
      assert.equal((await byUser({ sub: "alice", tenantId: "A" })).status, 200);
      assert.equal(
        (await byUser({ sub: "bob", tenantId: "A" })).status,
        200,
        "users sharing a gateway IP have independent quotas",
      );
      assert.equal(
        (await byUser({ sub: "alice", tenantId: "B" })).status,
        200,
        "identical subject IDs in separate tenants have independent quotas",
      );
      const quota = await byUser(
        { sub: "alice", tenantId: "A" },
        { "X-User-Id": "mallory", "X-Tenant-Id": "B" },
      );
      assert.equal(quota.status, 429);
      assert.deepEqual(quota.body, { error: "User quota exceeded" });
      assert.equal(
        (await byUser({ sub: "alice" })).status,
        200,
        "single-tenant identities remain supported",
      );
      const replica = await start(services[3]);
      const concurrent = await Promise.all(
        Array.from({ length: 6 }, (_, i) =>
          request(i % 2 ? replica : origins[3], "/shared"),
        ),
      );
      assert.equal(
        concurrent.filter((response) => response.status === 200).length,
        3,
      );
      for (const response of concurrent.filter(
        (response) => response.status !== 200,
      )) {
        assert.equal(response.status, 429);
        assert.deepEqual(response.body, { error: "Shared quota exceeded" });
      }
      const restarted = children[children.length - 1];
      const exited = new Promise<void>((resolve) =>
        restarted.once("exit", () => resolve()),
      );
      restarted.kill();
      await exited;
      const restartedOrigin = await start(services[3]);
      const persisted = await request(restartedOrigin, "/shared");
      assert.equal(
        persisted.status,
        429,
        "restarting a replica does not reset the shared quota",
      );
      assert.deepEqual(persisted.body, { error: "Shared quota exceeded" });
      const client = await MongoClient.connect(mongo.getUri("replicas"));
      try {
        const counters = client.db().collection("levoks_rate_limits");
        const rows = await counters.find().toArray();
        assert.equal(rows.length, 1);
        assert.match(String(rows[0]._id), /^[a-f0-9]{64}$/);
        assert.equal(rows[0].totalHits, 7);
        assert.ok(
          (await counters.indexes()).some(
            (index) => index.expireAfterSeconds === 0,
          ),
        );
        await counters.updateOne(
          { _id: rows[0]._id },
          { $set: { resetTime: new Date(0) } },
        );
        assert.equal(
          (await request(restartedOrigin, "/shared")).status,
          200,
          "expired quota resets without depending on the TTL cleanup schedule",
        );
      } finally {
        await client.close();
      }
      await mongo.stop();
      const failed = await request(restartedOrigin, "/shared");
      assert.equal(failed.status, 503, "database outage fails closed");
      assert.equal(failed.body.error.code, "unavailable");
      assert.doesNotMatch(
        JSON.stringify(failed.body),
        /mongodb|127\.0\.0\.1|Shared quota/i,
      );
    } finally {
      await Promise.all(
        children.map(async (child) => {
          if (child.exitCode === null && child.signalCode === null) {
            const exited = new Promise<void>((resolve) =>
              child.once("exit", () => resolve()),
            );
            child.kill();
            await exited;
          }
        }),
      );
      await mongo.stop();
    }
  },
);
