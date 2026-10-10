import { z } from "zod";
import type { ElementNode } from "@/types";
import type { EndpointConfig, SchemaField } from "@/types/backend";
import { definitionFor } from "./elements/registry";
import { buttonHref } from "./elements/native";
import { fieldCondition } from "./form-conditions";
import { selectionLimits } from "./elements/selection-limits";
import { selectChoices } from "./elements/select-options";

const id = z
  .string()
  .min(1)
  .max(120)
  .regex(/^[a-zA-Z0-9_-]+$/);
export const requestMappingSchema = z.object({
  fieldId: id,
  location: z.enum(["body", "query", "path", "header"]),
  source: z.discriminatedUnion("kind", [
    z.object({ kind: z.literal("element"), elementId: id }),
    z.object({ kind: z.literal("response"), fieldId: id }),
    z.object({
      kind: z.literal("literal"),
      value: z.union([
        z.string().max(10000),
        z.number().finite(),
        z.boolean(),
        z.null(),
      ]),
    }),
  ]),
});
export const responseMappingSchema = z.object({ fieldId: id, elementId: id });
export const failureSchema = z.object({
  pageId: id.optional(),
  message: z.string().max(500).optional(),
});
export type RequestMapping = z.infer<typeof requestMappingSchema>;
export type ResponseMapping = z.infer<typeof responseMappingSchema>;
export type FailureBehavior = z.infer<typeof failureSchema>;
export type ResolvedRequestMapping = RequestMapping & {
  name: string;
  type: SchemaField["type"];
  required: boolean;
  responseName?: string;
};

/** Legacy fields acquire their original name as identity on first edit. */
export const fieldIdentity = (field: SchemaField) => field.id || field.name;
export function endpointFields(config: EndpointConfig) {
  return [
    ...config.requestBody.map((field) => ({
      ...field,
      location: "body" as const,
    })),
    ...(config.queryParameters || []).map((field) => ({
      ...field,
      location: "query" as const,
    })),
    ...(config.requestHeaders || []).map((field) => ({
      ...field,
      location: "header" as const,
    })),
    ...(
      config.pathParameters ||
      [...config.route.matchAll(/:([A-Za-z_][A-Za-z0-9_]*)/g)].map((match) => ({
        name: match[1],
        type: "string" as const,
        required: true,
      }))
    ).map((field) => ({ ...field, location: "path" as const })),
  ];
}
export function formOwner(element: ElementNode, elements: ElementNode[]) {
  const byId = new Map(elements.map((item) => [item.id, item]));
  let parent = element.parentId;
  const seen = new Set<string>();
  while (parent && !seen.has(parent)) {
    seen.add(parent);
    const node = byId.get(parent);
    if (!node) return;
    if (node.type === "form") return node;
    parent = node.parentId;
  }
}
export function isSubmitControl(element: ElementNode) {
  return (
    (element.type === "button" ||
      (element.type === "native" &&
        definitionFor(element)?.tag === "button")) &&
    !(element.type === "button" ? buttonHref(element) : element.props.href) &&
    (element.props.type ||
      (element.type === "button" ? "submit" : "button")) === "submit"
  );
}
export function isFormInput(element: ElementNode, parent?: ElementNode) {
  if (parent?.definitionId === "checkboxGroup") return false;
  return (
    element.definitionId === "checkboxGroup" ||
    element.type === "input" ||
    (element.type === "native" &&
      ["input", "textarea", "select"].includes(
        definitionFor(element)?.tag || "",
      ))
  );
}

/** Native multiple selections require an array in the JSON request body. */
export function compatibleFormField(
  element: ElementNode,
  field: { type: SchemaField["type"]; location: RequestMapping["location"] },
) {
  if (String(element.props.inputType || element.props.type) === "file") return field.type === "object" && field.location === "body";
  const multiple =
    element.definitionId === "checkboxGroup" ||
    definitionFor(element)?.tag === "select" && Boolean(element.props.multiple);
  return (
    field.type !== "object" &&
    (multiple
      ? field.type === "array" && field.location === "body"
      : field.type !== "array")
  );
}

/** Resolve stable identities once, before either deterministic or AI generation. */
export function resolveContract(
  connection: import("@/types/routing").RoutingConnection,
  config: EndpointConfig,
  previous: EndpointConfig | undefined,
  elements: ElementNode[],
  triggerId: string,
  pages: import("@/types").Page[],
  diagnostics: import("@/types/ir").IRDiagnostic[],
): Pick<
  import("@/types/ir").ApiCallStep,
  "requestMappings" | "responseMappings" | "failure"
> {
  const error = (message: string) =>
    diagnostics.push({
      severity: "error",
      code: "INVALID_CONTRACT_MAPPING",
      nodeId: connection.id,
      message,
    });
  const fields = endpointFields(config);
  const nodes = Object.fromEntries(elements.map(node => [node.id, node]));
  if (
    !connection.requestMappings &&
    config.requestHeaders?.some((field) => field.required)
  )
    error("Required header fields need explicit request mappings in Routing.");
  const requestMappings: ResolvedRequestMapping[] = [];
  const seen = new Set<string>();
  for (const mapping of connection.requestMappings || []) {
    const field = fields.find(
      (field) =>
        field.location === mapping.location &&
        fieldIdentity(field) === mapping.fieldId,
    );
    const key = `${mapping.location}:${mapping.fieldId}`;
    if (mapping.location === "body" && config.method === "GET")
      error("GET endpoints use query or path mappings, not a request body.");
    if (!field) {
      error(`Request mapping references missing field ${key}.`);
      continue;
    }
    if (seen.has(key))
      error(`Request field ${field.name} is mapped more than once.`);
    seen.add(key);
    let responseName: string | undefined;
    const source = mapping.source;
    if (source.kind === "element") {
      const element = elements.find((el) => el.id === source.elementId);
      const condition = element && fieldCondition(element, nodes);
      if (condition) {
        if (field.required || mapping.location !== "body") error(`Conditional field ${field.name} must map to an optional request body field. Enforce Required in its active backend branch.`);
        const controllerMapping = connection.requestMappings?.find(item => item.source.kind === "element" && item.source.elementId === condition.sourceId && item.location === "body");
        const controllerField = controllerMapping && fields.find(item => item.location === "body" && fieldIdentity(item) === controllerMapping.fieldId);
        if (!controllerField || controllerField.type !== "boolean" || !controllerField.required) error(`Conditional field ${field.name} needs its controlling checkbox mapped to a required Boolean request body field.`);
      }
      if (element?.definitionId === "checkboxGroup") {
        const min = Math.max(field.required ? 1 : 0, selectionLimits(element.props).min);
        if (min > 0 && (element.props.disabled || elements.filter(choice => choice.parentId === element.id && choice.definitionId === "checkbox" && !choice.props.disabled).length < min))
          error(`Field ${field.name} needs an enabled checkbox group with at least ${min} enabled choice${min === 1 ? "" : "s"}.`);
      }
      if (element && definitionFor(element)?.tag === "select" && element.props.multiple) {
        const min = Math.max(field.required ? 1 : 0, selectionLimits(element.props).min);
        if (min > 0 && (element.props.disabled || selectChoices(element.props).filter(choice => !choice.disabled && !choice.groupDisabled).length < min))
          error(`Field ${field.name} needs an enabled multiple select with at least ${min} enabled choice${min === 1 ? "" : "s"}.`);
      }
      if (element && !compatibleFormField(element, field))
        error(
          `Field ${field.name} requires compatible structured data; multiple selections map to an array in the request body.`,
        );
      if (
        !element ||
        !isFormInput(element, elements.find(node => node.id === element.parentId)) ||
        formOwner(element, elements)?.id !== triggerId
      )
        error(
          `Field ${field.name} must use an input owned by the submitting form.`,
        );
    } else if (source.kind === "response") {
      responseName = previous?.responseBody.find(
        (field) => fieldIdentity(field) === source.fieldId,
      )?.name;
      if (!responseName)
        error(
          `Field ${field.name} references a missing previous response field.`,
        );
    }
    requestMappings.push({
      ...mapping,
      name: field.name,
      type: field.type,
      required: field.required,
      ...(responseName ? { responseName } : {}),
    });
  }
  if (connection.requestMappings) {
    for (const field of fields)
      if (
        field.required &&
        !seen.has(`${field.location}:${fieldIdentity(field)}`)
      )
        error(`Required ${field.location} field ${field.name} has no mapping.`);
  }
  const responseMappings: { name: string; elementId: string }[] = [];
  for (const mapping of connection.responseMappings || []) {
    const field = config.responseBody.find(
      (field) => fieldIdentity(field) === mapping.fieldId,
    );
    const element = elements.find((el) => el.id === mapping.elementId);
    if (
      !field ||
      !element ||
      !["text", "title", "paragraph"].includes(element.type)
    ) {
      error(
        "Response mappings require an existing response field and a text element on the triggering page.",
      );
      continue;
    }
    responseMappings.push({ name: field.name, elementId: element.id });
  }
  const failurePage = pages.find(
    (page) => page.id === connection.failure?.pageId,
  );
  if (connection.failure?.pageId && !failurePage)
    error("Failure navigation references a missing page.");
  return {
    ...(connection.requestMappings ? { requestMappings } : {}),
    ...(connection.responseMappings ? { responseMappings } : {}),
    ...(connection.failure
      ? {
          failure: {
            ...connection.failure,
            ...(failurePage ? { pageRoute: failurePage.route } : {}),
          },
        }
      : {}),
  };
}
