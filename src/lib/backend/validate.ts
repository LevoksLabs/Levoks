import type { BackendIR } from "./ir";
import type { IRDiagnostic } from "@/types/ir";
import { BACKEND_REGISTRY } from "./registry";
import { programDiagnostics } from "./program";
import { modelDefault } from "./model-defaults";
import { databaseSchema, isSql, defaultDatabase } from "./database";
import { serviceSlug } from "@/lib/project/schema";
import { relationDiagnostics } from "./relations";

export function validateBackendIR(backend: BackendIR): IRDiagnostic[] {
  const diagnostics: IRDiagnostic[] = [];
  const problem = (nodeId: string, message: string) =>
    diagnostics.push({
      severity: "error",
      code: "UNSUPPORTED_CONFIGURATION",
      nodeId,
      message,
    });
  if (
    backend.schemaVersion !== 1 ||
    backend.generatorVersion !== "backend-1" ||
    !["express-mongoose", "express-database"].includes(backend.target)
  ) {
    problem("backend", "Unsupported backend IR version or generation target.");
    return diagnostics;
  }
  for (const service of backend.services) {
    if (backend.services.some(s => !s.database) && serviceSlug(service.name) === "mongodb") problem(service.id, "The service name MongoDB is reserved by legacy database storage. Rename this service before export.");
    const database = service.database || defaultDatabase();
    const parsedDatabase = databaseSchema.safeParse(database);
    if (!parsedDatabase.success) problem(service.id, "Choose a valid database engine, storage location, filename and dedicated environment variable.");
    if (service.blocks.some(b => b.type === "env_var" && b.config.key === database.connectionEnv)) problem(service.id, "Database connection values belong in the exported runtime environment, not an Environment Variable block.");
    if (service.blocks.some(b => b.type === "env_var" && b.config.key === "OPERATOR_SETUP_TOKEN")) problem(service.id, "Operator setup codes belong only in the exported runtime environment, not an Environment Variable block.");
    if (isSql(database)) {
      const tables = service.blocks.filter(b => b.type === "db_model").map(b => b.config.tableName.toLowerCase());
      if (new Set(tables).size !== tables.length) problem(service.id, "SQL table names must be distinct without relying on letter case.");
      const incompatible = service.blocks.filter(b => b.type === "audit_log" || ["credential_lookup", "password_verify", "session_issue"].includes(b.type) || (b.type === "db_model" && b.config.fields.some(f => f.name === "password")));
      for (const block of incompatible) problem(block.id, "Identity accounts and durable audit logs currently require a MongoDB service. Use a separate MongoDB identity service for SQL resources.");
      for (const owner of backend.services) for (const block of owner.blocks) if (block.type === "middleware" && block.config.middlewareType === "rateLimit" && block.config.rateLimitStore === "mongodb" && (owner.id === service.id || block.config.scope === "backend")) problem(block.id, `${service.name}: database-backed rate limits require MongoDB; choose memory counters for SQL services.`);
      for (const block of service.blocks) if (block.type === "db_model") {
        if (new Set(block.config.fields.map(f => f.name.toLowerCase())).size !== block.config.fields.length) problem(block.id, "SQL field names must be distinct without relying on letter case.");
        if (block.config.tableName.length > 50 || block.config.fields.some(f => f.name.length > 50)) problem(block.id, "SQL table and field names must be at most 50 characters.");
        for (const field of block.config.fields) {
          if (["object", "array"].includes(field.type) && (field.unique || field.indexed)) problem(block.id, "SQL indexes require scalar fields; remove the JSON field index or uniqueness option.");
          if (field.type === "string" && (field.unique || field.indexed) && (field.defaultValue?.length || 0) > 191) problem(block.id, "Indexed SQL text defaults must be at most 191 characters.");
        }
      }
    }
    for (const block of service.blocks) {
      const definition = BACKEND_REGISTRY[block.type];
      if (!definition || block.definitionVersion !== definition.version) {
        problem(block.id, "Unknown or incompatible backend block definition.");
        continue;
      }
      definition.propsSchema.parse(block.config);
      if (block.type === "db_model") {
        const reserved = ["_id", "__v", ...(block.config.timestamps ? ["createdAt", "updatedAt"] : []), ...(block.config.softDelete ? ["deletedAt"] : [])];
        for (const field of block.config.fields) {
          if (field.name === "operatorBootstrap") problem(block.id, "operatorBootstrap is reserved for one-time operator enrollment.");
          if (reserved.includes(field.name)) problem(block.id, `${block.label}: ${field.name} is managed by the model.`);
          try { modelDefault(field); }
          catch (error) { problem(block.id, `${block.label}.${field.name}: ${(error as Error).message}`); }
        }
      }
      if (definition.generate === "unsupported")
        problem(
          block.id,
          `${block.label}: experimental block has no executable generator.`,
        );
    }
    diagnostics.push(...programDiagnostics(service));
    diagnostics.push(...relationDiagnostics(service));
    for (const type of ["error_handler", "audit_log"])
      if (service.blocks.filter((b) => b.type === type).length > 1)
        problem(
          service.id,
          `Use one ${type.replaceAll("_", " ")} block per service.`,
        );
    for (const block of service.blocks) {
      if (block.type === "error_handler" || block.type === "audit_log") {
        if (block.connections.length)
          problem(
            block.id,
            "Observability settings are service configuration, not workflow steps.",
          );
      }
      if (block.type === "audit_log")
        for (const id of block.config.endpointIds)
          if (
            !service.blocks.some(
              (b) => b.id === id && b.type === "rest_endpoint",
            )
          )
            problem(
              block.id,
              "Audit scope must reference existing endpoints in this service.",
            );
      if (
        block.type === "error_handler" &&
        new Set(block.config.rules.map((r) => r.kind)).size !==
          block.config.rules.length
      )
        problem(
          block.id,
          "Each error classification must have at most one response rule.",
        );
    }
    const healthBlocks = service.blocks.filter(
      (b) => b.type === "health_check",
    );
    if (healthBlocks.length > 1)
      problem(service.id, "Use one Health Check block per service.");
    const healthRoutes = new Set([
      "/health",
      "/health/live",
      "/health/ready",
      ...healthBlocks.map((b) => b.config.route),
    ]);
    for (const block of service.blocks) {
      if (
        block.type === "rest_endpoint" &&
        healthRoutes.has(block.config.route)
      )
        problem(block.id, "This route is reserved for service health checks.");
      if (block.type === "health_check") {
        if (
          block.config.route === "/health/live" ||
          block.config.route.includes("//") ||
          block.config.route.endsWith("/")
        )
          problem(
            block.id,
            "Choose a readiness path distinct from /health/live, without empty segments or a trailing slash.",
          );
        for (const id of block.config.serviceIds)
          if (id === service.id || !backend.services.some((s) => s.id === id))
            problem(
              block.id,
              "Health dependencies must reference other existing services.",
            );
        if (block.connections.length)
          problem(
            block.id,
            "Health checks are service configuration, not workflow steps.",
          );
      }
    }
    const identityModel = service.blocks.find(
      (b) =>
        b.type === "db_model" &&
        b.config.fields.some((f) => f.name === "password"),
    );
    const jwt = service.blocks.some(
      (b) => b.type === "auth_block" && b.config.strategy === "jwt",
    );
    if (service.port === 3000)
      problem(
        service.id,
        `${service.name}: port 3000 is reserved for the frontend.`,
      );
    for (const block of service.blocks) {
      if (block.type === "rest_endpoint" && block.config.route.endsWith("/operator-setup")) {
        const fields = block.config.requestBody;
        if (
          !jwt ||
          !identityModel ||
          block.config.method !== "POST" ||
          block.config.authRequired ||
          block.config.policyIds?.length ||
          block.connections.length ||
          (block.config.modelId && block.config.modelId !== identityModel.id) ||
          fields.length !== 4 ||
          ["email", "name", "password", "setupCode"].some(name => !fields.some(f => f.name === name && f.type === "string" && f.required))
        )
          problem(block.id, "Operator setup requires the JWT identity model, public POST, no workflow or policies, and required string email, name, password and setupCode fields.");
      }
      if (block.type === "rest_endpoint" && block.config.view === "submissionInbox") {
        const config = block.config;
        const model = service.blocks.find(b => b.type === "db_model" && b.id === config.modelId);
        const policy = service.blocks.find(b => b.type === "access_policy" && config.policyIds?.includes(b.id));
        const query = service.blocks.find(b => b.type === "query" && b.id === block.connections[0]);
        const response = service.blocks.find(b => b.type === "response" && b.id === block.connections[1]);
        if (
          config.method !== "GET" ||
          !config.authRequired ||
          /[:*]/.test(config.route) ||
          config.requestBody.length ||
          config.responseBody.length ||
          config.requestHeaders?.length ||
          config.pathParameters?.length ||
          config.queryParameters?.length !== 1 ||
          config.queryParameters[0].name !== "page" ||
          config.queryParameters[0].type !== "number" ||
          config.queryParameters[0].required ||
          !service.blocks.some(b => b.type === "auth_block" && b.config.strategy === "jwt" && b.config.identityServiceId) ||
          model?.type !== "db_model" ||
          model.config.fields.some(f => /password|secret|token/i.test(f.name)) ||
          policy?.type !== "access_policy" ||
          policy.config.roles.length !== 1 ||
          policy.config.roles[0] !== "operator" ||
          !policy.config.permissions.includes("submissions.read") ||
          policy.config.ownerField ||
          policy.config.tenantField ||
          block.connections.length !== 2 ||
          query?.type !== "query" ||
          query.connections.length ||
          query.config.operation !== "find" ||
          query.config.modelId !== config.modelId ||
          query.config.policyId !== policy.id ||
          query.config.limit !== 50 ||
          query.config.page !== "$request.query.page" ||
          query.config.sortField !== "_id" ||
          query.config.sortDirection !== "desc" ||
          response?.type !== "response" ||
          response.connections.length ||
          response.config.status !== 200 ||
          response.config.value !== `$${query.config.output}`
        )
          problem(block.id, "Submission inbox requires a fixed authenticated GET, a separate JWT identity service, the operator submissions.read policy, and a 50-record descending _id query with optional numeric page and an array response. Credential fields and owner/tenant scopes require a dedicated view.");
      }
      if (
        jwt &&
        identityModel &&
        block.type === "rest_endpoint" &&
        block.connections.length &&
        !block.config.route.endsWith("/login")
      )
        problem(
          block.id,
          "Only login currently supports an explicit identity workflow. Other identity endpoints use the validated lifecycle controller; workflow steps cannot bypass password hashing or session checks.",
        );
      if (
        jwt &&
        identityModel?.type === "db_model" &&
        ["email", "name", "password"].some(
          (name) =>
            identityModel.config.fields.find((f) => f.name === name)?.type !==
            "string",
        )
      )
        problem(
          identityModel.id,
          "Identity email, name and password must be string fields.",
        );
      if (block.type === "auth_block" && block.config.identityServiceId) {
        const target = backend.services.find(
          (s) => s.id === block.config.identityServiceId,
        );
        if (
          !target ||
          target.id === service.id ||
          !target.blocks.some(
            (b) =>
              b.type === "db_model" &&
              b.config.fields.some((f) => f.name === "password"),
          ) ||
          !target.blocks.some(
            (b) => b.type === "auth_block" && b.config.strategy === "jwt",
          ) ||
          !target.blocks.some(
            (b) =>
              b.type === "rest_endpoint" &&
              b.config.route.endsWith("/introspect") &&
              b.config.method === "POST",
          )
        )
          problem(
            block.id,
            "Select an identity service with a JWT User model and POST introspect endpoint.",
          );
        if (identityModel)
          problem(
            block.id,
            "Identity services validate their own sessions. Remote identity binding is for resource services.",
          );
      }
      if (
        ["logic_if", "logic_loop", "logic_trycatch"].includes(
          block.type,
        ) &&
        !("program" in block.config && block.config.program)
      )
        problem(
          block.id,
          `${block.label}: this block needs an execution compiler before it can be exported. It will not be silently omitted.`,
        );
      if (block.type === "auth_block" && block.config.strategy !== "jwt")
        problem(
          block.id,
          `${block.label}: only JWT verification is currently compiled.`,
        );
      if (
        block.type === "auth_block" &&
        !/^\d+(s|m|h|d)$/.test(block.config.tokenExpiry)
      )
        problem(
          block.id,
          `${block.label}: token expiry must use a duration such as 1h or 7d.`,
        );
      if (
        block.type === "db_model" &&
        block.config.softDelete &&
        jwt && identityModel
      )
        problem(block.id, `${block.label}: identity accounts use session revocation and disabledAt, not resource soft deletion.`);
      if (
        jwt &&
        identityModel &&
        block.type === "rest_endpoint" &&
        !/\/(register|login|profile|logout|refresh|sessions|revoke-session|logout-all|change-password|introspect|forgot-password|reset-password|request-verification|verify-email|operator-setup)$/.test(
          block.config.route,
        )
      )
        problem(
          block.id,
          `${block.label}: identity services expose register, login, profile, logout, refresh, sessions, revoke-session, logout-all and change-password. Put other resources in a separate service.`,
        );
      if (
        jwt &&
        identityModel &&
        identityModel.type === "db_model" &&
        !["email", "name", "password"].every((name) =>
          identityModel.config.fields.some((f) => f.name === name),
        )
      )
        problem(
          identityModel.id,
          "JWT identity models require email, name, and password fields.",
        );
      if (
        block.type === "rest_endpoint" &&
        !block.connections.length &&
        !block.config.modelId &&
        service.blocks.filter((b) => b.type === "db_model").length > 1
      )
        problem(
          block.id,
          `${block.label}: use one model per service until explicit model binding is available.`,
        );
      if (
        block.type === "rest_endpoint" &&
        /\/(login|register|signup|signin)\b/i.test(block.config.route) &&
        (!jwt ||
          !identityModel ||
          !/\/(login|register)$/.test(block.config.route))
      )
        problem(
          block.id,
          `${block.label}: use the JWT auth template's /login and /register endpoints with its User model.`,
        );
      if (
        jwt &&
        identityModel &&
        block.type === "rest_endpoint" &&
        block.config.method !==
          (/\/(profile|sessions)$/.test(block.config.route) ? "GET" : "POST")
      )
        problem(
          block.id,
          `${block.label}: identity endpoints use POST, except profile and sessions which use GET.`,
        );
      if (
        block.type === "middleware" &&
        block.config.middlewareType === "custom"
      )
        problem(
          block.id,
          `${block.label}: custom middleware requires manual source review.`,
        );
      if (
        block.type === "validation" &&
        block.config.rules.some(
          (r) => r.type === "custom" || r.type === "regex",
        )
      )
        problem(
          block.id,
          `${block.label}: custom and regular-expression validation need manual source review.`,
        );
    }
  }
  return diagnostics;
}
