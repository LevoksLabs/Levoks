import { NextResponse } from "next/server";
import { z } from "zod";
import { getMongoClient } from "@/lib/mongodb";
import { requireOwner } from "@/lib/server/identity";
import { apiError, HttpError } from "@/lib/server/http";
import { Deployments } from "@/lib/server/deployments";
import { deploymentProjectId } from "@/lib/deployment";
import { createProjectZip } from "@/lib/codegen/exporter";

export async function GET(request: Request) {
  try {
    const owner = await requireOwner();
    const params = new URL(request.url).searchParams;
    const projectId = deploymentProjectId.parse(params.get("projectId"));
    const operationId = z.uuid().parse(params.get("operationId"));
    if (!process.env.MONGODB_URI)
      throw new HttpError(
        503,
        "Configure deployment storage to download archived releases.",
      );
    const store = new Deployments((await getMongoClient()).db());
    const archive = await store.archive(owner, projectId, operationId);
    const bytes = await createProjectZip(archive.files);
    return new NextResponse(bytes as Uint8Array<ArrayBuffer>, {
      headers: {
        "Content-Type": "application/zip",
        "Content-Disposition": `attachment; filename="levoks-release-${operationId}.zip"`,
        "Cache-Control": "private, no-store",
        "X-Content-Type-Options": "nosniff",
      },
    });
  } catch (error) {
    const response = apiError(error);
    response.headers.set("Cache-Control", "private, no-store");
    return response;
  }
}
