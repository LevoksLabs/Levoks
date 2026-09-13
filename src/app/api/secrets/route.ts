import { z } from "zod";
import { NextResponse } from "next/server";
import { apiError, HttpError, readJSON } from "@/lib/server/http";
import { requireOwner } from "@/lib/server/identity";
import { MongoVault } from "@/lib/server/vault";
import { getMongoClient } from "@/lib/mongodb";
const projectId = z.string().regex(/^[A-Za-z0-9_-]{1,120}$/);
async function vault() {
  if (!process.env.MONGODB_URI)
    throw new HttpError(
      503,
      "Configure MONGODB_URI and the server vault keyring to enable durable secrets.",
    );
  return new MongoVault((await getMongoClient()).db());
}
export async function GET(request: Request) {
  try {
    const owner = await requireOwner();
    const id = projectId.parse(
      new URL(request.url).searchParams.get("projectId"),
    );
    return NextResponse.json(await (await vault()).list(owner, id), {
      headers: { "Cache-Control": "no-store" },
    });
  } catch (error) {
    return apiError(error);
  }
}
export async function POST(request: Request) {
  try {
    const owner = await requireOwner();
    const body = z
      .object({
        projectId,
        name: z.string().regex(/^[A-Z_][A-Z0-9_]{0,99}$/),
        version: z.number().int().nonnegative(),
        action: z.enum(["put", "remove", "rotate"]),
        value: z.string().max(32000).optional(),
      })
      .parse(await readJSON(request, 40000));
    const store = await vault();
    if (body.action === "put")
      return NextResponse.json(
        await store.put(
          owner,
          body.projectId,
          body.name,
          body.value || "",
          body.version,
        ),
      );
    if (body.action === "rotate")
      return NextResponse.json(
        await store.rotate(owner, body.projectId, body.name, body.version),
      );
    await store.remove(owner, body.projectId, body.name, body.version);
    return new NextResponse(null, { status: 204 });
  } catch (error) {
    return apiError(error);
  }
}
