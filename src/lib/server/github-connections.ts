import { createHash, randomUUID } from "node:crypto";
import type { Db } from "mongodb";
import { compileProject } from "../project/compiler";
import {
  parseProject,
  redactProject,
  type ProjectDocument,
} from "../project/schema";
import { HttpError } from "./http";
import { MongoVault } from "./vault";
import { commitProject, githubHead, type GitHubTarget } from "./github";

type Status =
  "idle" | "queued" | "running" | "conflict" | "reauthorize" | "failed";
export interface GitHubConnection {
  _id: string;
  ownerId: string;
  projectId: string;
  owner: string;
  repo: string;
  branch: string;
  head: string;
  secretName: string;
  version: number;
  sequence: number;
  processed: number;
  automatic: boolean;
  cloudRevision: number;
  status: Status;
  message: string;
  attempts: number;
  dueAt: Date;
  updatedAt: Date;
  desired?: { project: ProjectDocument; message: string; digest: string };
  lease?: { token: string; expires: Date };
  history: { sha: string; at: string; unchanged: boolean; sequence: number }[];
}
export function connectionMetadata(c: GitHubConnection) {
  return {
    owner: c.owner,
    repo: c.repo,
    branch: c.branch,
    head: c.head,
    version: c.version,
    sequence: c.sequence,
    processed: c.processed,
    automatic: c.automatic,
    status: c.status,
    message: c.message,
    dueAt: c.dueAt.toISOString(),
    updatedAt: c.updatedAt.toISOString(),
    history: c.history,
  };
}
export type ConnectionMetadata = ReturnType<typeof connectionMetadata>;
const idFor = (ownerId: string, projectId: string) =>
  createHash("sha256")
    .update(JSON.stringify([ownerId, projectId]))
    .digest("hex");
const namespace = (projectId: string) => `connections:${projectId}`;
export class GitHubConnections {
  constructor(
    private db: Db,
    private vault: MongoVault = new MongoVault(db),
  ) {}
  private collection() {
    return this.db.collection<GitHubConnection>("levoks_github_connections");
  }
  async get(ownerId: string, projectId: string) {
    return this.collection().findOne({
      _id: idFor(ownerId, projectId),
      ownerId,
      projectId,
    });
  }
  async require(ownerId: string, projectId: string) {
    const c = await this.get(ownerId, projectId);
    if (!c) throw new HttpError(404, "Connect a GitHub repository first.");
    return c;
  }
  async target(c: GitHubConnection): Promise<GitHubTarget> {
    return {
      owner: c.owner,
      repo: c.repo,
      branch: c.branch,
      token: await this.vault.resolve(
        c.ownerId,
        namespace(c.projectId),
        c.secretName,
      ),
    };
  }
  async connect(
    ownerId: string,
    projectId: string,
    target: GitHubTarget,
    expectedVersion: number,
    expectedHead: string,
  ) {
    const { sha } = await githubHead(target);
    if (sha !== expectedHead)
      throw new HttpError(
        409,
        "Branch changed since review. Review the current files before connecting.",
      );
    const previous = await this.get(ownerId, projectId);
    // Connection settings cannot discard queued work or change a running job's credentials.
    if (previous && previous.sequence > previous.processed)
      throw new HttpError(
        409,
        "Cancel pending synchronization before changing the connection.",
      );
    const secretName = `GITHUB_${randomUUID().replaceAll("-", "").toUpperCase()}`;
    await this.vault.put(
      ownerId,
      namespace(projectId),
      secretName,
      target.token,
      0,
    );
    const record: GitHubConnection = {
      _id: idFor(ownerId, projectId),
      ownerId,
      projectId,
      owner: target.owner,
      repo: target.repo,
      branch: target.branch,
      head: sha,
      secretName,
      version: expectedVersion + 1,
      sequence: 0,
      processed: 0,
      automatic: false,
      cloudRevision: 0,
      status: "idle",
      message: "Connected. No changes queued.",
      attempts: 0,
      dueAt: new Date(),
      updatedAt: new Date(),
      history: previous?.history || [],
    };
    try {
      if (expectedVersion === 0) await this.collection().insertOne(record);
      else {
        const result = await this.collection().replaceOne(
          {
            _id: record._id,
            version: expectedVersion,
            lease: { $exists: false },
            $expr: { $eq: ["$sequence", "$processed"] },
          },
          record,
        );
        if (!result.matchedCount)
          throw new HttpError(
            409,
            "Connection changed or is busy. Refresh before reconnecting.",
          );
      }
    } catch (error) {
      await this.vault.remove(ownerId, namespace(projectId), secretName, 1);
      if ((error as { code?: number }).code === 11000)
        throw new HttpError(
          409,
          "Connection already exists. Refresh before replacing it.",
        );
      throw error;
    }
    if (previous)
      await this.vault.remove(
        ownerId,
        namespace(projectId),
        previous.secretName,
        1,
      );
    return record;
  }
  async enqueue(
    ownerId: string,
    projectId: string,
    value: unknown,
    sequence: number,
    version: number,
    message: string,
    immediate: boolean,
    cloudRevision?: number,
  ) {
    const project = redactProject(parseProject(value));
    if (project.id !== projectId)
      throw new HttpError(400, "Snapshot belongs to another project.");
    const compiled = compileProject(project);
    const errors = compiled.diagnostics.filter((d) => d.severity === "error");
    if (errors.length)
      throw new HttpError(
        422,
        errors
          .slice(0, 5)
          .map((d) => d.message)
          .join("\n"),
      );
    // A fresh snapshot timestamp alone must not cause a commit.
    const digest = createHash("sha256")
      .update(JSON.stringify({ ...project, updatedAt: "" }))
      .digest("hex");
    const c = await this.require(ownerId, projectId);
    if (c.sequence !== sequence || c.version !== version)
      throw new HttpError(
        409,
        "Another editor changed the synchronization queue. Review it before replacing queued work.",
      );
    if (["conflict", "reauthorize", "failed"].includes(c.status))
      throw new HttpError(
        409,
        "Resolve the connection error before queuing more changes.",
      );
    if (c.desired?.digest === digest) {
      if (immediate && c.status === "queued")
        return (
          (await this.collection().findOneAndUpdate(
            { _id: c._id, sequence, version, status: "queued" },
            { $set: { dueAt: new Date() } },
            { returnDocument: "after" },
          )) || c
        );
      return c;
    }
    // A manual snapshot supersedes older cloud saves. A later cloud revision may
    // replace it only when the user explicitly enabled automatic synchronization.
    const currentCloud =
      cloudRevision === undefined
        ? await this.db
            .collection<{
              ownerId: string;
              projectId: string;
              revision: number;
            }>("levoks_projects")
            .findOne({ ownerId, projectId }, { projection: { revision: 1 } })
        : null;
    const result = await this.collection().findOneAndUpdate(
      { _id: c._id, sequence, version, status: c.status },
      {
        $set: {
          desired: { project, message, digest },
          cloudRevision:
            cloudRevision ?? currentCloud?.revision ?? c.cloudRevision,
          status: c.status === "running" ? "running" : "queued",
          message: "Snapshot safely queued on the server.",
          updatedAt: new Date(),
          dueAt: immediate
            ? new Date()
            : c.sequence > c.processed
              ? c.dueAt
              : new Date(Date.now() + 300_000),
        },
        $inc: { sequence: 1 },
      },
      { returnDocument: "after" },
    );
    if (!result)
      throw new HttpError(
        409,
        "Queue changed. Refresh and review before retrying.",
      );
    return result;
  }
  async configure(
    ownerId: string,
    projectId: string,
    version: number,
    automatic: boolean,
    cancel: boolean,
  ) {
    const c = await this.require(ownerId, projectId);
    const result = await this.collection().findOneAndUpdate(
      { _id: c._id, version, sequence: c.sequence, lease: { $exists: false } },
      {
        $set: {
          automatic,
          ...(cancel
            ? {
                processed: c.sequence,
                status: "idle" as Status,
                message: "Pending synchronization canceled.",
                attempts: 0,
              }
            : {}),
          updatedAt: new Date(),
        },
        ...(cancel ? { $unset: { desired: "" as const } } : {}),
        $inc: { version: 1 },
      },
      { returnDocument: "after" },
    );
    if (!result)
      throw new HttpError(
        409,
        "Connection is busy or changed. Refresh before changing settings.",
      );
    return result;
  }
  async disconnect(ownerId: string, projectId: string, version: number) {
    const c = await this.require(ownerId, projectId);
    const result = await this.collection().deleteOne({
      _id: c._id,
      version,
      lease: { $exists: false },
      $expr: { $eq: ["$sequence", "$processed"] },
    });
    if (!result.deletedCount)
      throw new HttpError(
        409,
        "Cancel pending synchronization and wait for any running commit before disconnecting.",
      );
    await this.vault.remove(ownerId, namespace(projectId), c.secretName, 1);
  }
  async claim() {
    const now = new Date();
    return this.collection().findOneAndUpdate(
      {
        status: { $in: ["queued", "running"] },
        dueAt: { $lte: now },
        $expr: { $gt: ["$sequence", "$processed"] },
        $or: [{ lease: { $exists: false } }, { "lease.expires": { $lt: now } }],
      },
      {
        $set: {
          status: "running",
          lease: {
            token: randomUUID(),
            expires: new Date(Date.now() + 180_000),
          },
          updatedAt: now,
        },
      },
      { sort: { dueAt: 1 }, returnDocument: "after" },
    );
  }
  async enqueueCloudSaves() {
    const connections = this.collection().find({
      automatic: true,
      status: { $in: ["idle", "queued"] },
      lease: { $exists: false },
    });
    for await (const c of connections) {
      const cloud = await this.db
        .collection<{
          ownerId: string;
          projectId: string;
          revision: number;
          document: ProjectDocument;
        }>("levoks_projects")
        .findOne({ ownerId: c.ownerId, projectId: c.projectId });
      if (!cloud || cloud.revision <= c.cloudRevision) continue;
      try {
        const queued = await this.enqueue(
          c.ownerId,
          c.projectId,
          cloud.document,
          c.sequence,
          c.version,
          "Save Levoks cloud progress",
          false,
          cloud.revision,
        );
        await this.collection().updateOne(
          { _id: c._id, version: c.version, sequence: queued.sequence },
          { $set: { cloudRevision: cloud.revision } },
        );
      } catch (error) {
        if (error instanceof HttpError && error.status === 409) continue;
        await this.collection().updateOne(
          {
            _id: c._id,
            version: c.version,
            sequence: c.sequence,
            lease: { $exists: false },
          },
          {
            $set: {
              status: "failed",
              message:
                "Cloud snapshot cannot be compiled. Open Source & checks, correct the errors and save again.",
            },
          },
        );
      }
    }
  }
  async retain(c: GitHubConnection) {
    const result = await this.collection().updateOne(
      {
        _id: c._id,
        "lease.token": c.lease?.token,
        "lease.expires": { $gt: new Date() },
      },
      { $set: { "lease.expires": new Date(Date.now() + 180_000) } },
    );
    if (!result.matchedCount)
      throw new HttpError(409, "Worker lease expired; commit was stopped.");
  }
  async finish(
    c: GitHubConnection,
    result: { sha: string; unchanged: boolean },
  ) {
    await this.collection().updateOne(
      { _id: c._id, "lease.token": c.lease?.token },
      {
        $set: {
          head: result.sha,
          processed: c.sequence,
          status: "queued",
          attempts: 0,
          message: result.unchanged
            ? "No source changes."
            : "Changes committed.",
          updatedAt: new Date(),
        },
        $unset: { lease: "" },
        $push: {
          history: {
            $each: [
              {
                sha: result.sha,
                unchanged: result.unchanged,
                sequence: c.sequence,
                at: new Date().toISOString(),
              },
            ],
            $slice: -30,
          },
        },
      },
    );
    await this.collection().updateOne(
      {
        _id: c._id,
        status: "queued",
        $expr: { $eq: ["$sequence", "$processed"] },
      },
      { $set: { status: "idle" } },
    );
  }
  async fail(c: GitHubConnection, error: unknown) {
    const status = error instanceof HttpError ? error.status : 502;
    const attempts = c.attempts + 1;
    const retry = [429, 502, 503].includes(status) && attempts < 5;
    await this.collection().updateOne(
      { _id: c._id, "lease.token": c.lease?.token },
      {
        $set: {
          attempts,
          status: retry
            ? "queued"
            : [401, 403, 404].includes(status)
              ? "reauthorize"
              : status === 409
                ? "conflict"
                : "failed",
          message:
            error instanceof HttpError
              ? error.message
              : "Provider unavailable. Synchronization will retry up to five times.",
          dueAt: new Date(
            Date.now() + Math.min(900_000, 30_000 * 2 ** attempts),
          ),
          updatedAt: new Date(),
        },
        $unset: { lease: "" },
      },
    );
  }
}

/** Runs independently of browser sessions. Inject transport only in provider contract tests. */
export async function processGitHubJob(
  store: GitHubConnections,
  commit = commitProject,
) {
  const c = await store.claim();
  if (!c) return false;
  const heartbeat = setInterval(() => {
    void store.retain(c).catch(() => {});
  }, 30_000);
  try {
    if (!c.desired) throw new HttpError(422, "Queued snapshot is missing.");
    const output = compileProject(c.desired.project);
    if (output.diagnostics.some((d) => d.severity === "error"))
      throw new HttpError(
        422,
        "Queued source no longer passes compiler checks. Review and queue a new snapshot.",
      );
    const result = await commit(
      await store.target(c),
      c.projectId,
      output.files,
      c.head,
      c.desired.message,
      {
        operationId: `${c._id}:${c.version}:${c.sequence}`,
        beforePush: () => store.retain(c),
      },
    );
    await store.finish(c, result);
  } catch (error) {
    await store.fail(c, error);
  } finally {
    clearInterval(heartbeat);
  }
  return true;
}
