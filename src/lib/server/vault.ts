import {
  createCipheriv,
  createDecipheriv,
  createHash,
  randomBytes,
} from "node:crypto";
import type { Db } from "mongodb";
import { HttpError } from "./http";

export interface SecretMetadata {
  name: string;
  version: number;
  updatedAt: string;
  keyId: string;
}
interface SecretRecord extends SecretMetadata {
  _id: string;
  ownerId: string;
  projectId: string;
  encrypted: string;
  nonce: string;
  tag: string;
}
export interface Keyring {
  active: string;
  keys: Record<string, Buffer>;
}
export function environmentKeyring(): Keyring {
  try {
    const raw = JSON.parse(process.env.LEVOKS_SECRET_KEYS || "{}");
    const active = process.env.LEVOKS_ACTIVE_SECRET_KEY || "";
    if (!active || !raw || typeof raw !== "object") throw new Error();
    const keys: Record<string, Buffer> = {};
    for (const [id, value] of Object.entries(raw)) {
      if (
        !/^[A-Za-z0-9_-]{1,80}$/.test(id) ||
        typeof value !== "string" ||
        !/^[A-Za-z0-9+/]+={0,2}$/.test(value)
      )
        throw new Error();
      const key = Buffer.from(value, "base64");
      if (key.length !== 32) throw new Error();
      keys[id] = key;
    }
    if (!keys[active]) throw new Error();
    return { active, keys };
  } catch {
    throw new HttpError(
      503,
      "Secret storage requires LEVOKS_SECRET_KEYS and LEVOKS_ACTIVE_SECRET_KEY on the server. Local project editing remains available.",
    );
  }
}
function identity(ownerId: string, projectId: string, name: string) {
  return createHash("sha256")
    .update(JSON.stringify([ownerId, projectId, name]))
    .digest("hex");
}
function metadata(record: SecretRecord): SecretMetadata {
  return {
    name: record.name,
    version: record.version,
    updatedAt: record.updatedAt,
    keyId: record.keyId,
  };
}
export class MongoVault {
  constructor(
    private db: Db,
    private ring: Keyring = environmentKeyring(),
  ) {}
  private collection() {
    return this.db.collection<SecretRecord>("levoks_secrets");
  }
  private encrypt(value: string, id: string) {
    const nonce = randomBytes(12),
      keyId = this.ring.active;
    const cipher = createCipheriv("aes-256-gcm", this.ring.keys[keyId], nonce);
    cipher.setAAD(Buffer.from(id));
    return {
      keyId,
      nonce: nonce.toString("base64"),
      encrypted: Buffer.concat([
        cipher.update(value, "utf8"),
        cipher.final(),
      ]).toString("base64"),
      tag: cipher.getAuthTag().toString("base64"),
    };
  }
  async list(ownerId: string, projectId: string) {
    return (
      await this.collection()
        .find(
          { ownerId, projectId },
          { projection: { name: 1, version: 1, updatedAt: 1, keyId: 1 } },
        )
        .sort({ name: 1 })
        .limit(200)
        .toArray()
    ).map(metadata);
  }
  async put(
    ownerId: string,
    projectId: string,
    name: string,
    value: string,
    expectedVersion: number,
  ) {
    if (
      !/^[A-Z_][A-Z0-9_]{0,99}$/.test(name) ||
      !value ||
      Buffer.byteLength(value) > 32000
    )
      throw new HttpError(
        400,
        "Use a valid secret name and a value of at most 32 KB.",
      );
    if (
      expectedVersion === 0 &&
      (await this.collection().countDocuments(
        { ownerId, projectId },
        { limit: 200 },
      )) >= 200
    )
      throw new HttpError(409, "Project secret limit reached.");
    const _id = identity(ownerId, projectId, name);
    const record: SecretRecord = {
      _id,
      ownerId,
      projectId,
      name,
      version: expectedVersion + 1,
      updatedAt: new Date().toISOString(),
      ...this.encrypt(value, _id),
    };
    if (expectedVersion === 0) {
      try {
        await this.collection().insertOne(record);
      } catch (error) {
        if ((error as { code?: number }).code === 11000)
          throw new HttpError(
            409,
            "Secret changed. Refresh before replacing it.",
          );
        throw error;
      }
    } else {
      const result = await this.collection().replaceOne(
        { _id, ownerId, projectId, version: expectedVersion },
        record,
      );
      if (!result.matchedCount)
        throw new HttpError(
          409,
          "Secret changed. Refresh before replacing it.",
        );
    }
    return metadata(record);
  }
  /** Server workers only: never return this value through a browser API. */
  async resolve(ownerId: string, projectId: string, name: string) {
    const _id = identity(ownerId, projectId, name);
    const record = await this.collection().findOne({ _id, ownerId, projectId });
    if (!record) throw new HttpError(404, "Secret reference does not exist.");
    try {
      const key = this.ring.keys[record.keyId];
      if (!key) throw new Error();
      const decipher = createDecipheriv(
        "aes-256-gcm",
        key,
        Buffer.from(record.nonce, "base64"),
      );
      decipher.setAAD(Buffer.from(_id));
      decipher.setAuthTag(Buffer.from(record.tag, "base64"));
      return Buffer.concat([
        decipher.update(Buffer.from(record.encrypted, "base64")),
        decipher.final(),
      ]).toString("utf8");
    } catch {
      throw new HttpError(
        503,
        "Secret could not be decrypted. Check the server keyring and restore a valid record.",
      );
    }
  }
  async remove(
    ownerId: string,
    projectId: string,
    name: string,
    version: number,
  ) {
    const result = await this.collection().deleteOne({
      _id: identity(ownerId, projectId, name),
      ownerId,
      projectId,
      version,
    });
    if (!result.deletedCount)
      throw new HttpError(
        409,
        "Secret changed or no longer exists. Refresh the list.",
      );
  }
  async rotate(
    ownerId: string,
    projectId: string,
    name: string,
    version: number,
  ) {
    const value = await this.resolve(ownerId, projectId, name);
    return this.put(ownerId, projectId, name, value, version);
  }
}
