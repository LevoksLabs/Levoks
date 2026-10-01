import type { BackendIR } from "./ir";
import type { IRDiagnostic } from "@/types/ir";
import { BACKEND_REGISTRY } from "./registry";
import { programDiagnostics } from "./program";

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
    backend.target !== "express-mongoose"
  ) {
    problem("backend", "Unsupported backend IR version or generation target.");
    return diagnostics;
  }
  for (const service of backend.services) {
    for (const block of service.blocks) {
      const definition = BACKEND_REGISTRY[block.type];
      if (!definition || block.definitionVersion !== definition.version) {
        problem(block.id, "Unknown or incompatible backend block definition.");
        continue;
      }
      definition.propsSchema.parse(block.config);
      if (definition.generate === "unsupported")
        problem(
          block.id,
          `${block.label}: experimental block has no executable generator.`,
        );
    }
    diagnostics.push(...programDiagnostics(service));
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
        ["logic_if", "logic_loop", "logic_trycatch", "relation"].includes(
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
        service.blocks.some(
          (b) => b.type === "rest_endpoint" && !b.connections.length,
        )
      )
        problem(block.id, `${block.label}: soft deletion is not yet compiled.`);
      if (
        jwt &&
        identityModel &&
        block.type === "rest_endpoint" &&
        !/\/(register|login|profile|logout|refresh|sessions|revoke-session|logout-all|change-password|introspect|forgot-password|reset-password|request-verification|verify-email)$/.test(
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
