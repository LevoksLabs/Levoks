import type { ServiceContainer, AuthConfig } from "@/types/backend";
import { serviceSlug } from "@/lib/project/schema";
import { defaultDatabase } from "@/lib/backend/database";
import { healthConfiguration } from "./health";
import { databaseCompose } from "./database";
import { DEPLOY_SCRIPT } from "./deployment-runtime";

/** Container orchestration remains separate from the authored application graph. */
export function deploymentFiles(
  services: ServiceContainer[],
  source: Record<string, string>,
) {
  const files: Record<string, string> = {};
  const requirements: { path: string; keys: string[]; profile?: string }[] = [];
  const blockers: string[] = [];
  const root: Record<string, string> = {
    COMPOSE_PROJECT_NAME: "",
    APP_ORIGIN: "",
    FRONTEND_PORT: "3000",
  };
  const runtime: Parameters<typeof databaseCompose>[2] = { runtime: {} };
  const examples = (
    path: string,
    values: Record<string, string>,
    profile?: string,
    required = Object.keys(values),
  ) => {
    files[`${path}.example`] =
      "# Literal KEY=value lines. No surrounding quotes or variable expansion.\n" +
      Object.entries(values)
        .map(([key, value]) => `${key}=${value}`)
        .join("\n") +
      "\n";
    requirements.push({
      path,
      keys: required,
      ...(profile ? { profile } : {}),
    });
    return path;
  };
  for (const service of services) {
    const slug = serviceSlug(service.name);
    const db = service.database || defaultDatabase();
    if (db.location === "local" && db.tls && db.engine !== "sqlite")
      blockers.push(
        `${service.name}: local database containers do not configure TLS. Select a remote TLS database or disable Require TLS for this local database.`,
      );
    if (db.location === "remote")
      root[`${slug.replaceAll("-", "_").toUpperCase()}_${db.connectionEnv}`] =
        "";
    else if (!["mongodb", "sqlite"].includes(db.engine))
      root[`${slug.replaceAll("-", "_").toUpperCase()}_DB_PASSWORD`] = "";
    const base = `deployment/${slug}`;
    const original = Object.fromEntries(
      (source[`backend/${slug}/.env.example`] || "")
        .split(/\r?\n/)
        .filter((line) => /^[A-Z][A-Z0-9_]*=/.test(line))
        .map((line) => {
          const i = line.indexOf("=");
          return [line.slice(0, i), line.slice(i + 1)];
        }),
    );
    const jwt = Object.hasOwn(original, "JWT_SECRET");
    if (jwt) root.JWT_SECRET = "";
    const controlled = new Set([
      db.connectionEnv,
      "PORT",
      "NODE_ENV",
      "JWT_SECRET",
      "CORS_ORIGINS",
      "AUTH_IDENTITY_ORIGIN",
      "RESEND_API_KEY",
    ]);
    const identityKeys = [
      "IDENTITY_PUBLIC_URL",
      "IDENTITY_EMAIL_FROM",
      "IDENTITY_EMAIL_KEYS",
      "IDENTITY_EMAIL_ACTIVE_KEY",
    ];
    const hasEmail = Boolean(
      JSON.parse(source[`backend/${slug}/package.json`]).scripts[
        "worker:email"
      ],
    );
    const apiValues = Object.fromEntries(
      Object.entries(original).filter(
        ([key]) =>
          !controlled.has(key) &&
          !/^HEALTH_ORIGIN_/.test(key) &&
          !(hasEmail && identityKeys.includes(key)),
      ),
    );
    // Empty setup codes and other optional settings remain optional; declared
    // secret variables and HTTP destinations must be configured before startup.
    const required = service.blocks.flatMap((block) =>
      block.type === "env_var" &&
      "isSecret" in block.config &&
      block.config.isSecret
        ? [block.config.key]
        : block.type === "http_request" && "originEnv" in block.config
          ? [block.config.originEnv, block.config.bearerTokenEnv].filter(
              Boolean,
            )
          : [],
    );
    const apiFiles = [
      examples(
        `${base}/api/.env`,
        apiValues,
        undefined,
        required.filter((key) => Object.hasOwn(apiValues, key)),
      ),
    ];
    const workers: NonNullable<typeof runtime>["runtime"][string]["workers"] =
      [];
    if (hasEmail) {
      const identity = examples(
        `${base}/identity/.env`,
        Object.fromEntries(identityKeys.map((key) => [key, ""])),
        "identity-email",
      );
      apiFiles.push(identity);
      workers.push({
        command: "worker:email",
        profile: "identity-email",
        files: [
          identity,
          examples(
            `${base}/identity-provider/.env`,
            { RESEND_API_KEY: "" },
            "identity-email",
          ),
        ],
      });
    }
    if (
      service.blocks.some((block) => block.type === "submission_notification")
    )
      workers.push({
        command: "worker:submissions",
        profile: "notifications",
        files: [
          examples(
            `${base}/notifications/.env`,
            {
              SUBMISSION_EMAIL_FROM: "",
              SUBMISSION_EMAIL_TO: "",
              SUBMISSION_PUBLIC_ORIGIN: "",
              RESEND_API_KEY: "",
            },
            "notifications",
          ),
        ],
      });
    runtime.runtime[slug] = { apiFiles, workers, jwt };
    if (workers.length)
      files[`backend/${slug}/workers/check.js`] =
        "try {const value = JSON.parse(require('node:fs').readFileSync(process.env.LEVOKS_WORKER_HEALTH_FILE, 'utf8')); process.kill(value.pid, 0); process.exitCode = Date.now() - value.at < 90000 && value.at <= Date.now() ? 0 : 1;} catch {process.exitCode = 1;}\n";
  }
  files["compose.yaml"] = databaseCompose(
    services,
    services.map((service) => {
      const auth = service.blocks.find((block) => block.type === "auth_block")
        ?.config as AuthConfig | undefined;
      const identity = services.find(
        (target) => target.id === auth?.identityServiceId,
      );
      return {
        name: service.name,
        port: service.port,
        identityOrigin: identity
          ? `http://${serviceSlug(identity.name)}:${identity.port}`
          : undefined,
        healthOrigins: Object.fromEntries(
          healthConfiguration(service).serviceIds.flatMap((id) => {
            const target = services.find((value) => value.id === id);
            return target
              ? [
                  [
                    `HEALTH_ORIGIN_${target.port}`,
                    `http://${serviceSlug(target.name)}:${target.port}`,
                  ],
                ]
              : [];
          }),
        ),
      };
    }),
    runtime,
  );
  files[".env.example"] =
    "# Compose interpolation: URL-encode database credentials; quote values containing #.\n" +
    Object.entries(root)
      .map(([key, value]) => `${key}=${value}`)
      .join("\n") +
    "\n";
  files["deployment/manifest.json"] = JSON.stringify(
    {
      version: 1,
      requirements,
      rootKeys: Object.keys(root),
      blockers,
      profiles: [
        "https",
        ...new Set(
          Object.values(runtime.runtime).flatMap((value) =>
            value.workers.map((worker) => worker.profile),
          ),
        ),
      ],
    },
    null,
    2,
  );
  files["deploy.mjs"] = DEPLOY_SCRIPT;
  files["deployment/Caddyfile"] = `{
  admin off
}
https://{$LEVOKS_DOMAIN:unconfigured.invalid} {
  reverse_proxy {$LEVOKS_FRONTEND}
}
http://:8080 {
  respond /health "ready" 200
}
`;
  files["frontend/app/%5F%5Flevoks/health/route.js"] =
    deploymentHealthSource(services);
  files["frontend/healthcheck.cjs"] =
    "fetch('http://127.0.0.1:3000/__levoks/health', {signal: AbortSignal.timeout(8000)}).then(async response => {await response.body?.cancel(); process.exitCode = response.ok ? 0 : 1;}).catch(() => {process.exitCode = 1;});\n";
  files["frontend/Dockerfile"] = source["frontend/Dockerfile"].replace(
    "USER node",
    "COPY --from=build --chown=node:node /app/healthcheck.cjs ./healthcheck.cjs\nUSER node",
  );
  files["DEPLOYMENT.md"] = DEPLOYMENT_GUIDE;
  return files;
}

export function deploymentHealthSource(services: ServiceContainer[]) {
  return `export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
const ports = ${JSON.stringify(services.map((service) => service.port))};
export async function GET() {
  const checks = await Promise.all(ports.map(async port => {
    try {
      const base = new URL(process.env['API_ORIGIN_' + port]);
      if (!['http:', 'https:'].includes(base.protocol) || base.username || base.password || base.pathname !== '/' || base.search || base.hash) return false;
      const response = await fetch(new URL('/health', base), {redirect: 'error', cache: 'no-store', signal: AbortSignal.timeout(5000)});
      await response.body?.cancel(); return response.ok;
    } catch {return false;}
  }));
  const ready = checks.every(Boolean);
  return Response.json({status: ready ? 'ready' : 'unavailable'}, {status: ready ? 200 : 503, headers: {'Cache-Control': 'no-store'}});
}
`;
}

const DEPLOYMENT_GUIDE = `# Full-stack container release

This release runs on one existing Docker server. Node.js 22+ and Docker Compose 2.30+ are required. The optional --https profile uses Caddy to route your public domain, obtain certificates and renew them. It does not create a cloud account, server or DNS record. The frontend binds only to 127.0.0.1; use --https or put your existing HTTPS reverse proxy in front of its port. Backend and database ports are private to the Compose network.

1. Copy the root .env.example to .env. Choose a stable COMPOSE_PROJECT_NAME (lowercase letters, digits and hyphens), the public HTTPS APP_ORIGIN and a free FRONTEND_PORT. Use the same project name and settings on subsequent releases to retain database volumes. For local evaluation, http://localhost:<port> is supported.
2. Fill the database settings and, when present, JWT_SECRET (at least 32 random characters). SQL database passwords must be URL-safe. Remote databases must already exist; their credentials go into the root .env. Keep the source release and runtime secrets private.
3. Copy each deployment/<service>/api/.env.example to .env in that directory and configure its declared secrets and HTTP integrations. Files under deployment/ use literal KEY=value lines: dollar signs and JSON keyrings are preserved. Do not add outer quotes. These files are runtime-only and excluded from image builds and Git.
4. Optional email workers: copy the identity and identity-provider examples and enable --identity-email; copy notification examples and enable --notifications. Identity keyrings are shared with the matching API through one runtime file. Provider keys are passed only to their worker. Use verified senders and the public HTTPS frontend URLs. Runtime provider delivery still requires acceptance testing.
5. Run node deploy.mjs check with the same optional profile flags you intend to deploy. It checks required settings without printing values, verifies Compose version and runs compose config --quiet. Then run node deploy.mjs up with those flags. Images build, databases become healthy, SQL initialization completes successfully, APIs become healthy, and the frontend must reach every backend readiness route. Selected workers must publish fresh process heartbeats. Startup has a 180-second health timeout after image builds. A failure is reported with a nonzero exit code; it does not delete storage or claim a successful release.

For built-in HTTPS, set APP_ORIGIN to https://your-public-domain with no custom port. Point that domain's A/AAAA records to this server, open inbound TCP ports 80 and 443 (UDP 443 enables HTTP/3), and ensure no other service owns those ports. Use node deploy.mjs check --https, then node deploy.mjs up --https. The domain is derived from APP_ORIGIN; inherited LEVOKS_DOMAIN values cannot override it. Caddy routes to the private frontend and persists certificate state in named volumes. Keep those volumes when restarting or updating. One explicit domain is supported; wildcard DNS challenges and DNS provider credentials are not configured.

After startup, --https performs a public check with normal certificate validation and a 90-second allowance for initial issuance. It checks HTTP-to-HTTPS redirection and the frontend readiness JSON over HTTPS. Failure exits nonzero and leaves containers and storage available for diagnosis. Run node deploy.mjs verify from another machine with Node.js, deploy.mjs and a root .env containing only APP_ORIGIN to repeat this read-only public check without Docker or private deployment credentials. A server-side check cannot prove external firewall accessibility; repeat it off the server before release. It proves current public readiness, not which source revision is serving or all application behavior. Verification refuses NODE_TLS_REJECT_UNAUTHORIZED=0.

The initializer creates missing SQL tables and validates the saved schema fingerprint; it does not migrate existing application data or schemas. Back up storage and review schema changes before releasing. SQLite has a writable named volume and supports one API replica. Local MongoDB is private, without authentication/TLS, and uses a single-member replica set where needed. Use a managed remote database for stronger isolation, redundancy and independent administration. Private CA files require a reviewed Compose mount override.

Run node deploy.mjs status to view only container state and health, never runtime environment values or provider messages. A health gate proves process/database readiness, not all product behavior. Email heartbeat proves a running loop, not delivery. Run application acceptance checks and disposable provider tests before promoting a release. Restarting APIs can interrupt traffic; this release does not promise zero downtime. Archive source separately. Automatic rollback, managed DNS, scaling, resource controls and backup restoration remain future deployment increments. Never use compose down --volumes on retained application storage.

Profile flags select optional services to start. Omitting a previously enabled profile does not stop its running service. Stop that service explicitly through Compose before disabling it; use its service name from compose.yaml. Existing services and retained database volumes are not deleted by the release command.
`;
