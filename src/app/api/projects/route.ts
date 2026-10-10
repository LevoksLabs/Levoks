import { NextResponse } from "next/server";
import { z } from "zod";
import { getMongoClient } from "@/lib/mongodb";
import { requireOwner } from "@/lib/server/identity";
import { apiError, HttpError, readJSON } from "@/lib/server/http";
import { CloudProjects } from "@/lib/server/cloud-projects";
async function store() {
  if (!process.env.MONGODB_URI)
    throw new HttpError(
      503,
      "Cloud saving is not configured. Local autosave remains available.",
    );
  return new CloudProjects((await getMongoClient()).db());
}
const identity = z.string().min(1).max(200);
export async function GET(request: Request) {
  try {
    const actor = await requireOwner(),
      projects = await store();
    const params = new URL(request.url).searchParams,
      id = params.get("id");
    return NextResponse.json(
      id
        ? await projects.get(
            actor,
            identity.parse(params.get("ownerId") || actor),
            identity.parse(id),
          )
        : await projects.list(actor),
      { headers: { "Cache-Control": "no-store" } },
    );
  } catch (error) {
    return apiError(error);
  }
}
export async function PUT(request: Request) {
  try {
    const actor = await requireOwner();
    const body = z
      .object({
        ownerId: identity,
        projectOwnerId: identity.optional(),
        project: z.unknown(),
        revision: z.number().int().nonnegative(),
      })
      .parse(await readJSON(request));
    if (body.ownerId !== actor)
      throw new HttpError(
        409,
        "Your account changed. Reload cloud projects before saving.",
      );
    return NextResponse.json(
      await (
        await store()
      ).save(actor, body.projectOwnerId || actor, body.project, body.revision),
      { headers: { "Cache-Control": "no-store" } },
    );
  } catch (error) {
    return apiError(error);
  }
}
