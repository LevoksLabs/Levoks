import { createHash } from "node:crypto";
import { gzipSync, gunzipSync } from "node:zlib";
import { Binary, type Db } from "mongodb";
import { validateFiles } from "../codegen/files";
import {
  deploymentEnvironment,
  deploymentTarget,
  type DeploymentTarget,
} from "../deployment";
import { HttpError } from "./http";

export function releaseDigest(
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
const archiveId = (ownerId: string, projectId: string, operationId: string) =>
  createHash("sha256")
    .update(JSON.stringify([ownerId, projectId, operationId]))
    .digest("hex");
interface Archive {
  _id: string;
  ownerId: string;
  projectId: string;
  operationId: string;
  digest: string;
  target: DeploymentTarget;
  environment: Record<string, string>;
  source: Binary;
  expiresAt: Date;
}
/** Account-private generated source, after the queue's declared-secret redaction. */
export class DeploymentArchives {
  constructor(private db: Db) {}
  private collection() {
    return this.db.collection<Archive>("levoks_deployment_archives");
  }
  async put(
    ownerId: string,
    projectId: string,
    operationId: string,
    files: Record<string, string>,
    environment: Record<string, string>,
    target: DeploymentTarget,
  ) {
    let checked: Record<string, string>;
    try {
      checked = validateFiles(files);
    } catch {
      throw new HttpError(
        422,
        "Release source must contain 1–1,000 safe files totaling at most 10 MB.",
      );
    }
    const input = Buffer.from(JSON.stringify(checked));
    if (input.length > 20_000_000)
      throw new HttpError(422, "Release source is too large to archive.");
    const source = gzipSync(input);
    if (source.length > 10_500_000)
      throw new HttpError(422, "Release archive exceeds the storage limit.");
    const archive: Archive = {
      _id: archiveId(ownerId, projectId, operationId),
      ownerId,
      projectId,
      operationId,
      digest: releaseDigest(checked, environment, target),
      target: deploymentTarget.parse(target),
      environment: deploymentEnvironment.parse(environment),
      source: new Binary(source),
      expiresAt: new Date(Date.now() + 30 * 86400_000),
    };
    await this.collection().createIndex(
      { expiresAt: 1 },
      { expireAfterSeconds: 0 },
    );
    try {
      await this.collection().insertOne(archive);
    } catch (error) {
      if ((error as { code?: number }).code !== 11000) throw error;
      const existing = await this.get(ownerId, projectId, operationId);
      if (existing.digest !== archive.digest)
        throw new HttpError(
          409,
          "This operation ID already has different archived source.",
        );
      return existing.expiresAt;
    }
    return archive.expiresAt;
  }
  async get(ownerId: string, projectId: string, operationId: string) {
    const archive = await this.collection().findOne({
      _id: archiveId(ownerId, projectId, operationId),
      ownerId,
      projectId,
      operationId,
    });
    if (!archive || archive.expiresAt.getTime() <= Date.now())
      throw new HttpError(
        410,
        "Release source is unavailable or expired. Queue a new reviewed snapshot.",
      );
    try {
      const files = validateFiles(
        JSON.parse(
          gunzipSync(archive.source.buffer, {
            maxOutputLength: 20_000_000,
          }).toString("utf8"),
        ),
      );
      const environment = deploymentEnvironment.parse(archive.environment);
      const target = deploymentTarget.parse(archive.target);
      if (releaseDigest(files, environment, target) !== archive.digest)
        throw new Error();
      return { ...archive, files, environment, target };
    } catch {
      throw new HttpError(
        422,
        "Archived source failed its integrity check. Queue a new reviewed snapshot.",
      );
    }
  }
  async prune(ownerId: string, projectId: string, operationIds: string[]) {
    if (operationIds.length)
      await this.collection().deleteMany({
        ownerId,
        projectId,
        operationId: { $in: operationIds },
      });
  }
}
