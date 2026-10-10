import test from "node:test";
import assert from "node:assert/strict";
import { randomBytes, randomUUID } from "node:crypto";
import { resolve } from "node:path";
import { MongoClient, Binary } from "mongodb";
import { MongoMemoryServer } from "mongodb-memory-server";
import {
  Deployments,
  processDeploymentJob,
} from "../../src/lib/server/deployments";
import { MongoVault } from "../../src/lib/server/vault";
import { emptyProject } from "../../src/lib/project/workspace";
import { compileProject } from "../../src/lib/project/compiler";
import { gzipSync } from "node:zlib";

test(
  "private archived releases pin source, reuse saved configuration, survive retries and enforce expiry/integrity/retention",
  { timeout: 180000 },
  async (t) => {
    const mongo = await MongoMemoryServer.create({
      binary: { downloadDir: resolve(".verification/mongodb-bin") },
      instance: { ip: "127.0.0.1" },
    });
    t.after(() => mongo.stop());
    const client = await MongoClient.connect(mongo.getUri());
    t.after(() => client.close());
    const db = client.db();
    const ring = { active: "test", keys: { test: randomBytes(32) } };
    const store = () => new Deployments(db, new MongoVault(db, ring));
    t.mock.method(globalThis, "fetch", async () =>
      Response.json({ id: "prj_test", name: "preview", framework: "nextjs" }),
    );
    const project = emptyProject("Archived original");
    const target = { name: "preview", providerProjectId: "prj_test" };
    await store().connect(
      "alice",
      project.id,
      target,
      "fixture-provider-token",
      0,
    );
    const baseline = compileProject(project).files;
    const original = randomUUID();
    let c = await store().enqueue(
      "alice",
      project.id,
      project,
      { APP_ORIGIN: "https://old.example.com" },
      1,
      0,
      original,
    );
    assert.equal(c.job?.snapshot, undefined);
    assert.equal(c.job?.sourceArchived, true);
    assert.deepEqual(
      (await store().archive("alice", project.id, original)).files,
      baseline,
    );
    await assert.rejects(
      store().archive("bob", project.id, original),
      /Connect a Vercel/,
    );
    await assert.rejects(
      store().archive("alice", "another-project", original),
      /Connect a Vercel/,
    );
    await assert.rejects(
      store().archive("alice", project.id, randomUUID()),
      /not in this project's/,
    );
    let creates = 0;
    const submitted: {
      files: Record<string, string>;
      environment: Record<string, string>;
    }[] = [];
    const transport = {
      create: async (
        _auth: unknown,
        files: Record<string, string>,
        environment: Record<string, string>,
        operationId: string,
      ) => {
        creates++;
        submitted.push({ files, environment });
        return {
          id: `dpl_${creates}`,
          readyState: "READY" as const,
          projectId: "prj_test",
          meta: { levoksOperation: operationId },
        };
      },
      status: async () => {
        throw new Error("No status call expected.");
      },
      recover: async () => {
        throw new Error("No recovery call expected.");
      },
    };
    await processDeploymentJob(store(), transport);
    const changed = { ...project, name: "Current canvas changed" };
    const newer = randomUUID();
    await store().enqueue(
      "alice",
      project.id,
      changed,
      { APP_ORIGIN: "https://new.example.com" },
      1,
      1,
      newer,
    );
    await processDeploymentJob(store(), transport);
    assert.notDeepEqual(submitted[1].files, baseline);
    const replayId = randomUUID();
    const [first, duplicate] = await Promise.all([
      store().replay("alice", project.id, original, 1, 2, replayId),
      store().replay("alice", project.id, original, 1, 2, replayId),
    ]);
    assert.equal(first.sequence, 3);
    assert.equal(duplicate.sequence, 3);
    assert.equal(first.history.at(-1)?.sourceOperationId, original);
    await assert.rejects(
      store().replay("alice", project.id, original, 1, 2, randomUUID()),
      /queue changed/,
    );
    await assert.rejects(
      store().replay("alice", project.id, newer, 1, 2, replayId),
      /different release/,
    );
    await processDeploymentJob(store(), transport);
    assert.deepEqual(submitted[2], {
      files: baseline,
      environment: { APP_ORIGIN: "https://old.example.com" },
    });
    const replayRetry = await store().replay(
      "alice",
      project.id,
      original,
      1,
      2,
      replayId,
    );
    assert.equal(replayRetry.sequence, 3);
    assert.equal(creates, 3);
    // Use direct saved metadata to exercise target mismatch without another provider.
    await db
      .collection<{ _id: string }>("levoks_deployments")
      .updateOne({ _id: c._id }, { $set: { providerProjectId: "prj_other" } });
    await assert.rejects(
      store().replay("alice", project.id, original, 1, 3, randomUUID()),
      /another deployment target/,
    );
    await db
      .collection<{ _id: string }>("levoks_deployments")
      .updateOne({ _id: c._id }, { $set: { providerProjectId: "prj_test" } });
    await db
      .collection("levoks_deployment_archives")
      .updateOne(
        { operationId: original },
        { $set: { expiresAt: new Date(0) } },
      );
    await assert.rejects(
      store().replay("alice", project.id, original, 1, 3, randomUUID()),
      /unavailable or expired/,
    );
    const corrupt = randomUUID();
    c = await store().enqueue("alice", project.id, project, {}, 1, 3, corrupt);
    await db.collection("levoks_deployment_archives").updateOne(
      { operationId: corrupt },
      {
        $set: {
          source: new Binary(
            gzipSync(JSON.stringify({ ...baseline, "README.md": "tampered" })),
          ),
        },
      },
    );
    await processDeploymentJob(store(), transport);
    assert.equal(
      creates,
      3,
      "Corrupt source must fail before a provider submission.",
    );
    assert.equal(
      (await store().require("alice", project.id)).history.at(-1)?.state,
      "error",
    );
    assert.match((await store().require("alice", project.id)).history.at(-1)!.message, /Queued source/);
    await assert.rejects(
      store().archive("alice", project.id, corrupt),
      /integrity check/,
    );
    for (let index = 0; index < 30; index++) {
      c = await store().require("alice", project.id);
      const id = randomUUID();
      await store().enqueue(
        "alice",
        project.id,
        project,
        {},
        c.version,
        c.sequence,
        id,
      );
      await store().cancel("alice", project.id, id);
    }
    c = await store().require("alice", project.id);
    assert.equal(c.history.length, 30);
    assert.equal(
      await db
        .collection("levoks_deployment_archives")
        .countDocuments({ ownerId: "alice", projectId: project.id }),
      30,
    );
    await assert.rejects(
      store().archive("alice", project.id, newer),
      /not in this project's/,
    );
    assert.doesNotMatch(
      JSON.stringify(c.history),
      /fixture-provider-token|frontend\/package.json/,
    );
  },
);
