import test from "node:test";
import assert from "node:assert/strict";
import { mkdir, writeFile } from "node:fs/promises";
import { createRequire } from "node:module";
import { createServer } from "node:http";
import { randomBytes } from "node:crypto";
import path from "node:path";
import type mongooseTypes from "mongoose";
import { MongoMemoryReplSet } from "mongodb-memory-server";
import { block, programFixture } from "../helpers/program-fixture";
import { compileProject } from "../../src/lib/project/compiler";
import { emptyProject } from "../../src/lib/project/workspace";
import { parseProject } from "../../src/lib/project/schema";

test(
  "generated aggregation casts filters, isolates tenants and owners, and runs within transactions",
  { timeout: 120000 },
  async () => {
    const root = path.resolve(".verification/runtime-test");
    const service = {
      ...programFixture(),
      name: "Aggregate Service",
      blocks: [
        block("model", "db_model", {
          tableName: "Sale",
          fields: [
            { name: "category", type: "string", required: true },
            { name: "amount", type: "number", required: true },
            { name: "ownerId", type: "string", required: true },
            { name: "tenantId", type: "string", required: true },
          ],
        }),
        block("policy", "access_policy", {
          roles: [],
          permissions: [],
          ownerField: "ownerId",
          tenantField: "tenantId",
        }),
        block("aggregate", "query", {
          modelId: "model",
          operation: "aggregate",
          sortField: "total",
          sortDirection: "desc",
          limit: 2,
          aggregation: {
            groupBy: "category",
            metrics: [
              { name: "count", operation: "count", field: "" },
              { name: "total", operation: "sum", field: "amount" },
              { name: "average", operation: "avg", field: "amount" },
              { name: "lowest", operation: "min", field: "amount" },
              { name: "highest", operation: "max", field: "amount" },
            ],
          },
        }),
        block("filtered", "query", {
          modelId: "model",
          operation: "aggregate",
          filter: { _id: "$request.params.id" },
        }),
        block("transaction", "transaction", { steps: ["aggregate"] }),
        block(
          "endpoint",
          "rest_endpoint",
          { route: "/summary", policyIds: ["policy"] },
          ["transaction"],
        ),
        block(
          "one",
          "rest_endpoint",
          { route: "/summary/:id", policyIds: ["policy"] },
          ["filtered"],
        ),
      ],
    };
    const base = emptyProject();
    const output = compileProject(
      parseProject({
        ...base,
        backend: { ...base.backend, services: [service] },
      }),
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
    const require = createRequire(path.join(root, "entry.cjs"));
    const mongoose = require("mongoose") as typeof mongooseTypes;
    const database = await MongoMemoryReplSet.create({
      binary: { downloadDir: path.resolve(".verification/mongodb-bin") },
      replSet: { count: 1, storageEngine: "wiredTiger", ip: "127.0.0.1" },
    });
    try {
      await mongoose.connect(database.getUri("aggregate_test"));
      const Sale =
        require("./aggregate-service/models/Sale.js") as mongooseTypes.Model<{
          category: string;
          amount: number;
          ownerId: string;
          tenantId: string;
        }>;
      await Sale.init();
      await require("./aggregate-service/observability").initialize();
      const rows = await Sale.create([
        { category: "Book", amount: 10, ownerId: "alice", tenantId: "A" },
        { category: "Book", amount: 30, ownerId: "alice", tenantId: "A" },
        { category: "Tool", amount: 5, ownerId: "alice", tenantId: "A" },
        { category: "Book", amount: 1000, ownerId: "bob", tenantId: "A" },
        { category: "Book", amount: 5000, ownerId: "alice", tenantId: "B" },
      ]);
      const execute = require("./aggregate-service/workflow") as (
        id: string,
        req: unknown,
      ) => Promise<{ body: unknown }>;
      const user = { sub: "alice", tenantId: "A" };
      assert.deepEqual((await execute("endpoint", { user })).body, [
        {
          _id: "Book",
          count: 2,
          total: 40,
          average: 20,
          lowest: 10,
          highest: 30,
        },
        { _id: "Tool", count: 1, total: 5, average: 5, lowest: 5, highest: 5 },
      ]);
      assert.deepEqual(
        (await execute("one", { user, params: { id: rows[0]._id.toString() } }))
          .body,
        [{ _id: null, count: 1 }],
      );
      assert.deepEqual(
        (await execute("one", { user, params: { id: rows[3]._id.toString() } }))
          .body,
        [],
      );
      await assert.rejects(
        execute("endpoint", {}),
        (error: unknown) => (error as { status: number }).status === 401,
      );
      const express = require("express");
      const app = express();
      app.use(express.json());
      app.use(require("./aggregate-service/routes"));
      app.use(require("./aggregate-service/observability").error);
      const server = createServer(app);
      const previousSecret = process.env.JWT_SECRET;
      const secret = randomBytes(32).toString("hex");
      process.env.JWT_SECRET = secret;
      try {
        await new Promise<void>((resolve) =>
          server.listen(0, "127.0.0.1", resolve),
        );
        const origin = `http://127.0.0.1:${(server.address() as { port: number }).port}`;
        const jwt = require("jsonwebtoken");
        const headers = {
          Authorization: `Bearer ${jwt.sign(user, secret, { algorithm: "HS256", expiresIn: "5m" })}`,
        };
        const response = await fetch(origin + "/summary", { headers });
        assert.equal(response.status, 200);
        assert.deepEqual(
          await response.json(),
          (await execute("endpoint", { user })).body,
        );
        const foreign = await fetch(
          origin + "/summary/" + rows[3]._id.toString(),
          { headers },
        );
        assert.equal(foreign.status, 200);
        assert.deepEqual(await foreign.json(), []);
        const unauthorized = await fetch(origin + "/summary");
        assert.equal(unauthorized.status, 401);
        await unauthorized.body?.cancel();
        const missingTenant = await fetch(origin + "/summary", {
          headers: {
            Authorization: `Bearer ${jwt.sign({ sub: "alice" }, secret, { algorithm: "HS256", expiresIn: "5m" })}`,
          },
        });
        assert.equal(missingTenant.status, 403);
        await missingTenant.body?.cancel();
        const invalid = await fetch(origin + "/summary/not-an-id", { headers });
        assert.equal(invalid.status, 400);
        assert.deepEqual(await invalid.json(), {
          error: "Invalid resource ID",
        });
      } finally {
        await new Promise<void>((resolve) => server.close(() => resolve()));
        if (previousSecret === undefined) delete process.env.JWT_SECRET;
        else process.env.JWT_SECRET = previousSecret;
      }
      assert.equal(await Sale.countDocuments(), 5);
    } finally {
      await mongoose.disconnect();
      await database.stop();
    }
  },
);
