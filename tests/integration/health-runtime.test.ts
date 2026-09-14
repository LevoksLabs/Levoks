import test from "node:test";
import assert from "node:assert/strict";
import { createServer } from "node:http";
import { createRequire } from "node:module";
import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import type { Mongoose } from "mongoose";
import { MongoMemoryServer } from "mongodb-memory-server";
import { emptyProject } from "../../src/lib/project/workspace";
import { compileProject } from "../../src/lib/project/compiler";
import { parseProject } from "../../src/lib/project/schema";
import { block, programFixture } from "../helpers/program-fixture";

test(
  "generated health probes real MongoDB and HTTP dependencies, bounds concurrency/timeouts and separates readiness from liveness",
  { timeout: 90000 },
  async () => {
    const project = emptyProject("Health runtime");
    const service = programFixture();
    service.blocks = [
      block("health", "health_check", {
        route: "/ready",
        timeoutMs: 150,
        cacheMs: 0,
        serviceIds: ["dependency"],
      }),
    ];
    const services = [
      service,
      {
        ...service,
        id: "dependency",
        name: "Dependency",
        port: 3010,
        blocks: [],
      },
    ];
    const output = compileProject(
      parseProject({ ...project, backend: { ...project.backend, services } }),
    );
    assert.deepEqual(
      output.diagnostics.filter((d) => d.severity === "error"),
      [],
    );
    assert.match(
      output.files["backend/docker-compose.yml"],
      /HEALTH_ORIGIN_3010=http:\/\/dependency:3010/,
    );
    const root = path.resolve(".verification/runtime-test/health-runtime");
    await mkdir(root, { recursive: true });
    await writeFile(
      path.join(root, "health.cjs"),
      output.files["backend/workflow-service/observability/health.js"],
    );
    const requireGenerated = createRequire(path.join(root, "health.cjs"));
    const mongoose = requireGenerated("mongoose") as Mongoose;
    const health = requireGenerated("./health.cjs") as {
      mount: (app: unknown) => void;
      drain: () => void;
    };
    const express = requireGenerated("express");
    const app = express();
    health.mount(app);
    const server = createServer(app);
    let dependencyStatus = 200,
      dependencyDelay = 0,
      requests = 0;
    const dependency = createServer((req, res) => {
      requests++;
      assert.equal(req.url, "/health/live");
      assert.equal(req.headers.authorization, undefined);
      setTimeout(
        () =>
          res
            .writeHead(dependencyStatus)
            .end("provider details must never be exposed"),
        dependencyDelay,
      );
    });
    const mongo = await MongoMemoryServer.create({
      binary: { downloadDir: path.resolve(".verification/mongodb-bin") },
      instance: { ip: "127.0.0.1" },
    });
    const old = process.env.HEALTH_ORIGIN_3010;
    try {
      await mongoose.connect(mongo.getUri("health"));
      await new Promise<void>((r) => dependency.listen(0, "127.0.0.1", r));
      process.env.HEALTH_ORIGIN_3010 = `http://127.0.0.1:${(dependency.address() as { port: number }).port}`;
      await new Promise<void>((r) => server.listen(0, "127.0.0.1", r));
      const origin = `http://127.0.0.1:${(server.address() as { port: number }).port}`;
      const check = () => fetch(origin + "/ready");
      let response = await check();
      assert.equal(response.status, 200);
      assert.deepEqual(await response.json(), {
        status: "ready",
        checks: { database: "up", dependency: "up" },
      });
      dependencyStatus = 503;
      response = await check();
      assert.equal(response.status, 503);
      assert.equal(response.headers.get("cache-control"), "no-store");
      assert.doesNotMatch(
        await response.text(),
        /provider details|mongodb:|127.0.0.1/,
      );
      assert.equal((await fetch(origin + "/health/live")).status, 200);
      dependencyStatus = 200;
      dependencyDelay = 80;
      const before = requests;
      const parallel = await Promise.all(Array.from({ length: 8 }, check));
      assert.ok(parallel.every((r) => r.status === 200));
      assert.equal(
        requests - before,
        1,
        "concurrent readiness calls share one probe",
      );
      await Promise.all(parallel.map((r) => r.body?.cancel()));
      dependencyDelay = 1200;
      const start = Date.now();
      response = await check();
      assert.equal(response.status, 503);
      assert.ok(
        Date.now() - start < 1000,
        "slow dependencies cannot stall readiness",
      );
      await response.body?.cancel();
      dependencyDelay = 0;
      await mongoose.disconnect();
      response = await check();
      assert.equal(response.status, 503);
      assert.equal((await response.json()).checks.database, "down");
      await mongoose.connect(mongo.getUri("health"));
      response = await check();
      assert.equal(response.status, 200);
      await response.body?.cancel();
      health.drain();
      response = await check();
      assert.equal(response.status, 503);
      assert.deepEqual(await response.json(), { status: "draining" });
      assert.equal((await fetch(origin + "/health/live")).status, 200);
    } finally {
      if (old === undefined) delete process.env.HEALTH_ORIGIN_3010;
      else process.env.HEALTH_ORIGIN_3010 = old;
      server.closeAllConnections();
      dependency.closeAllConnections();
      await Promise.all([
        new Promise<void>((r) => server.close(() => r())),
        new Promise<void>((r) => dependency.close(() => r())),
      ]);
      await mongoose.disconnect();
      await mongo.stop();
    }
  },
);

test("health compilation rejects route collisions, duplicate blocks and invalid dependency bindings", () => {
  const project = emptyProject();
  const service = programFixture();
  service.blocks = [
    block("health", "health_check", {
      route: "/health/live",
      serviceIds: [service.id, "missing"],
    }),
    block("second", "health_check"),
    block("endpoint", "rest_endpoint", { route: "/health" }),
    block("call", "rest_endpoint", {}, ["health"]),
  ];
  const messages = compileProject(
    parseProject({
      ...project,
      backend: { ...project.backend, services: [service] },
    }),
  )
    .diagnostics.filter((d) => d.severity === "error")
    .map((d) => d.message)
    .join("\n");
  for (const expected of [
    "one Health Check",
    "reserved",
    "distinct",
    "other existing services",
    "not an executable step",
  ])
    assert.ok(messages.includes(expected), messages);
});
