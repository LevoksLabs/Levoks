import { createHash, randomUUID } from "node:crypto";
import type { Db } from "mongodb";
import { compileProject } from "../project/compiler";
import {
  parseProject,
  redactProject,
  type ProjectDocument,
} from "../project/schema";
import {
  deploymentTarget,
  deploymentEnvironment,
  type DeploymentTarget,
  type DeploymentMetadata,
  type ReleaseMetadata,
} from "../deployment";
import { HttpError } from "./http";
import { MongoVault } from "./vault";
import { DeploymentArchives, releaseDigest } from "./deployment-archives";
import {
  verifyVercelTarget,
  createVercelRelease,
  getVercelRelease,
  recoverVercelRelease,
  type VercelDeployment,
} from "./vercel";

interface Connection extends DeploymentMetadata {
  _id: string;
  ownerId: string;
  projectId: string;
  secretName: string;
  job?: {
    release: ReleaseMetadata;
    snapshot?: ProjectDocument;
    sourceArchived?: boolean;
    attempted: boolean;
    attempts: number;
    dueAt: Date;
  };
  lease?: { token: string; expires: Date };
}
export function deploymentMetadata(c: Connection): DeploymentMetadata {
  return {
    name: c.name,
    providerProjectId: c.providerProjectId,
    teamId: c.teamId,
    version: c.version,
    sequence: c.sequence,
    environment: c.environment,
    active: c.active,
    history: c.history,
  };
}
const idFor = (ownerId: string, projectId: string) =>
  createHash("sha256")
    .update(JSON.stringify([ownerId, projectId]))
    .digest("hex");
const namespace = (projectId: string) => `deployment:${projectId}`;
export class Deployments {
  constructor(
    private db: Db,
    private vault = new MongoVault(db),
  ) {}
  private collection() {
    return this.db.collection<Connection>("levoks_deployments");
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
    if (!c) throw new HttpError(404, "Connect a Vercel project first.");
    return c;
  }
  async authorization(c: Connection) {
    return {
      name: c.name,
      providerProjectId: c.providerProjectId,
      teamId: c.teamId,
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
    target: DeploymentTarget,
    token: string,
    version: number,
  ) {
    const parsed = deploymentTarget.parse(target);
    const previous = await this.get(ownerId, projectId);
    if (
      previous?.active &&
      (previous.providerProjectId !== parsed.providerProjectId ||
        previous.teamId !== parsed.teamId ||
        previous.name !== parsed.name)
    )
      throw new HttpError(
        409,
        "Finish the active release before changing the deployment target.",
      );
    await verifyVercelTarget({ ...parsed, token });
    const secretName = `VERCEL_${randomUUID().replaceAll("-", "").toUpperCase()}`;
    await this.vault.put(ownerId, namespace(projectId), secretName, token, 0);
    let result: Connection | null = null;
    try {
      if (version === 0) {
        result = {
          _id: idFor(ownerId, projectId),
          ownerId,
          projectId,
          ...parsed,
          secretName,
          version: 1,
          sequence: 0,
          environment: {},
          active: false,
          history: [],
        };
        await this.collection().insertOne(result);
      } else {
        result = await this.collection().findOneAndUpdate(
          {
            _id: idFor(ownerId, projectId),
            ownerId,
            projectId,
            version,
            sequence: previous?.sequence,
            active: previous?.active,
            lease: { $exists: false },
          },
          {
            $set: { ...parsed, secretName },
            ...(!parsed.teamId ? { $unset: { teamId: "" as const } } : {}),
            $inc: { version: 1 },
          },
          { returnDocument: "after" },
        );
        if (!result)
          throw new HttpError(
            409,
            "Connection changed or a worker is busy. Refresh and try again.",
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
    return result;
  }
  async enqueue(
    ownerId: string,
    projectId: string,
    value: unknown,
    environment: Record<string, string>,
    version: number,
    sequence: number,
    operationId: string,
  ) {
    const c = await this.require(ownerId, projectId);
    let project: ProjectDocument;
    try {
      project = redactProject(parseProject(value));
    } catch {
      throw new HttpError(
        400,
        "Project validation failed. Reopen a valid project before deploying.",
      );
    }
    if (project.id !== projectId)
      throw new HttpError(400, "Snapshot belongs to another project.");
    const origins = deploymentEnvironment.parse(environment);
    const required = new Set(
      project.backend.services.map((service) => `API_ORIGIN_${service.port}`),
    );
    if ([...required].some((key) => !origins[key]))
      throw new HttpError(
        422,
        "Provide an HTTPS API origin for every backend service.",
      );
    if (
      Object.keys(origins).some(
        (key) => key !== "APP_ORIGIN" && !required.has(key),
      )
    )
      throw new HttpError(
        422,
        "Remove API origins that do not belong to this project.",
      );
    const output = compileProject(project);
    if (output.diagnostics.some((item) => item.severity === "error"))
      throw new HttpError(
        422,
        "Resolve Source & checks errors before deploying.",
      );
    return this.queue(c, output.files, origins, version, sequence, operationId);
  }
  async archive(ownerId: string, projectId: string, operationId: string) {
    const c = await this.require(ownerId, projectId);
    const release = c.history.find(
      (item) => item.operationId === operationId && item.archiveExpiresAt,
    );
    if (!release)
      throw new HttpError(
        404,
        "Archived source is not in this project's release history.",
      );
    const archive = await new DeploymentArchives(this.db).get(
      ownerId,
      projectId,
      operationId,
    );
    if (archive.digest !== release.digest)
      throw new HttpError(
        422,
        "Archived source does not match release history. Queue a new reviewed snapshot.",
      );
    return archive;
  }
  async replay(
    ownerId: string,
    projectId: string,
    sourceOperationId: string,
    version: number,
    sequence: number,
    operationId: string,
  ) {
    const c = await this.require(ownerId, projectId);
    if (operationId === sourceOperationId)
      throw new HttpError(
        400,
        "Use a new operation ID for the archived preview.",
      );
    const duplicate = c.history.find(
      (release) => release.operationId === operationId,
    );
    if (duplicate) {
      if (duplicate.sourceOperationId !== sourceOperationId)
        throw new HttpError(
          409,
          "This operation ID was used for a different release.",
        );
      return c;
    }
    const previous = c.history.find(
      (release) => release.operationId === sourceOperationId,
    );
    if (previous?.state !== "ready")
      throw new HttpError(
        409,
        "Choose a completed ready preview from this project's history.",
      );
    const archive = await this.archive(ownerId, projectId, sourceOperationId);
    if (
      archive.target.providerProjectId !== c.providerProjectId ||
      archive.target.teamId !== c.teamId
    )
      throw new HttpError(
        409,
        "Archived source belongs to another deployment target. Restore that connection before requeuing.",
      );
    return this.queue(
      c,
      archive.files,
      archive.environment,
      version,
      sequence,
      operationId,
      sourceOperationId,
    );
  }
  async source(c: Connection) {
    let files: Record<string, string>;
    if (c.job!.sourceArchived) {
      const archive = await new DeploymentArchives(this.db).get(
        c.ownerId,
        c.projectId,
        c.job!.release.operationId,
      );
      files = archive.files;
    } else {
      if (!c.job!.snapshot)
        throw new HttpError(422, "Queued snapshot is missing.");
      const output = compileProject(c.job!.snapshot);
      if (output.diagnostics.some((item) => item.severity === "error"))
        throw new HttpError(422, "Snapshot no longer compiles.");
      files = output.files;
    }
    if (releaseDigest(files, c.environment, c) !== c.job!.release.digest)
      throw new HttpError(
        422,
        "Queued source or configuration failed its integrity check. Review and queue a new release.",
      );
    return files;
  }
  private async queue(
    c: Connection,
    files: Record<string, string>,
    origins: Record<string, string>,
    version: number,
    sequence: number,
    operationId: string,
    sourceOperationId?: string,
  ) {
    const digest = releaseDigest(files, origins, c);
    const existing = c.history.find(
      (release) => release.operationId === operationId,
    );
    if (existing) {
      if (
        existing.digest !== digest ||
        existing.sourceOperationId !== sourceOperationId
      )
        throw new HttpError(
          409,
          "This operation ID was already used for a different release.",
        );
      return c;
    }
    if (c.active || c.version !== version || c.sequence !== sequence || c.lease)
      throw new HttpError(
        409,
        "A release is active or the queue changed. Refresh before deploying.",
      );
    const at = new Date().toISOString();
    const archives = new DeploymentArchives(this.db);
    const expiresAt = await archives.put(
      c.ownerId,
      c.projectId,
      operationId,
      files,
      origins,
      c,
    );
    const release: ReleaseMetadata = {
      operationId,
      sequence: sequence + 1,
      state: "queued",
      message: "Snapshot saved. Waiting for the deployment worker.",
      createdAt: at,
      updatedAt: at,
      digest,
      archiveExpiresAt: expiresAt.toISOString(),
      ...(sourceOperationId ? { sourceOperationId } : {}),
    };
    const result = await this.collection().findOneAndUpdate(
      {
        _id: c._id,
        version,
        sequence,
        active: false,
        lease: { $exists: false },
      },
      {
        $set: {
          active: true,
          environment: origins,
          job: {
            release,
            sourceArchived: true,
            attempted: false,
            attempts: 0,
            dueAt: new Date(),
          },
        },
        $inc: { sequence: 1 },
        $push: { history: { $each: [release], $slice: -30 } },
      },
      { returnDocument: "after" },
    );
    if (!result) {
      const latest = await this.require(c.ownerId, c.projectId);
      if (
        latest.history.some(
          (item) =>
            item.operationId === operationId &&
            item.digest === digest &&
            item.sourceOperationId === sourceOperationId,
        )
      )
        return latest;
      throw new HttpError(
        409,
        "A release is active or the queue changed. Refresh before deploying.",
      );
    }
    const retained = new Set(result.history.map((item) => item.operationId));
    await archives
      .prune(
        c.ownerId,
        c.projectId,
        c.history
          .filter((item) => !retained.has(item.operationId))
          .map((item) => item.operationId),
      )
      .catch(() => {});
    return result;
  }
  async cancel(ownerId: string, projectId: string, operationId: string) {
    const c = await this.require(ownerId, projectId);
    const release = c.job?.release;
    if (!release || release.operationId !== operationId)
      throw new HttpError(409, "Release changed. Refresh the history.");
    const canceled: ReleaseMetadata = {
      ...release,
      state: "canceled",
      message: "Queued release canceled before submission.",
      updatedAt: new Date().toISOString(),
    };
    const result = await this.collection().findOneAndUpdate(
      {
        _id: c._id,
        "job.release.operationId": operationId,
        "job.attempted": false,
        lease: { $exists: false },
        "history.operationId": operationId,
      },
      {
        $set: { active: false, "history.$": canceled },
        $unset: { job: "" },
      },
      { returnDocument: "after" },
    );
    if (!result)
      throw new HttpError(
        409,
        "Submission has started. Track the release in Vercel before canceling it there.",
      );
    return result;
  }
  async resume(ownerId: string, projectId: string, operationId: string) {
    const c = await this.require(ownerId, projectId);
    const result = await this.collection().findOneAndUpdate(
      {
        _id: c._id,
        active: true,
        "job.release.operationId": operationId,
        lease: { $exists: false },
      },
      {
        $set: { "job.attempts": 0, "job.dueAt": new Date() },
      },
      { returnDocument: "after" },
    );
    if (!result)
      throw new HttpError(
        409,
        "Release changed or a worker is busy. Refresh and try again.",
      );
    return result;
  }
  async claim() {
    return this.collection().findOneAndUpdate(
      {
        active: true,
        "job.dueAt": { $lte: new Date() },
        "job.attempts": { $lt: 5 },
        $or: [
          { lease: { $exists: false } },
          { "lease.expires": { $lt: new Date() } },
        ],
      },
      {
        $set: {
          lease: {
            token: randomUUID(),
            expires: new Date(Date.now() + 180_000),
          },
        },
      },
      { sort: { "job.dueAt": 1 }, returnDocument: "after" },
    );
  }
  private filter(c: Connection) {
    if (!c.lease) throw new HttpError(409, "A worker lease is required.");
    return {
      _id: c._id,
      "lease.token": c.lease.token,
      "lease.expires": { $gt: new Date() },
    };
  }
  async retain(c: Connection) {
    const result = await this.collection().updateOne(this.filter(c), {
      $set: { "lease.expires": new Date(Date.now() + 180_000) },
    });
    if (!result.matchedCount) throw new HttpError(409, "Worker lease expired.");
  }
  async markSubmission(c: Connection) {
    const release = {
      ...c.job!.release,
      state: "submitting" as const,
      message: "Submitting the preview build to Vercel.",
      updatedAt: new Date().toISOString(),
    };
    const result = await this.collection().updateOne(
      {
        ...this.filter(c),
        "job.attempted": false,
        "history.operationId": release.operationId,
      },
      {
        $set: {
          "job.attempted": true,
          "job.release": release,
          "history.$": release,
        },
      },
    );
    if (!result.matchedCount)
      throw new HttpError(409, "Release submission was already claimed.");
    c.job!.attempted = true;
  }
  async finish(c: Connection, provider: VercelDeployment) {
    const done = ["READY", "ERROR", "CANCELED", "BLOCKED"].includes(
      provider.readyState,
    );
    const release: ReleaseMetadata = {
      ...c.job!.release,
      providerId: provider.id,
      url: provider.url,
      providerState: provider.readyState,
      state:
        provider.readyState === "READY"
          ? "ready"
          : provider.readyState === "CANCELED"
            ? "canceled"
            : done
              ? "error"
              : "tracking",
      message:
        provider.readyState === "READY"
          ? "Frontend preview ready. Verify the website and its backend connections."
          : done
            ? "Vercel did not complete the build. Inspect the provider build logs."
            : "Vercel is building the frontend preview.",
      updatedAt: new Date().toISOString(),
    };
    await this.collection().updateOne(
      { ...this.filter(c), "history.operationId": release.operationId },
      {
        $set: {
          active: !done,
          "history.$": release,
          ...(!done
            ? {
                "job.release": release,
                "job.attempts": 0,
                "job.dueAt": new Date(Date.now() + 15_000),
              }
            : {}),
        },
        $unset: { lease: "", ...(done ? { job: "" } : { "job.snapshot": "" }) },
      },
    );
  }
  async fail(c: Connection, error: unknown, createRequest = false) {
    const status = error instanceof HttpError ? error.status : 502;
    // Only explicit create rejections are terminal. An ambiguous acknowledgement
    // remains active for reconciliation and must never automatically be reposted.
    const rejected =
      (!c.job!.attempted || createRequest) &&
      error instanceof HttpError &&
      [400, 401, 402, 403, 404, 410, 422, 429].includes(status);
    const attempts = c.job!.attempts + 1;
    const release: ReleaseMetadata = {
      ...c.job!.release,
      state: rejected ? "error" : "attention",
      message: rejected
        ? !c.job!.attempted && [410, 422].includes(status)
          ? "Queued source is unavailable or failed validation. Review Source & checks and queue a new snapshot."
          : "The release could not be submitted. Check project access, token and quota before queuing a new release."
        : "Release status is unresolved. Refresh tracking or replace the token for this target; no duplicate build will be submitted.",
      updatedAt: new Date().toISOString(),
    };
    await this.collection().updateOne(
      { ...this.filter(c), "history.operationId": release.operationId },
      {
        $set: {
          active: !rejected,
          "history.$": release,
          ...(!rejected
            ? {
                "job.release": release,
                "job.attempts": attempts,
                "job.dueAt": new Date(
                  Date.now() + Math.min(900_000, 30_000 * 2 ** attempts),
                ),
              }
            : {}),
        },
        $unset: { lease: "", ...(rejected ? { job: "" } : {}) },
      },
    );
  }
}
export const vercelTransport = {
  create: createVercelRelease,
  status: getVercelRelease,
  recover: recoverVercelRelease,
};
/** Supervised independently from browser sessions. */
export async function processDeploymentJob(
  store: Deployments,
  transport = vercelTransport,
) {
  const c = await store.claim();
  if (!c) return false;
  const heartbeat = setInterval(() => {
    void store.retain(c).catch(() => {});
  }, 30_000);
  let createRequest = false;
  try {
    const auth = await store.authorization(c);
    const job = c.job!;
    let provider: VercelDeployment | null;
    if (job.release.providerId)
      provider = await transport.status(
        auth,
        job.release.providerId,
        job.release.operationId,
      );
    else if (job.attempted)
      provider = await transport.recover(
        auth,
        job.release.operationId,
        job.release.createdAt,
      );
    else {
      const files = await store.source(c);
      await store.markSubmission(c);
      createRequest = true;
      provider = await transport.create(
        auth,
        files,
        c.environment,
        job.release.operationId,
      );
    }
    if (!provider)
      throw new HttpError(
        502,
        "Submission was not found. Review the provider project.",
      );
    await store.finish(c, provider);
  } catch (error) {
    await store.fail(c, error, createRequest);
  } finally {
    clearInterval(heartbeat);
  }
  return true;
}
