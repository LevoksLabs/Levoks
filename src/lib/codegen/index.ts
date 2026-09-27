// ═══════════════════════════════════════════════════
// Code Generation — Orchestrator
// ═══════════════════════════════════════════════════
//
// Pipeline:  Canvas State → resolveGraph() → validateIR() → codegen
//

import { ServiceContainer, ConnectionEdge } from "@/types/backend";
import { FlowGraph } from "@/types/ir";
import { serviceSlug } from "@/lib/project/schema";
import type { AuthConfig } from "@/types/backend";
import { generateServiceCode } from "./express";
import { healthConfiguration } from "./health";
import { DOCKER_COMPOSE_TEMPLATE, README_TEMPLATE } from "./templates";

/**
 * Generate all code files for the entire backend project.
 * Returns a flat file map: { "path/to/file.js": "content" }
 *
 * @param services       — backend service containers
 * @param connections    — backend inter-service connections (for docker-compose)
 * @param flowGraph      — optional IR for cross-referencing wired endpoints
 */
export function generateProject(
    services: ServiceContainer[],
    connections: ConnectionEdge[],
    flowGraph?: FlowGraph
): Record<string, string> {
    const allFiles: Record<string, string> = {};

    // Generate code for each service
    for (const service of services) {
        const serviceFiles = generateServiceCode(service, services);
        Object.assign(allFiles, serviceFiles);
    }

    // Docker Compose (if multiple services)
    if (services.length > 0) {
        allFiles["docker-compose.yml"] = DOCKER_COMPOSE_TEMPLATE(
            services.map((s) => {
                const identityId = (s.blocks.find(b => b.type === "auth_block" && (b.config as AuthConfig).identityServiceId)?.config as AuthConfig | undefined)?.identityServiceId;
                const target = services.find(service => service.id === identityId);
                return {
                name: s.name,
                port: s.port,
                identityOrigin: target ? `http://${serviceSlug(target.name)}:${target.port}` : undefined,
                healthOrigins: Object.fromEntries(healthConfiguration(s).serviceIds.flatMap(id => {const target = services.find(v => v.id === id); return target ? [[`HEALTH_ORIGIN_${target.port}`, `http://${serviceSlug(target.name)}:${target.port}`]] : [];})),
            }; })
        );
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

    return allFiles;
}
