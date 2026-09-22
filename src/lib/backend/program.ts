import type {
  BackendBlock,
  ServiceContainer,
  EndpointConfig,
  DbModelConfig,
} from "@/types/backend";
import type { IRDiagnostic } from "@/types/ir";
import { controlSchema, programConfigs } from "./program-schema";
import { PROGRAM_RUNTIME } from "@/lib/codegen/program-runtime";

export function programDiagnostics(service: ServiceContainer): IRDiagnostic[] {
  const diagnostics: IRDiagnostic[] = [];
  const byId = new Map(service.blocks.map((block) => [block.id, block]));
  const adjacency = new Map<string, string[]>();
  const fail = (block: BackendBlock, message: string) =>
    diagnostics.push({
      code: "BACKEND_PROGRAM",
      severity: "error",
      nodeId: block.id,
      message: `${block.label}: ${message}`,
    });
  const checkRef = (block: BackendBlock, id: string, type?: string) => {
    const target = byId.get(id);
    if (!target || (type && target.type !== type))
      fail(
        block,
        `Select an existing ${type || "executable block"} in this service.`,
      );
    return target;
  };
  for (const block of service.blocks) {
    let children = [...block.connections];
    try {
      if (block.type in programConfigs) {
        const schema =
          programConfigs[block.type as keyof typeof programConfigs];
        const c = schema.parse(block.config);
        if (
          "output" in c &&
          [
            "request",
            "principal",
            "input",
            "item",
            "error",
            "__proto__",
            "constructor",
            "prototype",
          ].includes(c.output)
        )
          fail(
            block,
            "Choose an output name that is not a reserved context name.",
          );
        if ("steps" in c) children.push(...c.steps);
        if ("modelId" in c) {
          const model = checkRef(block, c.modelId, "db_model");
          if (c.policyId) {
            const policy = checkRef(block, c.policyId, "access_policy");
            if (policy && model) {
              const p = programConfigs.access_policy.parse(policy.config);
              for (const field of [p.ownerField, p.tenantField].filter(Boolean))
                if (
                  field !== "_id" &&
                  !(model.config as DbModelConfig).fields.some(
                    (f) => f.name === field,
                  )
                )
                  fail(
                    block,
                    `Policy field ${field} must exist on the selected model.`,
                  );
            }
          }
          if (model && c.operation === "aggregate") {
            const fields = new Map(
              (model.config as DbModelConfig).fields.map((field) => [
                field.name,
                field.type,
              ]),
            );
            fields.set("_id", "objectId");
            const checkField = (field: string, numeric = false) => {
              const type = fields.get(field);
              if (
                !type ||
                /password|secret|token/i.test(field) ||
                ["object", "array"].includes(type) ||
                (numeric && type !== "number")
              )
                fail(
                  block,
                  `Aggregation field ${field || "(empty)"} must be a ${numeric ? "numeric" : "scalar"}, non-sensitive field on the query model.`,
                );
            };
            if (c.aggregation.groupBy) checkField(c.aggregation.groupBy);
            for (const metric of c.aggregation.metrics)
              if (metric.operation !== "count")
                checkField(
                  metric.field,
                  ["sum", "avg"].includes(metric.operation),
                );
            if (
              c.sortField &&
              c.sortField !== "_id" &&
              !c.aggregation.metrics.some(
                (metric) => metric.name === c.sortField,
              )
            )
              fail(
                block,
                "Sort aggregate results by _id or a configured metric name.",
              );
          }
          if (
            ["update", "delete"].includes(c.operation) &&
            !Object.keys(c.filter).length
          )
            fail(block, "An explicit filter is required for update/delete.");
        }
        if (block.type === "role") {
          const role = programConfigs.role.parse(c);
          const permissions = service.blocks
            .filter((b) => b.type === "permission")
            .map((b) => {
              const p = programConfigs.permission.parse(b.config);
              return `${p.resource}.${p.action}`;
            });
          for (const permission of role.permissions)
            if (!permissions.includes(permission))
              fail(block, `Permission ${permission} is not defined.`);
        }
      }
      if (block.type.startsWith("logic_")) {
        const config = block.config as { program?: unknown };
        if (config.program) {
          const c = controlSchema.parse(config.program);
          children.push(
            ...c.steps,
            ...c.thenSteps,
            ...c.elseSteps,
            ...c.catchSteps,
            ...c.finallySteps,
          );
        }
      }
      if (block.type === "rest_endpoint") {
        const c = block.config as EndpointConfig;
        if (c.modelId) checkRef(block, c.modelId, "db_model");
        for (const id of c.policyIds || [])
          checkRef(block, id, "access_policy");
        if (c.policyIds?.length && !block.connections.length)
          fail(
            block,
            "Attach an explicit query workflow so resource policies can scope database operations.",
          );
      }
      if (block.type === "access_policy") {
        const c = programConfigs.access_policy.parse(block.config);
        if (c.ownerField && c.ownerField === c.tenantField)
          fail(
            block,
            "Ownership and tenant isolation must use distinct model fields.",
          );
        for (const role of c.roles)
          if (
            !service.blocks.some(
              (b) =>
                b.type === "role" &&
                programConfigs.role.parse(b.config).name === role,
            )
          )
            fail(block, `Role ${role} is not defined.`);
      }
    } catch (error) {
      fail(
        block,
        error instanceof Error ? error.message : "Invalid configuration",
      );
    }
    children = [...new Set(children)];
    for (const id of children) {
      const target = checkRef(block, id);
      if (
        target &&
        [
          "rest_endpoint",
          "db_model",
          "role",
          "permission",
          "env_var",
          "health_check",
          "error_handler",
          "audit_log",
          "relation",
          "middleware",
          "auth_block",
        ].includes(target.type)
      )
        fail(
          block,
          `${target.label} is configuration, not an executable step.`,
        );
    }
    adjacency.set(block.id, children);
  }
  const visited = new Set<string>(),
    active = new Set<string>();
  const visit = (id: string) => {
    if (active.has(id)) {
      fail(
        byId.get(id)!,
        "Recursive execution is not allowed. Use a bounded Loop block.",
      );
      return;
    }
    if (visited.has(id)) return;
    active.add(id);
    for (const target of adjacency.get(id) || [])
      if (byId.has(target)) visit(target);
    active.delete(id);
    visited.add(id);
  };
  for (const id of byId.keys()) visit(id);
  // Endpoint policies apply to every reachable query, including nested functions,
  // branches and transactions. Validate their model bindings before delivery.
  for (const endpoint of service.blocks.filter(
    (block) => block.type === "rest_endpoint",
  )) {
    const policies = (endpoint.config as EndpointConfig).policyIds || [];
    const pending = [...endpoint.connections],
      checked = new Set<string>();
    while (pending.length) {
      const id = pending.pop()!;
      if (checked.has(id)) continue;
      checked.add(id);
      pending.push(...(adjacency.get(id) || []));
      const query = byId.get(id);
      if (!query || query.type !== "query") continue;
      const config = programConfigs.query.safeParse(query.config);
      if (!config.success) continue;
      const model = byId.get(config.data.modelId);
      if (!model || model.type !== "db_model") continue;
      const fields = new Set([
        "_id",
        ...(model.config as DbModelConfig).fields.map((field) => field.name),
      ]);
      const scopes = new Map<string, string>();
      for (const policyId of new Set(
        [...policies, config.data.policyId].filter(Boolean),
      )) {
        const target = byId.get(policyId);
        const policy =
          target?.type === "access_policy" &&
          programConfigs.access_policy.safeParse(target.config);
        if (!policy || !policy.success) continue;
        for (const [kind, field] of [
          ["owner", policy.data.ownerField],
          ["tenant", policy.data.tenantField],
        ]) {
          if (!field) continue;
          if (!fields.has(field))
            fail(
              query,
              `Endpoint ${endpoint.label} applies policy field ${field}, which is absent from the selected model.`,
            );
          if (scopes.has(field) && scopes.get(field) !== kind)
            fail(
              query,
              `Endpoint ${endpoint.label} applies conflicting ownership and tenant scopes to ${field}.`,
            );
          scopes.set(field, kind);
        }
      }
    }
  }
  return diagnostics;
}

export function programFiles(
  service: ServiceContainer,
): Record<string, string> {
  const models = service.blocks.filter((b) => b.type === "db_model");
  return {
    "workflow/runtime.js": PROGRAM_RUNTIME,
    "workflow/program.json": JSON.stringify(
      {
        version: 1,
        blocks: service.blocks.filter(
          (b) =>
            ![
              "env_var",
              "auth_block",
              "middleware",
              "health_check",
              "error_handler",
              "audit_log",
            ].includes(b.type),
        ),
      },
      null,
      2,
    ),
    "workflow/index.js": `const { createWorkflow } = require('./runtime');
const program = require('./program.json');
const mongoose = require('mongoose');
const models = {${models.map((b) => `${JSON.stringify(b.id)}: require('../models/${(b.config as DbModelConfig).tableName}')`).join(",")}};
module.exports = createWorkflow(program, models, mongoose, require('../observability'));
`,
  };
}
