import { z } from "zod";

const name = z
  .string()
  .regex(/^[A-Za-z_][A-Za-z0-9_]*$/)
  .max(100);
const ref = z.string().max(120);
const steps = z.array(ref).max(200);
// Values beginning with $ bind to a context path; all other values are literals.
export const binding = z.union([
  z
    .string()
    .max(10000)
    .refine(
      (value) =>
        !value.startsWith("$") ||
        value
          .slice(1)
          .split(".")
          .every(
            (part) =>
              /^[A-Za-z_][A-Za-z0-9_]*$/.test(part) &&
              !["__proto__", "constructor", "prototype"].includes(part),
          ),
      "Use a safe $context.path binding or a literal value",
    ),
  z.number().finite(),
  z.boolean(),
  z.null(),
]);
const mapping = z.record(name, binding);
export const aggregationSchema = z.object({
  groupBy: z.string().max(100).default(""),
  metrics: z
    .array(
      z.object({
        name: name.refine(
          (value) =>
            !["_id", "__proto__", "constructor", "prototype"].includes(value) &&
            !/password|secret|token/i.test(value),
        ),
        operation: z.enum(["count", "sum", "avg", "min", "max"]),
        field: z.string().max(100).default(""),
      }),
    )
    .min(1)
    .max(8)
    .refine(
      (metrics) =>
        new Set(metrics.map((metric) => metric.name)).size === metrics.length,
      "Metric names must be unique",
    ),
});
export type AggregationConfig = z.infer<typeof aggregationSchema>;
export const programConfigs = {
  http_request: z.object({
    originEnv: z.string().regex(/^[A-Z][A-Z0-9_]*$/),
    path: z.string().regex(/^\/(?!\/)[A-Za-z0-9/_:.-]*$/),
    method: z.enum(["GET", "POST", "PUT", "PATCH", "DELETE"]),
    query: mapping, body: mapping,
    bearerTokenEnv: z.string().regex(/^$|^[A-Z][A-Z0-9_]*$/),
    timeoutMs: z.number().int().min(100).max(10000),
    retries: z.number().int().min(0).max(2),
    output: name,
  }),
  cache: z.object({
    operation: z.enum(["get", "set", "delete"]),
    namespace: name, key: binding, value: binding,
    ttlSeconds: z.number().int().min(1).max(3600),
    output: name,
  }),
  credential_lookup: z.object({
    identityModelId: ref,
    email: binding,
    output: name,
  }),
  password_verify: z.object({ lookupId: ref, password: binding }),
  session_issue: z.object({ verificationId: ref, output: name }),
  query: z.object({
    modelId: ref,
    operation: z.enum([
      "find",
      "findOne",
      "create",
      "update",
      "delete",
      "restore",
      "purge",
      "count",
      "aggregate",
    ]),
    deleted: z.enum(["exclude", "include", "only"]).optional(),
    filter: mapping,
    values: mapping,
    sortField: z.string().max(100),
    sortDirection: z.enum(["asc", "desc"]),
    limit: z.number().int().min(1).max(100),
    page: binding.optional(),
    output: name,
    policyId: ref,
    aggregation: aggregationSchema.default({
      groupBy: "",
      metrics: [{ name: "count", operation: "count", field: "" }],
    }),
  }),
  transaction: z.object({ steps, output: name }),
  transform: z.object({ fields: mapping, output: name }),
  function: z.object({ steps, inputs: mapping, output: name, result: binding }),
  response: z.object({
    status: z.number().int().min(200).max(599),
    value: binding,
    headers: z.array(z.object({name: z.string().max(120), value: z.union([z.string().max(10000), z.number().finite(), z.boolean(), z.null()])})).max(32).optional(),
  }),
  role: z.object({ name, permissions: z.array(z.string().max(100)).max(100) }),
  permission: z.object({ resource: name, action: name }),
  access_policy: z.object({
    roles: z.array(name).max(50),
    permissions: z.array(z.string().max(100)).max(100),
    ownerField: z.string().max(100),
    tenantField: z.string().max(100),
  }),
};
export type ProgramBlockType = keyof typeof programConfigs;
export type ProgramConfig = z.infer<(typeof programConfigs)[ProgramBlockType]>;
export const PROGRAM_DEFAULTS: Record<ProgramBlockType, ProgramConfig> = {
  http_request: {originEnv: "UPSTREAM_ORIGIN", path: "/", method: "GET", query: {}, body: {}, bearerTokenEnv: "", timeoutMs: 5000, retries: 0, output: "result"},
  cache: {operation: "get", namespace: "default", key: "$request.query.key", value: "$result", ttlSeconds: 60, output: "cached"},
  credential_lookup: {
    identityModelId: "",
    email: "$request.body.email",
    output: "account",
  },
  password_verify: { lookupId: "", password: "$request.body.password" },
  session_issue: { verificationId: "", output: "result" },
  query: {
    modelId: "",
    operation: "find",
    filter: {},
    values: {},
    sortField: "",
    sortDirection: "asc",
    limit: 20,
    output: "result",
    policyId: "",
    aggregation: {
      groupBy: "",
      metrics: [{ name: "count", operation: "count", field: "" }],
    },
  },
  transaction: { steps: [], output: "transactionResult" },
  transform: { fields: {}, output: "result" },
  function: { steps: [], inputs: {}, output: "result", result: "$result" },
  response: { status: 200, value: "$result" },
  role: { name: "user", permissions: [] },
  permission: { resource: "product", action: "read" },
  access_policy: {
    roles: [],
    permissions: [],
    ownerField: "ownerId",
    tenantField: "",
  },
};
export const controlSchema = z.object({
  left: binding.default("$request.body.value"),
  operator: z
    .enum(["eq", "ne", "gt", "gte", "lt", "lte", "exists"])
    .default("exists"),
  right: binding.default(null),
  thenSteps: steps.default([]),
  elseSteps: steps.default([]),
  steps: steps.default([]),
  catchSteps: steps.default([]),
  finallySteps: steps.default([]),
  source: binding.default("$request.body.items"),
  maxIterations: z.number().int().min(1).max(1000).default(100),
});
export type ControlConfig = z.input<typeof controlSchema>;
