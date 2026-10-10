import test from "node:test";
import assert from "node:assert/strict";
import { randomBytes, randomUUID } from "node:crypto";
import { createServer } from "node:http";
import path from "node:path";
import { MongoClient } from "mongodb";
import { MongoMemoryServer } from "mongodb-memory-server";
import {
  Deployments,
  deploymentMetadata,
  processDeploymentJob,
} from "../../src/lib/server/deployments";
import { MongoVault } from "../../src/lib/server/vault";
import { emptyProject } from "../../src/lib/project/workspace";

test(
  "managed releases persist through worker restarts, fence leases and recover lost provider acknowledgements over HTTP",
  { timeout: 180000 },
  async (t) => {
    const mongo = await MongoMemoryServer.create({
      binary: { downloadDir: path.resolve(".verification/mongodb-bin") },
      instance: { ip: "127.0.0.1" },
    });
    t.after(() => mongo.stop());
    const client = await MongoClient.connect(mongo.getUri());
    t.after(() => client.close());
    const releases = new Map<
      string,
      {
        id: string;
        projectId: string;
        readyState: string;
        url: string;
        meta: { levoksOperation: string };
      }
    >();
    let creates = 0;
    let loseAcknowledgement = false;
    let statusCode = 200;
    const provider = createServer(async (req, res) => {
      assert.equal(req.headers.authorization, "Bearer fixture-vercel-token");
      const url = new URL(req.url!, "http://provider");
      assert.equal(url.searchParams.get("teamId"), "team_test");
      res.setHeader("Content-Type", "application/json");
      if (url.pathname.startsWith("/v9/projects/")) {
        res.end(
          JSON.stringify({
            id: "prj_test",
            name: "preview",
            framework: "nextjs",
          }),
        );
        return;
      }
      if (url.pathname === "/v13/deployments" && req.method === "POST") {
        if (statusCode !== 200) {
          res.statusCode = statusCode;
          res.end(
            JSON.stringify({ error: "fixture-vercel-token must never leak" }),
          );
          return;
        }
        let text = "";
        for await (const chunk of req) text += chunk;
        const body = JSON.parse(text);
        assert.equal(body.target, undefined);
        assert.equal(body.project, "prj_test");
        assert.ok(
          body.files.every(
            (file: { file: string }) => !file.file.startsWith("backend"),
          ),
        );
        const release = {
          id: `dpl_${++creates}`,
          projectId: "prj_test",
          readyState: "BUILDING",
          url: "fixture.vercel.app",
          meta: body.meta,
        };
        releases.set(release.id, release);
        if (loseAcknowledgement) {
          loseAcknowledgement = false;
          res.destroy();
          return;
        }
        res.end(JSON.stringify(release));
        return;
      }
      if (url.pathname === "/v7/deployments") {
        if (statusCode !== 200) {
          res.statusCode = statusCode;
          res.end("{}");
          return;
        }
        res.end(
          JSON.stringify({
            deployments: [...releases.values()].map((release) => ({
              uid: release.id,
              meta: release.meta,
            })),
            pagination: { next: null },
          }),
        );
        return;
      }
      const release = releases.get(url.pathname.split("/").at(-1)!);
      if (release) {
        release.readyState = "READY";
        res.end(JSON.stringify(release));
      } else {
        res.statusCode = 404;
        res.end("{}");
      }
    });
    await new Promise<void>((resolve) =>
      provider.listen(0, "127.0.0.1", resolve),
    );
    t.after(
      () => new Promise<void>((resolve) => provider.close(() => resolve())),
    );
    const port = (provider.address() as { port: number }).port;
    const realFetch = globalThis.fetch;
    t.mock.method(
      globalThis,
      "fetch",
      (url: string | URL | Request, init?: RequestInit) => {
        const remote = new URL(String(url));
        assert.equal(remote.origin, "https://api.vercel.com");
        return realFetch(
          `http://127.0.0.1:${port}${remote.pathname}${remote.search}`,
          init,
        );
      },
    );
    const db = client.db("deployment_acceptance");
    const ring = { active: "test", keys: { test: randomBytes(32) } };
    const store = () => new Deployments(db, new MongoVault(db, ring));
    const project = emptyProject("Managed release acceptance");
    const target = {
      name: "preview",
      providerProjectId: "prj_test",
      teamId: "team_test",
    };
    const connected = await store().connect(
      "alice",
      project.id,
      target,
      "fixture-vercel-token",
      0,
    );
    assert.equal(await store().get("bob", project.id), null);
    await assert.rejects(
      store().enqueue("bob", project.id, project, {}, 1, 0, randomUUID()),
      /Connect/,
    );
    assert.doesNotMatch(
      JSON.stringify(deploymentMetadata(connected)),
      /secretName|token|snapshot|lease/,
    );
    assert.doesNotMatch(
      JSON.stringify(await db.collection("levoks_secrets").find({}).toArray()),
      /fixture-vercel-token/,
    );
    assert.deepEqual(
      await new MongoVault(db, ring).list("alice", project.id),
      [],
    );
    const operationId = randomUUID();
    const [first, duplicate] = await Promise.all([
      store().enqueue("alice", project.id, project, {}, 1, 0, operationId),
      store().enqueue("alice", project.id, project, {}, 1, 0, operationId),
    ]);
    assert.equal(first.sequence, 1);
    assert.equal(duplicate.sequence, 1);
    await assert.rejects(
      store().enqueue("alice", project.id, project, {}, 1, 0, randomUUID()),
      /queue changed/,
    );
    await assert.rejects(
      store().enqueue(
        "alice",
        project.id,
        { ...project, id: "different" },
        {},
        1,
        1,
        randomUUID(),
      ),
      /another project/,
    );
    const job = await store().claim();
    assert.ok(job);
    assert.equal(await store().claim(), null);
    await assert.rejects(
      store().cancel("alice", project.id, operationId),
      /Submission has started/,
    );
    await assert.rejects(
      store().connect("alice", project.id, target, "fixture-vercel-token", 1),
      /worker is busy/,
    );
    await db
      .collection<{ _id: string }>("levoks_deployments")
      .updateOne({ _id: job._id }, { $set: { "lease.expires": new Date(0) } });
    await assert.rejects(store().markSubmission(job), /already claimed/);
    assert.equal(await processDeploymentJob(store()), true);
    assert.equal(creates, 1);
    assert.equal(
      (await store().require("alice", project.id)).history.at(-1)?.state,
      "tracking",
    );
    assert.equal(
      (await store().require("alice", project.id)).job?.snapshot,
      undefined,
    );
    await store().resume("alice", project.id, operationId);
    await processDeploymentJob(store());
    let current = await store().require("alice", project.id);
    assert.equal(current.active, false);
    assert.equal(current.history.at(-1)?.state, "ready");
    assert.equal(current.job, undefined);

    const lostId = randomUUID();
    await store().enqueue("alice", project.id, project, {}, 1, 1, lostId);
    loseAcknowledgement = true;
    await processDeploymentJob(store());
    current = await store().require("alice", project.id);
    assert.equal(current.active, true);
    assert.equal(current.history.at(-1)?.state, "attention");
    assert.equal(creates, 2);
    // Even revoked credentials during recovery cannot classify an uncertain POST as rejected.
    statusCode = 401;
    await store().resume("alice", project.id, lostId);
    await processDeploymentJob(store());
    assert.equal((await store().require("alice", project.id)).active, true);
    statusCode = 200;
    await store().resume("alice", project.id, lostId);
    await processDeploymentJob(store());
    current = await store().require("alice", project.id);
    assert.equal(creates, 2);
    assert.equal(current.history.at(-1)?.state, "ready");

    const cancelId = randomUUID();
    await store().enqueue("alice", project.id, project, {}, 1, 2, cancelId);
    await store().cancel("alice", project.id, cancelId);
    assert.equal(await processDeploymentJob(store()), false);
    assert.equal(creates, 2);
    statusCode = 429;
    const rejectedId = randomUUID();
    await store().enqueue("alice", project.id, project, {}, 1, 3, rejectedId);
    await processDeploymentJob(store());
    current = await store().require("alice", project.id);
    assert.equal(current.active, false);
    assert.equal(current.history.at(-1)?.state, "error");
    assert.doesNotMatch(
      JSON.stringify(deploymentMetadata(current)),
      /fixture-vercel-token/,
    );
    statusCode = 200;

    // Crash after fencing submission but before receiving any provider ID.
    const crashId = randomUUID();
    await store().enqueue("alice", project.id, project, {}, 1, 4, crashId);
    const crashed = await store().claim();
    assert.ok(crashed);
    await store().markSubmission(crashed);
    await db
      .collection<{ _id: string }>("levoks_deployments")
      .updateOne(
        { _id: crashed._id },
        { $set: { "lease.expires": new Date(0) } },
      );
    await processDeploymentJob(store());
    current = await store().require("alice", project.id);
    assert.equal(current.active, true);
    assert.equal(creates, 2);
    await assert.rejects(
      store().cancel("alice", project.id, crashId),
      /Submission has started/,
    );
    await assert.rejects(
      store().connect(
        "alice",
        project.id,
        { ...target, teamId: undefined },
        "fixture-vercel-token",
        1,
      ),
      /active release/,
    );
    current = await store().connect(
      "alice",
      project.id,
      target,
      "fixture-vercel-token",
      1,
    );
    assert.equal(current.version, 2);
    assert.equal(current.active, true);
    // The obsolete lease cannot change the new worker's result.
    await store().finish(crashed, {
      id: "stale",
      projectId: "prj_test",
      readyState: "READY",
      meta: { levoksOperation: crashId },
    });
    assert.equal((await store().require("alice", project.id)).active, true);
    assert.equal(
      (await db.collection("levoks_secrets").find({}).toArray()).length,
      1,
    );
    const driftProject = emptyProject("Compiler consistency");
    await store().connect(
      "alice",
      driftProject.id,
      target,
      "fixture-vercel-token",
      0,
    );
    const drift = await store().enqueue(
      "alice",
      driftProject.id,
      driftProject,
      {},
      1,
      0,
      randomUUID(),
    );
    await db
      .collection<{ _id: string }>("levoks_deployments")
      .updateOne(
        { _id: drift._id },
        {
          $set: {
            "job.snapshot": { ...driftProject, name: "Changed after queue" },
          },
          $unset: { "job.sourceArchived": "" },
        },
      );
    await processDeploymentJob(store());
    const rejectedDrift = await store().require("alice", driftProject.id);
    assert.equal(rejectedDrift.active, false);
    assert.equal(rejectedDrift.history[0].state, "error");
    assert.equal(
      creates,
      2,
      "Changed compiler output cannot trigger a provider build.",
    );
  },
);
