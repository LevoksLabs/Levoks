import { z } from "zod";

const name = z
  .string()
  .regex(/^[A-Za-z_][A-Za-z0-9_]*$/)
  .max(100);
const ref = z.string().max(120);
const steps = z.array(ref).max(200);
// Values beginning with $ bind to a context path; all other values are literals.
export const binding = z.union([
  z.string().max(10000),
  z.number().finite(),
  z.boolean(),
  z.null(),
]);
const mapping = z.record(name, binding);
export const programConfigs = {
  query: z.object({
    modelId: ref,
    operation: z.enum([
      "find",
      "findOne",
      "create",
      "update",
      "delete",
      "count",
    ]),
    filter: mapping,
    values: mapping,
    sortField: z.string().max(100),
    sortDirection: z.enum(["asc", "desc"]),
    limit: z.number().int().min(1).max(100),
    output: name,
    policyId: ref,
  }),
  transaction: z.object({ steps, output: name }),
  transform: z.object({ fields: mapping, output: name }),
  function: z.object({ steps, inputs: mapping, output: name, result: binding }),
  response: z.object({
    status: z.number().int().min(200).max(599),
    value: binding,
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
