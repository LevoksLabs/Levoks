import test from "node:test";
import assert from "node:assert/strict";
import { randomBytes } from "node:crypto";
import { MongoClient } from "mongodb";
import { MongoMemoryServer } from "mongodb-memory-server";
import path from "node:path";
import {
  GitHubConnections,
  connectionMetadata,
  processGitHubJob,
} from "../../src/lib/server/github-connections";
import { MongoVault } from "../../src/lib/server/vault";
import { HttpError } from "../../src/lib/server/http";
import { emptyProject } from "../../src/lib/project/workspace";

test(
  "durable GitHub queue survives store restart, serializes workers, isolates owners and preserves concurrent edits",
  { timeout: 180000 },
  async (t) => {
    const mongo = await MongoMemoryServer.create({
      binary: { downloadDir: path.resolve(".verification/mongodb-bin") },
      instance: { ip: "127.0.0.1" },
    });
    const client = await MongoClient.connect(mongo.getUri());
    const head = "a".repeat(40),
      nextHead = "b".repeat(40);
    t.mock.method(globalThis, "fetch", async () =>
      Response.json({ object: { sha: head } }),
    );
    try {
      const db = client.db("connections");
      const ring = { active: "test", keys: { test: randomBytes(32) } };
      const store = new GitHubConnections(db, new MongoVault(db, ring));
      const project = emptyProject("Durable project");
      const target = {
        token: "fixture-provider-token",
        owner: "alice",
        repo: "sandbox",
        branch: "main",
      };
      const connected = await store.connect(
        "alice",
        project.id,
        target,
        0,
        head,
      );
      assert.equal(await store.get("bob", project.id), null);
      await assert.rejects(
        store.enqueue("bob", project.id, project, 0, 1, "Unauthorized", true),
        /Connect/,
      );
      assert.doesNotMatch(
        JSON.stringify(connectionMetadata(connected)),
        /secretName|token|desired|lease/,
      );
      assert.doesNotMatch(
        JSON.stringify(
          await db.collection("levoks_secrets").find({}).toArray(),
        ),
        /fixture-provider-token/,
      );
      assert.deepEqual(
        await new MongoVault(db, ring).list("alice", project.id),
        [],
      );
      const queued = await store.enqueue(
        "alice",
        project.id,
        project,
        0,
        1,
        "Save",
        true,
      );
      await assert.rejects(
        store.enqueue(
          "alice",
          project.id,
          { ...project, name: "Stale tab" },
          0,
          1,
          "Save",
          true,
        ),
        /Another editor/,
      );
      await assert.rejects(
        store.disconnect("alice", project.id, 1),
        /Cancel pending/,
      );
      // A new store instance sees acknowledged work without any browser state.
      const restarted = new GitHubConnections(db, new MongoVault(db, ring));
      let calls = 0;
      await processGitHubJob(
        restarted,
        async (actualTarget, id, files, expectedHead, message, options) => {
          calls++;
          assert.equal(actualTarget.token, target.token);
          assert.equal(id, project.id);
          assert.equal(expectedHead, head);
          assert.equal(message, "Save");
          assert.ok((files as Record<string, string>)["frontend/package.json"]);
          assert.match(options!.operationId!, /:1:1$/);
          assert.equal(
            await store.claim(),
            null,
            "another worker cannot claim the same connection",
          );
          await assert.rejects(
            store.configure("alice", project.id, 1, false, true),
            /busy/,
          );
          await store.enqueue(
            "alice",
            project.id,
            { ...project, name: "Newer edit" },
            queued.sequence,
            1,
            "Next",
            true,
          );
          await options!.beforePush!();
          return {
            sha: nextHead,
            unchanged: false,
            url: "https://github.com/alice/sandbox/commit/test",
          };
        },
      );
      const pending = await restarted.require("alice", project.id);
      assert.equal(pending.head, nextHead);
      assert.equal(pending.sequence, 2);
      assert.equal(pending.processed, 1);
      assert.equal(pending.status, "queued");
      assert.equal(pending.desired?.project.name, "Newer edit");
      assert.equal(calls, 1);
      await processGitHubJob(restarted, async () => {
        throw new HttpError(409, "Remote branch changed");
      });
      assert.equal(
        (await store.require("alice", project.id)).status,
        "conflict",
      );
      assert.equal(await store.claim(), null, "conflicts never auto-retry");
      await store.configure("alice", project.id, 1, false, true);
      await store.connect(
        "alice",
        project.id,
        { ...target, token: "replacement-token" },
        2,
        head,
      );
      assert.equal(
        await db.collection("levoks_secrets").countDocuments(),
        1,
        "old encrypted credential is removed on reconnect",
      );
      const auto = await store.configure("alice", project.id, 3, true, false);
      await db
        .collection("levoks_projects")
        .insertOne({
          ownerId: "alice",
          projectId: project.id,
          revision: 1,
          document: project,
        });
      await store.enqueueCloudSaves();
      const cloud = await store.require("alice", project.id);
      assert.equal(cloud.sequence, 1);
      assert.equal(cloud.cloudRevision, 1);
      assert.ok(cloud.dueAt.getTime() > Date.now());
      assert.equal(
        await store.claim(),
        null,
        "scheduled commits wait for their due time",
      );
      await store.enqueueCloudSaves();
      assert.equal((await store.require("alice", project.id)).sequence, 1);
      await store.configure("alice", project.id, auto.version, false, true);
      const c = await store.require("alice", project.id);
      await store.enqueue(
        "alice",
        project.id,
        project,
        c.sequence,
        c.version,
        "Retry",
        true,
      );
      const leased = await store.claim();
      assert.ok(leased);
      await db
        .collection("levoks_github_connections")
        .updateOne(
          { projectId: project.id },
          { $set: { "lease.expires": new Date(0) } },
        );
      const reclaimed = await restarted.claim();
      assert.ok(reclaimed);
      await assert.rejects(store.retain(leased), /lease expired/);
      await store.fail(leased, new HttpError(401, "Old worker"));
      assert.equal(
        (await store.require("alice", project.id)).status,
        "running",
        "expired workers cannot overwrite a new lease",
      );
      await store.fail(reclaimed, new HttpError(401, "Token expired"));
      assert.equal(
        (await store.require("alice", project.id)).status,
        "reauthorize",
      );
      const canceled = await store.configure(
        "alice",
        project.id,
        c.version,
        false,
        true,
      );
      await store.disconnect("alice", project.id, canceled.version);
      assert.equal(await store.get("alice", project.id), null);
      assert.equal(await db.collection("levoks_secrets").countDocuments(), 0);
    } finally {
      await client.close();
      await mongo.stop();
    }
  },
);
