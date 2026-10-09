import test from "node:test";
import assert from "node:assert/strict";
import { runInNewContext } from "node:vm";
import { VALIDATION_RUNTIME } from "../src/lib/backend/validation";
import {
  temporalNumber,
  temporalConfigError,
  type TemporalKind,
} from "../src/lib/backend/temporal";
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
import type { ValidationConfig, ValidationRule } from "../src/types/backend";

const valid = (rule: Partial<ValidationRule>, value: unknown) =>
  runInNewContext(`${VALIDATION_RUNTIME}\nvalidationRuleValid(rule, value)`, {
    rule,
    value,
  });

test("temporal parsing checks calendar dates and local times without timezone conversion", () => {
  for (const [kind, values, expected] of [
    [
      "date",
      [
        "0001-01-01",
        "0099-12-31",
        "2000-02-29",
        "2028-02-29",
        "10000-01-01",
        "275760-09-13",
      ],
      true,
    ],
    [
      "date",
      [
        "0000-01-01",
        "1900-02-29",
        "2026-02-29",
        "2026-04-31",
        "2026-00-10",
        "2026-13-01",
        "2026-01-00",
        "2026-1-01",
        "275760-09-14",
        "2026-10-15\n",
        null,
        false,
        [],
        {},
      ],
      false,
    ],
    [
      "time",
      ["00:00", "23:59", "12:30:45", "12:30:45.1", "12:30:45.012"],
      true,
    ],
    [
      "time",
      [
        "24:00",
        "23:60",
        "12:30:60",
        "12:30:45.1234",
        "12:30Z",
        "1:30",
        "12:30\n",
      ],
      false,
    ],
    [
      "datetime-local",
      ["2028-02-29T12:30", "2028-02-29 12:30:45.012", "0099-01-01T00:00"],
      true,
    ],
    [
      "datetime-local",
      [
        "2026-02-29T12:30",
        "2026-10-15T12:30Z",
        "2026-10-15T12:30+05:30",
        "2026-10-15T24:00",
        "2026-10-15T12:30T00:00",
      ],
      false,
    ],
  ] as const)
    for (const value of values) {
      const authorNumber = temporalNumber(kind, value);
      const emittedNumber = runInNewContext(
        `${VALIDATION_RUNTIME}\ntemporalNumber(kind,value)`,
        { kind, value },
      );
      assert.equal(
        Number.isFinite(authorNumber),
        expected,
        `${kind}: ${JSON.stringify(value)}`,
      );
      assert.equal(emittedNumber, authorNumber);
      assert.equal(
        valid({ type: kind, temporal: { step: "any" } }, value),
        expected,
      );
    }
  assert.equal(temporalNumber("date", "1970-01-01"), 0);
  assert.equal(temporalNumber("datetime-local", "1970-01-01T12:00"), 43200000);
});

test("temporal range and step rules match native bases, midnight ranges and optional semantics", () => {
  const cases: [ValidationRule, unknown, boolean][] = [
    [
      {
        type: "date",
        temporal: { min: "2026-10-15", max: "2026-10-21", step: "2" },
        message: "",
      },
      "2026-10-17",
      true,
    ],
    [
      {
        type: "date",
        temporal: { min: "2026-10-15", max: "2026-10-21", step: "2" },
        message: "",
      },
      "2026-10-16",
      false,
    ],
    [
      {
        type: "date",
        temporal: { min: "2026-10-15", max: "2026-10-21", step: "2" },
        message: "",
      },
      "2026-10-13",
      false,
    ],
    [
      {
        type: "date",
        temporal: { min: "2026-10-15", max: "2026-10-21", step: "2" },
        message: "",
      },
      "2026-10-23",
      false,
    ],
    [
      {
        type: "date",
        temporal: { base: "1970-01-02", step: "2" },
        message: "",
      },
      "1970-01-04",
      true,
    ],
    [
      {
        type: "date",
        temporal: { base: "1970-01-02", step: "2" },
        message: "",
      },
      "1970-01-03",
      false,
    ],
    [
      {
        type: "time",
        temporal: { min: "22:00", max: "02:00", step: "1800" },
        message: "",
      },
      "01:30",
      true,
    ],
    [
      {
        type: "time",
        temporal: { min: "22:00", max: "02:00", step: "1800" },
        message: "",
      },
      "12:00",
      false,
    ],
    [
      {
        type: "time",
        temporal: { min: "22:00", max: "02:00", step: "1800" },
        message: "",
      },
      "22:15",
      false,
    ],
    [
      { type: "time", temporal: { base: "12:00:30" }, message: "" },
      "12:01:30",
      true,
    ],
    [
      { type: "time", temporal: { base: "12:00:30" }, message: "" },
      "12:01",
      false,
    ],
    [
      { type: "time", temporal: { step: "0.001" }, message: "" },
      "12:30:45.123",
      true,
    ],
    [
      { type: "time", temporal: { step: "0.1" }, message: "" },
      "12:30:45.123",
      false,
    ],
    [{ type: "time", message: "" }, "12:30:01", false],
    [
      {
        type: "datetime-local",
        temporal: {
          min: "2026-10-15T09:15",
          max: "2026-10-15T17:15",
          step: "1800",
        },
        message: "",
      },
      "2026-10-15T09:45",
      true,
    ],
    [
      {
        type: "datetime-local",
        temporal: {
          min: "2026-10-15T09:15",
          max: "2026-10-15T17:15",
          step: "1800",
        },
        message: "",
      },
      "2026-10-15T09:30",
      false,
    ],
  ];
  for (const [rule, value, expected] of cases)
    assert.equal(valid(rule, value), expected, JSON.stringify({ rule, value }));
  for (const type of ["date", "time", "datetime-local"] as const) {
    for (const blank of [undefined, ""])
      assert.equal(valid({ type }, blank), true);
    for (const value of [null, false, 0, {}, []])
      assert.equal(valid({ type }, value), false);
  }
  assert.equal(valid({ type: "required" }, ""), false);
  for (const [kind, limits] of [
    ["date", { min: "2026-02-29" }],
    ["date", { min: "2026-10-20", max: "2026-10-15" }],
    ["time", { base: "24:00" }],
    ["datetime-local", { max: "2026-10-15T12:00Z" }],
    ...["0", "-1", "NaN", "Infinity", "1e999", "0.0001", " 60", "60x", "60\n", "any\n"].map(
      (step) => ["time", { step }],
    ),
  ] as [TemporalKind, object][]) {
    assert.ok(temporalConfigError(kind, limits));
    assert.equal(
      backendBlockSchema.safeParse({
        id: "v",
        type: "validation",
        label: "Limits",
        position: { x: 0, y: 0 },
        connections: [],
        config: {
          fieldName: "date",
          rules: [{ type: kind, temporal: limits, message: "Invalid" }],
        },
      }).success,
      false,
    );
  }
  assert.equal(
    temporalConfigError("time", { min: "22:00", max: "02:00", step: "ANY" }),
    "",
  );
});

test("guided temporal limits survive project history and compile into both server paths", () => {
  const project = emptyProject();
  restoreProject(project);
  const store = useEditorStore.getState(),
    form = store.addElement(templates.form);
  for (const [kind, props] of [
    [
      "dateInput",
      {
        name: "day",
        min: "2026-10-15",
        max: "2026-10-21",
        step: "2",
        value: "2026-10-15",
      },
    ],
    ["timeInput", { name: "time", min: "22:00", max: "02:00", step: "1800" }],
    [
      "dateTimeInput",
      {
        name: "appointment",
        min: "2026-10-15T09:15",
        max: "2026-10-15T17:15",
        step: "1800",
      },
    ],
  ] as const)
    store.addElement(
      {
        ...elementTemplate(kind),
        props: { ...elementTemplate(kind)!.props, ...props },
      },
      form,
    );
  createSubmissionDestination(form, "Temporal signups");
  const service = useBackendStore.getState().services[0];
  const checks = service.blocks.filter((b) => b.type === "validation");
  assert.equal(
    checks.filter((b) =>
      (b.config as ValidationConfig).rules.some((r) =>
        ["date", "time", "datetime-local"].includes(r.type),
      ),
    ).length,
    3,
  );
  const saved = captureProject(project.id, project.name);
  assert.deepEqual(
    compileProject(parseProject(saved)).diagnostics.filter(
      (d) => d.severity === "error",
    ),
    [],
  );
  store.undo();
  assert.equal(useBackendStore.getState().services.length, 0);
  store.redo();
  assert.deepEqual(
    captureProject(project.id, project.name).backend,
    saved.backend,
  );
  const legacy = structuredClone(service);
  const ids = new Set(checks.map((b) => b.id));
  for (const block of legacy.blocks)
    block.connections = block.connections.filter((id) => !ids.has(id));
  const exports: {
    validateRules?: (req: object, res: object, next: () => void) => void;
  } = {};
  runInNewContext(
    generateServiceCode(legacy)["temporal-signups/middleware/validate.js"],
    { exports },
  );
  for (const [body, expected] of [
    [
      { day: "2026-10-17", time: "01:30", appointment: "2026-10-15T09:45" },
      200,
    ],
    [{}, 200],
    [{ day: "2026-10-16" }, 400],
    [{ time: "12:00" }, 400],
    [{ appointment: "2026-10-15T09:30" }, 400],
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
    exports.validateRules!({ method: "POST", body }, res, () => {
      next = true;
    });
    assert.equal(status, expected);
    assert.equal(next, expected === 200);
  }
  const date = Object.values(useEditorStore.getState().elementsById).find(
    (n) => n.props.name === "day",
  )!;
  store.updateElement(date.id, { props: { step: "0" } });
  assert.match(
    submissionFields(
      form,
      useEditorStore.getState().elementsById,
    ).problems.join(" "),
    /Step/,
  );
  assert.throws(
    () => createSubmissionDestination(form, "Invalid dates"),
    /Step/,
  );
  assert.equal(useBackendStore.getState().services.length, 1);
});
