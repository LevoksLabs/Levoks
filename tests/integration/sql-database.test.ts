import test from "node:test";
import assert from "node:assert/strict";
import { mkdir, writeFile, mkdtemp } from "node:fs/promises";
import { createRequire } from "node:module";
import path from "node:path";
import { spawn } from "node:child_process";
import { createServer } from "node:net";
import { randomBytes } from "node:crypto";
import { generateServiceCode } from "../../src/lib/codegen/express";
import { defaultDatabase } from "../../src/lib/backend/database";
import { modelLifecycleFixture } from "../helpers/model-lifecycle-fixture";

for (const engine of ["sqlite", "postgresql", "mysql", "mariadb"] as const) {
  const url = process.env[`LEVOKS_TEST_${engine.toUpperCase()}`];
  test(
    `generated ${engine} service persists typed data, enforces policies and rolls back transactions`,
    {
      timeout: 180000,
      skip:
        engine !== "sqlite" && !url
          ? "Supply a disposable database URL to run this engine"
          : false,
    },
    async () => {
      const base = path.resolve(".verification/runtime-test/sql");
      await mkdir(base, { recursive: true });
      const root = await mkdtemp(path.join(base, engine + "-"));
      const environment = `LEVOKS_DB_${engine.toUpperCase()}`;
      process.env[environment] = url || path.join(root, "persistent.sqlite");
      const service = {
        ...modelLifecycleFixture(),
        database: { ...defaultDatabase(engine), connectionEnv: environment },
      };
      Object.assign(
        service.blocks.find((b) => b.id === "trash_report")!.config,
        {
          aggregation: {
            groupBy: "enabled",
            metrics: [
              { name: "count", operation: "count", field: "" },
              { name: "total", operation: "sum", field: "quantity" },
              { name: "average", operation: "avg", field: "quantity" },
              { name: "earliest", operation: "min", field: "availableAt" },
            ],
          },
        },
      );
      for (const [name, source] of Object.entries(
        generateServiceCode(service),
      )) {
        const file = path.join(root, name);
        await mkdir(path.dirname(file), { recursive: true });
        await writeFile(file, source);
      }
      const require = createRequire(path.join(root, "entry.cjs"));
      const database = require("./workflow-service/database.js");
      try {
        await assert.rejects(database.connect(), /db:migrate/);
        await database.migrate();
        await database.migrate();
        await database.connect();
        const schema = await database
          .db("levoks_schema")
          .where({ id: "resources" })
          .first();
        await database
          .db("levoks_schema")
          .where({ id: "resources" })
          .update({ hash: "changed" });
        await assert.rejects(database.connect(), /schema differs/);
        await database
          .db("levoks_schema")
          .where({ id: "resources" })
          .update({ hash: schema.hash });
        const execute = require("./workflow-service/workflow");
        const alice = { sub: "alice", tenantId: "tenant-a", role: "user" };
        const created = (
          await execute("create_endpoint", {
            user: alice,
            body: { title: "SQL record" },
          })
        ).body;
        assert.equal(created.quantity, 0);
        assert.equal(created.enabled, false);
        assert.equal(created.description, "");
        assert.deepEqual(created.settings, { theme: "dark" });
        assert.deepEqual(created.tags, ["new", 1, false]);
        assert.equal(created.availableAt, "2026-10-02T00:00:00.000Z");
        const request = { user: alice, params: { id: created._id } };
        await assert.rejects(
          execute("delete_endpoint", { user: alice }),
          /filter/,
        );
        await assert.rejects(
          execute("delete_endpoint", {
            ...request,
            user: { ...alice, sub: "bob" },
          }),
          /not found/i,
        );
        await execute("delete_endpoint", request);
        assert.deepEqual(
          (await execute("list_endpoint", { user: alice })).body,
          [],
        );
        assert.equal(
          (await execute("trash_count_endpoint", { user: alice })).body,
          1,
        );
        assert.deepEqual(
          (await execute("trash_report_endpoint", { user: alice })).body,
          [
            {
              _id: false,
              count: 1,
              total: 0,
              average: 0,
              earliest: "2026-10-02T00:00:00.000Z",
            },
          ],
        );
        await assert.rejects(
          execute("rollback_restore_endpoint", request),
          /not found/i,
        );
        await assert.rejects(
          execute("rollback_purge_endpoint", request),
          /not found/i,
        );
        assert.equal(
          (await execute("trash_count_endpoint", { user: alice })).body,
          1,
        );
        await execute("restore_endpoint", request);
        await assert.rejects(
          execute("create_endpoint", {
            user: alice,
            body: { title: "SQL record" },
          }),
          (e: unknown) => (e as { status: number }).status === 409,
        );
        await execute("delete_endpoint", request);
        await execute("purge_endpoint", request);
        assert.equal(
          (await execute("trash_count_endpoint", { user: alice })).body,
          0,
        );

        const reservation = createServer();
        await new Promise<void>((resolve) =>
          reservation.listen(0, "127.0.0.1", resolve),
        );
        const port = (reservation.address() as { port: number }).port;
        await new Promise<void>((resolve) =>
          reservation.close(() => resolve()),
        );
        const secret = randomBytes(32).toString("hex");
        const jwt = require("jsonwebtoken");
        const headers = {
          Authorization: `Bearer ${jwt.sign(alice, secret, { expiresIn: "5m" })}`,
          "Content-Type": "application/json",
        };
        const start = async () => {
          const child = spawn(
            process.execPath,
            [path.join(root, "workflow-service/server.js")],
            {
              env: { ...process.env, PORT: String(port), JWT_SECRET: secret },
              stdio: ["ignore", "pipe", "pipe"],
              windowsHide: true,
            },
          );
          let logs = "";
          child.stdout.on("data", (d) => {
            logs += d;
          });
          child.stderr.on("data", (d) => {
            logs += d;
          });
          for (let i = 0; i < 80; i++) {
            try {
              if ((await fetch(`http://127.0.0.1:${port}/health`)).ok)
                return child;
            } catch {}
            if (child.exitCode !== null) break;
            await new Promise((resolve) => setTimeout(resolve, 100));
          }
          child.kill();
          throw new Error(logs || "Server did not start");
        };
        const stop = async (child: ReturnType<typeof spawn>) => {
          child.kill();
          if (child.exitCode === null)
            await new Promise<void>((resolve) =>
              child.once("exit", () => resolve()),
            );
        };
        let child = await start();
        try {
          const response = await fetch(`http://127.0.0.1:${port}/plain`, {
            method: "POST",
            headers,
            body: JSON.stringify({
              title: "Persists after restart",
              enabled: true,
            }),
          });
          assert.equal(response.status, 201, await response.clone().text());
          const item = await response.json();
          assert.equal(item.enabled, true);
          assert.equal(item.createdAt, undefined);
          await stop(child);
          child = await start();
          const read = await fetch(
            `http://127.0.0.1:${port}/plain/${item._id}`,
            { headers },
          );
          assert.equal(read.status, 200);
          assert.equal((await read.json()).title, item.title);
          const bad = await fetch(`http://127.0.0.1:${port}/plain`, {
            method: "POST",
            headers,
            body: JSON.stringify({ title: { $ne: null } }),
          });
          assert.equal(bad.status, 400);
        } finally {
          await stop(child);
        }
      } finally {
        await database.disconnect();
        delete process.env[environment];
      }
    },
  );
}
