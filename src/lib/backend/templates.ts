import { backendDefaults } from "./registry";
import type {
  BackendBlock,
  BackendBlockType,
  BlockConfig,
} from "@/types/backend";

/** Templates expand to ordinary editable blocks; no template runtime exists. */
export function integrationBlocks(id: () => string): BackendBlock[] {
  const make = (
    type: BackendBlockType,
    label: string,
    config: Partial<BlockConfig> = {},
  ): BackendBlock => ({
    id: id(),
    type,
    label,
    config: { ...backendDefaults(type), ...config } as BlockConfig,
    connections: [],
    position: { x: 0, y: 0 },
  });
  const endpoint = make("rest_endpoint", "Read upstream", {
    method: "GET",
    route: "/api/integration",
    queryParameters: [{ id: id(), name: "q", type: "string", required: false }],
  });
  const request = make("http_request", "Fetch upstream JSON", {
    query: { q: "$request.query.q" },
  });
  const response = make("response", "Upstream response");
  const origin = make("env_var", "Upstream origin", {
    key: "UPSTREAM_ORIGIN",
    value: "",
    isSecret: false,
  });
  endpoint.connections = [request.id];
  request.connections = [response.id];
  return [endpoint, request, response, origin].map((block, index) => ({
    ...block,
    position: { x: 0, y: index * 130 },
  }));
}

export function catalogBlocks(id: () => string): BackendBlock[] {
  const blocks = integrationBlocks(id);
  const model: BackendBlock = {
    id: id(),
    type: "db_model",
    label: "Catalog item",
    config: {
      ...backendDefaults("db_model"),
      tableName: "CatalogItem",
      fields: [
        { id: id(), name: "title", type: "string", required: true },
        {
          id: id(),
          name: "category",
          type: "string",
          required: true,
          indexed: true,
        },
      ],
    } as BlockConfig,
    connections: [],
    position: { x: 300, y: 0 },
  };
  blocks[0].label = "Browse catalog";
  blocks[0].config = {
    ...backendDefaults("rest_endpoint"),
    method: "GET",
    route: "/api/catalog",
    queryParameters: [
      { id: id(), name: "category", type: "string", required: false },
      { id: id(), name: "page", type: "number", required: false },
    ],
  } as BlockConfig;
  blocks[1] = {
    ...blocks[1],
    type: "query",
    label: "Filter and paginate",
    config: {
      ...backendDefaults("query"),
      modelId: model.id,
      filter: { category: "$request.query.category" },
      page: "$request.query.page",
      sortField: "title",
    } as BlockConfig,
  };
  return [model, ...blocks.slice(0, 3)];
}
