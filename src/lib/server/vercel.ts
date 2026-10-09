import { z } from "zod";
import { validateFiles } from "../codegen/files";
import {
  deploymentEnvironment,
  deploymentTarget,
  type DeploymentTarget,
} from "../deployment";
import { HttpError, providerJSON } from "./http";

export interface VercelAuthorization extends DeploymentTarget {
  token: string;
}
const state = z.enum([
  "QUEUED",
  "INITIALIZING",
  "BUILDING",
  "READY",
  "ERROR",
  "CANCELED",
  "BLOCKED",
]);
const deployment = z.object({
  id: z.string().regex(/^[A-Za-z0-9_-]+$/),
  readyState: state,
  url: z
    .string()
    .regex(/^[A-Za-z0-9][A-Za-z0-9.-]*\.vercel\.app$/)
    .optional(),
  projectId: z.string(),
  meta: z.record(z.string(), z.string()).optional(),
});
export type VercelDeployment = z.infer<typeof deployment>;
function endpoint(path: string, target: VercelAuthorization) {
  const url = new URL(path, "https://api.vercel.com");
  if (target.teamId) url.searchParams.set("teamId", target.teamId);
  return url.toString();
}
function checked(
  value: unknown,
  target: VercelAuthorization,
  operationId: string,
) {
  const result = deployment.safeParse(value);
  if (
    !result.success ||
    result.data.projectId !== target.providerProjectId ||
    result.data.meta?.levoksOperation !== operationId
  )
    throw new HttpError(
      502,
      "Provider response does not match the queued release.",
    );
  return result.data;
}
export async function verifyVercelTarget(target: VercelAuthorization) {
  deploymentTarget.parse(target);
  const value = await providerJSON(
    endpoint(`/v9/projects/${target.providerProjectId}`, target),
    target.token,
  );
  if (
    value.id !== target.providerProjectId ||
    value.name !== target.name ||
    value.framework !== "nextjs"
  )
    throw new HttpError(
      422,
      "Select an existing Vercel Next.js project with the matching name.",
    );
}
export async function createVercelRelease(
  target: VercelAuthorization,
  files: Record<string, string>,
  environment: Record<string, string>,
  operationId: string,
) {
  deploymentTarget.parse(target);
  const source = validateFiles(files);
  if (!source["frontend/package.json"])
    throw new HttpError(422, "A generated Next.js frontend is required.");
  const origins = deploymentEnvironment.parse(environment);
  const frontend = Object.entries(source)
    .filter(
      ([path]) =>
        path.startsWith("frontend/") &&
        !path
          .slice(9)
          .split("/")
          .some((part) => part.startsWith(".env")),
    )
    .map(([path, data]) => ({
      file: path.slice(9),
      data: Buffer.from(data).toString("base64"),
      encoding: "base64",
    }));
  frontend.push({
    file: ".env.production",
    encoding: "base64",
    data: Buffer.from(
      Object.entries(origins)
        .map(([key, value]) => `${key}=${new URL(value).origin}`)
        .join("\n"),
    ).toString("base64"),
  });
  const value = await providerJSON(
    endpoint("/v13/deployments", target),
    target.token,
    {
      method: "POST",
      body: JSON.stringify({
        name: target.name,
        project: target.providerProjectId,
        files: frontend,
        projectSettings: { framework: "nextjs" },
        meta: { levoksOperation: operationId },
        // Omitted target creates a preview; never promote a live production alias.
      }),
    },
  );
  // Some create responses contain only id/state. Read the full deployment before
  // attaching it; failure after a successful POST remains an uncertain submission.
  if (value.projectId !== undefined || value.meta !== undefined)
    return checked(value, target, operationId);
  const acknowledgement = deployment
    .pick({ id: true, readyState: true })
    .safeParse(value);
  if (!acknowledgement.success)
    throw new HttpError(
      502,
      "Provider returned an invalid submission acknowledgement.",
    );
  try {
    return await getVercelRelease(target, acknowledgement.data.id, operationId);
  } catch {
    throw new HttpError(
      502,
      "The submission was acknowledged but its status could not be verified. Recover the release before submitting again.",
    );
  }
}
export async function getVercelRelease(
  target: VercelAuthorization,
  id: string,
  operationId: string,
) {
  if (!/^[A-Za-z0-9_-]+$/.test(id))
    throw new HttpError(400, "Invalid deployment ID.");
  return checked(
    await providerJSON(
      endpoint(`/v13/deployments/${id}`, target),
      target.token,
    ),
    target,
    operationId,
  );
}
/** A lost POST acknowledgement must never blindly trigger another billable build. */
export async function recoverVercelRelease(
  target: VercelAuthorization,
  operationId: string,
  since: string,
) {
  let until: number | undefined;
  for (let page = 0; page < 5; page++) {
    const url = new URL(endpoint("/v7/deployments", target));
    url.searchParams.set("projectId", target.providerProjectId);
    url.searchParams.set("limit", "100");
    url.searchParams.set("since", String(Date.parse(since) - 60_000));
    if (until !== undefined) url.searchParams.set("until", String(until));
    const result = z
      .object({
        deployments: z.array(
          z.object({
            uid: z.string().regex(/^[A-Za-z0-9_-]+$/),
            meta: z.record(z.string(), z.unknown()).optional(),
          }),
        ),
        pagination: z.object({ next: z.number().nullable() }),
      })
      .safeParse(await providerJSON(url.toString(), target.token));
    if (!result.success)
      throw new HttpError(502, "Provider returned an invalid release list.");
    const matches = result.data.deployments.filter(
      (item) => item.meta?.levoksOperation === operationId,
    );
    if (matches.length > 1)
      throw new HttpError(
        409,
        "Provider returned multiple releases for this operation. Review the Vercel project.",
      );
    if (matches.length)
      return getVercelRelease(target, matches[0].uid, operationId);
    const next = result.data.pagination.next;
    if (next === null || (until !== undefined && next >= until)) break;
    until = next;
  }
  return null;
}
