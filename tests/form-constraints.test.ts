import test from "node:test";
import assert from "node:assert/strict";
import { runInNewContext } from "node:vm";
import {
  VALIDATION_RUNTIME,
  validationChoices,
} from "../src/lib/backend/validation";
import { backendBlockSchema, parseProject } from "../src/lib/project/schema";
import {
  emptyProject,
  restoreProject,
  captureProject,
} from "../src/lib/project/workspace";
import { useEditorStore } from "../src/store/editorStore";
import { useBackendStore } from "../src/store/backendStore";
import { elementTemplate } from "../src/lib/elements/registry";
import { templates } from "../src/templates";
import {
  createSubmissionDestination,
  submissionFields,
} from "../src/lib/form-destination";
import { generateServiceCode } from "../src/lib/codegen/express";
import { compileProject } from "../src/lib/project/compiler";
import type { ValidationConfig } from "../src/types/backend";

test("choice and consent rules reject forged values and retain existing validation semantics", () => {
  const valid = (
    type: string,
    value: unknown,
    limit?: string | number,
    coerce = false,
  ) =>
    runInNewContext(
      `${VALIDATION_RUNTIME}\nvalidationRuleValid(rule, value, coerce)`,
      { rule: { type, value: limit }, value, coerce },
    );
  for (const value of ["Design", ["Design", "Code"], [], undefined])
    assert.equal(valid("oneOf", value, "Design\nCode"), true);
  for (const value of [
    "Unknown",
    ["Unknown"],
    ["Design", "Design"],
    ["Design", false],
    null,
    false,
    0,
    {},
    [["Design"]],
  ])
    assert.equal(valid("oneOf", value, "Design\nCode"), false);
  assert.equal(valid("accepted", true), true);
  for (const value of [false, undefined, "true", 1, null])
    assert.equal(valid("accepted", value), false);
  for (const value of [0, false]) assert.equal(valid("required", value), true);
  assert.equal(valid("required", []), false);
  assert.equal(valid("min", "5", 2), false);
  assert.equal(valid("min", "5", 2, true), true);
  assert.equal(valid("minLength", 123, 2), false);
  assert.equal(valid("minLength", 123, 2, true), true);
  for (const value of [
    "",
    "A\nA",
    Array.from({ length: 201 }, (_, i) => String(i)).join("\n"),
    "x".repeat(10001),
    "A\r\nB",
    5,
  ]) {
    assert.throws(() => validationChoices(value));
    assert.equal(
      backendBlockSchema.safeParse({
        id: "v",
        type: "validation",
        label: "Choices",
        config: {
          fieldName: "topics",
          rules: [{ type: "oneOf", value, message: "Choose a listed option" }],
        },
        connections: [],
        position: { x: 0, y: 0 },
      }).success,
      false,
    );
  }
});

test("guided destinations snapshot enabled choice values and require true consent through history and both emitted paths", () => {
  const project = emptyProject();
  restoreProject(project);
  const store = useEditorStore.getState();
  const form = store.addElement(templates.form);
  for (const [kind, props] of [
    [
      "select",
      { name: "session", options: "Morning\nAfternoon", value: "Afternoon" },
    ],
    [
      "multiSelect",
      {
        name: "topics",
        options: "Design\nCode",
        selectedValues: "Design",
        required: true,
      },
    ],
    ["checkbox", { name: "consent", required: true }],
    ["switch", { name: "optional", required: false }],
    ["radioButton", { name: "attendance", value: "remote" }],
    ["radioButton", { name: "attendance", value: "onsite", required: true }],
    ["radioButton", { name: "attendance", value: "disabled", disabled: true }],
  ] as const)
    store.addElement(
      {
        ...elementTemplate(kind),
        props: { ...elementTemplate(kind)!.props, ...props },
      },
      form,
    );
  const before = captureProject(project.id, project.name);
  createSubmissionDestination(form, "Constrained signups");
  const service = useBackendStore.getState().services[0];
  const rules = (name: string) =>
    service.blocks.find(
      (block) =>
        block.type === "validation" &&
        (block.config as ValidationConfig).fieldName === name,
    );
  for (const [name, choices] of [
    ["session", "Morning\nAfternoon"],
    ["topics", "Design\nCode"],
    ["attendance", "remote\nonsite"],
  ]) {
    const block = rules(name)!;
    assert.equal(
      block.type === "validation" &&
        (block.config as ValidationConfig).rules.find(
          (rule) => rule.type === "oneOf",
        )?.value,
      choices,
    );
  }
  const consent = rules("consent")!;
  assert.equal(
    consent.type === "validation" &&
      (consent.config as ValidationConfig).rules[0].type,
    "accepted",
  );
  assert.equal(rules("optional"), undefined);
  const saved = captureProject(project.id, project.name);
  assert.deepEqual(
    compileProject(parseProject(saved)).diagnostics.filter(
      (d) => d.severity === "error",
    ),
    [],
  );
  store.undo();
  assert.deepEqual(
    captureProject(project.id, project.name).backend,
    before.backend,
  );
  store.redo();
  assert.deepEqual(
    captureProject(project.id, project.name).backend,
    saved.backend,
  );
  const legacy = structuredClone(service);
  const validationIds = new Set(
    legacy.blocks.filter((b) => b.type === "validation").map((b) => b.id),
  );
  for (const block of legacy.blocks)
    block.connections = block.connections.filter(
      (id) => !validationIds.has(id),
    );
  const files = generateServiceCode(legacy),
    exports: {
      validateRules?: (req: object, res: object, next: () => void) => void;
    } = {};
  runInNewContext(files["constrained-signups/middleware/validate.js"], {
    exports,
  });
  const body = {
    session: "Morning",
    topics: ["Code"],
    attendance: "onsite",
    consent: true,
    optional: false,
  };
  for (const [patch, expected] of [
    [{}, 200],
    [{ consent: false }, 400],
    [{ consent: undefined }, 400],
    [{ topics: ["Unknown"] }, 400],
    [{ topics: ["Code", "Code"] }, 400],
    [{ attendance: "disabled" }, 400],
    [{ session: "forged" }, 400],
  ] as const) {
    let status = 200,
      next = false;
    const res = {
      status(code: number) {
        status = code;
        return this;
      },
      json() {},
    };
    exports.validateRules!(
      { method: "POST", body: { ...body, ...patch } },
      res,
      () => {
        next = true;
      },
    );
    assert.equal(status, expected);
    assert.equal(next, expected === 200);
  }
  const radio = Object.values(useEditorStore.getState().elementsById).find(
    (node) => node.props.name === "attendance",
  )!;
  store.updateElement(radio.id, { props: { value: "multi\nline" } });
  assert.match(
    submissionFields(
      form,
      useEditorStore.getState().elementsById,
    ).problems.join(" "),
    /one line/,
  );
  assert.throws(
    () => createSubmissionDestination(form, "Invalid choices"),
    /one line/,
  );
  assert.equal(useBackendStore.getState().services.length, 1);
});
