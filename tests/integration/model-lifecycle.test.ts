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
import { modelLifecycleFixture } from "../helpers/model-lifecycle-fixture";

test(
  "exported models apply typed defaults and enforce scoped restore, purge and rollback",
  { timeout: 240000 },
  async () => {
    const root = path.resolve(".verification/runtime-test/model-lifecycle");
    const require = createRequire(path.join(root, "entry.cjs"));
    const mongoose = require("mongoose") as typeof mongooseTypes;
    for (const [name, source] of Object.entries(
      generateServiceCode(modelLifecycleFixture()),
    )) {
      const target = path.resolve(root, name);
      assert.ok(target.startsWith(root + path.sep));
      await mkdir(path.dirname(target), { recursive: true });
      await writeFile(target, source);
    }
    const mongo = await MongoMemoryReplSet.create({
      binary: { downloadDir: path.resolve(".verification/mongodb-bin") },
      replSet: { count: 1, storageEngine: "wiredTiger", ip: "127.0.0.1" },
    });
    try {
      await mongoose.connect(mongo.getUri("model_lifecycle"));
      const Entry =
        require("./workflow-service/models/Entry.js") as mongooseTypes.Model<
          Record<string, unknown>
        >;
      const Plain =
        require("./workflow-service/models/Plain.js") as mongooseTypes.Model<
          Record<string, unknown>
        >;
      await Promise.all([Entry.init(), Plain.init()]);
      const execute = require("./workflow-service/workflow/index.js") as (
        id: string,
        request: unknown,
      ) => Promise<{ status: number; body: unknown }>;
      const alice = { sub: "alice", role: "user", tenantId: "tenant-a" };
      const bob = { sub: "bob", role: "user", tenantId: "tenant-a" };
      const otherTenant = { ...alice, tenantId: "tenant-b" };
      const created = (
        await execute("create_endpoint", {
          user: alice,
          body: { title: "Lifecycle" },
        })
      ).body as Record<string, unknown>;
      assert.equal(created.quantity, 0);
      assert.equal(created.enabled, false);
      assert.equal(created.description, "");
      assert.deepEqual(created.settings, { theme: "dark" });
      assert.deepEqual(created.tags, ["new", 1, false]);
      assert.equal(
        new Date(String(created.availableAt)).toISOString(),
        "2026-10-02T00:00:00.000Z",
      );
      assert.equal(String(created.referenceId), "507f1f77bcf86cd799439011");
      assert.ok(created.createdAt && created.updatedAt);
      const request = { user: alice, params: { id: String(created._id) } };
      await assert.rejects(
        execute("delete_endpoint", { user: alice, params: {} }),
        /filter/i,
      );
      assert.equal(await Entry.countDocuments({ deletedAt: null }), 1);
      for (const operation of ["restore", "purge"])
        await assert.rejects(
          execute(`${operation}_endpoint`, request),
          /not found/i,
        );
      await execute("delete_endpoint", request);
      assert.deepEqual(
        (await execute("list_endpoint", { user: alice })).body,
        [],
      );
      assert.equal(
        ((await execute("trash_endpoint", { user: alice })).body as unknown[])
          .length,
        1,
      );
      assert.equal(
        ((await execute("all_endpoint", { user: alice })).body as unknown[])
          .length,
        1,
      );
      assert.equal(
        (await execute("trash_count_endpoint", { user: alice })).body,
        1,
      );
      assert.equal(
        (
          (await execute("trash_report_endpoint", { user: alice }))
            .body as unknown[]
        ).length,
        1,
      );
      for (const user of [bob, otherTenant]) {
        assert.deepEqual((await execute("trash_endpoint", { user })).body, []);
        for (const operation of ["restore", "purge"])
          await assert.rejects(
            execute(`${operation}_endpoint`, { ...request, user }),
            /not found/i,
          );
      }
      await assert.rejects(
        execute("update_endpoint", {
          ...request,
          body: { title: "Hidden edit" },
        }),
        /not found/i,
      );
      await assert.rejects(
        execute("rollback_restore_endpoint", request),
        /not found/i,
      );
      assert.ok(
        (await Entry.findById(created._id).lean())?.deletedAt,
        "failed transaction restores the tombstone",
      );
      await assert.rejects(
        execute("rollback_purge_endpoint", request),
        /not found/i,
      );
      assert.ok(
        (await Entry.findById(created._id).lean())?.deletedAt,
        "failed transaction restores the purged record",
      );
      await execute("restore_endpoint", request);
      assert.equal(
        ((await execute("list_endpoint", { user: alice })).body as unknown[])
          .length,
        1,
      );
      await execute("delete_endpoint", request);
      await assert.rejects(
        execute("create_endpoint", {
          user: alice,
          body: { title: "Lifecycle" },
        }),
        /duplicate key/i,
      );
      await execute("purge_endpoint", request);
      assert.equal(await Entry.countDocuments(), 0);
      await assert.rejects(execute("purge_endpoint", request), /not found/i);

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
            MONGO_URI: mongo.getUri("model_lifecycle"),
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
        for (let i = 0; i < 80; i++) {
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
        const jwt = require("jsonwebtoken") as {
          sign(claims: object, secret: string, options: object): string;
        };
        const headers = {
          Authorization: `Bearer ${jwt.sign(alice, secret, { algorithm: "HS256", expiresIn: "5m" })}`,
          "Content-Type": "application/json",
        };
        const call = (route: string, method = "GET", body?: object) =>
          fetch(origin + route, {
            method,
            headers,
            body: body ? JSON.stringify(body) : undefined,
          });
        const response = await call("/plain", "POST", {
          title: "Default from HTTP",
          deletedAt: "2026-01-01",
        });
        assert.equal(response.status, 201, await response.clone().text());
        const item = await response.json();
        assert.equal(item.enabled, false);
        assert.equal(item.quantity, 0);
        assert.equal(item.createdAt, undefined);
        assert.equal(item.deletedAt, null);
        const second = await (
          await call("/plain", "POST", {
            title: "Override",
            quantity: 7,
            enabled: true,
            settings: { theme: "light" },
          })
        ).json();
        assert.equal(second.quantity, 7);
        assert.equal(second.enabled, true);
        assert.deepEqual(second.settings, { theme: "light" });
        assert.deepEqual((await Plain.findById(item._id).lean())?.settings, {
          theme: "dark",
        });
        assert.equal((await call(`/plain/${item._id}`, "DELETE")).status, 200);
        assert.ok((await Plain.findById(item._id).lean())?.deletedAt);
        assert.equal((await call(`/plain/${item._id}`)).status, 404);
        assert.equal(
          (await call(`/plain/${item._id}`, "PATCH", { title: "Hidden edit" }))
            .status,
          404,
        );
        assert.equal((await call(`/plain/${item._id}`, "DELETE")).status, 404);
        assert.equal((await (await call("/plain")).json()).length, 1);
      } finally {
        child.kill();
        if (child.exitCode === null)
          await new Promise<void>((resolve) =>
            child.once("exit", () => resolve()),
          );
      }
    } finally {
      await mongoose.disconnect();
      await mongo.stop();
    }
  },
);
