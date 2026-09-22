import test from "node:test";
import assert from "node:assert/strict";
import { runInNewContext } from "node:vm";
import { programDiagnostics } from "../src/lib/backend/program";
import { PROGRAM_RUNTIME } from "../src/lib/codegen/program-runtime";
import { compileProject } from "../src/lib/project/compiler";
import { emptyProject } from "../src/lib/project/workspace";
import { parseProject } from "../src/lib/project/schema";
import { block, programFixture } from "./helpers/program-fixture";
import type { BackendBlock } from "../src/types/backend";

export function executeProgram(blocks: BackendBlock[]) {
  const generatedModule = {
    exports: {} as {
      createWorkflow: (
        program: unknown,
        models: unknown,
        database: unknown,
      ) => (
        id: string,
        request: unknown,
      ) => Promise<{ status: number; body: unknown }>;
    },
  };
  runInNewContext(PROGRAM_RUNTIME, {
    exports: generatedModule.exports,
    structuredClone,
    Date,
    Set,
  });
  return generatedModule.exports.createWorkflow({ blocks }, {}, {});
}
test("explicit program survives validated IR and emits executable service modules", () => {
  const project = emptyProject();
  const output = compileProject(
    parseProject({
      ...project,
      backend: { ...project.backend, services: [programFixture()] },
    }),
  );
  assert.deepEqual(
    output.diagnostics.filter((d) => d.severity === "error"),
    [],
  );
  assert.match(
    output.files["backend/workflow-service/routes/index.js"],
    /await workflow\("create_endpoint", req\)/,
  );
  assert.ok(
    JSON.parse(
      output.files["backend/workflow-service/workflow/program.json"],
    ).blocks.some((b: BackendBlock) => b.type === "access_policy"),
  );
});
test("workflow compiler rejects missing model bindings, cycles and unsafe outputs", () => {
  const service = programFixture();
  service.blocks.push(
    block("bad", "query", { modelId: "missing", output: "request" }, ["bad"]),
  );
  const issues = programDiagnostics(service);
  assert.ok(issues.some((d) => /existing db_model/.test(d.message)));
  assert.ok(issues.some((d) => /Recursive/.test(d.message)));
  assert.ok(issues.some((d) => /reserved/.test(d.message)));
});
test("endpoint policies validate fields and conflicting scopes across nested operations", () => {
  const service = programFixture();
  service.blocks.push(
    block("inherited", "access_policy", { ownerField: "missingOwner", tenantField: "" }),
    block("nested", "function", { steps: ["list"] }),
    block("inherited_endpoint", "rest_endpoint", { policyIds: ["inherited"] }, ["nested"]),
    block("conflicting", "access_policy", { ownerField: "", tenantField: "ownerId" }),
    block("conflicting_endpoint", "rest_endpoint", { policyIds: ["conflicting"] }, ["nested"]),
  );
  const issues = programDiagnostics(service);
  assert.ok(issues.some(issue => issue.nodeId === "list" && /missingOwner.*absent/.test(issue.message)));
  assert.ok(issues.some(issue => issue.nodeId === "list" && /conflicting ownership/.test(issue.message)));
});
test("aggregation rejects sensitive fields, nonnumeric sums and invalid result sorting", () => {
  const service = programFixture();
  service.blocks.push(block("aggregate", "query", { modelId: "model", operation: "aggregate", sortField: "title", aggregation: { groupBy: "missing", metrics: [{ name: "total", operation: "sum", field: "title" }] } }));
  const issues = programDiagnostics(service);
  assert.ok(issues.some(issue => /Aggregation field missing/.test(issue.message)));
  assert.ok(issues.some(issue => /Aggregation field title.*numeric/.test(issue.message)));
  assert.ok(issues.some(issue => /Sort aggregate results/.test(issue.message)));
  const base = emptyProject();
  assert.throws(() => parseProject({ ...base, backend: { ...base.backend, services: [{ ...service, blocks: [...service.blocks, block("unsafe", "query", { modelId: "model", operation: "aggregate", aggregation: { groupBy: "", metrics: [{ name: "__proto__", operation: "count", field: "" }] } })] }] } }));
});
test("bounded branching, functions and transforms run without evaluating code", async () => {
  const blocks = [
    block("endpoint", "rest_endpoint", {}, ["condition", "reply"]),
    block("condition", "logic_if", {
      program: {
        left: "$request.body.count",
        operator: "gt",
        right: 2,
        thenSteps: ["fn"],
        elseSteps: ["small"],
      },
    }),
    block("fn", "function", {
      inputs: { name: "$request.body.name" },
      steps: ["transform"],
      result: "$result",
      output: "result",
    }),
    block("transform", "transform", {
      fields: { name: "$input.name", label: "large" },
    }),
    block("small", "transform", { fields: { label: "small" } }),
    block("reply", "response", { value: "$result", status: 201 }),
  ];
  const run = executeProgram(blocks);
  const result = await run("endpoint", { body: { count: 3, name: "Ada" } });
  assert.equal(result.status, 201);
  assert.deepEqual(JSON.parse(JSON.stringify(result.body)), {
    name: "Ada",
    label: "large",
  });
  const evil = JSON.parse('{"__proto__":{"admin":true}}');
  await assert.rejects(run("endpoint", { body: evil }), /Unsafe field/);
});
test("loop bounds and missing steps fail with actionable errors", async () => {
  const run = executeProgram([
    block("endpoint", "rest_endpoint", {}, ["loop"]),
    block("loop", "logic_loop", {
      program: { source: "$request.body.items", maxIterations: 2, steps: [] },
    }),
  ]);
  await assert.rejects(
    run("endpoint", { body: { items: [1, 2, 3] } }),
    /configured limit/,
  );
});
