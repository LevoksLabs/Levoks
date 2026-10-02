import { endpointFields, fieldIdentity } from "@/lib/contracts";
import { lowerBackend, type BackendIR } from "@/lib/backend/ir";
import type { ProjectDocument } from "./schema";
import type { FlowGraph } from "@/types/ir";
import { ELEMENT_REGISTRY } from "@/lib/elements/registry";
import { BACKEND_REGISTRY } from "@/lib/backend/registry";

export const GENERATOR_VERSION = "semantic-2";
/** Application IR is the validated project plus resolved routing and versioned semantics.
 * The project is already normalized: consumers never reconstruct it from the DOM.
 */
export function projectIR(project: ProjectDocument, graph: FlowGraph, backendIR: BackendIR = lowerBackend(project.backend)) {
  const definitions = Object.fromEntries(
    Object.values(project.editor.elementsById)
      .map((element) => {
        const id = element.definitionId || element.type;
        const definition = ELEMENT_REGISTRY[id];
        return [
          id,
          {
            version: element.definitionVersion || 1,
            semanticType: id,
            primitive: element.type,
            generate: definition?.generate || "custom-source",
            render: definition?.render || "isolated-export",
            status: definition?.status || "custom-source",
          },
        ];
      })
      .sort(([a], [b]) => String(a).localeCompare(String(b))),
  );
  const backendDefinitions = Object.fromEntries(
    project.backend.services
      .flatMap((service) =>
        service.blocks.map((block) => [
          block.type,
          {
            version: BACKEND_REGISTRY[block.type].version,
            generate: BACKEND_REGISTRY[block.type].generate,
          },
        ]),
      )
      .sort(([a], [b]) => String(a).localeCompare(String(b))),
  );
  return {
    schemaVersion: 1,
    generatorVersion: GENERATOR_VERSION,
    target: "next-react-express",
    definitions,
    backendDefinitions,
    contracts: project.backend.services.flatMap(service => service.blocks.filter(block => block.type === "rest_endpoint").map(block => {
      if (block.type !== "rest_endpoint") throw new Error("Expected endpoint");
      return {serviceId: service.id, endpointId: block.id, method: block.config.method, route: block.config.route,
        request: endpointFields(block.config).map(field => ({...field, id: fieldIdentity(field)})),
        response: block.config.responseBody.map(field => ({...field, id: fieldIdentity(field)}))};
    })),
    backend: backendIR,
    project,
    graph,
  };
}
