// ═══════════════════════════════════════════════════
// Code Generation — Orchestrator
// ═══════════════════════════════════════════════════
//
// Pipeline: Semantic backend state → lowerBackend() → validateBackendIR() → codegen
//

import type { BackendIR } from "@/lib/backend/ir";
import { validateBackendIR } from "@/lib/backend/validate";
import { serviceSlug } from "@/lib/project/schema";
import type { AuthConfig } from "@/types/backend";
import { generateServiceCode } from "./express";
import { healthConfiguration } from "./health";
import { DOCKER_COMPOSE_TEMPLATE, README_TEMPLATE } from "./templates";
import { databaseCompose } from "./database";
import { defaultDatabase } from "@/lib/backend/database";

/**
 * Generate all code files for the entire backend project.
 * Returns a flat file map: { "path/to/file.js": "content" }
 *
 * @param ir — versioned backend semantics, independent of the editor canvas
 */
export function generateProject(
    ir: BackendIR
): Record<string, string> {
    const diagnostics = validateBackendIR(ir);
    if (diagnostics.some(d => d.severity === "error")) throw new Error(diagnostics.map(d => d.message).join("\n"));
    const { services } = ir;
    const allFiles: Record<string, string> = {"backend.ir.json": JSON.stringify(ir, null, 2)};

    // Generate code for each service
    for (const service of services) {
        const serviceFiles = generateServiceCode(service, services);
        Object.assign(allFiles, serviceFiles);
    }

    // Docker Compose (if multiple services)
    if (services.length > 0) {
        const infrastructure =
            services.map((s) => {
                const identityId = (s.blocks.find(b => b.type === "auth_block" && (b.config as AuthConfig).identityServiceId)?.config as AuthConfig | undefined)?.identityServiceId;
                const target = services.find(service => service.id === identityId);
                return {
                name: s.name,
                port: s.port,
                operatorSetup: s.blocks.some(b => b.type === "rest_endpoint" && b.config.route.endsWith("/operator-setup")),
                identityOrigin: target ? `http://${serviceSlug(target.name)}:${target.port}` : undefined,
                healthOrigins: Object.fromEntries(healthConfiguration(s).serviceIds.flatMap(id => {const target = services.find(v => v.id === id); return target ? [[`HEALTH_ORIGIN_${target.port}`, `http://${serviceSlug(target.name)}:${target.port}`]] : [];})),
            }; });
        allFiles["docker-compose.yml"] = services.some(s => s.database || s.blocks.some(b => b.type === "relation")) ? databaseCompose(services, infrastructure) : DOCKER_COMPOSE_TEMPLATE(infrastructure);
    }

    // README
    allFiles["README.md"] = README_TEMPLATE(
        "Backend Project",
        services.map((s) => ({
            name: s.name,
            port: s.port,
            description: s.description,
        }))
    );

    if (services.some(service => service.blocks.some(block => block.type === "middleware" && "middlewareType" in block.config && block.config.middlewareType === "rateLimit")))
        allFiles["README.md"] += `\n\n## Rate limits\n\nConfigured rate limits apply per client IP, or per verified user/tenant on authenticated selected endpoints. Backend scope installs an independent quota in every service. Selected endpoints attached to one block share its quota. Database counter storage uses the service MONGO_URI and initializes a TTL index in levoks_rate_limits before startup; replicas need the same service/block IDs, window and database. Database outages fail closed with HTTP 503. Memory counters reset on restart. All configured limits are additional to the built-in 120 requests/minute service ceiling. Health routes are not throttled.\n\nThe frontend gateway shares its backend-facing IP across visitors. Select signed-in-user quotas on authenticated endpoints for separate user/tenant limits; service-wide IP ceilings still apply. API-key strategies and trusted-proxy configuration require further implementation. Do not enable blanket proxy trust. Roll out consistent quota/window configuration across replicas.\n`;

    if (services.some(s => s.database)) {
        const composeEnvironment: Record<string, string> = {JWT_SECRET: "", CORS_ORIGINS: "http://localhost:3000"};
        for (const service of services) {
            const database = service.database || defaultDatabase();
            const prefix = serviceSlug(service.name).replaceAll("-", "_").toUpperCase();
            if (service.blocks.some(b => b.type === "rest_endpoint" && b.config.route.endsWith("/operator-setup"))) composeEnvironment[`${prefix}_OPERATOR_SETUP_TOKEN`] = "";
            if (database.location === "remote") composeEnvironment[`${prefix}_${database.connectionEnv}`] = "";
            else if (!["mongodb", "sqlite"].includes(database.engine)) composeEnvironment[`${prefix}_DB_PASSWORD`] = "";
        }
        allFiles[".env.example"] = Object.entries(composeEnvironment).map(([key, value]) => `${key}=${value}`).join("\n") + "\n";
        allFiles["README.md"] = allFiles["README.md"].replace('- MongoDB', '- The database engines selected per service (see storage below)');
        allFiles["README.md"] += '\n\n## Database storage\n\nEach service owns its selected database. See its .env.example and, for SQL, DATABASE.md. Local Compose databases use private networks and persistent named volumes; remote connections use environment variables and do not provision a local database. SQLite uses a persistent file volume.\n\nFor local SQL containers, set <SERVICE_SLUG>_DB_PASSWORD (uppercase, underscores) to a random URL-safe password, such as a 64-character hex secret, in the Compose .env. Remote connections use <SERVICE_SLUG>_<CONNECTION_ENV>. Do not commit credentials. For each SQL service, run `docker compose run --rm <service> npm run db:migrate` before `docker compose up -d`. SQLite also needs this initial setup. Migrations are explicit and never alter or adopt existing application tables automatically. Back up data before changing schema or engines. Local database containers do not configure TLS: disable Require TLS for those containers, or provide your own TLS-enabled server.\n';
    }
    if (services.some(s => s.blocks.some(b => b.type === "relation"))) allFiles["README.md"] += '\n\n## Relationships\n\nSee RELATIONS.md in each related service. Configure a MongoDB replica set or sharded cluster for transactions. Local Compose configures a single-member replica set on the existing named database volume and waits for a writable primary. Back up existing storage before enabling replica-set operation; this does not migrate or validate existing application references. Relationship indexes initialize before request handling; startup fails on conflicting existing unique values.\n';
    return allFiles;
}
