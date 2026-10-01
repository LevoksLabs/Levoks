import { loginDiagnostics } from "./login";
import type {
  SemanticBackendBlock as BackendBlock,
  SemanticBackendService as ServiceContainer,
  EndpointConfig,
  DbModelConfig,
  MiddlewareConfig,
} from "@/types/backend";
import type { IRDiagnostic } from "@/types/ir";
import { controlSchema, programConfigs } from "./program-schema";
import { PROGRAM_RUNTIME } from "@/lib/codegen/program-runtime";

export function programDiagnostics(service: ServiceContainer): IRDiagnostic[] {
  const diagnostics: IRDiagnostic[] = [...loginDiagnostics(service)];
  const byId = new Map(service.blocks.map((block) => [block.id, block]));
  const identityService =
    service.blocks.some(
      (block) =>
        block.type === "auth_block" &&
        "strategy" in block.config &&
        block.config.strategy === "jwt",
    ) &&
    service.blocks.some(
      (block) =>
        block.type === "db_model" &&
        (block.config as DbModelConfig).fields.some(
          (field) => field.name === "password",
        ),
    );
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
        if (new Set(c.middlewareIds).size !== c.middlewareIds.length)
          fail(block, "Attach each middleware block only once.");
        for (const id of c.middlewareIds) {
          const middleware = checkRef(block, id, "middleware");
          if (
            middleware?.type === "middleware" &&
            (middleware.config as MiddlewareConfig).rateLimitKey === "identity"
          ) {
            if (!c.authRequired)
              fail(
                block,
                "Enable Auth Required before attaching a signed-in-user rate limit.",
              );
            if (
              identityService &&
              /\/(register|login|refresh|forgot-password|request-verification|reset-password|verify-email)$/.test(
                c.route,
              )
            )
              fail(
                block,
                "Public identity lifecycle endpoints require IP limits, not signed-in-user limits.",
              );
          }
          if (
            middleware?.type === "middleware" &&
            (middleware.config as MiddlewareConfig).middlewareType !==
              "rateLimit"
          )
            fail(
              block,
              "Endpoint middleware currently supports rate limits. Configure other middleware at service scope.",
            );
        }
        for (const id of c.policyIds || [])
          checkRef(block, id, "access_policy");
        if (c.policyIds?.length && !block.connections.length)
          fail(
            block,
            "Attach an explicit query workflow so resource policies can scope database operations.",
          );
      }
      if (block.type === "middleware") {
        const c = block.config as MiddlewareConfig;
        if (
          c.middlewareType === "rateLimit" &&
          c.rateLimitKey === "identity" &&
          c.scope !== "endpoints"
        )
          fail(
            block,
            "Signed-in-user quotas require selected-endpoint scope so authentication runs first.",
          );
        if (
          c.scope &&
          c.scope !== "service" &&
          c.middlewareType !== "rateLimit"
        )
          fail(
            block,
            "Endpoint and backend scopes currently support rate limits only.",
          );
        if (
          c.scope === "endpoints" &&
          !service.blocks.some(
            (b) =>
              b.type === "rest_endpoint" &&
              (b.config as EndpointConfig).middlewareIds.includes(block.id),
          )
        )
          fail(
            block,
            "Attach this rate limit to at least one endpoint in its inspector.",
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
    const endpointConfig = endpoint.config as EndpointConfig;
    const policies = endpointConfig.policyIds || [];
    const requestFields = new Set(
      endpointConfig.requestBody.map((field) => field.name),
    );
    const missingFields = new Set<string>();
    const checkBodyBinding = (value: unknown) => {
      if (typeof value === "string") {
        const field = /^\$request\.body\.([A-Za-z_][A-Za-z0-9_]*)/.exec(
          value,
        )?.[1];
        if (field && !requestFields.has(field)) missingFields.add(field);
      } else if (value && typeof value === "object")
        Object.values(value).forEach(checkBodyBinding);
    };
    const pending = [...endpoint.connections],
      checked = new Set<string>();
    while (pending.length) {
      const id = pending.pop()!;
      if (checked.has(id)) continue;
      checked.add(id);
      pending.push(...(adjacency.get(id) || []));
      const query = byId.get(id);
      // Generated request validation preserves only declared body fields. Catch
      // discarded workflow inputs before delivery, including nested control paths.
      if (query && !["GET", "DELETE"].includes(endpointConfig.method)) {
        const c = query.config as unknown as Record<string, unknown>;
        const control = c.program as
          { left?: unknown; right?: unknown; source?: unknown } | undefined;
        const inputs: Record<string, unknown> = {
          credential_lookup: c.email,
          password_verify: c.password,
          query: [c.filter, c.values],
          transform: c.fields,
          function: [c.inputs, c.result],
          response: c.value,
          logic_if: [control?.left, control?.right],
          logic_loop: control?.source,
          validation: `$request.body.${c.fieldName}`,
        };
        checkBodyBinding(inputs[query.type]);
      }
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
    if (missingFields.size)
      fail(
        endpoint,
        `Declare ${[...missingFields].sort().join(", ")} in this endpoint's Request Body schema; its workflow reads these fields but validation would remove them.`,
      );
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
module.exports = createWorkflow(program, models, mongoose, require('../observability')${service.blocks.some(b => b.type === 'credential_lookup') ? ", require('../controllers/identity')" : ''});
`,
  };
}
