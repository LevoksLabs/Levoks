import { getServerSession } from "next-auth";
import { NextResponse } from "next/server";
import { z } from "zod";
import { authOptions } from "@/lib/server/auth";
import { getMongoClient } from "@/lib/mongodb";
import { apiError, HttpError, readJSON } from "@/lib/server/http";
import { parseProject, redactProject } from "@/lib/project/schema";
async function collection() {
  if (!process.env.MONGODB_URI)
    throw new HttpError(
      503,
      "Cloud saving is not configured. Local autosave remains available.",
    );
  return (await getMongoClient())
    .db()
    .collection<{
      _id: string;
      ownerId: string;
      projectId: string;
      name: string;
      updatedAt: string;
      revision: number;
      document: ReturnType<typeof parseProject>;
    }>("levoks_projects");
}
async function owner() {
  const session = await getServerSession(authOptions);
  if (!session?.user?.id)
    throw new HttpError(401, "Sign in to use cloud projects.");
  return session.user.id;
}
export async function GET(request: Request) {
  try {
    const ownerId = await owner();
    const db = await collection();
    const id = new URL(request.url).searchParams.get("id");
    if (id) {
      const project = await db.findOne(
        { ownerId, projectId: id },
        { projection: { _id: 0 } },
      );
      if (!project) throw new HttpError(404, "Project not found.");
      return NextResponse.json(project, {
        headers: { "Cache-Control": "no-store" },
      });
    }
    return NextResponse.json(
      await db
        .find(
          { ownerId },
          {
            projection: {
              _id: 0,
              projectId: 1,
              name: 1,
              updatedAt: 1,
              revision: 1,
            },
          },
        )
        .sort({ updatedAt: -1 })
        .limit(100)
        .toArray(),
      { headers: { "Cache-Control": "no-store" } },
    );
  } catch (error) {
    return apiError(error);
  }
}
export async function PUT(request: Request) {
  try {
    const ownerId = await owner();
    const body = z
      .object({
        project: z.unknown(),
        revision: z.number().int().nonnegative(),
      })
      .parse(await readJSON(request));
    let project;
    try {
      project = redactProject(parseProject(body.project));
    } catch {
      throw new HttpError(400, "Project validation failed.");
    }
    const db = await collection();
    const record = {
      ownerId,
      projectId: project.id,
      name: project.name,
      updatedAt: new Date().toISOString(),
      document: project,
      revision: body.revision + 1,
    };
    if (body.revision === 0) {
      try {
        await db.insertOne({ ...record, _id: `${ownerId}/${project.id}` });
      } catch (error) {
        if ((error as { code?: number }).code === 11000)
          throw new HttpError(
            409,
            "A cloud version already exists. Open it before saving.",
          );
        throw error;
      }
    } else {
      const result = await db.updateOne(
        { ownerId, projectId: project.id, revision: body.revision },
        { $set: record },
      );
      if (!result.matchedCount)
        throw new HttpError(
          409,
          "Cloud project changed. Download a local backup, then reopen the cloud version.",
        );
    }
    return NextResponse.json({ revision: record.revision });
  } catch (error) {
    return apiError(error);
  }
}
