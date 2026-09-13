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

    return allFiles;
}
