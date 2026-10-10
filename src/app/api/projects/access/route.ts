import { getServerSession } from "next-auth";
import { NextResponse } from "next/server";
import { z } from "zod";
import { getMongoClient } from "@/lib/mongodb";
import { authOptions } from "@/lib/server/auth";
import { CloudProjects } from "@/lib/server/cloud-projects";
import { apiError, HttpError, readJSON } from "@/lib/server/http";
const id = z.string().min(1).max(200),
  token = z.string().regex(/^[a-f0-9]{64}$/),
  role = z.enum(["editor", "viewer"]);
const target = z.object({ ownerId: id, projectId: id });
const versioned = target.extend({
  actorId: id,
  accessVersion: z.number().int().nonnegative(),
});
const command = z.discriminatedUnion("action", [
  versioned.extend({
    action: z.literal("delete"),
    name: z.string().min(1).max(200),
    revision: z.number().int().positive(),
  }),
  versioned.extend({ action: z.literal("invite"), role }),
  versioned.extend({ action: z.literal("role"), memberId: id, role }),
  versioned.extend({ action: z.literal("remove"), memberId: id }),
  versioned.extend({ action: z.literal("revoke"), invitationId: z.uuid() }),
  target.extend({ actorId: id, action: z.literal("accept"), token }),
]);
async function context() {
  const session = await getServerSession(authOptions);
  if (!session?.user?.id)
    throw new HttpError(401, "Sign in to collaborate on cloud projects.");
  if (!process.env.MONGODB_URI)
    throw new HttpError(503, "Configure cloud storage to share projects.");
  return {
    actor: session.user.id,
    name: session.user.name || session.user.id,
    store: new CloudProjects((await getMongoClient()).db()),
  };
}
function response(value: unknown) {
  return NextResponse.json(value, {
    headers: { "Cache-Control": "private, no-store" },
  });
}
export async function GET(request: Request) {
  try {
    const { actor, store } = await context(),
      params = new URL(request.url).searchParams;
    const { ownerId, projectId } = target.parse(Object.fromEntries(params));
    const invitationToken = request.headers.get("x-levoks-invitation");
    return response(
      invitationToken
        ? await store.invitation(
            actor,
            ownerId,
            projectId,
            token.parse(invitationToken),
          )
        : await store.access(actor, ownerId, projectId),
    );
  } catch (error) {
    const result = apiError(error);
    result.headers.set("Cache-Control", "private, no-store");
    return result;
  }
}
export async function POST(request: Request) {
  try {
    const { actor, name, store } = await context(),
      body = command.parse(await readJSON(request, 8000));
    if (body.actorId !== actor)
      throw new HttpError(
        409,
        "Your account changed. Reload before changing project access.",
      );
    if (body.action === "accept")
      return response(
        await store.accept(
          actor,
          name,
          body.ownerId,
          body.projectId,
          body.token,
        ),
      );
    if (body.action === "delete")
      return response(
        await store.removeProject(
          actor,
          body.ownerId,
          body.projectId,
          body.accessVersion,
          body.name,
          body.revision,
        ),
      );
    if (body.action === "invite")
      return response(
        await store.invite(
          actor,
          body.ownerId,
          body.projectId,
          body.accessVersion,
          body.role,
        ),
      );
    return response(
      await store.manage(
        actor,
        body.ownerId,
        body.projectId,
        body.accessVersion,
        body,
      ),
    );
  } catch (error) {
    const result = apiError(error);
    result.headers.set("Cache-Control", "private, no-store");
    return result;
  }
}
