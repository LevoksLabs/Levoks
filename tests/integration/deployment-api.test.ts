import test from "node:test";
import assert from "node:assert/strict";
import { spawn, execFileSync } from "node:child_process";
import { randomBytes, randomUUID } from "node:crypto";
import { createServer } from "node:net";
import { setTimeout } from "node:timers/promises";
import path from "node:path";
import { MongoMemoryServer } from "mongodb-memory-server";
import { MongoClient } from "mongodb";
import { encode } from "next-auth/jwt";
import { Deployments } from "../../src/lib/server/deployments";
import { MongoVault } from "../../src/lib/server/vault";
import { emptyProject } from "../../src/lib/project/workspace";

test(
  "real Next deployment API enforces sessions, account changes, same origin and concurrent queue revisions",
  { timeout: 180000 },
  async (t) => {
    const database = await MongoMemoryServer.create({
      binary: { downloadDir: path.resolve(".verification/mongodb-bin") },
      instance: { ip: "127.0.0.1" },
    });
    t.after(() => database.stop());
    const client = await MongoClient.connect(database.getUri("deployment_api"));
    t.after(() => client.close());
    const ring = { active: "test", keys: { test: randomBytes(32) } };
    const project = emptyProject("API acceptance");
    const alice = "google:alice";
    const bob = "google:bob";
    const realFetch = globalThis.fetch;
    t.mock.method(
      globalThis,
      "fetch",
      (url: string | URL | Request, init?: RequestInit) => {
        if (String(url).startsWith("https://api.vercel.com/"))
          return Promise.resolve(
            Response.json({
              id: "prj_test",
              name: "preview",
              framework: "nextjs",
            }),
          );
        return realFetch(url, init);
      },
    );
    await new Deployments(
      client.db(),
      new MongoVault(client.db(), ring),
    ).connect(
      alice,
      project.id,
      { name: "preview", providerProjectId: "prj_test" },
      "fixture-provider-token",
      0,
    );
    const reservation = createServer();
    await new Promise<void>((resolve) =>
      reservation.listen(0, "127.0.0.1", resolve),
    );
    const port = (reservation.address() as { port: number }).port;
    await new Promise<void>((resolve) => reservation.close(() => resolve()));
    const origin = `http://127.0.0.1:${port}`;
    const secret = randomBytes(32).toString("hex");
    const server = spawn(
      process.execPath,
      [
        "node_modules/next/dist/bin/next",
        "dev",
        "--hostname",
        "127.0.0.1",
        "--port",
        String(port),
      ],
      {
        windowsHide: true,
        stdio: ["ignore", "pipe", "pipe"],
        env: {
          ...process.env,
          NODE_ENV: "development",
          LEVOKS_E2E: "1",
          LEVOKS_DEPLOYMENT_API_TEST: "1",
          NEXT_TELEMETRY_DISABLED: "1",
          NEXTAUTH_URL: origin,
          NEXTAUTH_SECRET: secret,
          MONGODB_URI: database.getUri("deployment_api"),
          LEVOKS_ACTIVE_SECRET_KEY: "test",
          LEVOKS_SECRET_KEYS: JSON.stringify({
            test: ring.keys.test.toString("base64"),
          }),
          GITHUB_ID: "",
          GITHUB_SECRET: "",
          GOOGLE_ID: "",
          GOOGLE_SECRET: "",
        },
      },
    );
    let logs = "";
    server.stdout.on("data", (chunk) => {
      logs = (logs + chunk).slice(-12000);
    });
    server.stderr.on("data", (chunk) => {
      logs = (logs + chunk).slice(-12000);
    });
    t.after(async () => {
      if (server.exitCode === null && server.signalCode === null)
        await new Promise<void>((resolve) => {
          server.once("exit", () => resolve());
          if (process.platform === "win32")
            execFileSync("taskkill", ["/PID", String(server.pid), "/T", "/F"], {
              windowsHide: true,
              stdio: "ignore",
            });
          else server.kill("SIGTERM");
        });
    });
    let ready = false;
    for (let attempt = 0; attempt < 120; attempt++) {
      assert.equal(server.exitCode, null, logs);
      try {
        const response = await fetch(
          `${origin}/api/deploy?projectId=${project.id}`,
          { signal: AbortSignal.timeout(2000) },
        );
        await response.body?.cancel();
        if (response.status === 401) {
          ready = true;
          break;
        }
      } catch {
        /* Route cold start. */
      }
      await setTimeout(500);
    }
    assert.ok(ready, logs);
    const cookies = new Map<string, string>();
    for (const owner of [alice, bob])
      cookies.set(
        owner,
        `next-auth.session-token=${await encode({ token: { id: owner, sub: owner }, secret, maxAge: 3600 })}`,
      );
    async function request(
      owner: string,
      body?: object,
      requestOrigin = origin,
    ) {
      const response = await fetch(
        `${origin}/api/deploy?projectId=${project.id}`,
        {
          method: body ? "POST" : "GET",
          headers: {
            Cookie: cookies.get(owner) || "",
            Origin: requestOrigin,
            "Content-Type": "application/json",
          },
          ...(body ? { body: JSON.stringify(body) } : {}),
        },
      );
      return {
        status: response.status,
        body: await response.json(),
        cache: response.headers.get("cache-control"),
      };
    }
    const payload = {
      action: "deploy",
      ownerId: alice,
      projectId: project.id,
      project,
      environment: {},
      version: 1,
      sequence: 0,
      operationId: randomUUID(),
    };
    assert.equal((await request("anonymous", payload)).status, 401);
    assert.equal((await request(bob, payload)).status, 409);
    assert.equal(
      (await request(bob, { ...payload, ownerId: bob })).status,
      404,
    );
    assert.equal(
      (await request(alice, payload, "https://foreign.example")).status,
      403,
    );
    assert.equal(
      (await request(alice, { ...payload, operationId: "bad" })).status,
      400,
    );
    const results = await Promise.all([
      request(alice, payload),
      request(alice, payload),
    ]);
    assert.ok(
      results.every((result) => result.status === 200),
      JSON.stringify(results) + logs,
    );
    assert.equal(
      (await request(alice, { ...payload, operationId: randomUUID() })).status,
      409,
    );
    const saved = await request(alice);
    assert.equal(saved.cache, "no-store");
    assert.equal(saved.body.connection.history.length, 1);
    assert.equal(saved.body.connection.sequence, 1);
    assert.doesNotMatch(
      JSON.stringify(saved.body),
      /fixture-provider-token|secretName|snapshot|lease/,
    );
    assert.equal((await request(bob)).body.connection, null);
    assert.equal(
      (
        await request(alice, {
          action: "cancel",
          ownerId: alice,
          projectId: project.id,
          operationId: payload.operationId,
        })
      ).status,
      200,
    );
    assert.equal(
      (await request(alice)).body.connection.history[0].state,
      "canceled",
    );
  },
);
