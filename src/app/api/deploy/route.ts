import { NextResponse } from "next/server";
import { z } from "zod";
import { apiError, HttpError, providerJSON, readJSON } from "@/lib/server/http";
import { validateFiles } from "@/lib/codegen/files";
export async function POST(request: Request) {
  try {
    const publicOrigin = z.url().refine((value) => {
      const url = new URL(value);
      return (
        url.protocol === "https:" &&
        !url.username &&
        !url.password &&
        !url.search &&
        !url.hash &&
        url.pathname === "/"
      );
    }, "Use an HTTPS origin without credentials, paths, or query parameters.");
    const body = z
      .object({
        token: z.string().min(10).max(1000),
        action: z.enum(["deploy", "status"]),
        name: z
          .string()
          .regex(/^[a-z0-9][a-z0-9-]{0,80}$/)
          .optional(),
        deploymentId: z
          .string()
          .regex(/^[a-zA-Z0-9_-]+$/)
          .optional(),
        files: z.unknown().optional(),
        environment: z
          .record(z.string().regex(/^NEXT_PUBLIC_API_\d+$/), publicOrigin)
          .default({}),
      })
      .parse(await readJSON(request, 12_000_000));
    if (body.action === "status") {
      if (!body.deploymentId)
        throw new HttpError(400, "Deployment ID is required.");
      const deployment = await providerJSON(
        `https://api.vercel.com/v13/deployments/${body.deploymentId}`,
        body.token,
      );
      return NextResponse.json({
        id: deployment.id,
        url: deployment.url,
        state: deployment.readyState,
      });
    }
    if (!body.name) throw new HttpError(400, "Deployment name is required.");
    const files = validateFiles(body.files);
    const frontend = Object.entries(files).filter(([path]) =>
      path.startsWith("frontend/"),
    );
    if (!files["frontend/package.json"] || !frontend.length)
      throw new HttpError(400, "A generated Next.js frontend is required.");
    const deploymentFiles = frontend.map(([path, data]) => ({
      file: path.slice(9),
      data: Buffer.from(data).toString("base64"),
      encoding: "base64",
    }));
    // These are public API origins, not credentials. Next reads them at build time.
    deploymentFiles.push({
      file: ".env.production",
      data: Buffer.from(
        Object.entries(body.environment)
          .map(([key, value]) => `${key}=${new URL(value).origin}`)
          .join("\n"),
      ).toString("base64"),
      encoding: "base64",
    });
    const deployment = await providerJSON(
      "https://api.vercel.com/v13/deployments",
      body.token,
      {
        method: "POST",
        body: JSON.stringify({
          name: body.name,
          files: deploymentFiles,
          projectSettings: { framework: "nextjs" },
        }),
      },
    );
    return NextResponse.json({
      id: deployment.id,
      url: deployment.url,
      state: deployment.readyState || "QUEUED",
    });
  } catch (error) {
    return apiError(error);
  }
}
