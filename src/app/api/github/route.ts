import { NextResponse } from "next/server";
import { z } from "zod";
import { apiError, readJSON } from "@/lib/server/http";
import { commitProject, githubHead } from "@/lib/server/github";
const target = z.object({
  token: z.string().min(10).max(1000),
  owner: z.string().regex(/^[\w-]+$/),
  repo: z.string().regex(/^[\w.-]+$/),
  branch: z
    .string()
    .min(1)
    .max(200)
    .regex(/^[\w/.-]+$/)
    .refine(
      (s) => !s.includes("..") && !s.endsWith("/") && !s.endsWith(".lock"),
    ),
});
export async function POST(request: Request) {
  try {
    const raw = await readJSON(request, 12_000_000);
    const body = target
      .extend({
        action: z.enum(["connect", "commit"]),
        projectId: z.string().regex(/^[a-zA-Z0-9_-]+$/),
        files: z.unknown().optional(),
        expectedHead: z
          .string()
          .regex(/^[a-f0-9]{40}$/)
          .optional(),
        message: z
          .string()
          .trim()
          .min(1)
          .max(200)
          .default("Save Levoks progress"),
      })
      .parse(raw);
    if (body.action === "connect") {
      const { sha } = await githubHead(body);
      return NextResponse.json({ sha });
    }
    const expectedHead = z
      .string()
      .regex(/^[a-f0-9]{40}$/)
      .parse(body.expectedHead);
    return NextResponse.json(
      await commitProject(
        body,
        body.projectId,
        body.files,
        expectedHead,
        body.message,
      ),
    );
  } catch (error) {
    return apiError(error);
  }
}
