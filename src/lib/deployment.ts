import { z } from "zod";

export const deploymentProjectId = z.string().regex(/^[A-Za-z0-9_-]{1,120}$/);
export const publicOrigin = z.url().refine((value) => {
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
export const deploymentEnvironment = z.record(
  z.string().regex(/^(?:API_ORIGIN_\d+|APP_ORIGIN)$/),
  publicOrigin,
);
export const deploymentTarget = z.object({
  name: z.string().regex(/^[a-z0-9][a-z0-9-]{0,80}$/),
  providerProjectId: z.string().regex(/^prj_[A-Za-z0-9]+$/),
  teamId: z
    .string()
    .regex(/^team_[A-Za-z0-9]+$/)
    .optional(),
});
export type DeploymentTarget = z.infer<typeof deploymentTarget>;
export type ReleaseState =
  | "queued"
  | "submitting"
  | "tracking"
  | "ready"
  | "error"
  | "canceled"
  | "attention";
export interface ReleaseMetadata {
  operationId: string;
  sequence: number;
  state: ReleaseState;
  message: string;
  createdAt: string;
  updatedAt: string;
  digest: string;
  providerId?: string;
  url?: string;
  providerState?: string;
}
export interface DeploymentMetadata extends DeploymentTarget {
  version: number;
  sequence: number;
  environment: Record<string, string>;
  active: boolean;
  history: ReleaseMetadata[];
}

// Provider support is explicit: generated Express, databases and workers require
// a separate container host. A frontend build does not certify their readiness.
export const DEPLOYMENT_CAPABILITIES = {
  provider: "vercel",
  frontend: true,
  backend: false,
  database: false,
  workers: false,
  target: "preview",
} as const;
