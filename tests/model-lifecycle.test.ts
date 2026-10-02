import test from "node:test";
import assert from "node:assert/strict";
import { modelDefault } from "../src/lib/backend/model-defaults";
import { emptyProject } from "../src/lib/project/workspace";
import { compileProject } from "../src/lib/project/compiler";
import { parseProject } from "../src/lib/project/schema";
import {
  defaultFields,
  modelLifecycleFixture,
} from "./helpers/model-lifecycle-fixture";
import type { DbModelConfig } from "../src/types/backend";

test("model defaults remain typed data and reject invalid or executable values", () => {
  assert.deepEqual(defaultFields.map(modelDefault), [
    0,
    false,
    "",
    { theme: "dark" },
    ["new", 1, false],
    "2026-10-02T00:00:00.000Z",
    "507f1f77bcf86cd799439011",
  ]);
  for (const [type, defaultValue] of [
    ["number", "1e999"],
    ["boolean", '"false"'],
    ["object", "[]"],
    ["array", "{}"],
    ["date", "2026-02-30"],
    ["date", "2026-02-30T00:00:00Z"],
    ["objectId", "not-an-id"],
    ["object", '{"__proto__":{"admin":true}}'],
    ["array", '[{"$where":"x"}]'],
    ["number", "process.exit()"],
  ] as const)
    assert.throws(() =>
      modelDefault({ name: "field", type, required: false, defaultValue }),
    );
});

test("model lifecycle persists, generates typed defaults, and blocks unsafe lifecycle configurations", () => {
  const initial = emptyProject("Model lifecycle");
  const project = parseProject({
    ...initial,
    backend: { ...initial.backend, services: [modelLifecycleFixture()] },
  });
  const result = compileProject(
    parseProject(JSON.parse(JSON.stringify(project))),
  );
  assert.deepEqual(
    result.diagnostics.filter((d) => d.severity === "error"),
    [],
  );
  assert.match(
    result.files["backend/workflow-service/models/Entry.js"],
    /default: false/,
  );
  assert.match(
    result.files["backend/workflow-service/models/Entry.js"],
    /default: 0/,
  );
  assert.match(
    result.files["backend/workflow-service/models/Plain.js"],
    /timestamps: false/,
  );
  for (const mutate of [
    (p: typeof project) => {
      (
        p.backend.services[0].blocks.find((b) => b.id === "model")!
          .config as DbModelConfig
      ).softDelete = false;
    },
    (p: typeof project) => {
      Object.assign(
        p.backend.services[0].blocks.find((b) => b.id === "restore")!.config,
        { filter: {} },
      );
    },
    (p: typeof project) => {
      Object.assign(
        p.backend.services[0].blocks.find((b) => b.id === "delete")!.config,
        { deleted: "include" },
      );
    },
    (p: typeof project) => {
      Object.assign(
        p.backend.services[0].blocks.find((b) => b.id === "update")!.config,
        { values: { deletedAt: null } },
      );
    },
    (p: typeof project) => {
      (
        p.backend.services[0].blocks.find((b) => b.id === "model")!
          .config as DbModelConfig
      ).fields.push({ name: "deletedAt", type: "date", required: false });
    },
    (p: typeof project) => {
      (
        p.backend.services[0].blocks.find((b) => b.id === "model")!
          .config as DbModelConfig
      ).fields[3].defaultValue = "NaN";
    },
  ]) {
    const invalid = structuredClone(project);
    mutate(invalid);
    assert.ok(
      compileProject(invalid).diagnostics.some((d) => d.severity === "error"),
    );
  }
});
