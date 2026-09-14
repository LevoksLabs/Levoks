import test from "node:test";
import assert from "node:assert/strict";
import { randomBytes } from "node:crypto";
import { spawn } from "node:child_process";
import { createServer } from "node:net";
import { mkdir, writeFile } from "node:fs/promises";
import { MongoClient } from "mongodb";
import { MongoMemoryServer } from "mongodb-memory-server";
import path from "node:path";
import {
  emptyProject,
  restoreProject,
  captureProject,
} from "../../src/lib/project/workspace";
import { useBackendStore } from "../../src/store/backendStore";
import { compileProject } from "../../src/lib/project/compiler";
import {
  DEFAULT_AUTH_CONFIG,
  DEFAULT_ENDPOINT_CONFIG,
} from "../../src/types/backend";
async function availablePort() {
  const listener = createServer();
  await new Promise<void>((resolve) =>
    listener.listen(0, "127.0.0.1", resolve),
  );
  const port = (listener.address() as { port: number }).port;
  await new Promise<void>((resolve) => listener.close(() => resolve()));
  return port;
}

test(
  "generated identity HTTP rotates refresh tokens, detects replay, revokes sessions and invalidates changed passwords",
  { timeout: 180000 },
  async () => {
    const mongo = await MongoMemoryServer.create({
      binary: { downloadDir: path.resolve(".verification/mongodb-bin") },
      instance: { ip: "127.0.0.1" },
    });
    const dbClient = await MongoClient.connect(mongo.getUri());
    const db = dbClient.db("identity_lifecycle");
    const project = emptyProject("Identity verification");
    restoreProject(project);
    useBackendStore.getState().loadAuthTemplate();
    const identityService = useBackendStore.getState().services[0];
    useBackendStore.setState({
      services: [
        identityService,
        {
          id: "resource-service",
          name: "Resource Service",
          port: 3010,
          description: "Protected resource",
          color: "#333333",
          collapsed: false,
          blocks: [
            {
              id: "identity-binding",
              type: "auth_block",
              label: "Identity session",
              config: {
                ...DEFAULT_AUTH_CONFIG,
                identityServiceId: identityService.id,
              },
              position: { x: 0, y: 0 },
              connections: [],
            },
            {
              id: "private",
              type: "rest_endpoint",
              label: "Private",
              config: {
                ...DEFAULT_ENDPOINT_CONFIG,
                method: "GET",
                route: "/private",
                authRequired: true,
                description: "Authenticated resource",
              },
              position: { x: 0, y: 0 },
              connections: [],
            },
          ],
        },
      ],
    });
    const output = compileProject(captureProject(project.id, project.name));
    assert.deepEqual(
      output.diagnostics.filter((d) => d.severity === "error"),
      [],
    );
    const root = path.resolve(".verification/runtime-test/identity-runtime");
    for (const [file, source] of Object.entries(output.files)) {
      if (!file.startsWith("backend/")) continue;
      const destination = path.join(root, file.slice("backend/".length));
      await mkdir(path.dirname(destination), { recursive: true });
      await writeFile(destination, source);
    }
    const port = await availablePort(),
      resourcePort = await availablePort();
    const origin = `http://127.0.0.1:${port}`;
    const sharedSecret = randomBytes(32).toString("hex");
    const child = spawn(
      process.execPath,
      [path.join(root, "auth-service/server.js")],
      {
        env: {
          ...process.env,
          PORT: String(port),
          MONGO_URI: mongo.getUri("identity_lifecycle"),
          JWT_SECRET: sharedSecret,
          CORS_ORIGINS: origin,
          NODE_ENV: "production",
        },
        stdio: ["ignore", "pipe", "pipe"],
        windowsHide: true,
      },
    );
    const resource = spawn(
      process.execPath,
      [path.join(root, "resource-service/server.js")],
      {
        env: {
          ...process.env,
          PORT: String(resourcePort),
          MONGO_URI: mongo.getUri("resource_database"),
          JWT_SECRET: sharedSecret,
          AUTH_IDENTITY_ORIGIN: origin,
          CORS_ORIGINS: origin,
          NODE_ENV: "production",
        },
        stdio: ["ignore", "pipe", "pipe"],
        windowsHide: true,
      },
    );
    const protectedRequest = (cookie: string) =>
      fetch(`http://127.0.0.1:${resourcePort}/private`, {
        headers: { Cookie: cookie },
      });
    let logs = "";
    child.stdout.on("data", (v) => {
      logs = (logs + v).slice(-10000);
    });
    child.stderr.on("data", (v) => {
      logs = (logs + v).slice(-10000);
    });
    resource.stdout.on("data", (v) => {
      logs = (logs + v).slice(-10000);
    });
    resource.stderr.on("data", (v) => {
      logs = (logs + v).slice(-10000);
    });
    const call = (
      action: string,
      body?: object,
      cookie = "",
      method = "POST",
      from = origin,
    ) =>
      fetch(`${origin}/api/auth/${action}`, {
        method,
        headers: {
          Origin: from,
          "Content-Type": "application/json",
          ...(cookie ? { Cookie: cookie } : {}),
        },
        ...(method === "GET" ? {} : { body: JSON.stringify(body || {}) }),
      });
    const cookies = (response: Response) =>
      response.headers
        .getSetCookie()
        .map((v) => v.split(";")[0])
        .join("; ");
    const login = async (
      email = "alice@example.test",
      password = "correct-password-123",
    ) => {
      const r = await call("login", { email, password });
      assert.equal(r.status, 200, await r.clone().text());
      return cookies(r);
    };
    try {
      let ready = false;
      for (let i = 0; i < 100; i++) {
        try {
          if (
            (await fetch(origin + "/health")).ok &&
            (await fetch(`http://127.0.0.1:${resourcePort}/health`)).ok
          ) {
            ready = true;
            break;
          }
        } catch {}
        if (child.exitCode !== null || resource.exitCode !== null) break;
        await new Promise((r) => setTimeout(r, 100));
      }
      assert.ok(ready, logs);
      await db.collection("users").createIndex({ email: 1 }, { unique: true });
      const register = await call("register", {
        email: "ALICE@example.test",
        password: "correct-password-123",
        name: "Alice",
        role: "admin",
      });
      assert.equal(register.status, 201);
      assert.doesNotMatch(await register.text(), /password|authVersion/);
      const user = await db
        .collection("users")
        .findOne({ email: "alice@example.test" });
      assert.ok(user);
      assert.equal(user.role, "user");
      assert.notEqual(user.password, "correct-password-123");
      const original = await login();
      assert.match(original, /levoks_refresh_3001=/);
      assert.match(original, /levoks_session_3001=/);
      assert.equal(
        (await call("profile", undefined, original, "GET")).status,
        200,
      );
      assert.equal(
        (await protectedRequest(original)).status,
        200,
        "a separately deployed resource validates the identity session",
      );
      const rows = await db
        .collection("levoksidentitysessions")
        .find({})
        .toArray();
      assert.equal(rows.length, 1);
      assert.doesNotMatch(
        JSON.stringify(rows),
        /levoks_session_3001|levoks_refresh_3001/,
      );
      const refreshSecret = decodeURIComponent(
        original.split("levoks_refresh_3001=")[1],
      ).split(".")[1];
      assert.ok(
        !JSON.stringify(rows).includes(refreshSecret),
        "refresh secrets are stored only as hashes",
      );
      const forbidden = await call(
        "refresh",
        {},
        original,
        "POST",
        "https://attacker.test",
      );
      assert.equal(forbidden.status, 403);
      const refreshed = await call("refresh", {}, original);
      assert.equal(refreshed.status, 204);
      const rotated = cookies(refreshed);
      assert.notEqual(rotated, original);
      const invalidSecret = rotated.replace(
        /(levoks_refresh_3001=[^.;]+)[^;]*/,
        `$1.${"a".repeat(43)}`,
      );
      assert.equal((await call("refresh", {}, invalidSecret)).status, 401);
      assert.equal(
        (await call("profile", undefined, rotated, "GET")).status,
        200,
      );
      assert.equal(
        (await call("refresh", {}, original)).status,
        401,
        "consumed refresh token cannot be used twice",
      );
      assert.equal(
        (await call("profile", undefined, rotated, "GET")).status,
        401,
        "replay revokes the entire session family",
      );
      assert.equal(
        (await protectedRequest(rotated)).status,
        401,
        "revocation reaches other services through introspection",
      );
      const first = await login(),
        second = await login();
      const sessionResponse = await call("sessions", undefined, first, "GET");
      assert.equal(sessionResponse.status, 200);
      const sessions = await sessionResponse.json();
      assert.equal(sessions.length, 2);
      assert.doesNotMatch(
        JSON.stringify(sessions),
        /refreshHash|usedHashes|authVersion|password/,
      );
      assert.equal((await call("logout", {}, first)).status, 204);
      assert.equal(
        (await call("profile", undefined, first, "GET")).status,
        401,
      );
      assert.equal(
        (await call("profile", undefined, second, "GET")).status,
        200,
      );
      assert.equal(
        (
          await call(
            "change-password",
            {
              currentPassword: "wrong",
              newPassword: "replacement-password-456",
            },
            second,
          )
        ).status,
        401,
      );
      assert.equal(
        (
          await call(
            "change-password",
            {
              currentPassword: "correct-password-123",
              newPassword: "replacement-password-456",
            },
            second,
          )
        ).status,
        204,
      );
      assert.equal(
        (await call("profile", undefined, second, "GET")).status,
        401,
      );
      assert.equal(
        (await protectedRequest(second)).status,
        401,
        "password changes revoke access in the resource service too",
      );
      assert.equal((await call("refresh", {}, second)).status, 401);
      assert.equal(
        (
          await call("login", {
            email: "alice@example.test",
            password: "correct-password-123",
          })
        ).status,
        401,
      );
      const newLogin = await login(
        "alice@example.test",
        "replacement-password-456",
      );
      const concurrent = await Promise.all([
        call("refresh", {}, newLogin),
        call("refresh", {}, newLogin),
      ]);
      assert.deepEqual(
        concurrent.map((r) => r.status).sort(),
        [204, 401],
        "only one concurrent refresh consumes the token",
      );
      const winner = cookies(concurrent.find((r) => r.status === 204)!);
      assert.equal(
        (await call("profile", undefined, winner, "GET")).status,
        401,
        "concurrent reuse revokes the family",
      );
      const active = await login(
        "alice@example.test",
        "replacement-password-456",
      );
      await db
        .collection("users")
        .updateOne({ _id: user._id }, { $set: { disabledAt: new Date() } });
      assert.equal(
        (await call("profile", undefined, active, "GET")).status,
        401,
      );
      assert.equal(
        (
          await call("login", {
            email: "alice@example.test",
            password: "replacement-password-456",
          })
        ).status,
        401,
      );
    } finally {
      resource.kill();
      if (resource.exitCode === null)
        await new Promise<void>((resolve) =>
          resource.once("exit", () => resolve()),
        );
      child.kill();
      if (child.exitCode === null)
        await new Promise<void>((resolve) =>
          child.once("exit", () => resolve()),
        );
      await dbClient.close();
      await mongo.stop();
    }
  },
);
