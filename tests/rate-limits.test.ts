import test from "node:test";
import assert from "node:assert/strict";
import { programDiagnostics } from "../src/lib/backend/program";
import { withoutWorkflowTarget } from "../src/lib/backend/workflow-editor";
import { block, programFixture } from "./helpers/program-fixture";
import { emptyProject } from "../src/lib/project/workspace";
import { parseProject } from "../src/lib/project/schema";
import type { EndpointConfig } from "../src/types/backend";

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
