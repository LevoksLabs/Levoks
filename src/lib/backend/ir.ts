import type { ProjectDocument } from "@/lib/project/schema";

/** Lower validated semantic state; arrays retain execution and route precedence. */
export function lowerBackend(backend: ProjectDocument["backend"]) {
  return {
    schemaVersion: 1 as const,
    generatorVersion: "backend-1" as const,
    target: "express-mongoose" as const,
    services: backend.services.map((service) => ({
      id: service.id,
      name: service.name,
      description: service.description,
      port: service.port,
      blocks: service.blocks.map((block) => {
        const { position: _position, ...semantic } = block;
        void _position;
        const normalized = structuredClone(semantic);
        if (normalized.type === "auth_block") normalized.config.secretKey = "";
        if (normalized.type === "env_var" && normalized.config.isSecret)
          normalized.config.value = "";
        return { ...normalized, definitionVersion: 1 as const };
      }),
    })),
    connections: structuredClone(backend.connections),
  };
}

export type BackendIR = ReturnType<typeof lowerBackend>;
