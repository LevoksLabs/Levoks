import test from "node:test";
import assert from "node:assert/strict";
import { parse } from "yaml";
import { mkdtemp, mkdir, writeFile, unlink } from "node:fs/promises";
import { resolve, dirname } from "node:path";
import { pathToFileURL } from "node:url";
import { createServer } from "node:http";
import { compileProject } from "../src/lib/project/compiler";
import { parseProject } from "../src/lib/project/schema";
import {
  emptyProject,
  restoreProject,
  captureProject,
} from "../src/lib/project/workspace";
import { defaultDatabase } from "../src/lib/backend/database";
import { useBackendStore } from "../src/store/backendStore";
import { modelLifecycleFixture } from "./helpers/model-lifecycle-fixture";
import { addSubmissionFormTemplate } from "../src/lib/form-destination";
import { createSubmissionInbox } from "../src/lib/submission-inbox";
import { setSubmissionNotifications } from "../src/lib/backend/submission-notifications";
import { deploymentHealthSource } from "../src/lib/codegen/deployment";
import { DEPLOY_SCRIPT } from "../src/lib/codegen/deployment-runtime";

type Container = {
  build: string;
  image?: string;
  ports?: string[];
  volumes: string[];
  command?: string[];
  environment: Record<string, string>;
  depends_on: Record<string, { condition: string }>;
  healthcheck: { test: string[] };
  env_file: { path: string; format: string }[];
  profiles?: string[];
};
const compositionFrom = (value: string) =>
  parse(value) as { services: Record<string, Container> };

test("one container release isolates frontend, API, provider workers and storage, and gates SQL initialization", () => {
  const project = emptyProject("Container release");
  restoreProject(project);
  addSubmissionFormTemplate();
  const service = useBackendStore.getState().services[0];
  const submit = service.blocks.find(
    (block) => block.type === "rest_endpoint",
  )!;
  createSubmissionInbox(service.id, submit.id);
  setSubmissionNotifications(service.id, submit.id, true);
  const configured = captureProject(project.id, project.name);
  const sql = {
    ...modelLifecycleFixture(),
    id: "sql",
    name: "SQL",
    port: 3020,
    database: defaultDatabase("sqlite"),
  };
  const result = compileProject(
    parseProject({
      ...configured,
      backend: {
        ...configured.backend,
        services: [...configured.backend.services, sql],
      },
    }),
  );
  assert.deepEqual(
    result.diagnostics.filter((item) => item.severity === "error"),
    [],
  );
  const composition = compositionFrom(result.files["compose.yaml"]);
  const containers = composition.services;
  assert.deepEqual(containers["levoks-frontend"].ports, [
    "127.0.0.1:${FRONTEND_PORT:-3000}:3000",
  ]);
  assert.equal(
    containers["levoks-frontend"].environment.API_ORIGIN_3020,
    "http://sql:3020",
  );
  assert.equal(containers.sql.ports, undefined);
  assert.equal(containers.sql.environment.NODE_ENV, "production");
  assert.equal(
    containers.sql.environment.JWT_SECRET,
    "${JWT_SECRET:?Set JWT_SECRET}",
  );
  assert.equal(containers.sql.environment.DATABASE_FILE, "/data/app.sqlite");
  assert.equal(
    containers.sql.depends_on["sql-migrate"].condition,
    "service_completed_successfully",
  );
  assert.deepEqual(containers["sql-migrate"].command, [
    "npm",
    "run",
    "db:migrate",
  ]);
  assert.deepEqual(containers["sql-migrate"].volumes, containers.sql.volumes);
  const workers = Object.values(containers).filter((value) =>
    value.command?.[2]?.startsWith("worker:"),
  );
  assert.equal(workers.length, 2);
  for (const worker of workers) {
    assert.equal(worker.ports, undefined);
    assert.equal(worker.environment.JWT_SECRET, undefined);
    assert.equal(worker.environment.OPERATOR_SETUP_TOKEN, undefined);
    assert.deepEqual(worker.healthcheck.test, [
      "CMD",
      "node",
      "workers/check.js",
    ]);
    assert.ok(worker.env_file.every((file) => file.format === "raw"));
  }
  const identity = Object.values(containers).find(
    (value) => value.command?.[2] === "worker:email",
  )!;
  const api = Object.values(containers).find(
    (value) =>
      !value.command &&
      value.env_file?.some((file) => file.path === identity.env_file[0].path),
  )!;
  assert.ok(
    api.env_file.some((file) => file.path === identity.env_file[0].path),
  );
  assert.ok(api.env_file.every((file) => !file.path.includes("provider")));
  assert.ok(
    Object.values(containers)
      .filter((value) => value.image && !value.profiles?.includes("https"))
      .every((value) => !value.ports),
  );
  assert.ok(result.files["DEPLOYMENT.md"]);
  assert.doesNotMatch(
    result.files[
      Object.keys(result.files).find((path) =>
        path.endsWith("/api/.env.example"),
      )!
    ],
    /RESEND_API_KEY|JWT_SECRET/,
  );
});

test("Compose names stay unique and remote database credentials never enter generated sources", () => {
  const project = emptyProject();
  const services = [
    "Levoks Frontend",
    "Other",
    "Remote",
    "Remote Database",
  ].map((name, index) => ({
    ...modelLifecycleFixture(),
    blocks: [],
    id: `s${index}`,
    name,
    port: 3010 + index,
    ...(index > 1
      ? {
          database: {
            ...defaultDatabase("postgresql"),
            location: "remote" as const,
            tls: true,
          },
        }
      : {}),
  }));
  project.backend.services = services;
  const { files, diagnostics } = compileProject(project);
  assert.deepEqual(
    diagnostics.filter((item) => item.severity === "error"),
    [],
  );
  const composition = compositionFrom(files["compose.yaml"]);
  assert.ok(composition.services["levoks-frontend-2"]);
  assert.ok(composition.services.mongodb.image);
  assert.equal(
    composition.services.remote.environment.DATABASE_URL,
    "${REMOTE_DATABASE_URL:?Set the remote database URL}",
  );
  assert.equal(composition.services["remote-database"].ports, undefined);
  assert.equal(
    Object.values(composition.services).filter(
      (value) => value.image && !value.profiles?.includes("https"),
    ).length,
    1,
  );
  assert.match(files[".env.example"], /REMOTE_DATABASE_URL=\n/);
});

test("optional HTTPS proxy routes only to the private frontend and retains certificate storage without service collisions", () => {
  const project = emptyProject();
  project.backend.services = [
    "Levoks Proxy",
    "Levoks Certificates",
    "Levoks Frontend",
  ].map((name, index) => ({
    ...modelLifecycleFixture(),
    id: `proxy-${index}`,
    name,
    port: 3040 + index,
    blocks: [],
    database: defaultDatabase("sqlite"),
  }));
  const { files } = compileProject(project);
  const composition = parse(files["compose.yaml"]);
  const proxy = composition.services["levoks-proxy-2"];
  assert.deepEqual(proxy.profiles, ["https"]);
  assert.equal(proxy.image, "caddy:2.11.7-alpine");
  assert.deepEqual(proxy.ports, ["80:80", "443:443", "443:443/udp"]);
  assert.deepEqual(proxy.environment, {
    LEVOKS_DOMAIN: "${LEVOKS_DOMAIN:-unconfigured.invalid}",
    LEVOKS_FRONTEND: "levoks-frontend-2:3000",
  });
  assert.equal(
    proxy.depends_on["levoks-frontend-2"].condition,
    "service_healthy",
  );
  for (const volume of proxy.volumes.filter(
    (value: string) => !value.startsWith("./"),
  ))
    assert.ok(Object.hasOwn(composition.volumes, volume.split(":")[0]));
  assert.match(files["deployment/Caddyfile"], /admin off/);
  assert.match(
    files["deployment/Caddyfile"],
    /reverse_proxy \{\$LEVOKS_FRONTEND\}/,
  );
  assert.doesNotMatch(
    files["deployment/Caddyfile"],
    /tls internal|on_demand|auto_https off/,
  );
  assert.ok(
    JSON.parse(files["deployment/manifest.json"]).profiles.includes("https"),
  );
});

test("HTTPS CLI derives the domain, rejects unsafe domains before Docker and verifies publicly without Docker or private runtime files", async () => {
  const base = resolve(".verification/deployment-cli");
  await mkdir(base, { recursive: true });
  const root = await mkdtemp(resolve(base, "https-"));
  const files = compileProject(emptyProject()).files;
  for (const path of ["deploy.mjs", "deployment/manifest.json"]) {
    await mkdir(dirname(resolve(root, path)), { recursive: true });
    await writeFile(resolve(root, path), files[path]);
  }
  const writeSettings = (origin: string) =>
    writeFile(
      resolve(root, ".env"),
      `COMPOSE_PROJECT_NAME=acceptance\nAPP_ORIGIN=${origin}\nFRONTEND_PORT=3400\nLEVOKS_DOMAIN=attacker.example.com\n`,
    );
  await writeSettings("https://app.example.com");
  const runtime = await import(pathToFileURL(resolve(root, "deploy.mjs")).href);
  const calls: { args: string[]; env: Record<string, string> }[] = [];
  const execute = async (
    _command: string,
    args: string[],
    options: { env: Record<string, string> },
  ) => {
    calls.push({ args, env: options.env });
    return {
      stdout: args.includes("version")
        ? "2.30.0"
        : args.includes("ps")
          ? "[]"
          : "",
    };
  };
  await runtime.runDeployment(["check", "--https"], execute);
  assert.equal(calls.at(-1)!.env.LEVOKS_DOMAIN, "app.example.com");
  assert.ok(calls.at(-1)!.args.includes("https"));
  for (const origin of [
    "http://localhost:3400",
    "https://127.0.0.1",
    "https://app.local",
    "https://app.home.arpa",
    "https://app.example.test",
    "https://app.example.com:8443",
    "https://user:secret@app.example.com",
    "https://app.example.com/path",
    "https://*.example.com",
    "https://-bad.example.com",
    "https://app.example.com.",
  ]) {
    await writeSettings(origin);
    calls.length = 0;
    await assert.rejects(
      runtime.runDeployment(["check", "--https"], execute),
      /APP_ORIGIN|Public HTTPS/,
    );
    assert.equal(calls.length, 0);
  }
  await writeSettings("https://app.example.com");
  const requests: { url: string; redirect: string }[] = [];
  let failure:
    "unready" | "wrong-domain" | "oversized" | "transport" | undefined;
  const request = async (url: URL, options: { redirect: string }) => {
    requests.push({ url: url.href, redirect: options.redirect });
    if (failure === "transport")
      throw new Error("provider-secret-must-not-escape");
    if (url.protocol === "https:")
      return new Response(
        failure === "oversized"
          ? "x".repeat(5000)
          : JSON.stringify({
              status: failure === "unready" ? "unavailable" : "ready",
            }),
        { headers: { "Content-Type": "application/json" } },
      );
    return new Response(null, {
      status: 308,
      headers: {
        Location:
          failure === "wrong-domain"
            ? "https://attacker.example.com/__levoks/health"
            : "https://app.example.com/__levoks/health",
      },
    });
  };
  calls.length = 0;
  await runtime.runDeployment(["verify"], execute, request);
  assert.equal(calls.length, 0);
  assert.deepEqual(requests, [
    { url: "https://app.example.com/__levoks/health", redirect: "error" },
    { url: "http://app.example.com/__levoks/health", redirect: "manual" },
  ]);
  requests.length = 0;
  await runtime.runDeployment(["up", "--https"], execute, request);
  assert.ok(calls.some((call) => call.args.includes("up")));
  assert.equal(requests.length, 2);
  await unlink(resolve(root, "deployment/manifest.json"));
  await writeFile(resolve(root, ".env"), "APP_ORIGIN=https://app.example.com\n");
  await runtime.runDeployment(["verify"], execute, request);
  for (failure of ["unready", "wrong-domain", "oversized", "transport"] as const)
    await assert.rejects(
      runtime.runDeployment(["verify"], execute, request),
      (error) =>
        error instanceof Error &&
        /No public readiness/.test(error.message) &&
        !/provider-secret/.test(error.message),
    );
  const previous = process.env.NODE_TLS_REJECT_UNAUTHORIZED;
  try {
    process.env.NODE_TLS_REJECT_UNAUTHORIZED = "0";
    await assert.rejects(
      runtime.runDeployment(["verify"], execute, request),
      /Remove NODE_TLS_REJECT_UNAUTHORIZED/,
    );
  } finally {
    if (previous === undefined) delete process.env.NODE_TLS_REJECT_UNAUTHORIZED;
    else process.env.NODE_TLS_REJECT_UNAUTHORIZED = previous;
  }
});

test("every local database engine has private persistent storage and SQL readiness dependencies", () => {
  for (const engine of [
    "mongodb",
    "postgresql",
    "mysql",
    "mariadb",
    "sqlite",
  ] as const) {
    const project = emptyProject();
    project.backend.services = [
      {
        ...modelLifecycleFixture(),
        blocks: [],
        database: defaultDatabase(engine),
      },
    ];
    const { files } = compileProject(project);
    const containers = compositionFrom(files["compose.yaml"]).services;
    assert.ok(Object.keys(parse(files["compose.yaml"]).volumes).length);
    if (engine === "sqlite")
      assert.equal(
        containers["workflow-service"].environment.DATABASE_FILE,
        "/data/app.sqlite",
      );
    else {
      const database = containers["workflow-service-database"];
      assert.equal(database.ports, undefined);
      assert.equal(
        containers["workflow-service"].depends_on["workflow-service-database"]
          .condition,
        "service_healthy",
      );
    }
    if (engine !== "mongodb")
      assert.equal(
        containers["workflow-service"].depends_on["workflow-service-migrate"]
          .condition,
        "service_completed_successfully",
      );
  }
  const project = emptyProject();
  project.backend.services = [
    {
      ...modelLifecycleFixture(),
      blocks: [],
      database: { ...defaultDatabase(), tls: true },
    },
  ];
  assert.match(
    JSON.parse(compileProject(project).files["deployment/manifest.json"])
      .blockers[0],
    /do not configure TLS/,
  );
});

test("generated deployment CLI checks before mutation, pins Compose scope and suppresses failed provider output", async () => {
  const base = resolve(".verification/deployment-cli");
  await mkdir(base, { recursive: true });
  const root = await mkdtemp(resolve(base, "release-"));
  await writeFile(resolve(root, "deploy.mjs"), DEPLOY_SCRIPT);
  await mkdir(resolve(root, "deployment"));
  const requirements = [
    { path: "deployment/api/.env", keys: ["API_TOKEN"] },
    {
      path: "deployment/identity/.env",
      keys: ["IDENTITY_EMAIL_KEYS", "IDENTITY_EMAIL_ACTIVE_KEY"],
      profile: "identity-email",
    },
  ];
  for (const requirement of requirements)
    await mkdir(dirname(resolve(root, requirement.path)), { recursive: true });
  await writeFile(
    resolve(root, "deployment/manifest.json"),
    JSON.stringify({
      rootKeys: ["COMPOSE_PROJECT_NAME", "APP_ORIGIN", "FRONTEND_PORT"],
      requirements,
      profiles: ["identity-email"],
      blockers: [],
    }),
  );
  await writeFile(
    resolve(root, "deployment/api/.env"),
    "API_TOKEN=literal$secret#value\n",
  );
  await writeFile(
    resolve(root, ".env"),
    "COMPOSE_PROJECT_NAME=acceptance\nAPP_ORIGIN=https://app.example.test\nFRONTEND_PORT=3400\n",
  );
  const runtime = await import(pathToFileURL(resolve(root, "deploy.mjs")).href);
  const calls: { args: string[]; env: Record<string, string> }[] = [];
  let rejectUp = false,
    version = "2.30.0";
  const execute = async (
    _command: string,
    args: string[],
    options: { env: Record<string, string> },
  ) => {
    calls.push({ args, env: options.env });
    if (args.includes("up") && rejectUp)
      throw new Error("provider-secret-must-not-escape");
    return {
      stdout: args.includes("version")
        ? version
        : args.includes("ps")
          ? '[{"Service":"frontend","State":"running","Health":"healthy"}]'
          : "",
    };
  };
  await runtime.runDeployment(["check"], execute);
  assert.equal(calls.length, 2);
  assert.ok(calls[1].args.includes("--quiet"));
  assert.equal(calls[1].env.APP_ORIGIN, "https://app.example.test");
  assert.equal(calls[1].env.COMPOSE_FILE, undefined);
  assert.equal(calls[1].env.COMPOSE_PROFILES, undefined);
  calls.length = 0;
  await runtime.runDeployment(["up"], execute);
  assert.deepEqual(calls[2].args.slice(-6), [
    "up",
    "--build",
    "--wait",
    "--wait-timeout",
    "180",
    "--quiet-build",
  ]);
  rejectUp = true;
  await assert.rejects(
    runtime.runDeployment(["up"], execute),
    (error) =>
      error instanceof Error &&
      /No success was recorded/.test(error.message) &&
      !/provider-secret/.test(error.message),
  );
  calls.length = 0;
  await assert.rejects(
    runtime.runDeployment(["check", "--identity-email"], execute),
    /Missing runtime configuration/,
  );
  assert.equal(calls.length, 0);
  await writeFile(
    resolve(root, "deployment/identity/.env"),
    'IDENTITY_EMAIL_KEYS={"active":"' +
      Buffer.alloc(32).toString("base64") +
      '"}\nIDENTITY_EMAIL_ACTIVE_KEY=active\n',
  );
  await runtime.runDeployment(["check", "--identity-email"], execute);
  assert.ok(calls.at(-1)!.args.includes("identity-email"));
  version = "2.29.0";
  await assert.rejects(runtime.runDeployment(["check"], execute), /2.30/);
  await writeFile(
    resolve(root, ".env"),
    "COMPOSE_PROJECT_NAME=acceptance\nAPP_ORIGIN=https://user:secret@app.test\nFRONTEND_PORT=3400\n",
  );
  await assert.rejects(
    runtime.runDeployment(["up"], execute),
    /APP_ORIGIN must/,
  );
});

test("frontend readiness uses real backend HTTP readiness and returns no upstream data or credentials", async () => {
  let status = 200;
  const server = createServer((req, response) => {
    assert.equal(req.url, "/health");
    assert.equal(req.headers.authorization, undefined);
    response
      .writeHead(
        status,
        status === 302 ? { Location: "https://unexpected.example.test" } : {},
      )
      .end("database-password");
  });
  await new Promise<void>((done) => server.listen(0, "127.0.0.1", done));
  const previous = process.env.API_ORIGIN_3031;
  process.env.API_ORIGIN_3031 = `http://127.0.0.1:${(server.address() as { port: number }).port}`;
  const health = await import(
    "data:text/javascript;base64," +
      Buffer.from(
        deploymentHealthSource([{ ...modelLifecycleFixture(), port: 3031 }]),
      ).toString("base64")
  );
  try {
    let response = await health.GET();
    assert.equal(response.status, 200);
    assert.equal(response.headers.get("cache-control"), "no-store");
    assert.deepEqual(await response.json(), { status: "ready" });
    for (status of [503, 302]) {
      response = await health.GET();
      assert.equal(response.status, 503);
      assert.deepEqual(await response.json(), { status: "unavailable" });
    }
    process.env.API_ORIGIN_3031 = "http://user:secret@127.0.0.1";
    assert.equal((await health.GET()).status, 503);
  } finally {
    if (previous === undefined) delete process.env.API_ORIGIN_3031;
    else process.env.API_ORIGIN_3031 = previous;
    await new Promise<void>((done) => server.close(() => done()));
  }
});
