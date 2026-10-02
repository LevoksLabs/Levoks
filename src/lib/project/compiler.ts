import type { ElementNode } from "@/types";
import { projectIR } from "./ir";
import { lowerBackend } from "@/lib/backend/ir";
import { validateBackendIR } from "@/lib/backend/validate";
import type { IRDiagnostic } from "@/types/ir";
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
  for (const flow of graph.flows) {
    const node = editor.elementsById[flow.trigger.elementId];
    const event = flow.trigger.event === "submit" ? "onSubmit" : "onClick";
    if (node?.events?.[event]) problem(node.id, `Choose either a Routing connection or an explicit ${event} action for this element.`);
  }
  const backendIR = lowerBackend(backend);
  diagnostics.push(...validateBackendIR(backendIR));
  for (const flow of graph.flows)
    for (const step of flow.steps)
      if (
        step.type === "api_call" &&
        /:[A-Za-z_]/.test(step.endpoint) &&
        flow.trigger.elementType !== "form" && !step.requestMappings
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
      editor.tokens,
      editor.assets,
      editor.customElements,
    );
    const folder = page.route === "/" ? "" : page.route.slice(1) + "/";
    const app = output.files["src/App.jsx"]
      .replaceAll('from "./custom/', 'from "@/components/custom/')
      .replace('import "./styles.css";', 'import "./page.css";')
      .replace(
        'import { apiFetch } from "./api.js";',
        'import { apiFetch } from "@/lib/api";',
      );
    files[`frontend/app/${folder}page.jsx`] = `"use client";\n${app}`;
    files[`frontend/app/${folder}page.css`] = output.files["src/styles.css"];
  }
  const customDependencies: Record<string, string> = {};
  for (const [id, definition] of Object.entries(editor.customElements || {})) {
    files[`frontend/components/custom/${id}.jsx`] = definition.source;
    for (const [name, version] of Object.entries(definition.dependencies)) {
      if (customDependencies[name] && customDependencies[name] !== version) problem(id, `Custom components require conflicting versions of ${name}.`);
      customDependencies[name] = version;
    }
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
        ...customDependencies,
        next: "16.3.5",
        react: "19.2.3",
        "react-dom": "19.2.3",
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
    "export default { output: 'standalone', outputFileTracingRoot: import.meta.dirname, turbopack: { root: import.meta.dirname } };\n";
  files["frontend/.env.example"] =
    "APP_ORIGIN=http://localhost:3000\n" +
    backend.services
      .map((s) => `API_ORIGIN_${s.port}=http://localhost:${s.port}`)
      .join("\n");
  files["frontend/lib/api.js"] = apiClientSource(backend.services);
  const buildOrigins =
    "# Set APP_ORIGIN and API_ORIGIN_<port> on the runtime container.";
  files["frontend/Dockerfile"] =
    `FROM node:22-alpine AS build\nWORKDIR /app\nCOPY package*.json ./\nRUN npm install --package-lock-only --ignore-scripts && npm ci\nCOPY . .\n${buildOrigins}\nRUN npm run build\nFROM node:22-alpine\nWORKDIR /app\nENV NODE_ENV=production HOSTNAME=0.0.0.0\nCOPY --from=build --chown=node:node /app/.next/standalone ./\nCOPY --from=build --chown=node:node /app/.next/static ./.next/static\nUSER node\nEXPOSE 3000\nCMD ["node", "server.js"]\n`;
  files["frontend/.dockerignore"] = "node_modules\n.next\n.env*\n.git\n";
  if (!diagnostics.some(diagnostic => diagnostic.severity === "error")) for (const [path, content] of Object.entries(
    generateProject(backendIR),
  ))
    files[`backend/${path}`] = content;
  files[".gitignore"] =
    "node_modules/\n.next/\n.env\n.env.*\n!.env.example\n*.pem\n*.key\n";
  files["levoks.project.json"] = JSON.stringify(project, null, 2);
  files["levoks.ir.json"] = JSON.stringify(
    projectIR(project, graph, backendIR),
    null,
    2,
  );
  files["IDENTITY.md"] =
    `# Generated accounts\n\nIdentity services expose /__levoks/account/<service-slug> on the frontend for registration, sign-in, verification, password recovery, session inventory and revocation. New Auth templates include these endpoints; older projects need the matching endpoint blocks.\n\nSet frontend APP_ORIGIN to its public HTTPS origin and API_ORIGIN_<port> to each backend origin at runtime. API routes are proxied through the same frontend origin with a declared-route allowlist and service-scoped HttpOnly cookies. Keep these values in the hosting environment.\n\nEach identity backend needs MONGO_URI, a random JWT_SECRET of at least 32 characters and exact frontend CORS_ORIGINS. Resource services must bind to the identity service in their Authentication inspector and configure AUTH_IDENTITY_ORIGIN to that service. Bare JWT verification does not revoke sessions.\n\nEmail verification/recovery requires IDENTITY_PUBLIC_URL (the full HTTPS account page URL), IDENTITY_EMAIL_FROM (verified sender), IDENTITY_EMAIL_KEYS (JSON keyring of base64 random 32-byte keys), and IDENTITY_EMAIL_ACTIVE_KEY. Run npm run worker:email separately with the same database and keyring plus RESEND_API_KEY. Keep the provider key on the worker. Enable the verified-email requirement in the Authentication inspector when required. Retain old encryption keys until pending mail has drained or expired. Never put keys in canvas state or generated source.\n\nThe worker uses encrypted durable delivery records, bounded retries, provider idempotency and expiring single-use links. Email provider setup and sender verification are external deployment actions. Supervise both processes, use HTTPS, persist and back up MongoDB, monitor worker failures, and verify real email delivery before release.\n`;
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
            projectIR(snapshot, graph, backendIR),
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
