// Runs compiler-generated applications only. No source overrides, custom packages or host secrets.
import fs from "node:fs/promises";
import path from "node:path";
import crypto from "node:crypto";
import { spawn, execFile } from "node:child_process";
import { createServer } from "node:http";
import { MongoMemoryReplSet } from "mongodb-memory-server";
const directory = process.argv[2],
  root = path.resolve(".levoks-preview/sessions");
if (
  path.dirname(directory) !== root ||
  !/^[a-f0-9-]{36}$/.test(path.basename(directory))
)
  throw new Error("Invalid preview directory");
const children = [],
  emails = new Map();
let logs = "";
let database,
  transport,
  stopping = false,
  discard = false,
  running = false;
const send = (value) => {
  if (process.connected) process.send(value);
};
const phase = (message) => send({ type: "phase", message });
const pause = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
function launch(file, args, env, cwd) {
  if (stopping) throw new Error("Preview stopped.");
  const child = spawn(
    process.execPath,
    ["--max-old-space-size=384", file, ...args],
    {
      cwd,
      env: { ...process.env, ...env },
      stdio: ["ignore", "pipe", "pipe"],
      windowsHide: true,
    },
  );
  children.push(child);
  for (const stream of [child.stdout, child.stderr])
    stream.on("data", (chunk) => {
      logs = (logs + String(chunk)).slice(-20000);
    });
  child.on("error", () => {
    send({ type: "failed", message: "A preview process could not start." });
    void shutdown();
  });
  child.on("exit", () => {
    if (running && !stopping) {
      send({
        type: "failed",
        message: "A preview service stopped. Rebuild with fresh test data.",
      });
      void shutdown();
    }
  });
  return child;
}
async function kill(child) {
  if (!child.pid || child.exitCode !== null || child.signalCode !== null)
    return;
  if (process.platform === "win32")
    await new Promise((resolve) =>
      execFile(
        "taskkill",
        ["/PID", String(child.pid), "/T", "/F"],
        { windowsHide: true },
        () => resolve(),
      ),
    );
  else {
    child.kill("SIGTERM");
  }
}
async function shutdown() {
  if (stopping) return;
  stopping = true;
  await Promise.all(children.map(kill));
  if (transport) {
    transport.closeAllConnections();
    await new Promise((resolve) => transport.close(resolve));
  }
  await database?.stop();
  if (process.connected) process.disconnect();
}
process.on("message", (message) => {
  if (message?.type === "stop") {
    discard = true;
    void shutdown();
  }
});
process.on("disconnect", () => {
  if (!stopping) discard = true;
  void shutdown();
});
process.on("SIGTERM", () => {
  discard = true;
  void shutdown();
});
process.on("SIGINT", () => {
  discard = true;
  void shutdown();
});
// Wait for pending startup work to settle before deleting its directory.
process.once("beforeExit", () => {
  if (discard)
    void fs
      .rm(directory, { recursive: true, force: true, maxRetries: 3 })
      .catch(() => undefined);
});
async function ready(url, child) {
  for (let count = 0; count < 360; count++) {
    if (stopping) throw new Error("Preview stopped.");
    if (child.exitCode !== null || child.signalCode !== null)
      throw new Error(
        "A generated service failed to start. Check its configuration and restart preview.",
      );
    try {
      const response = await fetch(url, { signal: AbortSignal.timeout(1000) });
      await response.body?.cancel();
      if (response.ok) return;
    } catch {}
    await pause(250);
  }
  throw new Error(
    "Generated application startup timed out. Restart preview after checking local dependencies.",
  );
}
(async () => {
  const config = JSON.parse(
    await fs.readFile(path.join(directory, "runtime.json"), "utf8"),
  );
  const dependencies = path.join(directory, "dependencies");
  await fs.mkdir(dependencies, { recursive: true });
  if (config.services.length) {
    phase("Preparing local backend dependencies…");
    const manifest = JSON.parse(
      await fs.readFile(
        path.join(
          directory,
          "backend",
          config.services[0].slug,
          "package.json",
        ),
        "utf8",
      ),
    );
    // ponytail: one fixed dependency tree per run; cache by manifest if startup measurements justify it.
    await fs.writeFile(
      path.join(dependencies, "package.json"),
      JSON.stringify({
        private: true,
        dependencies: manifest.dependencies,
        overrides: manifest.overrides,
      }),
    );
    const npm = path.resolve("node_modules/npm/bin/npm-cli.js");
    const npmPath = await fs
      .access(npm)
      .then(() => npm)
      .catch(() =>
        path.join(
          path.dirname(process.execPath),
          "node_modules/npm/bin/npm-cli.js",
        ),
      );
    const installer = launch(
      npmPath,
      ["install", "--ignore-scripts", "--omit=dev", "--no-audit", "--no-fund"],
      {
        NPM_CONFIG_USERCONFIG: path.join(dependencies, "user.npmrc"),
        NPM_CONFIG_GLOBALCONFIG: path.join(dependencies, "global.npmrc"),
      },
      dependencies,
    );
    await new Promise((resolve, reject) => {
      const timer = setTimeout(() => {
        void kill(installer);
        reject(
          new Error(
            "Dependency preparation timed out. Check local npm connectivity and retry.",
          ),
        );
      }, 120000);
      installer.once("error", () => {
        clearTimeout(timer);
        reject(new Error("Local npm could not start."));
      });
      installer.once("exit", (code) => {
        clearTimeout(timer);
        if (code === 0) resolve();
        else
          reject(
            new Error(
              "Could not prepare generated backend dependencies. Check local npm connectivity and retry.",
            ),
          );
      });
    });
    if (stopping) return;
    phase("Creating disposable test databases…");
    await fs.mkdir(path.join(directory, "database"), { recursive: true });
    database = await MongoMemoryReplSet.create({
      binary: {
        downloadDir:
          process.env.LEVOKS_PREVIEW_MONGO_BINARY_DIR ||
          path.resolve(".levoks-preview/mongodb"),
      },
      replSet: { count: 1, ip: "127.0.0.1" },
      instanceOpts: [{ dbPath: path.join(directory, "database") }],
    });
    if (stopping) {
      await database.stop();
      return;
    }
  }
  if (stopping) return;
  const mailKey = crypto.randomBytes(32).toString("hex");
  transport = createServer(async (request, response) => {
    try {
      if (
        request.method !== "POST" ||
        request.url !== "/emails" ||
        request.headers.authorization !== "Bearer " + mailKey
      ) {
        response.writeHead(403);
        response.end();
        return;
      }
      let raw = "";
      for await (const chunk of request) {
        raw += chunk;
        if (Buffer.byteLength(raw) > 65536) throw new Error();
      }
      const value = JSON.parse(raw),
        id = String(request.headers["idempotency-key"] || "");
      if (
        !id ||
        typeof value.subject !== "string" ||
        typeof value.text !== "string" ||
        !Array.isArray(value.to)
      )
        throw new Error();
      const previous = emails.get(id);
      if (previous && previous.raw !== raw) {
        response.writeHead(409, { "Content-Type": "application/json" });
        response.end(JSON.stringify({ name: "invalid_idempotent_request" }));
        return;
      }
      emails.set(id, {
        raw,
        email: { id, subject: value.subject, text: value.text, to: value.to },
      });
      while (emails.size > 50) emails.delete(emails.keys().next().value);
      send({
        type: "emails",
        emails: [...emails.values()].map((value) => value.email),
      });
      response.writeHead(200, { "Content-Type": "application/json" });
      response.end(JSON.stringify({ id }));
    } catch {
      response.writeHead(400);
      response.end();
    }
  });
  await new Promise((resolve) => transport.listen(0, "127.0.0.1", resolve));
  if (stopping) return;
  const mailOrigin = `http://127.0.0.1:${transport.address().port}/emails`,
    jwt = crypto.randomBytes(32).toString("hex");
  const keyring = JSON.stringify({
    preview: crypto.randomBytes(32).toString("base64"),
  });
  phase("Starting generated API services…");
  const environments = new Map(),
    apis = [];
  for (const service of config.services) {
    const cwd = path.join(directory, "backend", service.slug);
    await fs.symlink(
      path.join(dependencies, "node_modules"),
      path.join(cwd, "node_modules"),
      process.platform === "win32" ? "junction" : "dir",
    );
    const identity = config.services.find(
      (value) => value.id === service.identityId,
    );
    const env = {
      NODE_ENV: "test",
      PORT: String(service.port),
      [service.connectionEnv]: database.getUri("preview_" + service.port),
      JWT_SECRET: jwt,
      CORS_ORIGINS: config.origin,
      RESEND_API_KEY: mailKey,
      AUTH_IDENTITY_ORIGIN: identity ? `http://127.0.0.1:${identity.port}` : "",
      OPERATOR_SETUP_TOKEN: service.setupCode || "",
      IDENTITY_PUBLIC_URL: config.origin + "/__levoks/account/" + service.slug,
      IDENTITY_EMAIL_FROM: "accounts@preview.test",
      IDENTITY_EMAIL_KEYS: keyring,
      IDENTITY_EMAIL_ACTIVE_KEY: "preview",
      IDENTITY_EMAIL_TEST_ENDPOINT: mailOrigin,
      SUBMISSION_PUBLIC_ORIGIN: config.origin,
      SUBMISSION_EMAIL_FROM: "alerts@preview.test",
      SUBMISSION_EMAIL_TO: "operator@preview.test",
      SUBMISSION_EMAIL_TEST_ENDPOINT: mailOrigin,
      ...Object.fromEntries(
        config.services.map((other) => [
          "HEALTH_ORIGIN_" + other.port,
          `http://127.0.0.1:${other.port}`,
        ]),
      ),
    };
    environments.set(service.id, env);
    const child = launch(path.join(cwd, "server.js"), [], env, cwd);
    apis.push({ service, child });
  }
  await Promise.all(
    apis.map(({ service, child }) =>
      ready(`http://127.0.0.1:${service.port}/health`, child),
    ),
  );
  phase("Starting generated frontend…");
  await fs.writeFile(
    path.join(directory, "frontend/next.config.mjs"),
    `export default {poweredByHeader:false,devIndicators:false,async headers(){return [{source:'/:path*',headers:[{key:'Content-Security-Policy',value:${JSON.stringify("frame-ancestors " + config.editorOrigin + "; connect-src 'self'; form-action 'self'; base-uri 'self';")}},{key:'Cache-Control',value:'no-store'}]}]}};`,
  );
  const frontend = launch(
    path.resolve("node_modules/next/dist/bin/next"),
    [
      "dev",
      "--webpack",
      "--hostname",
      "127.0.0.1",
      "--port",
      String(config.frontendPort),
    ],
    {
      NODE_ENV: "development",
      NEXT_TELEMETRY_DISABLED: "1",
      APP_ORIGIN: config.origin,
      ...Object.fromEntries(
        config.services.map((service) => [
          "API_ORIGIN_" + service.port,
          `http://127.0.0.1:${service.port}`,
        ]),
      ),
    },
    path.join(directory, "frontend"),
  );
  await ready(config.origin, frontend);
  for (const service of config.services) {
    const cwd = path.join(directory, "backend", service.slug),
      env = environments.get(service.id);
    if (service.account)
      launch(path.join(cwd, "workers/identity-email.js"), [], env, cwd);
    if (service.notifications)
      launch(path.join(cwd, "workers/submission-email.js"), [], env, cwd);
  }
  running = true;
  send({ type: "ready" });
  // Parent IPC owns lifetime; an orphaned runner stops itself on disconnect.
  const lifetime = setTimeout(
    () => {
      void shutdown();
    },
    30 * 60 * 1000,
  );
  lifetime.unref();
})().catch(async (error) => {
  if (!stopping)
    await fs
      .writeFile(path.join(directory, "runtime.log"), logs)
      .catch(() => undefined);
  send({
    type: "failed",
    message: error.message || "Local preview could not start.",
  });
  await shutdown();
});
