import { NextResponse } from "next/server";
import { z } from "zod";
import { getMongoClient } from "@/lib/mongodb";
import { requireOwner } from "@/lib/server/identity";
import { apiError, HttpError, readJSON } from "@/lib/server/http";
import {
  GitHubConnections,
  connectionMetadata,
} from "@/lib/server/github-connections";
import {
  githubCall,
  projectChanges,
  repositoryPath,
} from "@/lib/server/github";
import { compileProject } from "@/lib/project/compiler";
import { parseProject } from "@/lib/project/schema";

const projectId = z.string().regex(/^[A-Za-z0-9_-]{1,120}$/);
const name = z.string().regex(/^[\w.-]{1,100}$/);
const branch = z
  .string()
  .min(1)
  .max(200)
  .regex(/^[\w/.-]+$/)
  .refine(
    (s) =>
      !s.includes("..") &&
      !s.includes("//") &&
      s
        .split("/")
        .every(
          (p) =>
            p && !p.startsWith(".") && !p.endsWith(".") && !p.endsWith(".lock"),
        ),
  );
const sha = z.string().regex(/^[a-f0-9]{40}$/);
const bodySchema = z.object({
  projectId,
  action: z.enum([
    "repositories",
    "branches",
    "review",
    "connect",
    "queue",
    "configure",
    "disconnect",
    "history",
    "createRepository",
    "createBranch",
    "initialize",
  ]),
  token: z.string().min(10).max(1000).optional(),
  owner: name.optional(),
  repo: name.optional(),
  branch: branch.optional(),
  expectedHead: sha.optional(),
  version: z.number().int().nonnegative().default(0),
  sequence: z.number().int().nonnegative().default(0),
  page: z.number().int().min(1).max(200).default(1),
  project: z.unknown().optional(),
  message: z.string().trim().min(1).max(200).default("Save Levoks progress"),
  automatic: z.boolean().default(false),
  cancel: z.boolean().default(false),
  immediate: z.boolean().default(true),
  private: z.boolean().default(true),
});
async function storage() {
  if (!process.env.MONGODB_URI)
    throw new HttpError(
      503,
      "Configure MongoDB, the vault keyring and the GitHub worker to enable durable connections.",
    );
  const db = (await getMongoClient()).db();
  return { db, store: new GitHubConnections(db) };
}
export async function GET(request: Request) {
  try {
    const owner = await requireOwner();
    const id = projectId.parse(
      new URL(request.url).searchParams.get("projectId"),
    );
    const { db, store } = await storage();
    const c = await store.get(owner, id);
    const worker = await db
      .collection<{ _id: string; heartbeat: Date }>("levoks_workers")
      .findOne({ _id: "github" });
    return NextResponse.json(
      {
        connection: c ? connectionMetadata(c) : null,
        workerOnline:
          !!worker && Date.now() - worker.heartbeat.getTime() < 120_000,
      },
      { headers: { "Cache-Control": "no-store" } },
    );
  } catch (error) {
    return apiError(error);
  }
}
export async function POST(request: Request) {
  try {
    const ownerId = await requireOwner();
    const b = bodySchema.parse(await readJSON(request));
    const { store } = await storage();
    if (b.action === "queue")
      return NextResponse.json(
        connectionMetadata(
          await store.enqueue(
            ownerId,
            b.projectId,
            b.project,
            b.sequence,
            b.version,
            b.message,
            b.immediate,
          ),
        ),
      );
    if (b.action === "configure")
      return NextResponse.json(
        connectionMetadata(
          await store.configure(
            ownerId,
            b.projectId,
            b.version,
            b.automatic,
            b.cancel,
          ),
        ),
      );
    if (b.action === "disconnect") {
      await store.disconnect(ownerId, b.projectId, b.version);
      return NextResponse.json({ disconnected: true });
    }
    const saved = b.token ? null : await store.require(ownerId, b.projectId);
    const token = b.token || (await store.target(saved!)).token;
    if (b.action === "repositories") {
      const repos = await githubCall(
        token,
        `/user/repos?per_page=50&page=${b.page}&sort=updated&affiliation=owner,collaborator,organization_member`,
      );
      return NextResponse.json({
        repositories: (
          repos as {
            name: string;
            owner: { login: string };
            default_branch: string;
            permissions?: { push?: boolean };
            archived: boolean;
            private: boolean;
          }[]
        )
          .filter((r) => r.permissions?.push && !r.archived)
          .map((r) => ({
            name: r.name,
            owner: r.owner.login,
            defaultBranch: r.default_branch,
            private: r.private,
          })),
        hasMore: repos.length === 50,
      });
    }
    if (b.action === "createRepository") {
      const result = await githubCall(token, "/user/repos", "POST", {
        name: name.parse(b.repo),
        private: b.private,
        auto_init: true,
        description: "Application designed in Levoks",
      });
      return NextResponse.json({
        owner: result.owner.login,
        name: result.name,
        defaultBranch: result.default_branch,
      });
    }
    const target = {
      token,
      owner: name.parse(b.owner || saved?.owner),
      repo: name.parse(b.repo || saved?.repo),
      branch: branch.parse(b.branch || saved?.branch || "main"),
    };
    const base = repositoryPath(target.owner, target.repo);
    if (b.action === "branches") {
      const branches = await githubCall(
        token,
        `${base}/branches?per_page=50&page=${b.page}`,
      );
      return NextResponse.json({
        branches: branches.map(
          (v: {
            name: string;
            commit: { sha: string };
            protected: boolean;
          }) => ({ name: v.name, sha: v.commit.sha, protected: v.protected }),
        ),
        hasMore: branches.length === 50,
      });
    }
    if (b.action === "createBranch") {
      const result = await githubCall(token, `${base}/git/refs`, "POST", {
        ref: `refs/heads/${target.branch}`,
        sha: sha.parse(b.expectedHead),
      });
      return NextResponse.json({ name: target.branch, sha: result.object.sha });
    }
    if (b.action === "initialize") {
      const repository = await githubCall(token, base);
      if (repository.size !== 0)
        throw new HttpError(
          409,
          "Repository is not empty. Select an existing branch.",
        );
      await githubCall(token, `${base}/contents/README.md`, "PUT", {
        message: "Initialize Levoks repository",
        content: Buffer.from(`# ${target.repo}\n`).toString("base64"),
        branch: target.branch,
      });
      return NextResponse.json({ initialized: true });
    }
    if (b.action === "history") {
      const result = await githubCall(
        token,
        `${base}/commits?sha=${encodeURIComponent(target.branch)}&path=${encodeURIComponent(`levoks/${b.projectId}/`)}&per_page=30`,
      );
      return NextResponse.json(
        result.map(
          (c: {
            sha: string;
            commit: { message: string; author: { date: string } };
          }) => ({
            sha: c.sha,
            message: c.commit.message,
            at: c.commit.author.date,
          }),
        ),
      );
    }
    if (b.action === "review") {
      const project = parseProject(b.project);
      if (project.id !== b.projectId)
        throw new HttpError(400, "Snapshot belongs to another project.");
      const output = compileProject(project);
      if (output.diagnostics.some((d) => d.severity === "error"))
        throw new HttpError(
          422,
          "Resolve Source & checks errors before reviewing a commit.",
        );
      return NextResponse.json(
        await projectChanges(target, b.projectId, output.files),
      );
    }
    // Contents write permission is ultimately enforced by GitHub at commit time (including branch rules).
    const repo = await githubCall(token, base);
    if (!repo.permissions?.push || repo.archived)
      throw new HttpError(
        403,
        "This repository does not allow writes with the supplied authorization.",
      );
    return NextResponse.json(
      connectionMetadata(
        await store.connect(
          ownerId,
          b.projectId,
          target,
          b.version,
          sha.parse(b.expectedHead),
        ),
      ),
    );
  } catch (error) {
    return apiError(error);
  }
}
