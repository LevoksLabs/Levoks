import test from "node:test";
import assert from "node:assert/strict";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { createRequire } from "node:module";
import { spawn, type ChildProcess } from "node:child_process";
import { createServer } from "node:net";
import { randomBytes } from "node:crypto";
import { MongoMemoryReplSet, MongoMemoryServer } from "mongodb-memory-server";
import type mongooseTypes from "mongoose";
import JSZip from "jszip";
import { generateServiceCode } from "../../src/lib/codegen/express";
import { relationsFixture } from "../helpers/relations-fixture";

type RecordData = Record<string, unknown>;

async function freePort() {
  const server = createServer();
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
  const port = (server.address() as { port: number }).port;
  await new Promise<void>((resolve, reject) =>
    server.close((error) => (error ? reject(error) : resolve())),
  );
  return port;
}

async function stop(child: ChildProcess) {
  if (child.exitCode !== null || child.signalCode !== null) return;
  await new Promise<void>((resolve) => {
    child.once("exit", () => resolve());
    child.kill();
  });
}

test(
  "a generated relation service refuses standalone MongoDB with an actionable startup error",
  { timeout: 120000 },
  async () => {
    const root = path.resolve(
      ".verification/runtime-test/relations-standalone",
    );
    for (const [name, source] of Object.entries(
      generateServiceCode(relationsFixture()),
    )) {
      const target = path.resolve(root, name);
      assert.ok(target.startsWith(root + path.sep));
      await mkdir(path.dirname(target), { recursive: true });
      await writeFile(target, source);
    }
    const mongo = await MongoMemoryServer.create({
      binary: { downloadDir: path.resolve(".verification/mongodb-bin") },
      instance: { ip: "127.0.0.1" },
    });
    const child = spawn(
      process.execPath,
      [path.join(root, "relations-service/server.js")],
      {
        env: {
          ...process.env,
          MONGO_URI: mongo.getUri("relations_standalone"),
          PORT: String(await freePort()),
          NODE_ENV: "production",
        },
        stdio: ["ignore", "pipe", "pipe"],
        windowsHide: true,
      },
    );
    let output = "";
    child.stdout!.on("data", (data) => {
      output += data.toString();
    });
    child.stderr!.on("data", (data) => {
      output += data.toString();
    });
    try {
      const code = await new Promise<number | null>((resolve, reject) => {
        const timeout = setTimeout(
          () =>
            reject(
              new Error("Standalone service did not reject its configuration"),
            ),
          15000,
        );
        child.once("error", (error) => {
          clearTimeout(timeout);
          reject(error);
        });
        child.once("exit", (exitCode) => {
          clearTimeout(timeout);
          resolve(exitCode);
        });
      });
      assert.equal(code, 1);
      assert.match(
        output,
        /Relations require a MongoDB replica set or sharded cluster/,
      );
      assert.match(output, /RELATIONS.md/);
      assert.ok(!output.includes(mongo.getUri("relations_standalone")));
    } finally {
      await stop(child);
      await mongo.stop();
    }
  },
);

test(
  "downloaded relationships enforce scope, cardinality, cascade rollback, recovery and concurrent replicas",
  { timeout: 240000 },
  async () => {
    const root = path.resolve(".verification/runtime-test/relations");
    const require = createRequire(path.join(root, "entry.cjs"));
    const mongoose = require("mongoose") as typeof mongooseTypes;
    const files: Record<string, string> = {};
    if (process.env.LEVOKS_RELATIONS_EXPORT) {
      const zip = await JSZip.loadAsync(
        await readFile(process.env.LEVOKS_RELATIONS_EXPORT),
      );
      assert.ok(zip.file("levoks.project.json"));
      for (const name of Object.keys(zip.files))
        if (
          name.startsWith("backend/relations-service/") &&
          !zip.files[name].dir
        )
          files[name.slice("backend/".length)] =
            await zip.files[name].async("string");
    } else Object.assign(files, generateServiceCode(relationsFixture()));
    for (const [name, source] of Object.entries(files)) {
      const target = path.resolve(root, name);
      assert.ok(target.startsWith(root + path.sep));
      await mkdir(path.dirname(target), { recursive: true });
      await writeFile(target, source);
    }
    const mongo = await MongoMemoryReplSet.create({
      binary: { downloadDir: path.resolve(".verification/mongodb-bin") },
      replSet: { count: 1, storageEngine: "wiredTiger", ip: "127.0.0.1" },
    });
    const children: ChildProcess[] = [];
    try {
      const uri = mongo.getUri("relations");
      await mongoose.connect(uri);
      const load = (name: string) =>
        require(
          `./relations-service/models/${name}.js`,
        ) as mongooseTypes.Model<RecordData>;
      const Project = load("Project"),
        Task = load("Task"),
        Profile = load("Profile"),
        Tag = load("Tag"),
        Link = load("ProjectTag"),
        Note = load("Note");
      const secret = randomBytes(32).toString("hex");
      const jwt = require("jsonwebtoken") as {
        sign: (
          value: unknown,
          secret: string,
          options: { expiresIn: string },
        ) => string;
      };
      const alice = { sub: "alice", role: "user", tenantId: "tenant-a" };
      const headers = (principal = alice) => ({
        "Content-Type": "application/json",
        Authorization: `Bearer ${jwt.sign(principal, secret, { expiresIn: "1h" })}`,
      });
      const launch = async (selectedPort?: number) => {
        const port = selectedPort ?? (await freePort());
        const child = spawn(
          process.execPath,
          [path.join(root, "relations-service/server.js")],
          {
            env: {
              ...process.env,
              PORT: String(port),
              MONGO_URI: uri,
              JWT_SECRET: secret,
              NODE_ENV: "production",
            },
            stdio: ["ignore", "pipe", "pipe"],
            windowsHide: true,
          },
        );
        children.push(child);
        let logs = "";
        child.stdout!.on("data", (data) => {
          logs += data.toString();
        });
        child.stderr!.on("data", (data) => {
          logs += data.toString();
        });
        const origin = `http://127.0.0.1:${port}`;
        for (let i = 0; i < 100; i++) {
          if (child.exitCode !== null)
            assert.fail(`Generated service exited: ${logs}`);
          try {
            const response = await fetch(origin + "/health/ready");
            await response.body?.cancel();
            if (response.ok) return { origin, child, port };
          } catch {}
          await new Promise((resolve) => setTimeout(resolve, 150));
        }
        assert.fail(`Generated service did not become ready: ${logs}`);
      };
      let first = await launch();
      const second = await launch();
      const send = async (
        route: string,
        body: RecordData = {},
        principal = alice,
        origin = first.origin,
        method = "POST",
      ) => {
        const response = await fetch(origin + route, {
          method,
          headers: headers(principal),
          ...(method === "DELETE" ? {} : { body: JSON.stringify(body) }),
        });
        return {
          status: response.status,
          data: (await response.json()) as RecordData,
        };
      };
      const create = async (
        model: string,
        values: RecordData = {},
        principal = alice,
      ) => {
        const result = await send(
          `/${model}/create`,
          { title: `${model} record`, ...values },
          principal,
        );
        assert.equal(result.status, 200, JSON.stringify(result.data));
        return String(result.data._id);
      };
      const bad = "507f1f77bcf86cd799439011";
      assert.equal(
        (
          await fetch(first.origin + "/task/create", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ title: "anonymous", projectId: bad }),
          })
        ).status,
        401,
      );
      assert.equal(
        (
          await send("/task/create", {
            title: "missing parent",
            projectId: bad,
          })
        ).status,
        409,
      );
      const parent = await create("parent");
      const task = await create("task", { projectId: parent });
      const note = await create("note", { projectId: parent });
      const tag = await create("tag");
      for (const principal of [
        { ...alice, tenantId: "tenant-b" },
        { ...alice, sub: "bob" },
      ]) {
        assert.equal(
          (
            await send(
              "/task/create",
              { title: "Cross-scope", projectId: parent },
              principal,
            )
          ).status,
          409,
        );
        assert.equal(
          (await send(`/parent/delete/${parent}`, {}, principal)).status,
          404,
        );
      }
      assert.equal(
        (await send(`/task/update/${task}`, { projectId: bad })).status,
        409,
      );
      assert.equal(
        String((await Task.findById(task).lean())?.projectId),
        parent,
      );
      const alternate = await create("parent", { title: "Alternate" });
      assert.equal(
        (await send(`/task/update/${task}`, { projectId: alternate })).status,
        200,
      );
      assert.equal(
        (await send(`/task/update/${task}`, { projectId: parent })).status,
        200,
      );

      const profiles = await Promise.all(
        [first, second].map((server) =>
          send(
            "/profile/create",
            { title: "Concurrent profile", projectId: parent },
            alice,
            server.origin,
          ),
        ),
      );
      assert.deepEqual(
        profiles.map((result) => result.status).sort(),
        [200, 409],
      );
      assert.equal(await Profile.countDocuments({ projectId: parent }), 1);
      const profile = String(
        profiles.find((result) => result.status === 200)!.data._id,
      );
      const links = await Promise.all(
        [first, second].map((server) =>
          send(
            "/link/create",
            { title: "Concurrent membership", projectId: parent, tagId: tag },
            alice,
            server.origin,
          ),
        ),
      );
      assert.deepEqual(links.map((result) => result.status).sort(), [200, 409]);
      assert.equal(
        await Link.countDocuments({ projectId: parent, tagId: tag }),
        1,
      );
      const foreignTag = await create(
        "tag",
        {},
        { ...alice, tenantId: "tenant-b" },
      );
      assert.equal(
        (
          await send("/link/create", {
            title: "Cross-tenant junction",
            projectId: parent,
            tagId: foreignTag,
          })
        ).status,
        409,
      );

      // Tasks are cascaded before the Profile restriction is encountered. All work rolls back.
      for (const route of [
        `/parent/delete/${parent}`,
        `/parent/catch/${parent}`,
      ]) {
        assert.equal((await send(route)).status, 409);
        assert.equal((await Project.findById(parent).lean())?.deletedAt, null);
        assert.equal((await Task.findById(task).lean())?.deletedAt, null);
        assert.equal(await Link.countDocuments({ projectId: parent }), 1);
        assert.equal(
          String((await Note.findById(note).lean())?.projectId),
          parent,
        );
      }
      assert.equal((await send(`/profile/delete/${profile}`)).status, 200);
      assert.equal(
        (await send(`/parent/delete/${parent}`)).status,
        409,
        "deleted dependents still restrict deletion",
      );
      assert.equal((await send(`/profile/purge/${profile}`)).status, 200);
      assert.equal((await send(`/parent/rollback/${parent}`)).status, 404);
      assert.equal((await Task.findById(task).lean())?.deletedAt, null);
      assert.equal(await Link.countDocuments({ projectId: parent }), 1);
      assert.equal((await send(`/parent/delete/${parent}`)).status, 200);
      assert.ok((await Task.findById(task).lean())?.deletedAt);
      assert.equal((await Note.findById(note).lean())?.projectId, undefined);
      assert.equal(await Link.countDocuments({ projectId: parent }), 0);
      assert.equal(await Tag.countDocuments({ _id: tag }), 1);
      assert.equal((await send(`/task/restore/${task}`)).status, 409);
      assert.equal(
        (
          await send("/task/create", {
            title: "Deleted parent",
            projectId: parent,
          })
        ).status,
        409,
      );
      assert.equal((await send(`/parent/restore/${parent}`)).status, 200);
      assert.ok(
        (await Task.findById(task).lean())?.deletedAt,
        "children restore separately",
      );
      assert.equal((await send(`/task/restore/${task}`)).status, 200);
      assert.equal((await send(`/parent/delete/${parent}`)).status, 200);
      assert.equal((await send(`/parent/purge/${parent}`)).status, 200);
      assert.equal(await Task.countDocuments({ _id: task }), 0);

      const rawParent = await create("parent");
      const raw = {
        title: "Inferred CRUD",
        ownerId: "alice",
        tenantId: "tenant-a",
        projectId: rawParent,
      };
      assert.equal(
        (await send("/raw-task", { ...raw, projectId: bad })).status,
        409,
      );
      const rawTask = await send("/raw-task", raw);
      assert.equal(rawTask.status, 201);
      assert.equal(
        (
          await send(
            `/raw-task/${rawTask.data._id}`,
            { projectId: bad },
            alice,
            first.origin,
            "PATCH",
          )
        ).status,
        409,
      );
      assert.equal(
        (
          await send(
            `/raw-parent/${rawParent}`,
            {},
            alice,
            first.origin,
            "DELETE",
          )
        ).status,
        200,
      );
      assert.ok((await Task.findById(rawTask.data._id).lean())?.deletedAt);

      for (let i = 0; i < 5; i++) {
        const id = await create("parent", { title: `Race ${i}` });
        const results = await Promise.all([
          send(
            "/task/create",
            { title: "Racing child", projectId: id },
            alice,
            first.origin,
          ),
          send(`/parent/delete/${id}`, {}, alice, second.origin),
        ]);
        assert.equal(results[1].status, 200);
        assert.ok([200, 409].includes(results[0].status));
        assert.equal(
          await Task.countDocuments({ projectId: id, deletedAt: null }),
          0,
          "no active orphan survives concurrent replicas",
        );
      }

      const corruptParent = await create("parent");
      const corrupt = await Task.create({
        title: "Imported corruption",
        ownerId: "bob",
        tenantId: "tenant-b",
        projectId: corruptParent,
      });
      assert.equal((await send(`/parent/delete/${corruptParent}`)).status, 409);
      assert.equal(
        (await Project.findById(corruptParent).lean())?.deletedAt,
        null,
      );
      assert.equal((await Task.findById(corrupt._id).lean())?.deletedAt, null);

      const large = await create("parent");
      await Task.insertMany(
        Array.from({ length: 1000 }, (_, i) => ({
          title: `Limit ${i}`,
          ownerId: "alice",
          tenantId: "tenant-a",
          projectId: large,
        })),
      );
      assert.equal((await send(`/parent/delete/${large}`)).status, 422);
      assert.equal(
        await Task.countDocuments({ projectId: large, deletedAt: null }),
        1000,
      );
      assert.equal((await Project.findById(large).lean())?.deletedAt, null);

      const durableParent = await create("parent");
      const durableProfile = await create("profile", {
        projectId: durableParent,
      });
      const port = first.port;
      await stop(first.child);
      first = await launch(port);
      assert.equal(await Profile.countDocuments({ _id: durableProfile }), 1);
      assert.equal(
        (
          await send("/profile/create", {
            title: "After restart",
            projectId: durableParent,
          })
        ).status,
        409,
      );
      assert.equal((await send(`/parent/delete/${durableParent}`)).status, 409);
      console.log(
        "Verified real HTTP/replica-set relation writes, two service processes, restart and rollback" +
          (process.env.LEVOKS_RELATIONS_EXPORT
            ? " using the browser-downloaded ZIP"
            : " using generated fixtures"),
      );
    } finally {
      await Promise.all(children.map(stop));
      await mongoose.disconnect();
      await mongo.stop();
    }
  },
);
