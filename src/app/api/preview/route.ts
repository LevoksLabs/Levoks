import { NextResponse } from "next/server";
import { z } from "zod";
import { apiError, HttpError, readJSON } from "@/lib/server/http";
import {
  localPreviewOrigin,
  newPreviewOwner,
  previewOwner,
  previewState,
  startPreview,
  stopPreview,
} from "@/lib/server/preview";

export const runtime = "nodejs";
export async function GET(request: Request) {
  try {
    localPreviewOrigin(request);
    const id = new URL(request.url).searchParams.get("id"),
      owner = previewOwner(request);
    if (id) {
      if (!owner) throw new HttpError(404, "Preview not found.");
      return NextResponse.json(previewState(z.uuid().parse(id), owner), {
        headers: { "Cache-Control": "private, no-store" },
      });
    }
    const response = NextResponse.json(
      { available: true },
      { headers: { "Cache-Control": "private, no-store" } },
    );
    response.cookies.set("levoks_preview_owner", owner || newPreviewOwner(), {
      httpOnly: true,
      sameSite: "strict",
      path: "/api/preview",
      maxAge: 3600,
    });
    return response;
  } catch (error) {
    return apiError(error);
  }
}
export async function POST(request: Request) {
  try {
    const origin = localPreviewOrigin(request);
    const owner = previewOwner(request);
    if (!owner)
      throw new HttpError(403, "Initialize local preview before starting.");
    const body = z
      .object({ project: z.unknown() })
      .parse(await readJSON(request));
    return NextResponse.json(await startPreview(body.project, owner, origin), {
      status: 202,
      headers: { "Cache-Control": "private, no-store" },
    });
  } catch (error) {
    return apiError(
      error instanceof Error &&
        !(error instanceof HttpError) &&
        !(error instanceof z.ZodError)
        ? new HttpError(400, error.message)
        : error,
    );
  }
}
export async function DELETE(request: Request) {
  try {
    localPreviewOrigin(request);
    const owner = previewOwner(request);
    if (!owner) throw new HttpError(404, "Preview not found.");
    const body = z.object({ id: z.uuid() }).parse(await readJSON(request));
    await stopPreview(body.id, owner);
    return NextResponse.json(
      { stopped: true },
      { headers: { "Cache-Control": "private, no-store" } },
    );
  } catch (error) {
    return apiError(error);
  }
}
