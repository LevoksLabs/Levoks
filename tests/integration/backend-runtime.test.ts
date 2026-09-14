import test from "node:test";
import assert from "node:assert/strict";
import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { createRequire } from "node:module";
import type mongooseTypes from "mongoose";
import { spawn } from "node:child_process";
import { createServer } from "node:net";
import { randomBytes } from "node:crypto";
import { MongoMemoryReplSet } from "mongodb-memory-server";
import { generateServiceCode } from "../../src/lib/codegen/express";
import { block, programFixture } from "../helpers/program-fixture";

test(
  "generated workflows enforce tenant/owner isolation and roll back real MongoDB transactions",
  { timeout: 240000 },
  async () => {
    const root = path.resolve(".verification/runtime-test");
    const require = createRequire(path.join(root, "entry.cjs"));
    const mongoose = require("mongoose") as typeof mongooseTypes;
    await mkdir(root, { recursive: true });
    const service = programFixture();
    service.blocks.push(
      block("second", "query", {
        modelId: "model",
        operation: "create",
        policyId: "policy",
        values: { title: "$request.body.title" },
      }),
      block("tx", "transaction", { steps: ["create", "second"] }),
      block("single_tx", "transaction", { steps: ["create"] }),
      block("audit", "audit_log", {
        endpointIds: ["tx_endpoint", "single_tx_endpoint"],
      }),
      block(
        "single_tx_endpoint",
        "rest_endpoint",
        { route: "/single-atomic", method: "POST", authRequired: true },
        ["single_tx"],
      ),
      block(
        "tx_endpoint",
        "rest_endpoint",
        { route: "/atomic", method: "POST", authRequired: true },
        ["tx"],
      ),
    );
    for (const [name, source] of Object.entries(generateServiceCode(service))) {
      const target = path.resolve(root, name);
      assert.ok(target.startsWith(root + path.sep));
      await mkdir(path.dirname(target), { recursive: true });
      await writeFile(target, source);
    }
    const server = await MongoMemoryReplSet.create({
      binary: { downloadDir: path.resolve(".verification/mongodb-bin") },
      replSet: { count: 1, storageEngine: "wiredTiger", ip: "127.0.0.1" },
    });
    try {
      await mongoose.connect(server.getUri(), {
        dbName: "levoks_workflow_test",
      });
      const Entry =
        require("./workflow-service/models/Entry.js") as mongooseTypes.Model<{
          title: string;
          ownerId: string;
          tenantId: string;
        }>;
      await Entry.init();
      await require("./workflow-service/observability").initialize();
      const execute = require("./workflow-service/workflow/index.js") as (
        id: string,
        request: unknown,
      ) => Promise<{
        status: number;
        body: Record<string, unknown> | Record<string, unknown>[];
      }>;
      const a = { sub: "alice", role: "user", tenantId: "tenant-a" };
      const b = { sub: "bob", role: "user", tenantId: "tenant-b" };
      const created = await execute("create_endpoint", {
        user: a,
        body: { title: "A", ownerId: "bob", tenantId: "tenant-b" },
      });
      assert.equal((created.body as Record<string, unknown>).ownerId, "alice");
      assert.equal(
        (created.body as Record<string, unknown>).tenantId,
        "tenant-a",
      );
      assert.equal(
        (await execute("list_endpoint", { user: b })).body instanceof Array,
        true,
      );
      assert.equal(
        ((await execute("list_endpoint", { user: b })).body as unknown[])
          .length,
        0,
      );
      await assert.rejects(
        execute("update_endpoint", {
          user: b,
          params: { id: (created.body as Record<string, unknown>)._id },
          body: { title: "stolen" },
        }),
        /not found/,
      );
      assert.equal(await Entry.countDocuments({ title: "stolen" }), 0);
      await assert.rejects(
        execute("list_endpoint", { user: { sub: "alice", role: "user" } }),
        /Tenant access denied/,
      );
      await assert.rejects(
        execute("list_endpoint", {}),
        /Authentication required/,
      );
      await assert.rejects(
        execute("tx_endpoint", { user: a, body: { title: "rollback" } }),
        /duplicate key/,
      );
      assert.equal(
        await Entry.countDocuments({ title: "rollback" }),
        0,
        "first write must roll back after second write fails",
      );
      assert.equal(await Entry.countDocuments({ title: "A" }), 1);
      const audit = mongoose.connection.db!.collection("levoks_audit");
      assert.equal(
        await audit.countDocuments({ phase: "transaction_committed" }),
        0,
        "rolled-back transactions leave no committed audit event",
      );
      await execute("single_tx_endpoint", {
        user: a,
        body: { title: "atomic-audit" },
        levoksRequestId: "transaction-request",
      });
      const committed = await audit.findOne({ phase: "transaction_committed" });
      assert.equal(committed?.actorId, "alice");
      assert.equal(committed?.tenantId, "tenant-a");
      assert.equal(committed?.requestId, "transaction-request");
      assert.equal(await Entry.countDocuments({ title: "atomic-audit" }), 1);
      await mongoose.connection.db!.command({
        collMod: "levoks_audit",
        validator: { phase: { $ne: "transaction_committed" } },
        validationLevel: "strict",
      });
      await assert.rejects(
        execute("single_tx_endpoint", {
          user: a,
          body: { title: "audit-rejected" },
        }),
        /validation/i,
      );
      assert.equal(
        await Entry.countDocuments({ title: "audit-rejected" }),
        0,
        "audit write failure rolls back the business write in the same transaction",
      );
      assert.equal(
        await audit.countDocuments({ phase: "transaction_committed" }),
        1,
      );
      await mongoose.connection.db!.command({
        collMod: "levoks_audit",
        validator: {},
      });
      // Exercise the emitted Express server over HTTP, including its real JWT and validation middleware.
      const reservation = createServer();
      await new Promise<void>((resolve) =>
        reservation.listen(0, "127.0.0.1", resolve),
      );
      const port = (reservation.address() as { port: number }).port;
      await new Promise<void>((resolve, reject) =>
        reservation.close((error) => (error ? reject(error) : resolve())),
      );
      const secret = randomBytes(32).toString("hex");
      const child = spawn(
        process.execPath,
        [path.join(root, "workflow-service/server.js")],
        {
          env: {
            ...process.env,
            PORT: String(port),
            MONGO_URI: server.getUri("levoks_workflow_test"),
            JWT_SECRET: secret,
            NODE_ENV: "production",
          },
          stdio: ["ignore", "pipe", "pipe"],
          windowsHide: true,
        },
      );
      let logs = "";
      child.stdout.on("data", (data) => {
        logs += data.toString();
      });
      child.stderr.on("data", (data) => {
        logs += data.toString();
      });
      try {
        const origin = `http://127.0.0.1:${port}`;
        let ready = false;
        for (let i = 0; i < 60; i++) {
          try {
            if ((await fetch(origin + "/health")).ok) {
              ready = true;
              break;
            }
          } catch {}
          if (child.exitCode !== null) break;
          await new Promise((resolve) => setTimeout(resolve, 100));
        }
        assert.ok(ready, logs);
        assert.equal((await fetch(origin + "/entries")).status, 401);
        const jwt = require("jsonwebtoken") as {
          sign: (claims: object, key: string, options: object) => string;
        };
        const token = jwt.sign(a, secret, {
          algorithm: "HS256",
          expiresIn: "5m",
        });
        const headers = {
          Authorization: `Bearer ${token}`,
          "Content-Type": "application/json",
        };
        const createdHttp = await fetch(origin + "/entries", {
          method: "POST",
          headers,
          body: JSON.stringify({
            title: "HTTP created",
            ownerId: "mallory",
            tenantId: "tenant-b",
          }),
        });
        assert.equal(createdHttp.status, 200);
        assert.equal((await createdHttp.json()).ownerId, "alice");
        const forbidden = await fetch(origin + "/entries", {
          method: "POST",
          headers: { ...headers, Origin: "https://untrusted.test" },
          body: JSON.stringify({ title: "blocked" }),
        });
        assert.equal(forbidden.status, 403);
        const injection = await fetch(origin + "/entries", {
          method: "POST",
          headers,
          body: JSON.stringify({ title: { $ne: null } }),
        });
        assert.equal(injection.status, 400);
        assert.equal(await Entry.countDocuments({ title: "blocked" }), 0);
      } finally {
        child.kill();
        if (child.exitCode === null)
          await new Promise<void>((resolve) =>
            child.once("exit", () => resolve()),
          );
      }
    } finally {
      await mongoose.disconnect();
      await server.stop();
    }
  },
);
