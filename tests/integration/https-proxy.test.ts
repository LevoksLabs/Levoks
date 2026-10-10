import test from "node:test";
import assert from "node:assert/strict";
import { spawn, execFile } from "node:child_process";
import { promisify } from "node:util";
import { createServer } from "node:http";
import { mkdtemp, mkdir, writeFile, access } from "node:fs/promises";
import { resolve } from "node:path";
import { pathToFileURL } from "node:url";
import { compileProject } from "../../src/lib/project/compiler";
import { emptyProject } from "../../src/lib/project/workspace";

const execute = promisify(execFile);
const binary = process.env.LEVOKS_CADDY_BINARY;
const freePort = async () => {
  const server = createServer();
  await new Promise<void>((done) => server.listen(0, "127.0.0.1", done));
  const port = (server.address() as { port: number }).port;
  await new Promise<void>((done) => server.close(() => done()));
  return port;
};

test(
  "native Caddy validates the shipped configuration, proxies real HTTP and refuses untrusted TLS during public verification",
  { skip: !binary, timeout: 30000 },
  async () => {
    await access(binary!);
    const base = resolve(".verification/caddy-https");
    await mkdir(base, { recursive: true });
    const root = await mkdtemp(resolve(base, "native-"));
    const source = compileProject(emptyProject()).files;
    const proxyPort = await freePort(),
      healthPort = await freePort(),
      tlsPort = await freePort();
    const upstream = createServer(async (request, response) => {
      if (request.url === "/__levoks/health") {
        response.setHeader("Content-Type", "application/json");
        response.end(JSON.stringify({ status: "ready" }));
        return;
      }
      let body = "";
      for await (const chunk of request) body += chunk;
      response.setHeader("Content-Type", "application/json");
      response.setHeader(
        "Set-Cookie",
        "session=fixture; HttpOnly; SameSite=Lax",
      );
      response.end(
        JSON.stringify({
          method: request.method,
          path: request.url,
          host: request.headers.host,
          forwardedHost: request.headers["x-forwarded-host"],
          forwardedProto: request.headers["x-forwarded-proto"],
          body,
        }),
      );
    });
    await new Promise<void>((done) => upstream.listen(0, "127.0.0.1", done));
    const env = {
      ...process.env,
      LEVOKS_DOMAIN: "app.example.com",
      LEVOKS_FRONTEND: `127.0.0.1:${(upstream.address() as { port: number }).port}`,
      XDG_DATA_HOME: resolve(root, "data"),
      XDG_CONFIG_HOME: resolve(root, "config"),
      APPDATA: resolve(root, "data"),
      LOCALAPPDATA: resolve(root, "data"),
    };
    const configPath = resolve(root, "Caddyfile");
    await writeFile(configPath, source["deployment/Caddyfile"]);
    let child: ReturnType<typeof spawn> | undefined;
    try {
      // Validate the exact exported public-domain configuration without starting
      // listeners or issuing certificates. Runtime traffic uses a local fixture.
      await execute(
        binary!,
        [
          "adapt",
          "--config",
          configPath,
          "--adapter",
          "caddyfile",
          "--validate",
        ],
        { env, windowsHide: true },
      );
      const local =
        source["deployment/Caddyfile"]
          .replace("admin off", "admin off\n  skip_install_trust")
          .replace(
            "https://{$LEVOKS_DOMAIN:unconfigured.invalid}",
            `http://localhost:${proxyPort}`,
          )
          .replace("http://:8080", `http://127.0.0.1:${healthPort}`) +
        `\nhttps://localhost:${tlsPort} {\n  tls internal\n  reverse_proxy {$LEVOKS_FRONTEND}\n}\n`;
      await writeFile(configPath, local);
      let logs = "";
      child = spawn(
        binary!,
        ["run", "--config", configPath, "--adapter", "caddyfile"],
        { env, windowsHide: true, stdio: ["ignore", "pipe", "pipe"] },
      );
      child.stdout?.on("data", (chunk) => {
        logs += chunk.toString();
      });
      child.stderr?.on("data", (chunk) => {
        logs += chunk.toString();
      });
      let ready = false;
      for (let attempt = 0; attempt < 60; attempt++) {
        if (child.exitCode !== null)
          assert.fail(`Caddy exited before readiness: ${logs}`);
        try {
          ready = (await fetch(`http://127.0.0.1:${healthPort}/health`)).ok;
        } catch {}
        if (ready) break;
        await new Promise((done) => setTimeout(done, 100));
      }
      assert.ok(ready, "Caddy must start before testing proxy traffic");
      const response = await fetch(
        `http://localhost:${proxyPort}/api/forms?filter=active`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: '{"name":"acceptance"}',
        },
      );
      assert.equal(response.status, 200);
      assert.equal(
        response.headers.get("set-cookie"),
        "session=fixture; HttpOnly; SameSite=Lax",
      );
      assert.deepEqual(await response.json(), {
        method: "POST",
        path: "/api/forms?filter=active",
        host: `localhost:${proxyPort}`,
        forwardedHost: `localhost:${proxyPort}`,
        forwardedProto: "http",
        body: '{"name":"acceptance"}',
      });
      await writeFile(resolve(root, "deploy.mjs"), source["deploy.mjs"]);
      const runtime = await import(
        pathToFileURL(resolve(root, "deploy.mjs")).href
      );
      let realTLSRequests = 0;
      let trustFailure = "";
      await assert.rejects(
        runtime.verifyPublicOrigin(
          "https://app.example.com",
          async (_url: URL, options: RequestInit) => {
            realTLSRequests++;
            try {
              return await fetch(
                `https://localhost:${tlsPort}/__levoks/health`,
                options,
              );
            } catch (error) {
              trustFailure = String(
                (error as { cause?: { code?: string } }).cause?.code,
              );
              throw error;
            }
          },
        ),
        /No public readiness was confirmed/,
      );
      assert.equal(realTLSRequests, 1);
      assert.match(
        trustFailure,
        /SELF_SIGNED|UNABLE_TO_VERIFY|UNABLE_TO_GET_ISSUER/,
      );
      // The generated test certificate stays private to this process's data
      // directory. skip_install_trust prevents modification of the OS trust store.
    } finally {
      if (child && child.exitCode === null) {
        const exited = new Promise<void>((done) =>
          child!.once("exit", () => done()),
        );
        child.kill();
        await exited;
      }
      await new Promise<void>((done) => upstream.close(() => done()));
    }
  },
);
