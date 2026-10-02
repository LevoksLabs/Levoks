import test from "node:test";
import assert from "node:assert/strict";
import { spawn, execFileSync } from "node:child_process";
import { randomBytes } from "node:crypto";
import { createServer } from "node:net";
import { setTimeout as delay } from "node:timers/promises";
import path from "node:path";
import { MongoMemoryServer } from "mongodb-memory-server";
import { MongoClient } from "mongodb";
import { encode } from "next-auth/jwt";
import { emptyProject } from "../../src/lib/project/workspace";

test(
  "cloud API authenticates real sessions and atomically isolates concurrent MongoDB saves",
  { timeout: 180000 },
  async (t) => {
    const database = await MongoMemoryServer.create({
      binary: { downloadDir: path.resolve(".verification/mongodb-bin") },
      instance: { ip: "127.0.0.1" },
    });
    t.after(() => database.stop());
    const client = await MongoClient.connect(database.getUri("cloud_projects"));
    t.after(() => client.close());
    const reservation = createServer();
    await new Promise<void>((resolve) =>
      reservation.listen(0, "127.0.0.1", resolve),
    );
    const port = (reservation.address() as { port: number }).port;
    await new Promise<void>((resolve) => reservation.close(() => resolve()));
    const origin = `http://127.0.0.1:${port}`;
    const secret = randomBytes(32).toString("hex");
    // Run the actual Next request/auth boundary. No production credentials or
    // OAuth provider are needed for locally signed JWTs.
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
          NEXT_TELEMETRY_DISABLED: "1",
          NEXTAUTH_URL: origin,
          NEXTAUTH_SECRET: secret,
          MONGODB_URI: database.getUri("cloud_projects"),
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
      if (server.exitCode === null && server.signalCode === null) {
        await new Promise<void>((resolve) => {
          server.once("exit", () => resolve());
          if (process.platform === "win32")
            execFileSync("taskkill", ["/PID", String(server.pid), "/T", "/F"], {
              windowsHide: true,
              stdio: "ignore",
            });
          else server.kill("SIGTERM");
        });
      }
    });
    let ready = false;
    for (let attempt = 0; attempt < 120; attempt++) {
      t.signal.throwIfAborted();
      assert.equal(server.exitCode, null, logs);
      try {
        const response = await fetch(`${origin}/api/projects`, {
          signal: AbortSignal.timeout(2000),
        });
        await response.body?.cancel();
        if (response.status === 401) {
          ready = true;
          break;
        }
      } catch {
        /* Wait for Next to compile the actual route. */
      }
      await delay(500);
    }
    assert.ok(ready, logs);
    const cookies = new Map<string, string>();
    for (const ownerId of ["github:alice", "google:bob"]) {
      cookies.set(
        ownerId,
        `next-auth.session-token=${await encode({ token: { id: ownerId, sub: ownerId }, secret, maxAge: 3600 })}`,
      );
    }
    async function request(ownerId: string, body?: unknown, query = "") {
      const response = await fetch(`${origin}/api/projects${query}`, {
        method: body === undefined ? "GET" : "PUT",
        headers: {
          Cookie: cookies.get(ownerId) || "",
          Origin: origin,
          "Content-Type": "application/json",
        },
        ...(body === undefined ? {} : { body: JSON.stringify(body) }),
      });
      return {
        status: response.status,
        body: await response.json(),
        cache: response.headers.get("cache-control"),
      };
    }
    const project = emptyProject("Original cloud document");
    const alice = "github:alice",
      bob = "google:bob";
    const payload = (
      ownerId: string,
      revision: number,
      name = project.name,
    ) => ({ ownerId, revision, project: { ...project, name } });
    assert.equal((await request("anonymous", payload(alice, 0))).status, 401);
    const changedAccount = await request(alice, payload(bob, 0));
    assert.equal(
      changedAccount.status,
      409,
      JSON.stringify(changedAccount) + "\n" + logs,
    );
    assert.equal(
      (
        await request(alice, {
          ...payload(alice, 0),
          project: { ...project, schemaVersion: 999 },
        })
      ).status,
      400,
    );
    assert.equal(
      await client.db().collection("levoks_projects").countDocuments(),
      0,
    );

    const creates = await Promise.all(
      Array.from({ length: 8 }, (_, index) =>
        request(alice, payload(alice, 0, `Create ${index}`)),
      ),
    );
    assert.equal(creates.filter((result) => result.status === 200).length, 1);
    assert.equal(creates.filter((result) => result.status === 409).length, 7);
    const writes = await Promise.all(
      Array.from({ length: 8 }, (_, index) =>
        request(alice, payload(alice, 1, `Update ${index}`)),
      ),
    );
    assert.equal(writes.filter((result) => result.status === 200).length, 1);
    assert.equal(writes.filter((result) => result.status === 409).length, 7);
    const saved = await request(alice, undefined, `?id=${project.id}`);
    assert.equal(saved.status, 200);
    assert.equal(saved.body.revision, 2);
    assert.equal(saved.cache, "no-store");
    assert.match(saved.body.document.name, /^Update /);
    assert.equal(
      (await request(alice, payload(alice, 1, "Stale overwrite"))).status,
      409,
    );
    assert.deepEqual(
      (await request(alice, undefined, `?id=${project.id}`)).body,
      saved.body,
    );

    assert.equal(
      (await request(bob, undefined, `?id=${project.id}`)).status,
      404,
    );
    assert.deepEqual((await request(bob)).body, []);
    assert.equal(
      (await request(bob, payload(bob, 2, "Wrong account overwrite"))).status,
      409,
    );
    assert.equal(
      (await request(bob, payload(bob, 0, "Bob's independent project"))).status,
      200,
    );
    assert.deepEqual(
      (await request(alice, undefined, `?id=${project.id}`)).body,
      saved.body,
    );
    const list = await request(bob);
    assert.equal(list.body.length, 1);
    assert.equal(list.body[0].name, "Bob's independent project");
    assert.equal(list.body[0].document, undefined);

    const foreign = await fetch(`${origin}/api/projects`, {
      method: "PUT",
      headers: {
        Cookie: cookies.get(alice)!,
        Origin: "https://another-origin.example",
        "Content-Type": "application/json",
      },
      body: JSON.stringify(payload(alice, 2)),
    });
    assert.equal(foreign.status, 403);
    await foreign.body?.cancel();
    assert.equal(
      await client.db().collection("levoks_projects").countDocuments(),
      2,
    );
  },
);
