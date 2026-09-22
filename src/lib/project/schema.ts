import { z } from "zod";
import { validateFiles } from "@/lib/codegen/files";
import { programConfigs, controlSchema } from "@/lib/backend/program-schema";
import { healthSchema } from "@/lib/backend/health-schema";
import { errorHandlerSchema, auditLogSchema } from "@/lib/backend/observability-schema";

const id = z
  .string()
  .min(1)
  .max(120)
  .regex(/^[a-zA-Z0-9_-]+$/);
const text = z.string().max(100_000);
const finite = z.number().finite();
const fields = z
  .array(
    z.object({
      name: id,
      type: z.enum([
        "string",
        "number",
        "boolean",
        "date",
        "object",
        "array",
        "objectId",
      ]),
      required: z.boolean(),
      defaultValue: text.optional(),
      ref: id.optional(),
      unique: z.boolean().optional(),
      indexed: z.boolean().optional(),
    }),
  )
  .max(200);
const endpoint = z.object({
  route: z.string().regex(/^\/[a-zA-Z0-9/_:.-]*$/),
  method: z.enum(["GET", "POST", "PUT", "PATCH", "DELETE"]),
  description: text,
  requestBody: fields,
  responseBody: fields,
  middlewareIds: z.array(id),
  authRequired: z.boolean(),
  modelId: id.optional(),
  policyIds: z.array(id).optional(),
});
const configs = {
  rest_endpoint: endpoint,
  db_model: z.object({
    tableName: z.string().regex(/^[A-Z][a-zA-Z0-9]*$/),
    fields,
    timestamps: z.boolean(),
    softDelete: z.boolean(),
  }),
  middleware: z.object({
    middlewareType: z.enum([
      "cors",
      "rateLimit",
      "logger",
      "bodyParser",
      "helmet",
      "custom",
    ]),
    corsOrigins: text.optional(),
    rateLimit: finite.positive().optional(),
    rateLimitWindow: finite.positive().optional(),
    customCode: text.optional(),
  }),
  auth_block: z.object({
    requireVerifiedEmail: z.boolean().optional(),
    identityServiceId: id.optional(),
    refreshDays: z.number().int().min(1).max(30).optional(),
    idleMinutes: z.number().int().min(5).max(1440).optional(),
    strategy: z.enum(["jwt", "oauth", "session", "apiKey"]),
    secretKey: text,
    tokenExpiry: text,
    providers: z.array(text).optional(),
    hashRounds: finite.optional(),
  }),
  logic_if: z.object({
    condition: text,
    trueBranch: text,
    falseBranch: text,
    program: controlSchema.optional(),
  }),
  logic_loop: z.object({
    program: controlSchema.optional(),
    loopType: z.enum(["for", "forEach", "while"]),
    iteratorName: text,
    collection: text,
    body: text,
  }),
  logic_trycatch: z.object({
    program: controlSchema.optional(),
    tryBody: text,
    catchBody: text,
    finallyBody: text.optional(),
  }),
  validation: z.object({
    fieldName: id,
    rules: z
      .array(
        z.object({
          type: z.enum([
            "required",
            "minLength",
            "maxLength",
            "min",
            "max",
            "regex",
            "email",
            "custom",
          ]),
          value: z.union([text, finite]).optional(),
          message: text,
        }),
      )
      .max(100),
  }),
  relation: z.object({
    fromModel: text,
    toModel: text,
    relationType: z.enum(["one-to-one", "one-to-many", "many-to-many"]),
    foreignKey: text,
  }),
  env_var: z.object({
    key: z.string().regex(/^[A-Z_][A-Z0-9_]*$/),
    value: text,
    isSecret: z.boolean(),
    description: text,
  }),
};
const blockBase = z.object({
  id,
  label: text,
  position: z.object({ x: finite, y: finite, placed: z.boolean().optional() }),
  connections: z.array(id).max(1000),
});
const block = z.discriminatedUnion("type", [
  blockBase.extend({ type: z.literal("error_handler"), config: errorHandlerSchema }),
  blockBase.extend({ type: z.literal("audit_log"), config: auditLogSchema }),
  blockBase.extend({ type: z.literal("health_check"), config: healthSchema }),
  blockBase.extend({ type: z.literal("query"), config: programConfigs.query }),
  blockBase.extend({
    type: z.literal("transaction"),
    config: programConfigs.transaction,
  }),
  blockBase.extend({
    type: z.literal("transform"),
    config: programConfigs.transform,
  }),
  blockBase.extend({
    type: z.literal("function"),
    config: programConfigs.function,
  }),
  blockBase.extend({
    type: z.literal("response"),
    config: programConfigs.response,
  }),
  blockBase.extend({ type: z.literal("role"), config: programConfigs.role }),
  blockBase.extend({
    type: z.literal("permission"),
    config: programConfigs.permission,
  }),
  blockBase.extend({
    type: z.literal("access_policy"),
    config: programConfigs.access_policy,
  }),
  blockBase.extend({
    type: z.literal("rest_endpoint"),
    config: configs.rest_endpoint,
  }),
  blockBase.extend({ type: z.literal("db_model"), config: configs.db_model }),
  blockBase.extend({
    type: z.literal("middleware"),
    config: configs.middleware,
  }),
  blockBase.extend({
    type: z.literal("auth_block"),
    config: configs.auth_block,
  }),
  blockBase.extend({ type: z.literal("logic_if"), config: configs.logic_if }),
  blockBase.extend({
    type: z.literal("logic_loop"),
    config: configs.logic_loop,
  }),
  blockBase.extend({
    type: z.literal("logic_trycatch"),
    config: configs.logic_trycatch,
  }),
  blockBase.extend({
    type: z.literal("validation"),
    config: configs.validation,
  }),
  blockBase.extend({ type: z.literal("relation"), config: configs.relation }),
  blockBase.extend({ type: z.literal("env_var"), config: configs.env_var }),
]);

const responsiveLayout = z.object({ x: finite, y: finite, w: finite.nonnegative(), h: finite.nonnegative(), position: z.enum(["absolute", "relative", "static", "fixed", "sticky"]), opacity: finite.min(0).max(1), rotation: finite, visible: z.boolean(), locked: z.boolean() }).partial();
const responsiveOverride = z.object({ layout: responsiveLayout.optional(), styles: z.record(z.string(), z.union([text, finite])).optional() });
const vectorCoordinate = finite.min(-10000).max(10000);
export const elementSchema = z.object({
  responsive: z.object({ tablet: responsiveOverride.optional(), mobile: responsiveOverride.optional() }).optional(),
  vector: z.object({ points: z.array(z.object({ x: vectorCoordinate, y: vectorCoordinate, inX: vectorCoordinate.optional(), inY: vectorCoordinate.optional(), outX: vectorCoordinate.optional(), outY: vectorCoordinate.optional() }).refine(point => (point.inX === undefined) === (point.inY === undefined) && (point.outX === undefined) === (point.outY === undefined), "Curve handles require both coordinates")).min(2).max(500), closed: z.boolean(), stroke: text.regex(/^(none|#[0-9a-fA-F]{3,8})$/), strokeWidth: finite.min(0).max(100), fill: text.regex(/^(none|#[0-9a-fA-F]{3,8})$/) }).optional(),
  motion: z.object({ duration: finite.min(0.05).max(120), delay: finite.min(0).max(120), iterations: z.number().int().min(1).max(100), easing: z.enum(["linear", "ease-in", "ease-out", "ease-in-out"]), frames: z.array(z.object({ time: finite.min(0).max(1), x: vectorCoordinate, y: vectorCoordinate, scale: finite.min(0.01).max(20), rotation: finite.min(-3600).max(3600), opacity: finite.min(0).max(1) })).min(2).max(100).refine(frames => new Set(frames.map(f => f.time)).size === frames.length, "Keyframes must have unique times") }).optional(),
  component: z.object({ id, node: id, overrides: z.array(text).max(500) }).optional(),
  id,
  type: z.enum([
    "section",
    "container",
    "columns",
    "stack",
    "text",
    "title",
    "paragraph",
    "button",
    "image",
    "video",
    "gallery",
    "form",
    "input",
    "shape",
    "divider",
    "menu",
    "repeater",
    "frame",
    "icon",
    "spacer",
    "socialbar",
    "accordion",
    "tabs",
  ]),
  parentId: id.nullable(),
  label: text.optional(),
  props: z.record(
    z.string(),
    z.union([z.string().max(1_500_000), finite, z.boolean()]),
  ),
  styles: z.record(z.string(), z.union([text, finite])),
  layout: z.object({
    x: finite,
    y: finite,
    w: finite.nonnegative(),
    h: finite.nonnegative(),
    position: z.enum(["absolute", "relative", "static", "fixed", "sticky"]),
    opacity: finite.min(0).max(1),
    rotation: finite,
    visible: z.boolean(),
    locked: z.boolean(),
  }),
  children: z.array(id).max(5000),
  animation: z
    .object({
      type: text,
      trigger: z.enum([
        "onLoad",
        "onScroll",
        "onHover",
        "onClick",
        "continuous",
      ]),
      duration: finite.nonnegative(),
      delay: finite,
      easing: text,
      iterationCount: z.union([finite, z.literal("infinite")]),
      direction: z.enum([
        "normal",
        "reverse",
        "alternate",
        "alternate-reverse",
      ]),
      fillMode: z.enum(["none", "forwards", "backwards", "both"]),
      scrollOffset: finite.optional(),
      textSpeed: finite.optional(),
      textStagger: finite.optional(),
      translateDistance: finite.optional(),
      scaleFrom: finite.optional(),
      rotateAngle: finite.optional(),
      intensity: finite.optional(),
    })
    .optional(),
  actions: z
    .object({
      type: z.enum(["submit", "redirect", "api_call", "scroll", "none"]),
      target: text.optional(),
    })
    .optional(),
});

export const projectSchema = z.object({
  schemaVersion: z.literal(1),
  id,
  name: z.string().trim().min(1).max(100),
  updatedAt: z.string().datetime(),
  source: z
    .object({ basedOn: z.string(), files: z.record(z.string(), z.string()) })
    .optional(),
  editor: z.object({
    assets: z.record(id, z.object({ name: z.string().min(1).max(200), mime: z.enum(["image/png", "image/jpeg", "image/webp", "image/gif", "font/woff", "font/woff2"]), source: z.string().max(1_400_000).regex(/^data:(image\/(png|jpeg|webp|gif)|font\/woff2?);base64,[A-Za-z0-9+/]+={0,2}$/), width: finite.positive().max(100000).optional(), height: finite.positive().max(100000).optional() }).refine(asset => asset.source.startsWith(`data:${asset.mime};base64,`), "Asset type must match its data")).optional(),
    tokens: z.record(id, z.object({ name: z.string().min(1).max(100), value: z.string().min(1).max(200).regex(/^[^;{}<>]+$/).refine(value => !/url\s*\(|expression\s*\(/i.test(value), "Tokens cannot contain URLs or expressions"), kind: z.enum(["color", "dimension", "font"]) })).optional(),
    components: z.record(id, z.object({ name: z.string().min(1).max(100), rootId: id, nodes: z.record(id, elementSchema) })).optional(),
    elementsById: z.record(id, elementSchema),
    rootIds: z.array(id),
    globalRootIds: z.array(id),
    pages: z
      .array(
        z.object({
          id,
          title: z.string().min(1).max(200),
          route: z
            .string()
            .regex(/^\/(?:[a-zA-Z0-9_-]+(?:\/[a-zA-Z0-9_-]+)*)?$/),
        }),
      )
      .min(1)
      .max(100),
    activePageId: id,
    pageElementMap: z.record(id, z.array(id)),
    canvasSettings: z.object({
      backgroundColor: text,
      width: finite.min(1).max(20000),
      height: finite.min(1).max(100000),
    }),
  }),
  backend: z.object({
    services: z
      .array(
        z.object({
          id,
          name: z.string().min(1).max(100),
          description: text,
          port: z.number().int().min(1024).max(65535),
          color: text,
          blocks: z.array(block).max(1000),
          collapsed: z.boolean(),
          position: z.object({x:finite,y:finite}).optional(),
        }),
      )
      .max(100),
    connections: z.array(
      z.object({ id, fromServiceId: id, toServiceId: id, label: text }),
    ),
  }),
  routing: z.object({
    nodes: z
      .array(
        z.object({
          id,
          type: z.enum(["page", "service"]),
          refId: id,
          position: z.object({ x: finite, y: finite }),
          width: finite.positive(),
          height: finite.positive(),
        }),
      )
      .max(1000),
    connections: z
      .array(
        z.object({
          id,
          fromPortId: text,
          toPortId: text,
          fromNodeId: id,
          toNodeId: id,
          label: text.optional(),
          animated: z.boolean().optional(),
        }),
      )
      .max(5000),
  }),
});

export type ProjectDocument = z.infer<typeof projectSchema>;
export const MAX_PROJECT_BYTES = 5_000_000;

/** Validate untrusted imports/AI responses before they can touch the stores. */
export function parseProject(value: unknown): ProjectDocument {
  if (
    new TextEncoder().encode(JSON.stringify(value)).length > MAX_PROJECT_BYTES
  )
    throw new Error(
      "Project exceeds the 5 MB limit. Reduce embedded images or source size.",
    );
  const project = projectSchema.parse(value);
  const { editor, backend, routing } = project;
  if (project.source) validateFiles(project.source.files);
  const fail = (message: string): never => {
    throw new Error(message);
  };
  const unique = (ids: string[], label: string) => {
    if (new Set(ids).size !== ids.length) fail(`Duplicate ${label}.`);
  };
  for (const definition of Object.values(editor.components || {})) {
    const seen = new Set<string>();
    const walk = (key: string, parent: string | null, depth: number) => {
      const node = definition.nodes[key];
      if (!node || node.id !== key || node.parentId !== parent || seen.has(key) || depth > 100) fail("Invalid component tree.");
      seen.add(key); node.children.forEach(child => walk(child, key, depth + 1));
    };
    walk(definition.rootId, null, 0);
    if (seen.size !== Object.keys(definition.nodes).length || seen.size > 1000) fail("Invalid component size or detached nodes.");
  }
  for (const node of Object.values(editor.elementsById)) if (node.props.assetId && !editor.assets?.[String(node.props.assetId)]) fail("Unknown asset reference.");
  for (const node of Object.values(editor.elementsById)) if (node.component && !editor.components?.[node.component.id]?.nodes[node.component.node]) fail("Unknown component reference.");
  unique(
    editor.pages.map((p) => p.id),
    "page IDs",
  );
  unique(
    editor.pages.map((p) => p.route),
    "page routes",
  );
  if (!editor.pages.some((p) => p.id === editor.activePageId))
    fail("Active page does not exist.");
  if (!editor.pages.some((p) => p.route === "/"))
    fail("A home page with route / is required.");
  if (Object.keys(editor.elementsById).length > 5000)
    fail("Projects are limited to 5,000 elements.");
  const visited = new Set<string>();
  const visit = (elementId: string, parent: string | null, depth: number) => {
    if (depth > 100) fail("Element nesting exceeds 100 levels.");
    if (visited.has(elementId))
      fail("Element tree contains a cycle or a shared child.");
    visited.add(elementId);
    const el = editor.elementsById[elementId];
    if (!el || el.id !== elementId || el.parentId !== parent)
      fail(`Invalid element reference: ${elementId}.`);
    for (const child of el.children) visit(child, elementId, depth + 1);
  };
  for (const page of editor.pages) {
    const roots =
      page.id === editor.activePageId
        ? editor.rootIds
        : editor.pageElementMap[page.id] || [];
    editor.pageElementMap[page.id] = roots;
    for (const root of roots) visit(root, null, 0);
  }
  for (const root of editor.globalRootIds) visit(root, null, 0);
  if (visited.size !== Object.keys(editor.elementsById).length)
    fail("Project contains elements that belong to no page.");
  unique(
    backend.services.map((s) => s.id),
    "service IDs",
  );
  unique(
    backend.services.map((s) => String(s.port)),
    "service ports",
  );
  unique(
    backend.services.map((s) => serviceSlug(s.name)),
    "service names",
  );
  for (const service of backend.services) {
    unique(
      service.blocks.map((b) => b.id),
      "block IDs",
    );
    unique(
      service.blocks
        .filter((b) => b.type === "db_model")
        .map((b) => b.config.tableName),
      "model names",
    );
    unique(
      service.blocks
        .filter((b) => b.type === "rest_endpoint")
        .map((b) => `${b.config.method} ${b.config.route}`),
      "endpoints",
    );
    for (const block of service.blocks)
      for (const target of block.connections)
        if (!service.blocks.some((b) => b.id === target))
          fail("Backend block references a missing block.");
  }
  for (const edge of backend.connections)
    if (
      ![edge.fromServiceId, edge.toServiceId].every((id) =>
        backend.services.some((s) => s.id === id),
      )
    )
      fail("Backend connection references a missing service.");
  unique(
    routing.nodes.map((n) => n.id),
    "routing node IDs",
  );
  unique(
    routing.connections.map((c) => c.fromPortId),
    "connections from the same output port",
  );
  for (const node of routing.nodes)
    if (
      !(node.type === "page" ? editor.pages : backend.services).some(
        (item) => item.id === node.refId,
      )
    )
      fail("Routing node references a missing page or service.");
  for (const edge of routing.connections)
    if (
      ![edge.fromNodeId, edge.toNodeId].every((id) =>
        routing.nodes.some((n) => n.id === id),
      )
    )
      fail("Routing connection references a missing node.");
  for (const edge of routing.connections) {
    const from = routing.nodes.find((n) => n.id === edge.fromNodeId)!;
    const to = routing.nodes.find((n) => n.id === edge.toNodeId)!;
    if (
      !edge.fromPortId.startsWith(`${from.id}:out:`) ||
      !edge.toPortId.startsWith(`${to.id}:in:`)
    )
      fail("Connection port direction is invalid.");
    const sourceId = edge.fromPortId.slice(`${from.id}:out:`.length);
    const targetId = edge.toPortId.slice(`${to.id}:in:`.length);
    if (from.type === "page") {
      const allowed = new Set<string>();
      const collect = (id: string) => {
        allowed.add(id);
        editor.elementsById[id]?.children.forEach(collect);
      };
      [
        ...(editor.pageElementMap[from.refId] || []),
        ...editor.globalRootIds,
      ].forEach(collect);
      if (!allowed.has(sourceId))
        fail("Connection source does not belong to its page.");
    } else if (
      !backend.services
        .find((s) => s.id === from.refId)
        ?.blocks.some((b) => b.id === sourceId && b.type === "rest_endpoint")
    )
      fail("Connection source endpoint does not exist.");
    if (
      to.type === "page"
        ? targetId !== "page"
        : !backend.services
            .find((s) => s.id === to.refId)
            ?.blocks.some((b) => b.id === targetId)
    )
      fail("Connection target port does not exist.");
  }
  return project;
}

export function serviceSlug(name: string) {
  return (
    name
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-|-$/g, "") || "service"
  );
}

/** Remove declared credentials; arbitrary source/content is not secret-scanned. */
export function redactProject(project: ProjectDocument): ProjectDocument {
  const copy = structuredClone(project);
  for (const service of copy.backend.services)
    for (const block of service.blocks) {
      if (block.type === "env_var" && block.config.isSecret)
        block.config.value = "";
      if (block.type === "auth_block") block.config.secretKey = "";
    }
  return copy;
}

export function parseProjectJSON(raw: string) {
  if (new TextEncoder().encode(raw).length > MAX_PROJECT_BYTES)
    throw new Error("Project exceeds the 5 MB limit.");
  return parseProject(JSON.parse(raw));
}

export function designFingerprint(project: ProjectDocument): string {
  const safe = redactProject(project);
  const { activePageId, rootIds, ...editor } = safe.editor;
  editor.pageElementMap[activePageId] = rootIds;
  const stable = (value: unknown): unknown =>
    Array.isArray(value)
      ? value.map(stable)
      : value && typeof value === "object"
        ? Object.fromEntries(
            Object.entries(value)
              .sort(([a], [b]) => a.localeCompare(b))
              .map(([key, child]) => [key, stable(child)]),
          )
        : value;
  const input = JSON.stringify(stable([editor, safe.backend, safe.routing]));
  let hash = 2166136261;
  for (let index = 0; index < input.length; index++)
    hash = Math.imul(hash ^ input.charCodeAt(index), 16777619);
  return (hash >>> 0).toString(16) + "-" + input.length;
}
