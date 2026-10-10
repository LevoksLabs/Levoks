import test from "node:test";
import assert from "node:assert/strict";
import { runInNewContext } from "node:vm";
import {
  emptyProject,
  restoreProject,
  captureProject,
} from "../src/lib/project/workspace";
import { parseProject } from "../src/lib/project/schema";
import { compileProject } from "../src/lib/project/compiler";
import { elementTemplate } from "../src/lib/elements/registry";
import { editChoiceGroup } from "../src/lib/elements/radio-group";
import {
  selectionLimits,
  selectionCount,
} from "../src/lib/elements/selection-limits";
import { useEditorStore } from "../src/store/editorStore";
import { templates } from "../src/templates";
import {
  submissionFields,
  createSubmissionDestination,
} from "../src/lib/form-destination";
import { editFormCondition } from "../src/lib/edit-form-condition";
import { formValueRuntime } from "../src/lib/codegen/form-values";
import { VALIDATION_RUNTIME } from "../src/lib/backend/validation";

test("selection limits reject corrupt bounds and defaults atomically, preserve history and guard enabled capacity", () => {
  for (const invalid of [-1, 201, 1.5, "1e2", " ", null, true])
    assert.throws(() => selectionCount(invalid));
  assert.deepEqual(selectionLimits({ required: true, minSelections: "0" }), {
    min: 1,
    max: undefined,
  });
  assert.throws(
    () => selectionLimits({ required: true, maxSelections: 0 }),
    /including Required/,
  );
  const project = emptyProject();
  restoreProject(project);
  const store = useEditorStore.getState(),
    form = store.addElement(templates.form);
  const group = store.addElement(elementTemplate("checkboxGroup"), form);
  editChoiceGroup(group, {
    type: "limits",
    minSelections: "2",
    maxSelections: "2",
  });
  assert.ok(
    submissionFields(
      form,
      useEditorStore.getState().elementsById,
    ).problems.some((message) => /minimum of 2/.test(message)),
  );
  const choices = ["web", "app", "automation"].map((value) =>
    editChoiceGroup(group, { type: "add", label: value, value })!,
  );
  const before = useEditorStore.getState().elementsById;
  assert.throws(
    () =>
      editChoiceGroup(group, {
        type: "limits",
        minSelections: "3",
        maxSelections: "2",
      }),
    /Maximum/,
  );
  assert.equal(useEditorStore.getState().elementsById, before);
  editChoiceGroup(group, {
    type: "limits",
    minSelections: "1",
    maxSelections: "1",
  });
  store.undo();
  assert.equal(
    useEditorStore.getState().elementsById[group].props.minSelections,
    "2",
  );
  store.redo();
  assert.equal(
    useEditorStore.getState().elementsById[group].props.maxSelections,
    "1",
  );
  editChoiceGroup(group, { type: "default", id: choices[0], checked: true });
  assert.throws(
    () =>
      editChoiceGroup(group, {
        type: "default",
        id: choices[1],
        checked: true,
      }),
    /defaults/,
  );
  assert.throws(
    () =>
      editChoiceGroup(group, {
        type: "limits",
        minSelections: "0",
        maxSelections: "0",
      }),
    /defaults/,
  );
  editChoiceGroup(group, {
    type: "limits",
    minSelections: "2",
    maxSelections: "2",
  });
  createSubmissionDestination(form, "Selection enquiries");
  const saved = parseProject(captureProject(project.id, project.name));
  const validation = saved.backend.services[0].blocks.find(
    (block) =>
      block.type === "validation" &&
      block.config.fieldName === saved.editor.elementsById[group].props.name,
  )!;
  assert.equal(validation.type, "validation");
  if (validation.type !== "validation") throw new Error("Validation");
  assert.deepEqual(
    validation.config.rules
      .filter((rule) => /Items$/.test(rule.type))
      .map((rule) => [rule.type, rule.value]),
    [
      ["minItems", 2],
      ["maxItems", 2],
    ],
  );
  assert.deepEqual(
    compileProject(saved).diagnostics.filter((d) => d.severity === "error"),
    [],
  );
  editChoiceGroup(group, {
    type: "limits",
    minSelections: "1",
    maxSelections: "3",
  });
  assert.deepEqual(
    captureProject(project.id, project.name).backend,
    saved.backend,
    "Existing rules remain explicit snapshots.",
  );
  const insufficient = structuredClone(saved);
  for (const id of choices.slice(1))
    insufficient.editor.elementsById[id].props.disabled = true;
  assert.ok(
    compileProject(insufficient).diagnostics.some(
      (d) =>
        d.code === "INVALID_CONTRACT_MAPPING" && /at least 2/.test(d.message),
    ),
  );
  for (const bound of ["minSelections", "maxSelections"]) {
    const corrupt = structuredClone(saved);
    corrupt.editor.elementsById[group].props[bound] = "201";
    assert.throws(() => parseProject(corrupt), /Selection limits/);
  }
  for (const invalid of [undefined, "", "2.5", "-1", 201]) {
    const corrupt = structuredClone(saved);
    const ruleBlock = corrupt.backend.services[0].blocks.find(
      (block) => block.id === validation.id,
    )!;
    if (ruleBlock.type !== "validation") throw new Error("Validation");
    ruleBlock.config.rules.find((rule) => rule.type === "minItems")!.value =
      invalid;
    assert.throws(() => parseProject(corrupt), /selection counts/);
  }
  store.duplicateElement(group);
  assert.equal(
    useEditorStore.getState().elementsById[
      useEditorStore.getState().selectedElementId!
    ].props.maxSelections,
    "3",
  );
});

test("conditional minimum selections stay in the active branch and do not make the hidden endpoint field mandatory", () => {
  const project = emptyProject();
  restoreProject(project);
  const store = useEditorStore.getState(),
    form = store.addElement(templates.form);
  const source = store.addElement(
    {
      ...elementTemplate("checkbox"),
      props: { ...elementTemplate("checkbox").props, name: "business" },
    },
    form,
  );
  const group = store.addElement(elementTemplate("checkboxGroup"), form);
  editChoiceGroup(group, { type: "group", name: "services", required: false });
  for (const value of ["web", "app"])
    editChoiceGroup(group, { type: "add", label: value, value });
  editChoiceGroup(group, {
    type: "limits",
    minSelections: "2",
    maxSelections: "2",
  });
  editFormCondition(group, { sourceId: source, checked: true });
  createSubmissionDestination(form, "Conditional selections");
  const saved = parseProject(captureProject(project.id, project.name)),
    blocks = saved.backend.services[0].blocks;
  const endpoint = blocks.find((block) => block.type === "rest_endpoint")!;
  assert.equal(
    endpoint.type === "rest_endpoint" &&
      endpoint.config.requestBody.find((field) => field.name === "services")
        ?.required,
    false,
  );
  const active = blocks.find(
    (block) =>
      block.type === "validation" &&
      block.config.fieldName === "services" &&
      block.config.rules.some((rule) => rule.type === "minItems"),
  )!;
  assert.ok(
    blocks.some(
      (block) =>
        block.type === "logic_if" &&
        block.config.program?.thenSteps.includes(active.id),
    ),
  );
  assert.ok(!endpoint.connections.includes(active.id));
  assert.deepEqual(
    compileProject(saved).diagnostics.filter((d) => d.severity === "error"),
    [],
  );
});

test("shared browser and server counts reject under/over selection and wrong types, preserve optional zero and consent", () => {
  const value = runInNewContext(formValueRuntime + "; formControlValue");
  const form = {};
  let focus = -1;
  const choices = ["web", "app", "automation"].map((name, index) => ({
    form,
    value: name,
    checked: false,
    matches: () => false,
    focus: () => {
      focus = index;
    },
  }));
  const group = {
    dataset: { checkboxGroup: "true", checkboxMin: "2", checkboxMax: "2" },
    matches: () => false,
    querySelectorAll: () => choices,
    querySelector: () => ({ textContent: "Project services" }),
  };
  assert.throws(() => value(group, form), /at least 2.*Project services/);
  assert.equal(focus, 0);
  choices[0].checked = true;
  assert.throws(() => value(group, form), /at least 2/);
  choices[1].checked = true;
  assert.deepEqual(Array.from(value(group, form)), ["web", "app"]);
  choices[2].checked = true;
  assert.throws(() => value(group, form), /at most 2/);
  assert.equal(focus, 0);
  assert.ok(
    choices.every((choice) => choice.checked),
    "Failed validation preserves selections.",
  );
  assert.equal(value({ ...group, disabled: true }, form), undefined);
  group.dataset.checkboxMin = "0";
  group.dataset.checkboxMax = "0";
  choices.forEach((choice) => {
    choice.checked = false;
  });
  assert.equal(value(group, form), undefined);
  const valid = runInNewContext(VALIDATION_RUNTIME + "; validationRuleValid");
  for (const invalid of [undefined, [], ["web"], "web", true, 2, null, {}])
    assert.equal(valid({ type: "minItems", value: 2 }, invalid, true), false);
  assert.equal(valid({ type: "minItems", value: 2 }, ["web", "app"]), true);
  assert.equal(
    valid({ type: "maxItems", value: 2 }, ["web", "app", "automation"]),
    false,
  );
  assert.equal(valid({ type: "maxItems", value: 2 }, "web", true), false);
  assert.equal(valid({ type: "minItems", value: 0 }, undefined), true);
  assert.equal(valid({ type: "maxItems", value: 0 }, undefined), true);
  assert.equal(value({ type: "checkbox", checked: false }, form), false);
});
