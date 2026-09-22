import test from "node:test";
import assert from "node:assert/strict";
import { runInNewContext } from "node:vm";
import { block, programFixture } from "./helpers/program-fixture";
import {
  editWorkflow,
  workflowOutputs,
} from "../src/lib/backend/workflow-editor";
import { compileProject } from "../src/lib/project/compiler";
import { emptyProject } from "../src/lib/project/workspace";
import { useBackendStore } from "../src/store/backendStore";
import { parseProject } from "../src/lib/project/schema";

test("deleting a workflow block removes branch and function references; origin placement persists", () => {
  const service = {
    ...programFixture(),
    blocks: [
      block("entry", "rest_endpoint", {}, ["removed"]),
      block("branch", "logic_if", {
        program: { thenSteps: ["removed"], elseSteps: ["kept"] },
      }),
      block("fn", "function", { steps: ["removed", "kept"] }),
      block("removed", "transform"),
      block("kept", "transform"),
    ],
  };
  useBackendStore.setState({ services: [service] });
  const store = useBackendStore.getState();
  store.moveBlock(service.id, "kept", 0, 0);
  store.removeBlock(service.id, "removed");
  const next = useBackendStore.getState().services[0];
  assert.ok(
    !workflowOutputs(next.blocks[1])
      .flatMap((output) => output.ids)
      .includes("removed"),
  );
  assert.deepEqual(
    workflowOutputs(next.blocks[2]).find((output) => output.field === "steps")!
      .ids,
    ["kept"],
  );
  const base = emptyProject();
  const parsed = parseProject({
    ...base,
    backend: { ...base.backend, services: [next] },
  });
  assert.deepEqual(
    parsed.backend.services[0].blocks.find((block) => block.id === "kept")!
      .position,
    { x: 0, y: 0, placed: true },
  );
});

test("graph connections and branches compile to executable saved workflow steps", async () => {
  let service = {
    ...programFixture(),
    blocks: [
      block("entry", "rest_endpoint", { route: "/hello", method: "POST" }),
      block("choose", "logic_if", {
        program: { left: "$request.body.large", operator: "eq", right: true },
      }),
      block("large", "transform", { fields: { message: "Large" } }),
      block("small", "transform", { fields: { message: "Small" } }),
      block("reply", "response"),
    ],
  };
  service = editWorkflow(service, "entry", "connections", ["choose", "reply"]);
  service = editWorkflow(service, "choose", "program.thenSteps", ["large"]);
  service = editWorkflow(service, "choose", "program.elseSteps", ["small"]);
  const base = emptyProject();
  const project = {
    ...base,
    backend: { ...base.backend, services: [service] },
  };
  const output = compileProject(JSON.parse(JSON.stringify(project)));
  assert.deepEqual(
    output.diagnostics.filter((d) => d.severity === "error"),
    [],
  );
  const program = JSON.parse(
    output.files["backend/workflow-service/workflow/program.json"],
  );
  const exports: {
    createWorkflow?: (
      program: unknown,
      models: unknown,
      database: unknown,
    ) => (id: string, req: unknown) => Promise<{ body: unknown }>;
  } = {};
  runInNewContext(
    output.files["backend/workflow-service/workflow/runtime.js"],
    { exports, structuredClone, Date, Set },
  );
  const execute = exports.createWorkflow!(program, {}, {});
  assert.equal(
    JSON.stringify((await execute("entry", { body: { large: true } })).body),
    '{"message":"Large"}',
  );
  assert.equal(
    JSON.stringify((await execute("entry", { body: { large: false } })).body),
    '{"message":"Small"}',
  );
  assert.deepEqual(service.blocks[0].connections, ["choose", "reply"]);
});

test("workflow editing rejects cycles and configuration targets without mutating the service", () => {
  const service = {
    ...programFixture(),
    blocks: [
      block("first", "transform", {}, ["second"]),
      block("second", "logic_trycatch"),
      block("model", "db_model"),
    ],
  };
  const before = JSON.stringify(service);
  assert.throws(
    () => editWorkflow(service, "second", "program.catchSteps", ["first"]),
    /cycle/,
  );
  assert.throws(
    () => editWorkflow(service, "first", "connections", ["model"]),
    /executable/,
  );
  assert.throws(
    () => editWorkflow(service, "first", "program.steps", []),
    /output/,
  );
  assert.equal(JSON.stringify(service), before);
  assert.deepEqual(
    workflowOutputs(service.blocks[1]).map((output) => output.label),
    ["Next", "Try", "Catch", "Finally"],
  );
  assert.deepEqual(
    editWorkflow(service, "first", "connections", []).blocks[0].connections,
    [],
  );
});
