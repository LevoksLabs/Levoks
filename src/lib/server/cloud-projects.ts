import { createHash, randomBytes, randomUUID } from "node:crypto";
import type { Db } from "mongodb";
import { HttpError } from "./http";
import { parseProject, redactProject } from "../project/schema";

export type ProjectRole = "owner" | "editor" | "viewer";
type Member = { userId: string; name: string; role: "editor" | "viewer" };
type Invitation = {
  id: string;
  hash: string;
  role: Member["role"];
  expiresAt: string;
};
interface Record {
  _id: string;
  ownerId: string;
  projectId: string;
  name: string;
  updatedAt: string;
  revision: number;
  document: ReturnType<typeof parseProject>;
  members?: Member[];
  invitations?: Invitation[];
  accessVersion?: number;
}
const hash = (value: string) =>
  createHash("sha256").update(value).digest("hex");
const roleOf = (record: Record, actor: string): ProjectRole | undefined =>
  record.ownerId === actor
    ? "owner"
    : record.members?.find((m) => m.userId === actor)?.role;

/** Grants and document revisions share one atomic Mongo record, including revocation. */
export class CloudProjects {
  constructor(private db: Db) {}
  private collection() {
    // Project JSON omits optional fields; BSON must not turn them into null.
    return this.db.collection<Record>("levoks_projects", {
      ignoreUndefined: true,
    });
  }
  private async record(ownerId: string, projectId: string) {
    const record = await this.collection().findOne({ ownerId, projectId });
    if (!record) throw new HttpError(404, "Project not found.");
    return record;
  }
  async get(actor: string, ownerId: string, projectId: string) {
    const record = await this.record(ownerId, projectId),
      role = roleOf(record, actor);
    if (!role)
      throw new HttpError(404, "Project not found or access was removed.");
    return {
      ownerId,
      projectId,
      name: record.name,
      updatedAt: record.updatedAt,
      revision: record.revision,
      document: record.document,
      role,
    };
  }
  async list(actor: string) {
    const records = await this.collection()
      .find(
        { $or: [{ ownerId: actor }, { "members.userId": actor }] },
        { projection: { document: 0, invitations: 0 } },
      )
      .sort({ updatedAt: -1 })
      .limit(100)
      .toArray();
    return records.map((record) => ({
      ownerId: record.ownerId,
      projectId: record.projectId,
      name: record.name,
      updatedAt: record.updatedAt,
      revision: record.revision,
      role: roleOf(record, actor),
    }));
  }
  async save(actor: string, ownerId: string, input: unknown, revision: number) {
    let document;
    try {
      document = redactProject(parseProject(input));
    } catch {
      throw new HttpError(400, "Project validation failed.");
    }
    const fields = {
      name: document.name,
      updatedAt: new Date().toISOString(),
      document,
      revision: revision + 1,
    };
    if (revision === 0) {
      if (actor !== ownerId)
        throw new HttpError(
          403,
          "Only the owner can create this cloud project.",
        );
      try {
        await this.collection().insertOne({
          _id: `${ownerId}/${document.id}`,
          ownerId,
          projectId: document.id,
          ...fields,
        });
      } catch (error) {
        if ((error as { code?: number }).code === 11000)
          throw new HttpError(
            409,
            "A cloud version already exists. Open it before saving.",
          );
        throw error;
      }
    } else {
      const record = await this.collection().findOne({
        ownerId,
        projectId: document.id,
      });
      if (!record || !roleOf(record, actor))
        throw new HttpError(
          actor === ownerId ? 409 : 403,
          "Project access was removed or the cloud project is unavailable.",
        );
      if (roleOf(record, actor) === "viewer")
        throw new HttpError(403, "Viewers cannot edit cloud projects.");
      const result = await this.collection().updateOne(
        {
          ownerId,
          projectId: document.id,
          revision,
          ...(actor === ownerId
            ? {}
            : { members: { $elemMatch: { userId: actor, role: "editor" } } }),
        },
        { $set: fields },
      );
      if (!result.matchedCount)
        throw new HttpError(
          409,
          "Cloud project changed or your access changed. Download a local backup, then reopen the cloud version.",
        );
    }
    return { revision: fields.revision };
  }
  async access(actor: string, ownerId: string, projectId: string) {
    const record = await this.record(ownerId, projectId),
      role = roleOf(record, actor);
    if (!role)
      throw new HttpError(404, "Project not found or access was removed.");
    return {
      ownerId,
      projectId,
      name: record.name,
      role,
      revision: record.revision,
      accessVersion: record.accessVersion || 0,
      members: role === "owner" ? record.members || [] : [],
      invitations:
        role === "owner"
          ? (record.invitations || []).map(({ id, role, expiresAt }) => ({
              id,
              role,
              expiresAt,
            }))
          : [],
    };
  }
  private async change(
    actor: string,
    ownerId: string,
    projectId: string,
    version: number,
    edit: (record: Record) => { members: Member[]; invitations: Invitation[] },
  ) {
    if (actor !== ownerId)
      throw new HttpError(403, "Only the owner can manage project access.");
    const record = await this.record(ownerId, projectId),
      values = edit(record);
    const result = await this.collection().updateOne(
      {
        ownerId,
        projectId,
        ...(version === 0
          ? {
              $or: [
                { accessVersion: 0 },
                { accessVersion: { $exists: false } },
              ],
            }
          : { accessVersion: version }),
      },
      { $set: { ...values, accessVersion: version + 1 } },
    );
    if (!result.matchedCount)
      throw new HttpError(
        409,
        "Project access changed. Refresh before trying again.",
      );
    return this.access(actor, ownerId, projectId);
  }
  async invite(
    actor: string,
    ownerId: string,
    projectId: string,
    version: number,
    role: Member["role"],
  ) {
    const token = randomBytes(32).toString("hex");
    const invitation: Invitation = {
      id: randomUUID(),
      hash: hash(token),
      role,
      expiresAt: new Date(Date.now() + 7 * 86400_000).toISOString(),
    };
    const access = await this.change(
      actor,
      ownerId,
      projectId,
      version,
      (record) => {
        const invitations = (record.invitations || []).filter(
          (item) => Date.parse(item.expiresAt) > Date.now(),
        );
        if (invitations.length >= 20)
          throw new HttpError(
            422,
            "Revoke an invitation before creating another (limit 20).",
          );
        return {
          members: record.members || [],
          invitations: [...invitations, invitation],
        };
      },
    );
    return { ...access, token, invitationId: invitation.id };
  }
  async manage(
    actor: string,
    ownerId: string,
    projectId: string,
    version: number,
    command: {
      action: "role" | "remove" | "revoke";
      memberId?: string;
      invitationId?: string;
      role?: Member["role"];
    },
  ) {
    return this.change(actor, ownerId, projectId, version, (record) => {
      if (command.memberId === ownerId)
        throw new HttpError(
          422,
          "The owner role cannot be changed or removed.",
        );
      const members = record.members || [],
        invitations = record.invitations || [];
      if (command.action === "revoke") {
        if (!invitations.some((item) => item.id === command.invitationId))
          throw new HttpError(404, "Invitation not found.");
        return {
          members,
          invitations: invitations.filter(
            (item) => item.id !== command.invitationId,
          ),
        };
      }
      if (!members.some((item) => item.userId === command.memberId))
        throw new HttpError(404, "Member not found.");
      return {
        invitations,
        members:
          command.action === "remove"
            ? members.filter((item) => item.userId !== command.memberId)
            : members.map((item) =>
                item.userId === command.memberId
                  ? { ...item, role: command.role! }
                  : item,
              ),
      };
    });
  }
  async invitation(
    actor: string,
    ownerId: string,
    projectId: string,
    token: string,
  ) {
    const record = await this.record(ownerId, projectId);
    const existingRole = roleOf(record, actor);
    if (existingRole)
      return { name: record.name, role: existingRole, alreadyMember: true };
    const invitation = record.invitations?.find(
      (item) =>
        item.hash === hash(token) && Date.parse(item.expiresAt) > Date.now(),
    );
    if (!invitation)
      throw new HttpError(
        410,
        "Invitation expired, was revoked or has already been used. Ask the owner for a new link.",
      );
    return {
      name: record.name,
      role: invitation.role,
      expiresAt: invitation.expiresAt,
      alreadyMember: !!roleOf(record, actor),
    };
  }
  async removeProject(
    actor: string,
    ownerId: string,
    projectId: string,
    version: number,
    name: string,
    revision: number,
  ) {
    if (actor !== ownerId)
      throw new HttpError(
        403,
        "Only the owner can delete the shared cloud project.",
      );
    const record = await this.record(ownerId, projectId);
    if (record.revision !== revision)
      throw new HttpError(
        409,
        "The cloud project changed. Refresh before deleting.",
      );
    if (record.name !== name)
      throw new HttpError(
        422,
        "Enter the current project name to confirm deletion.",
      );
    const result = await this.collection().deleteOne({
      ownerId,
      projectId,
      revision,
      ...(version === 0
        ? { $or: [{ accessVersion: 0 }, { accessVersion: { $exists: false } }] }
        : { accessVersion: version }),
    });
    if (!result.deletedCount)
      throw new HttpError(
        409,
        "The project or its access changed. Refresh before deleting.",
      );
    return { deleted: true };
  }
  async accept(
    actor: string,
    name: string,
    ownerId: string,
    projectId: string,
    token: string,
  ) {
    const record = await this.record(ownerId, projectId);
    if (roleOf(record, actor)) return this.access(actor, ownerId, projectId);
    const invitation = record.invitations?.find(
      (item) =>
        item.hash === hash(token) && Date.parse(item.expiresAt) > Date.now(),
    );
    if (!invitation)
      throw new HttpError(
        410,
        "Invitation expired, was revoked or has already been used. Ask the owner for a new link.",
      );
    const result = await this.collection().updateOne(
      {
        ownerId,
        projectId,
        invitations: {
          $elemMatch: {
            id: invitation.id,
            hash: hash(token),
            expiresAt: { $gt: new Date().toISOString() },
          },
        },
        "members.userId": { $ne: actor },
        $expr: { $lt: [{ $size: { $ifNull: ["$members", []] } }, 50] },
      },
      {
        $push: {
          members: {
            userId: actor,
            name: name.trim().slice(0, 80) || actor,
            role: invitation.role,
          },
        },
        $pull: { invitations: { id: invitation.id } },
        $inc: { accessVersion: 1 },
      },
    );
    if (!result.matchedCount) {
      const latest = await this.record(ownerId, projectId);
      if (!roleOf(latest, actor))
        throw new HttpError(
          409,
          "Invitation changed or the project reached its 50-member limit. Ask the owner for access.",
        );
    }
    return this.access(actor, ownerId, projectId);
  }
}
