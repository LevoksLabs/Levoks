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
function releaseDigest(
  files: Record<string, string>,
  environment: Record<string, string>,
  target: DeploymentTarget,
) {
  const sorted = (values: Record<string, string>) =>
    Object.entries(values).sort(([a], [b]) => a.localeCompare(b));
  return createHash("sha256")
    .update(
      JSON.stringify([
        sorted(files),
        sorted(environment),
        target.providerProjectId,
        target.teamId,
      ]),
    )
    .digest("hex");
}
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
    const digest = releaseDigest(output.files, origins, c);
    const existing = c.history.find(
      (release) => release.operationId === operationId,
    );
    if (existing) {
      if (existing.digest !== digest)
        throw new HttpError(
          409,
          "This operation ID was already used for a different release.",
        );
      return c;
    }
    const at = new Date().toISOString();
    const release: ReleaseMetadata = {
      operationId,
      sequence: sequence + 1,
      state: "queued",
      message: "Snapshot saved. Waiting for the deployment worker.",
      createdAt: at,
      updatedAt: at,
      digest,
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
            snapshot: project,
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
      const latest = await this.require(ownerId, projectId);
      if (
        latest.history.some(
          (item) => item.operationId === operationId && item.digest === digest,
        )
      )
        return latest;
      throw new HttpError(
        409,
        "A release is active or the queue changed. Refresh before deploying.",
      );
    }
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
        ? "The release could not be submitted. Check project access, token and quota before queuing a new release."
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
      if (!job.snapshot)
        throw new HttpError(422, "Queued snapshot is missing.");
      const output = compileProject(job.snapshot);
      if (output.diagnostics.some((item) => item.severity === "error"))
        throw new HttpError(422, "Snapshot no longer compiles.");
      if (releaseDigest(output.files, c.environment, c) !== job.release.digest)
        throw new HttpError(
          422,
          "Compiler output changed after queuing. Review and queue a new release.",
        );
      await store.markSubmission(c);
      createRequest = true;
      provider = await transport.create(
        auth,
        output.files,
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
