import type { ElementNode } from "@/types";
import type { ServiceContainer } from "@/types/backend";
import type { ProjectDocument } from "./project/schema";
import { fieldIdentity } from "./contracts";
import { serviceSlug } from "./project/schema";

type DataNode = Pick<
  ElementNode,
  | "id"
  | "type"
  | "definitionId"
  | "dataSource"
  | "dataField"
  | "parentId"
  | "label"
>;
type SemanticBackendService = ProjectDocument["backend"]["services"][number];
export const isDataContainer = (node: DataNode) =>
  node.type === "repeater" ||
  ["table", "collection"].includes(node.definitionId || "");
export const isDataText = (node: DataNode) =>
  ["text", "title", "paragraph"].includes(node.type);
export function dataOwner(node: DataNode, elements: Record<string, DataNode>) {
  const seen = new Set<string>();
  let parent = node.parentId;
  while (parent && !seen.has(parent)) {
    seen.add(parent);
    const ancestor = elements[parent];
    if (!ancestor) break;
    if (ancestor.dataSource) return ancestor;
    parent = ancestor.parentId;
  }
}

/** Only list shapes the compiler can prove; never create or relax backend policies. */
export function listEndpoint(
  services: ServiceContainer[],
  serviceId: string,
  endpointId: string,
) {
  const service = services.find((s) => s.id === serviceId) as
    SemanticBackendService | undefined;
  const endpoint = service?.blocks.find((b) => b.id === endpointId);
  if (
    !service ||
    endpoint?.type !== "rest_endpoint" ||
    endpoint.config.method !== "GET" ||
    /:/.test(endpoint.config.route)
  )
    throw new Error(
      "Choose a GET endpoint that returns a record list without path parameters.",
    );
  const config = endpoint.config;
  if (
    config.requestBody.length ||
    config.responseBody.length ||
    config.requestHeaders?.some((f) => f.required) ||
    config.queryParameters?.some(
      (f) => f.required || f.name !== "page" || f.type !== "number",
    )
  )
    throw new Error(
      "This list endpoint needs unsupported request parameters or response mappings. Use an optional numeric page and a direct record array.",
    );
  let modelId = config.modelId,
    size = 20,
    paginated = true;
  if (endpoint.connections.length) {
    const [query, response] = endpoint.connections.map((id) =>
      service.blocks.find((b) => b.id === id),
    );
    if (
      endpoint.connections.length !== 2 ||
      query?.type !== "query" ||
      query.config.operation !== "find" ||
      query.connections.length ||
      response?.type !== "response" ||
      response.connections.length ||
      response.config.status !== 200 ||
      response.config.value !== `$${query.config.output}`
    )
      throw new Error(
        "Bind a direct Find records query followed by its array response.",
      );
    modelId = query.config.modelId;
    size = query.config.limit;
    paginated = query.config.page === "$request.query.page";
  } else if (
    service.blocks.some((b) => b.type === "auth_block") &&
    service.blocks.some(
      (b) =>
        b.type === "db_model" &&
        b.config.fields.some((f) => f.name === "password"),
    )
  )
    throw new Error("Identity endpoints require a dedicated list query.");
  if (!Number.isInteger(size) || size < 1 || size > 100)
    throw new Error(
      "Live lists support at most 100 records per page. Reduce the query limit.",
    );
  const model = service.blocks.find(
    (b) => b.type === "db_model" && (!modelId || b.id === modelId),
  );
  if (model?.type !== "db_model")
    throw new Error("The list endpoint needs an existing database model.");
  const fields = model.config.fields.filter(
    (f) => !/password|secret|token/i.test(f.name),
  );
  const auth = service.blocks.find((b) => b.type === "auth_block");
  const identity = (
    auth?.type === "auth_block" && auth.config.identityServiceId
      ? services.find((s) => s.id === auth.config.identityServiceId)
      : service
  ) as SemanticBackendService | undefined;
  const account =
    identity?.blocks.some(
      (b) => b.type === "auth_block" && b.config.strategy === "jwt",
    ) &&
    identity.blocks.some(
      (b) =>
        b.type === "db_model" &&
        b.config.fields.some((f) => f.name === "password"),
    )
      ? `/__levoks/account/${serviceSlug(identity.name)}`
      : "";
  return {
    service,
    endpoint,
    fields,
    settings: {
      port: service.port,
      route: config.route,
      size,
      paginated,
      account,
    },
  };
}

export type ResolvedDataSource = ReturnType<typeof resolveDataSource>;
export function resolveDataSource(
  node: DataNode,
  services: ServiceContainer[],
) {
  if (!isDataContainer(node) || !node.dataSource)
    throw new Error(
      "Only tables, collections and repeaters support live record sources.",
    );
  const source = listEndpoint(
    services,
    node.dataSource.serviceId,
    node.dataSource.endpointId,
  );
  const columns = node.dataSource.columns.map((column) => {
    const field = source.fields.find(
      (f) => fieldIdentity(f) === column.fieldId,
    );
    if (!field)
      throw new Error(
        `Live data references a deleted or private field: ${column.fieldId}.`,
      );
    return { ...column, name: field.name };
  });
  if (
    new Set(columns.map((c) => c.fieldId)).size !== columns.length ||
    (node.definitionId === "table" && !columns.length)
  )
    throw new Error(
      "Choose distinct table columns, including at least one field.",
    );
  return {
    ...source.settings,
    columns,
    fields: Object.fromEntries(
      source.fields.map((f) => [fieldIdentity(f), f.name]),
    ),
    emptyMessage: node.dataSource.emptyMessage,
    label: node.label || "Records",
  };
}
