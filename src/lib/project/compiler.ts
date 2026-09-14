import type { ElementNode } from "@/types";
import type { IRDiagnostic } from "@/types/ir";
import { programDiagnostics } from "@/lib/backend/program";
import { resolveGraph } from "@/lib/graphResolver";
import { validateIR } from "@/lib/irValidator";
import { generateFrontendProject } from "@/lib/codegen/frontend";
import { generateProject } from "@/lib/codegen";
import { gatewaySource, apiClientSource } from "@/lib/codegen/gateway";
import { accountPageSource, ACCOUNT_CSS } from "@/lib/codegen/account-page";
import { validateFiles } from "@/lib/codegen/files";
import {
  parseProject,
  redactProject,
  serviceSlug,
  designFingerprint,
  type ProjectDocument,
} from "./schema";

export function pageElements(
  project: ProjectDocument,
  pageId: string,
): ElementNode[] {
  const ids = [
    ...(project.editor.pageElementMap[pageId] || []),
    ...project.editor.globalRootIds,
  ];
  const result: ElementNode[] = [];
  const visit = (id: string) => {
    const el = project.editor.elementsById[id];
    if (el) {
      result.push(el as ElementNode);
      el.children.forEach(visit);
    }
  };
  ids.forEach(visit);
  return result;
}

export function compileProject(value: ProjectDocument) {
  const project = redactProject(parseProject(value));
  const { editor, backend, routing } = project;
  const elementsByPage = Object.fromEntries(
    editor.pages.map((p) => [p.id, pageElements(project, p.id)]),
  );
  const graph = resolveGraph({
    ...routing,
    pages: editor.pages,
    activePageId: editor.activePageId,
    activeElements: elementsByPage[editor.activePageId],
    elementsByPage,
    services: backend.services,
  });
  const diagnostics: IRDiagnostic[] = validateIR(graph);
  const problem = (nodeId: string, message: string) =>
    diagnostics.push({
      severity: "error",
      code: "UNSUPPORTED_CONFIGURATION",
      nodeId,
      message,
    });
  for (const element of Object.values(editor.elementsById)) {
    if (["gallery", "repeater", "tabs", "icon"].includes(element.type))
      diagnostics.push({
        severity: "warning",
        code: "WIDGET_REVIEW",
        nodeId: element.id,
        message: `${element.label || element.type}: verify widget content and behavior in source before publishing.`,
      });
  }
  for (const service of backend.services) {
    diagnostics.push(...programDiagnostics(service));
    const healthBlocks = service.blocks.filter(b => b.type === 'health_check');
    if (healthBlocks.length > 1) problem(service.id, 'Use one Health Check block per service.');
    const healthRoutes = new Set(['/health', '/health/live', '/health/ready', ...healthBlocks.map(b => b.config.type === undefined && 'route' in b.config ? b.config.route : '')]);
    for (const block of service.blocks) {
      if (block.type === 'rest_endpoint' && healthRoutes.has(block.config.route)) problem(block.id, 'This route is reserved for service health checks.');
      if (block.type === 'health_check') {
        if (block.config.route === '/health/live' || block.config.route.includes('//') || block.config.route.endsWith('/')) problem(block.id, 'Choose a readiness path distinct from /health/live, without empty segments or a trailing slash.');
        for (const id of block.config.serviceIds) if (id === service.id || !backend.services.some(s => s.id === id)) problem(block.id, 'Health dependencies must reference other existing services.');
        if (block.connections.length) problem(block.id, 'Health checks are service configuration, not workflow steps.');
      }
    }
    const identityModel = service.blocks.find(
      (b) =>
        b.type === "db_model" &&
        b.config.fields.some((f) => f.name === "password"),
    );
    const jwt = service.blocks.some(
      (b) => b.type === "auth_block" && b.config.strategy === "jwt",
    );
    if (service.port === 3000)
      problem(
        service.id,
        `${service.name}: port 3000 is reserved for the frontend.`,
      );
    for (const block of service.blocks) {
      if (
        jwt &&
        identityModel &&
        block.type === "rest_endpoint" &&
        block.connections.length
      )
        problem(
          block.id,
          "Identity endpoints use the validated identity lifecycle controller; workflow steps cannot bypass password hashing or session checks.",
        );
      if (
        jwt &&
        identityModel?.type === "db_model" &&
        ["email", "name", "password"].some(
          (name) =>
            identityModel.config.fields.find((f) => f.name === name)?.type !==
            "string",
        )
      )
        problem(
          identityModel.id,
          "Identity email, name and password must be string fields.",
        );
      if (block.type === "auth_block" && block.config.identityServiceId) {
        const target = backend.services.find(
          (s) => s.id === block.config.identityServiceId,
        );
        if (
          !target ||
          target.id === service.id ||
          !target.blocks.some(
            (b) =>
              b.type === "db_model" &&
              b.config.fields.some((f) => f.name === "password"),
          ) ||
          !target.blocks.some(
            (b) => b.type === "auth_block" && b.config.strategy === "jwt",
          ) ||
          !target.blocks.some(
            (b) =>
              b.type === "rest_endpoint" &&
              b.config.route.endsWith("/introspect") &&
              b.config.method === "POST",
          )
        )
          problem(
            block.id,
            "Select an identity service with a JWT User model and POST introspect endpoint.",
          );
        if (identityModel)
          problem(
            block.id,
            "Identity services validate their own sessions. Remote identity binding is for resource services.",
          );
      }
      if (
        ["logic_if", "logic_loop", "logic_trycatch", "relation"].includes(
          block.type,
        ) &&
        !("program" in block.config && block.config.program)
      )
        problem(
          block.id,
          `${block.label}: this block needs an execution compiler before it can be exported. It will not be silently omitted.`,
        );
      if (block.type === "auth_block" && block.config.strategy !== "jwt")
        problem(
          block.id,
          `${block.label}: only JWT verification is currently compiled.`,
        );
      if (
        block.type === "auth_block" &&
        !/^\d+(s|m|h|d)$/.test(block.config.tokenExpiry)
      )
        problem(
          block.id,
          `${block.label}: token expiry must use a duration such as 1h or 7d.`,
        );
      if (
        block.type === "db_model" &&
        block.config.softDelete &&
        service.blocks.some(
          (b) => b.type === "rest_endpoint" && !b.connections.length,
        )
      )
        problem(block.id, `${block.label}: soft deletion is not yet compiled.`);
      if (
        jwt &&
        identityModel &&
        block.type === "rest_endpoint" &&
        !/\/(register|login|profile|logout|refresh|sessions|revoke-session|logout-all|change-password|introspect|forgot-password|reset-password|request-verification|verify-email)$/.test(
          block.config.route,
        )
      )
        problem(
          block.id,
          `${block.label}: identity services expose register, login, profile, logout, refresh, sessions, revoke-session, logout-all and change-password. Put other resources in a separate service.`,
        );
      if (
        jwt &&
        identityModel &&
        identityModel.type === "db_model" &&
        !["email", "name", "password"].every((name) =>
          identityModel.config.fields.some((f) => f.name === name),
        )
      )
        problem(
          identityModel.id,
          "JWT identity models require email, name, and password fields.",
        );
      if (
        block.type === "rest_endpoint" &&
        !block.connections.length &&
        !block.config.modelId &&
        service.blocks.filter((b) => b.type === "db_model").length > 1
      )
        problem(
          block.id,
          `${block.label}: use one model per service until explicit model binding is available.`,
        );
      if (
        block.type === "rest_endpoint" &&
        /\/(login|register|signup|signin)\b/i.test(block.config.route) &&
        (!jwt ||
          !identityModel ||
          !/\/(login|register)$/.test(block.config.route))
      )
        problem(
          block.id,
          `${block.label}: use the JWT auth template's /login and /register endpoints with its User model.`,
        );
      if (
        jwt &&
        identityModel &&
        block.type === "rest_endpoint" &&
        block.config.method !==
          (/\/(profile|sessions)$/.test(block.config.route) ? "GET" : "POST")
      )
        problem(
          block.id,
          `${block.label}: identity endpoints use POST, except profile and sessions which use GET.`,
        );
      if (
        block.type === "middleware" &&
        block.config.middlewareType === "custom"
      )
        problem(
          block.id,
          `${block.label}: custom middleware requires manual source review.`,
        );
      if (
        block.type === "validation" &&
        block.config.rules.some(
          (r) => r.type === "custom" || r.type === "regex",
        )
      )
        problem(
          block.id,
          `${block.label}: custom and regular-expression validation need manual source review.`,
        );
    }
  }
  for (const flow of graph.flows)
    for (const step of flow.steps)
      if (
        step.type === "api_call" &&
        /:[A-Za-z_]/.test(step.endpoint) &&
        flow.trigger.elementType !== "form"
      )
        problem(
          step.blockId,
          "Endpoints with URL parameters require a form with named inputs matching those parameters (for example, id).",
        );
      else if (step.type === "auth" || step.type === "validate")
        problem(
          step.blockId,
          "Wire frontend interactions to REST endpoints. Attach authentication and validation within the backend service.",
        );
  const files: Record<string, string> = {};
  if (
    backend.services.length &&
    editor.pages.some((p) => p.route.startsWith("/__levoks"))
  )
    problem(
      project.id,
      "The /__levoks path is reserved for generated API and account routes. Choose another canvas page route.",
    );
  for (const page of editor.pages) {
    const elements = elementsByPage[page.id];
    const output = generateFrontendProject(
      elements,
      [],
      editor.canvasSettings,
      page,
      editor.pages,
      undefined,
      graph,
    );
    const folder = page.route === "/" ? "" : page.route.slice(1) + "/";
    const app = output.files["src/App.jsx"]
      .replace('import "./styles.css";', 'import "./page.css";')
      .replace(
        'import { apiFetch } from "./api.js";',
        'import { apiFetch } from "@/lib/api";',
      );
    files[`frontend/app/${folder}page.jsx`] = `"use client";\n${app}`;
    files[`frontend/app/${folder}page.css`] = output.files["src/styles.css"];
  }
  files["frontend/app/layout.jsx"] =
    `export const metadata = { title: ${JSON.stringify(project.name)}, description: "Created with Levoks" };\nexport default function Layout({ children }) { return <html lang="en"><body style={{margin: 0}}>{children}</body></html>; }`;
  // Next treats leading underscores as private folders; encode them in the filesystem route.
  if (backend.services.length)
    files["frontend/app/%5F%5Flevoks/api/[service]/[...path]/route.js"] =
      gatewaySource(backend.services);
  for (const service of backend.services) {
    if (
      !service.blocks.some(
        (b) => b.type === "auth_block" && b.config.strategy === "jwt",
      ) ||
      !service.blocks.some(
        (b) =>
          b.type === "db_model" &&
          b.config.fields.some((f) => f.name === "password"),
      )
    )
      continue;
    const folder = `frontend/app/%5F%5Flevoks/account/${serviceSlug(service.name)}`;
    files[`${folder}/page.jsx`] = accountPageSource(service);
    files[`${folder}/account.css`] = ACCOUNT_CSS;
  }
  files["frontend/package.json"] = JSON.stringify(
    {
      name: serviceSlug(project.name),
      private: true,
      scripts: { dev: "next dev", build: "next build", start: "next start" },
      dependencies: {
        next: "^16.2.10",
        react: "^19.2.3",
        "react-dom": "^19.2.3",
      },
      engines: { node: ">=22" },
    },
    null,
    2,
  );
  files["frontend/jsconfig.json"] = JSON.stringify(
    { compilerOptions: { baseUrl: ".", paths: { "@/*": ["./*"] } } },
    null,
    2,
  );
  files["frontend/next.config.mjs"] =
    "export default { output: 'standalone' };\n";
  files["frontend/.env.example"] =
    "APP_ORIGIN=http://localhost:3000\n" +
    backend.services
      .map(
        (s) =>
          `API_ORIGIN_${s.port}=http://localhost:${s.port}`,
      )
      .join("\n");
  files["frontend/lib/api.js"] = apiClientSource(backend.services);
  const buildOrigins = "# Set APP_ORIGIN and API_ORIGIN_<port> on the runtime container.";
  files["frontend/Dockerfile"] =
    `FROM node:22-alpine AS build\nWORKDIR /app\nCOPY package*.json ./\nRUN npm install --package-lock-only --ignore-scripts && npm ci\nCOPY . .\n${buildOrigins}\nRUN npm run build\nFROM node:22-alpine\nWORKDIR /app\nENV NODE_ENV=production HOSTNAME=0.0.0.0\nCOPY --from=build --chown=node:node /app/.next/standalone ./\nCOPY --from=build --chown=node:node /app/.next/static ./.next/static\nUSER node\nEXPOSE 3000\nCMD ["node", "server.js"]\n`;
  files["frontend/.dockerignore"] = "node_modules\n.next\n.env*\n.git\n";
  for (const [path, content] of Object.entries(
    generateProject(backend.services, backend.connections, graph),
  ))
    files[`backend/${path}`] = content;
  files[".gitignore"] =
    "node_modules/\n.next/\n.env\n.env.*\n!.env.example\n*.pem\n*.key\n";
  files["levoks.project.json"] = JSON.stringify(project, null, 2);
  files["levoks.ir.json"] = JSON.stringify(
    { schemaVersion: 1, project, graph },
    null,
    2,
  );
  files["IDENTITY.md"] = `# Generated accounts\n\nIdentity services expose /__levoks/account/<service-slug> on the frontend for registration, sign-in, verification, password recovery, session inventory and revocation. New Auth templates include these endpoints; older projects need the matching endpoint blocks.\n\nSet frontend APP_ORIGIN to its public HTTPS origin and API_ORIGIN_<port> to each backend origin at runtime. API routes are proxied through the same frontend origin with a declared-route allowlist and service-scoped HttpOnly cookies. Keep these values in the hosting environment.\n\nEach identity backend needs MONGO_URI, a random JWT_SECRET of at least 32 characters and exact frontend CORS_ORIGINS. Resource services must bind to the identity service in their Authentication inspector and configure AUTH_IDENTITY_ORIGIN to that service. Bare JWT verification does not revoke sessions.\n\nEmail verification/recovery requires IDENTITY_PUBLIC_URL (the full HTTPS account page URL), IDENTITY_EMAIL_FROM (verified sender), IDENTITY_EMAIL_KEYS (JSON keyring of base64 random 32-byte keys), and IDENTITY_EMAIL_ACTIVE_KEY. Run npm run worker:email separately with the same database and keyring plus RESEND_API_KEY. Keep the provider key on the worker. Enable the verified-email requirement in the Authentication inspector when required. Retain old encryption keys until pending mail has drained or expired. Never put keys in canvas state or generated source.\n\nThe worker uses encrypted durable delivery records, bounded retries, provider idempotency and expiring single-use links. Email provider setup and sender verification are external deployment actions. Supervise both processes, use HTTPS, persist and back up MongoDB, monitor worker failures, and verify real email delivery before release.\n`;
  files["README.md"] =
    `# ${project.name}\n\nGenerated by Levoks. Node.js 22+ required.\n\n## Frontend\n\nIn frontend/: npm install, copy .env.example to .env.local, then npm run dev. Production: npm run build && npm start.\n\n## Backend\n\nIn backend/: docker compose up --build. Configure JWT_SECRET and allowed CORS origins before exposing services. Each service also runs with npm install && npm start.\n\n## Deployment\n\nDeploy frontend/ as a Next.js project. Run Express services on a container host with MongoDB and configure server-only API_ORIGIN_<port> for each service origin and APP_ORIGIN for the frontend public origin at runtime. The generated gateway keeps browser requests on the frontend origin. See IDENTITY.md for account pages and the separately supervised email worker. Keep credentials in the hosting provider's secret store.\n\n## Source of truth\n\nlevoks.project.json restores the visual workspace. levoks.ir.json includes the resolved flows. Secret values are omitted. Review generated code and test application-specific authorization before release.\n`;
  if (project.source) {
    if (project.source.basedOn !== designFingerprint(project))
      problem(
        project.id,
        "The canvas changed after source editing. Regenerate source or reconcile your changes before exporting.",
      );
    else {
      const overrides = validateFiles(project.source.files);
      const snapshot = { ...project, source: undefined };
      return {
        files: validateFiles({
          ...overrides,
          "levoks.project.json": JSON.stringify(snapshot, null, 2),
          "levoks.ir.json": JSON.stringify(
            { schemaVersion: 1, project: snapshot, graph },
            null,
            2,
          ),
        }),
        graph,
        diagnostics,
        project,
      };
    }
  }
  return { files: validateFiles(files), graph, diagnostics, project };
}
