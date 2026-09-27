import test from "node:test";
import assert from "node:assert/strict";
import { programDiagnostics } from "../src/lib/backend/program";
import { withoutWorkflowTarget } from "../src/lib/backend/workflow-editor";
import { block, programFixture } from "./helpers/program-fixture";
import { emptyProject } from "../src/lib/project/workspace";
import { parseProject } from "../src/lib/project/schema";
import type { EndpointConfig } from "../src/types/backend";

test("user quotas require endpoint scope and explicit authentication; public login remains IP limited", () => {
  const service = programFixture();
  service.blocks.push(
    block("identity-limit", "middleware", {
      middlewareType: "rateLimit",
      rateLimitKey: "identity",
      scope: "service",
    }),
    block("unprotected", "rest_endpoint", {
      route: "/public",
      middlewareIds: ["identity-limit"],
    }),
  );
  const issues = programDiagnostics(service);
  assert.ok(
    issues.some((issue) => /selected-endpoint scope/.test(issue.message)),
  );
  assert.ok(issues.some((issue) => /Enable Auth Required/.test(issue.message)));
  service.blocks = [
    block("identity-limit", "middleware", {
      middlewareType: "rateLimit",
      rateLimitKey: "identity",
      scope: "endpoints",
    }),
    block("identity", "auth_block", { strategy: "jwt" }),
    block("model", "db_model", {
      fields: [{ name: "password", type: "string", required: true }],
    }),
    block("login", "rest_endpoint", {
      route: "/auth/login",
      method: "POST",
      authRequired: true,
      middlewareIds: ["identity-limit"],
    }),
  ];
  assert.ok(
    programDiagnostics(service).some((issue) =>
      /Public identity lifecycle/.test(issue.message),
    ),
  );
});

test("middleware references and scopes fail closed and deletion clears endpoint bindings", () => {
  const service = programFixture();
  service.blocks.push(
    block("unused", "middleware", {
      middlewareType: "rateLimit",
      scope: "endpoints",
    }),
    block("cors", "middleware", { middlewareType: "cors", scope: "backend" }),
    block("invalid", "rest_endpoint", {
      route: "/invalid",
      middlewareIds: ["missing", "cors", "cors"],
    }),
  );
  const issues = programDiagnostics(service);
  for (const message of [
    /existing middleware/,
    /only once/,
    /at least one endpoint/,
    /rate limits only/,
    /Endpoint middleware currently/,
  ])
    assert.ok(
      issues.some((issue) => message.test(issue.message)),
      message.source,
    );
  const endpoint = block("bound", "rest_endpoint", {
    middlewareIds: ["unused"],
  });
  const cleaned = withoutWorkflowTarget(endpoint, "unused");
  assert.equal(cleaned.type, "rest_endpoint");
  if (cleaned.type === "rest_endpoint")
    assert.deepEqual((cleaned.config as EndpointConfig).middlewareIds, []);
});

test("rate limit configuration bounds prevent invalid timers and quotas", () => {
  const project = emptyProject();
  for (const config of [
    { rateLimit: 0 },
    { rateLimit: 1.5 },
    { rateLimit: 100001 },
    { rateLimitWindow: 0.001 },
    { rateLimitWindow: 1441 },
    { rateLimitMessage: " " },
  ]) {
    assert.throws(() =>
      parseProject({
        ...project,
        backend: {
          ...project.backend,
          services: [
            {
              ...programFixture(),
              blocks: [
                block("limit", "middleware", {
                  middlewareType: "rateLimit",
                  ...config,
                }),
              ],
            },
          ],
        },
      }),
    );
  }
});
