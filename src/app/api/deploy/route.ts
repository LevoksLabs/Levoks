import { NextResponse } from "next/server";
import { z } from "zod";
import { getMongoClient } from "@/lib/mongodb";
import { requireOwner } from "@/lib/server/identity";
import { apiError, HttpError, readJSON } from "@/lib/server/http";
import { Deployments, deploymentMetadata } from "@/lib/server/deployments";
import {
  deploymentProjectId,
  deploymentTarget,
  deploymentEnvironment,
  DEPLOYMENT_CAPABILITIES,
} from "@/lib/deployment";

const bodySchema = z.discriminatedUnion("action", [
  z.object({
    action: z.literal("connect"),
    ownerId: z.string().min(1),
    projectId: deploymentProjectId,
    target: deploymentTarget,
    token: z.string().min(10).max(1000),
    version: z.number().int().nonnegative(),
  }),
  z.object({
    action: z.literal("deploy"),
    ownerId: z.string().min(1),
    projectId: deploymentProjectId,
    project: z.unknown(),
    environment: deploymentEnvironment,
    version: z.number().int().positive(),
    sequence: z.number().int().nonnegative(),
    operationId: z.uuid(),
  }),
  z.object({
    action: z.literal("replay"),
    ownerId: z.string().min(1),
    projectId: deploymentProjectId,
    sourceOperationId: z.uuid(),
    version: z.number().int().positive(),
    sequence: z.number().int().nonnegative(),
    operationId: z.uuid(),
  }),
  z.object({
    action: z.enum(["cancel", "refresh"]),
    ownerId: z.string().min(1),
    projectId: deploymentProjectId,
    operationId: z.uuid(),
  }),
]);
async function storage() {
  if (!process.env.MONGODB_URI)
    throw new HttpError(
      503,
      "Configure MongoDB, the vault keyring and the deployment worker to enable managed previews.",
    );
  const db = (await getMongoClient()).db();
  return { db, store: new Deployments(db) };
}
export async function GET(request: Request) {
  try {
    const owner = await requireOwner();
    const projectId = deploymentProjectId.parse(
      new URL(request.url).searchParams.get("projectId"),
    );
    const { db, store } = await storage();
    const c = await store.get(owner, projectId);
    const worker = await db
      .collection<{ _id: string; heartbeat: Date }>("levoks_workers")
      .findOne({ _id: "deployment" });
    return NextResponse.json(
      {
        connection: c ? deploymentMetadata(c) : null,
        capabilities: DEPLOYMENT_CAPABILITIES,
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
    const owner = await requireOwner();
    const b = bodySchema.parse(await readJSON(request));
    if (b.ownerId !== owner)
      throw new HttpError(
        409,
        "Your account changed. Reload deployment connections before continuing.",
      );
    const { store } = await storage();
    const c =
      b.action === "connect"
        ? await store.connect(owner, b.projectId, b.target, b.token, b.version)
        : b.action === "deploy"
          ? await store.enqueue(
              owner,
              b.projectId,
              b.project,
              b.environment,
              b.version,
              b.sequence,
              b.operationId,
            )
          : b.action === "replay"
            ? await store.replay(
                owner,
                b.projectId,
                b.sourceOperationId,
                b.version,
                b.sequence,
                b.operationId,
              )
            : b.action === "cancel"
              ? await store.cancel(owner, b.projectId, b.operationId)
              : await store.resume(owner, b.projectId, b.operationId);
    return NextResponse.json(deploymentMetadata(c), {
      headers: { "Cache-Control": "no-store" },
    });
  } catch (error) {
    return apiError(error);
  }
}
