import test from "node:test";
import assert from "node:assert/strict";
import { mkdir, cp, writeFile, readFile, mkdtemp } from "node:fs/promises";
import { existsSync } from "node:fs";
import { createRequire } from "node:module";
import { createServer } from "node:net";
import { spawn, execFile, type ChildProcess } from "node:child_process";
import { promisify } from "node:util";
import { resolve } from "node:path";
import { randomBytes } from "node:crypto";
import { emailWorkerSource } from "../../src/lib/codegen/auth-recovery";
import { compileProject } from "../../src/lib/project/compiler";
import {
  emptyProject,
  restoreProject,
  captureProject,
} from "../../src/lib/project/workspace";
import { useBackendStore } from "../../src/store/backendStore";

const exec = promisify(execFile);
const root = resolve(".verification/runtime-test/container-release");
const freePort = async () => {
  const server = createServer();
  await new Promise<void>((done) => server.listen(0, "127.0.0.1", done));
  const port = (server.address() as { port: number }).port;
  await new Promise<void>((done) => server.close(() => done()));
  return port;
};
const stop = async (child: ChildProcess) => {
  if (child.exitCode !== null) return;
  child.kill();
  await new Promise<void>((done) => child.once("exit", () => done()));
};
const wait = async (url: string, child: ChildProcess) => {
  for (let attempt = 0; attempt < 100; attempt++) {
    if (child.exitCode !== null)
      throw new Error("Generated process exited before readiness.");
    try {
      if ((await fetch(url, { signal: AbortSignal.timeout(1000) })).ok) return;
    } catch {}
    await new Promise((done) => setTimeout(done, 100));
  }
  throw new Error("Generated process did not become ready.");
};

test(
  "exported production standalone frontend gates real SQLite API health and retains records after restart",
  {
    timeout: 90000,
    skip: !existsSync(resolve(root, "frontend/.next/standalone/server.js"))
      ? "Build scripts/prepare-deployment-acceptance.ts's frontend first"
      : false,
  },
  async () => {
    const frontend = resolve(root, "frontend");
    await cp(
      resolve(frontend, ".next/static"),
      resolve(frontend, ".next/standalone/.next/static"),
      { recursive: true },
    );
    const backend = resolve(root, "backend/workflow-service");
    const apiPort = await freePort(),
      frontendPort = await freePort();
    const origin = `http://127.0.0.1:${frontendPort}`,
      apiOrigin = `http://127.0.0.1:${apiPort}`;
    const secret = randomBytes(32).toString("hex");
    const env: NodeJS.ProcessEnv = {
      ...process.env,
      NODE_ENV: "production",
      DATABASE_FILE: resolve(
        root,
        "persist-" + randomBytes(5).toString("hex") + ".sqlite",
      ),
      JWT_SECRET: secret,
      CORS_ORIGINS: origin,
    };
    const requireGenerated = createRequire(resolve(backend, "server.js"));
    const jwt = requireGenerated("jsonwebtoken");
    await exec(process.execPath, [resolve(backend, "scripts/migrate.js")], {
      cwd: backend,
      env,
      windowsHide: true,
    });
    const startAPI = () =>
      spawn(process.execPath, [resolve(backend, "server.js")], {
        cwd: backend,
        env: { ...env, PORT: String(apiPort) },
        stdio: "ignore",
        windowsHide: true,
      });
    let api = startAPI();
    const front = spawn(
      process.execPath,
      [resolve(frontend, ".next/standalone/server.js")],
      {
        cwd: frontend,
        env: {
          ...process.env,
          NODE_ENV: "production",
          PORT: String(frontendPort),
          HOSTNAME: "127.0.0.1",
          APP_ORIGIN: origin,
          API_ORIGIN_3001: apiOrigin,
        },
        stdio: "ignore",
        windowsHide: true,
      },
    );
    try {
      await wait(apiOrigin + "/health", api);
      await wait(origin + "/__levoks/health", front);
      assert.equal((await fetch(origin)).status, 200);
      const headers = {
        Authorization:
          "Bearer " +
          jwt.sign(
            { sub: "alice", tenantId: "tenant-a", role: "user" },
            secret,
            { expiresIn: "5m" },
          ),
        "Content-Type": "application/json",
        Origin: origin,
      };
      const created = await fetch(origin + "/__levoks/api/3001/plain", {
        method: "POST",
        headers,
        body: JSON.stringify({
          title: "Container acceptance record",
          enabled: true,
        }),
      });
      assert.equal(created.status, 201, await created.clone().text());
      const item = await created.json();
      assert.equal(
        (
          await fetch(origin + "/__levoks/api/3001/plain", {
            method: "POST",
            headers: { ...headers, Origin: "https://other.example.test" },
            body: "{}",
          })
        ).status,
        403,
      );
      await stop(api);
      const unavailable = await fetch(origin + "/__levoks/health");
      assert.equal(unavailable.status, 503);
      assert.deepEqual(await unavailable.json(), { status: "unavailable" });
      assert.equal(unavailable.headers.get("cache-control"), "no-store");
      api = startAPI();
      await wait(apiOrigin + "/health", api);
      await wait(origin + "/__levoks/health", front);
      const loaded = await fetch(
        origin + "/__levoks/api/3001/plain/" + item._id,
        { headers },
      );
      assert.equal(loaded.status, 200);
      assert.equal((await loaded.json()).title, item.title);
    } finally {
      await stop(api);
      await stop(front);
    }
  },
);

test(
  "generated email process publishes a health heartbeat and rejects stale or stopped process health",
  { timeout: 20000 },
  async () => {
    const base = resolve(".verification/runtime-test/worker-health");
    await mkdir(base, { recursive: true });
    const folder = await mkdtemp(resolve(base, "worker-"));
    await mkdir(resolve(folder, "workers"));
    await writeFile(
      resolve(folder, "database.js"),
      "exports.connect = async () => {}; exports.disconnect = async () => {};\n",
    );
    await writeFile(
      resolve(folder, "recovery.js"),
      "exports.ready = () => {}; exports.processOne = async () => false;\n",
    );
    await writeFile(
      resolve(folder, "workers/worker.js"),
      emailWorkerSource("../recovery", "Acceptance"),
    );
    const initial = emptyProject();
    restoreProject(initial);
    useBackendStore.getState().loadAuthTemplate();
    const { files } = compileProject(captureProject(initial.id, initial.name));
    const checkSource =
      files[
        Object.keys(files).find((path) => path.endsWith("/workers/check.js"))!
      ];
    await writeFile(resolve(folder, "workers/check.js"), checkSource);
    const heartbeat = resolve(folder, "heartbeat.json");
    const env = {
      ...process.env,
      LEVOKS_WORKER_HEALTH_FILE: heartbeat,
      RESEND_API_KEY: "fixture-provider-key",
    };
    const worker = spawn(
      process.execPath,
      [resolve(folder, "workers/worker.js")],
      { env, stdio: "ignore", windowsHide: true },
    );
    try {
      for (let i = 0; i < 70 && !existsSync(heartbeat); i++)
        await new Promise((done) => setTimeout(done, 100));
      const pulse = JSON.parse(await readFile(heartbeat, "utf8"));
      assert.equal(pulse.pid, worker.pid);
      await exec(process.execPath, [resolve(folder, "workers/check.js")], {
        env,
        windowsHide: true,
      });
      await writeFile(
        heartbeat,
        JSON.stringify({ ...pulse, at: Date.now() - 100000 }),
      );
      await assert.rejects(
        exec(process.execPath, [resolve(folder, "workers/check.js")], {
          env,
          windowsHide: true,
        }),
      );
    } finally {
      await stop(worker);
    }
    // Windows termination is forced and cannot run signal cleanup. A stopped
    // process must still fail health even when its last heartbeat is present.
    await assert.rejects(
      exec(process.execPath, [resolve(folder, "workers/check.js")], {
        env,
        windowsHide: true,
      }),
    );
  },
);
