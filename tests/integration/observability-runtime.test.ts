import test from "node:test";
import assert from "node:assert/strict";
import { createServer } from "node:http";
import { createRequire } from "node:module";
import { mkdir, writeFile } from "node:fs/promises";
import { randomBytes } from "node:crypto";
import path from "node:path";
import type { Mongoose } from "mongoose";
import { MongoMemoryServer } from "mongodb-memory-server";
import { emptyProject } from "../../src/lib/project/workspace";
import { parseProject } from "../../src/lib/project/schema";
import { compileProject } from "../../src/lib/project/compiler";
import { block, programFixture } from "../helpers/program-fixture";

test(
  "generated audit and error configuration execute with real authenticated Express routes and durable MongoDB writes",
  { timeout: 90000 },
  async () => {
    const source = emptyProject(),
      service = programFixture();
    service.blocks = [
      block("model", "db_model", {
        tableName: "Item",
        fields: [
          { name: "name", type: "string", required: true, unique: true },
        ],
      }),
    block("auth", "auth_block"),
    block("logger", "middleware", {middlewareType: 'logger'}),
      block("create", "rest_endpoint", {
        route: "/items",
        method: "POST",
        modelId: "model",
        authRequired: true,
      }),
      block("list", "rest_endpoint", {
        route: "/items",
        method: "GET",
        modelId: "model",
        authRequired: true,
      }),
      block("audit", "audit_log", {
        event: "item.write",
        endpointIds: ["create"],
        retentionDays: 30,
      }),
      block("errors", "error_handler", {
        rules: [
          {
            kind: "conflict",
            status: 409,
            message: "An item with that name already exists.",
          },
        ],
      }),
    ];
    const output = compileProject(
      parseProject({
        ...source,
        backend: { ...source.backend, services: [service] },
      }),
    );
    assert.deepEqual(
      output.diagnostics.filter((d) => d.severity === "error"),
      [],
    );
    const root = path.resolve(
      ".verification/runtime-test/observability-runtime",
    );
    for (const [file, value] of Object.entries(output.files))
      if (file.startsWith("backend/workflow-service/")) {
        const target = path.join(
          root,
          file.slice("backend/workflow-service/".length),
        );
        await mkdir(path.dirname(target), { recursive: true });
        await writeFile(target, value);
      }
    const requireGenerated = createRequire(path.join(root, "server.js"));
    const mongoose = requireGenerated("mongoose") as Mongoose;
    const observer = requireGenerated("./observability") as {
      context: unknown;
      audit: unknown;
      error: unknown;
      initialize: () => Promise<void>;
      flush: () => Promise<void>;
    };
    const express = requireGenerated("express");
    const app = express();
    app.use(observer.context);
    app.use(express.json());
    app.use(observer.audit);
    app.use(requireGenerated("./routes"));
    app.use(observer.error);
    const server = createServer(app);
    const mongo = await MongoMemoryServer.create({
      binary: { downloadDir: path.resolve(".verification/mongodb-bin") },
      instance: { ip: "127.0.0.1" },
    });
    const logs: string[] = [],
    priorLog = console.error,
    priorInfo = console.log,
      priorSecret = process.env.JWT_SECRET;
    process.env.JWT_SECRET = randomBytes(32).toString("hex");
  console.error = (...args) => logs.push(args.join(" "));
  console.log = (...args) => logs.push(args.join(" "));
    try {
      await mongoose.connect(mongo.getUri("observability"));
      await observer.initialize();
      await mongoose.connection
        .db!.collection("items")
        .createIndex({ name: 1 }, { unique: true });
      await new Promise<void>((r) => server.listen(0, "127.0.0.1", r));
      const origin = `http://127.0.0.1:${(server.address() as { port: number }).port}`;
      const token = requireGenerated("jsonwebtoken").sign(
        { sub: "actor-1", tenantId: "tenant-1", role: "user" },
        process.env.JWT_SECRET,
        { expiresIn: "5m" },
      );
      const call = (method = "POST", authorized = true) =>
        fetch(origin + "/items?secret=QUERY_SECRET", {
          method,
          headers: {
            "Content-Type": "application/json",
            ...(authorized ? { Authorization: "Bearer " + token } : {}),
            "X-Request-Id": "untrusted",
          },
          ...(method === "POST"
            ? {
                body: JSON.stringify({
                  name: "BODY_PRIVATE_VALUE",
                  password: "BODY_SECRET",
                }),
              }
            : {}),
        });
      let response = await call();
      assert.equal(response.status, 201);
      await response.body?.cancel();
      const requestId = response.headers.get("x-request-id");
      assert.match(requestId!, /^[a-f0-9-]{36}$/);
      assert.notEqual(requestId, "untrusted");
      await observer.flush();
      let records = await mongoose.connection
        .db!.collection("levoks_audit")
        .find({})
        .toArray();
      assert.equal(records.length, 1);
      assert.equal(records[0].phase, "completed");
      assert.equal(records[0].actorId, "actor-1");
      assert.equal(records[0].tenantId, "tenant-1");
      assert.equal(records[0].event, "item.write");
      assert.equal(
        records[0].expiresAt.getTime() - records[0].createdAt.getTime(),
        30 * 86400000,
      );
      assert.doesNotMatch(
        JSON.stringify(records),
        /BODY_|QUERY_SECRET|Bearer|password|untrusted/,
      );
      response = await call();
      assert.equal(response.status, 409);
      const error = await response.json();
      assert.equal(error.error.code, "conflict");
      assert.equal(
        error.error.message,
        "An item with that name already exists.",
      );
      assert.equal(error.error.requestId, response.headers.get("x-request-id"));
      response = await call("POST", false);
      assert.equal(response.status, 401);
      await response.body?.cancel();
      await observer.flush();
      records = await mongoose.connection
        .db!.collection("levoks_audit")
        .find({})
        .toArray();
      assert.equal(records.length, 3);
      const denied = records.find((r) => r.status === 401)!;
      assert.equal(denied.actorId, undefined);
      response = await call("GET");
      assert.equal(response.status, 200);
      await response.body?.cancel();
      await observer.flush();
      assert.equal(
        await mongoose.connection
          .db!.collection("levoks_audit")
          .countDocuments(),
        3,
        "endpoint and read scopes exclude the list request",
      );
    assert.ok(logs.some((v) => v.includes("conflict")));
    assert.ok(logs.some((v) => v.includes('request.completed')));
      assert.doesNotMatch(
        logs.join("\n"),
        /BODY_|QUERY_SECRET|Bearer|password|mongodb:|E11000/,
      );
      const indexes = await mongoose.connection
        .db!.collection("levoks_audit")
        .indexes();
      assert.equal(indexes.find((i) => i.key.expiresAt)?.expireAfterSeconds, 0);
      await mongoose.disconnect();
      response = await call();
      assert.equal(response.status, 503);
      await response.body?.cancel();
      await mongoose.connect(mongo.getUri("observability"));
      assert.equal(
        await mongoose.connection.db!.collection("items").countDocuments(),
        1,
        "audit failure prevents the business mutation",
      );
    } finally {
    console.error = priorLog;
    console.log = priorInfo;
      if (priorSecret === undefined) delete process.env.JWT_SECRET;
      else process.env.JWT_SECRET = priorSecret;
      server.closeAllConnections();
      await new Promise<void>((r) => server.close(() => r()));
      await observer.flush();
      await mongoose.disconnect();
      await mongo.stop();
    }
  },
);
