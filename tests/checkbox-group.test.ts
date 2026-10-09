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
import { useEditorStore } from "../src/store/editorStore";
import { useRoutingStore } from "../src/store/routingStore";
import { templates } from "../src/templates";
import {
  submissionFields,
  createSubmissionDestination,
  suggestedFormMappings,
} from "../src/lib/form-destination";
import { compatibleFormField } from "../src/lib/contracts";
import { formValueRuntime } from "../src/lib/codegen/form-values";
import { VALIDATION_RUNTIME } from "../src/lib/backend/validation";

test("checkbox groups keep independent defaults, stable array mappings and snapshots through edits, history and copies", () => {
  const project = emptyProject();
  restoreProject(project);
  const store = useEditorStore.getState(),
    form = store.addElement(templates.form);
  const group = store.addElement(elementTemplate("checkboxGroup"), form);
  editChoiceGroup(group, { type: "group", name: "interests", required: true });
  const invalidEmpty = structuredClone(
    captureProject(project.id, project.name),
  );
  invalidEmpty.editor.elementsById[group].props.name = "9invalid";
  assert.throws(() => parseProject(invalidEmpty), /valid field name/);
  assert.throws(() => createSubmissionDestination(form, "Empty choices"));
  assert.deepEqual(
    captureProject(project.id, project.name).backend,
    project.backend,
  );
  const first = editChoiceGroup(group, {
    type: "add",
    label: "Website design",
    value: "website",
  })!;
  const second = editChoiceGroup(group, {
    type: "add",
    label: "Application design",
    value: "app",
  })!;
  const disabled = editChoiceGroup(group, {
    type: "add",
    label: "Unavailable",
    value: "unavailable",
  })!;
  for (const id of [first, second, disabled])
    editChoiceGroup(group, { type: "default", id, checked: true });
  editChoiceGroup(group, { type: "disabled", id: disabled, disabled: true });
  let nodes = useEditorStore.getState().elementsById;
  assert.equal(nodes[first].props.checked, true);
  assert.equal(nodes[second].props.checked, true);
  assert.equal(nodes[disabled].props.checked, false);
  editChoiceGroup(group, { type: "disabled", id: disabled, disabled: false });
  assert.equal(
    useEditorStore.getState().elementsById[disabled].props.checked,
    false,
  );
  editChoiceGroup(group, { type: "disabled", id: disabled, disabled: true });
  assert.equal(nodes[first].props.required, false);
  assert.throws(
    () =>
      editChoiceGroup(group, { type: "default", id: disabled, checked: true }),
    /Enable/,
  );
  const analysis = submissionFields(form, nodes);
  assert.deepEqual(analysis.problems, []);
  assert.deepEqual(
    analysis.fields.find(({ input }) => input.id === group)?.field,
    { id: group, name: "interests", type: "array", required: true },
  );
  assert.equal(
    analysis.fields.find(({ input }) => input.id === group)?.choices,
    "website\napp",
  );
  assert.equal(
    analysis.fields.filter(({ input }) => [first, second].includes(input.id))
      .length,
    0,
  );
  assert.ok(
    compatibleFormField(nodes[group], { type: "array", location: "body" }),
  );
  assert.ok(
    !compatibleFormField(nodes[group], { type: "boolean", location: "body" }),
  );
  assert.ok(
    !compatibleFormField(nodes[group], { type: "array", location: "query" }),
  );
  createSubmissionDestination(form, "Checkbox enquiries");
  const before = captureProject(project.id, project.name),
    wires = before.routing.connections;
  const endpoint = before.backend.services[0].blocks.find(
    (block) => block.type === "rest_endpoint",
  )!;
  if (endpoint.type !== "rest_endpoint") throw new Error("Endpoint");
  assert.equal(
    suggestedFormMappings(form, nodes, endpoint.config).find(
      (mapping) => mapping.fieldId === group,
    )?.source.kind,
    "element",
  );
  assert.ok(
    before.backend.services[0].blocks.some(
      (block) =>
        block.type === "validation" &&
        block.config.fieldName === "interests" &&
        block.config.rules.some((rule) => rule.type === "required") &&
        !block.config.rules.some((rule) => rule.type === "accepted"),
    ),
  );
  editChoiceGroup(group, { type: "move", id: second, offset: -1 });
  editChoiceGroup(group, {
    type: "choice",
    id: second,
    label: "Business app",
    value: "business",
  });
  editChoiceGroup(group, { type: "remove", id: first });
  assert.deepEqual(useRoutingStore.getState().connections, wires);
  store.undo();
  assert.ok(useEditorStore.getState().elementsById[first]);
  store.redo();
  assert.throws(
    () => editChoiceGroup(group, { type: "remove", id: second }),
    /Disconnect/,
  );
  const saved = parseProject(captureProject(project.id, project.name));
  assert.deepEqual(saved.backend, before.backend);
  assert.deepEqual(
    compileProject(saved).diagnostics.filter((d) => d.severity === "error"),
    [],
  );
  const childMapping = structuredClone(saved);
  const allDisabled = structuredClone(saved);
  for (const id of allDisabled.editor.elementsById[group].children)
    Object.assign(allDisabled.editor.elementsById[id].props, {
      disabled: true,
      checked: false,
    });
  assert.ok(
    compileProject(allDisabled).diagnostics.some(
      (d) =>
        d.code === "INVALID_CONTRACT_MAPPING" &&
        /enabled choice/.test(d.message),
    ),
  );
  childMapping.routing.connections[0].requestMappings!.find(
    (mapping) => mapping.fieldId === group,
  )!.source = { kind: "element", elementId: second };
  assert.ok(
    compileProject(childMapping).diagnostics.some(
      (d) => d.code === "INVALID_CONTRACT_MAPPING" && d.severity === "error",
    ),
  );
  for (const edit of [
    { type: "add", label: "Duplicate", value: "business" },
    { type: "add", label: "", value: "blank" },
    { type: "group", name: "9wrong", required: true },
  ] as const) {
    nodes = useEditorStore.getState().elementsById;
    assert.throws(() => editChoiceGroup(group, edit));
    assert.equal(useEditorStore.getState().elementsById, nodes);
  }
  store.duplicateElement(group);
  const copy = useEditorStore.getState().selectedElementId!;
  nodes = useEditorStore.getState().elementsById;
  assert.notEqual(nodes[copy].props.name, "interests");
  assert.ok(
    nodes[copy].children.every(
      (id) => nodes[id].props.name === nodes[copy].props.name,
    ),
  );
  store.toggleLock(group);
  assert.throws(
    () => editChoiceGroup(group, { type: "remove", id: disabled }),
    /Unlock/,
  );
  store.toggleLock(group);
  store.saveComponent(group, "Interests");
  assert.throws(
    () => editChoiceGroup(group, { type: "remove", id: disabled }),
    /Detach/,
  );
  store.detachComponent(group);
  const corrupt = structuredClone(saved);
  corrupt.editor.elementsById[second].props.required = true;
  assert.throws(() => parseProject(corrupt), /Required belongs/);
  const duplicate = structuredClone(saved);
  duplicate.editor.elementsById[disabled].props.value = "business";
  assert.throws(() => parseProject(duplicate), /unique/);
  const linked = captureProject(project.id, project.name);
  const definition = Object.values(linked.editor.components!)[0];
  const child = Object.values(definition.nodes).find(
    (node) => node.definitionId === "checkbox",
  )!;
  child.props.name = "wrong";
  assert.throws(() => parseProject(linked), /Apply the checkbox/);
});

test("shared checkbox runtime excludes disabled choices, omits empty optional groups and focuses missing required groups while preserving boolean consent", () => {
  const value = runInNewContext(formValueRuntime + "; formControlValue");
  const form = {},
    choices = [
      {
        type: "checkbox",
        form,
        checked: true,
        value: "web",
        matches: () => false,
      },
      {
        type: "checkbox",
        form,
        checked: true,
        value: "app",
        matches: () => false,
      },
      {
        type: "checkbox",
        form,
        checked: true,
        value: "disabled",
        disabled: true,
      },
      {
        type: "checkbox",
        form,
        checked: true,
        value: "ancestor-disabled",
        matches: () => true,
      },
      { type: "checkbox", form: {}, checked: true, value: "foreign" },
    ];
  let focused = false;
  const group = {
    name: "interests",
    dataset: { checkboxGroup: "true", checkboxRequired: "true" },
    matches: () => false,
    querySelectorAll: () => choices,
    querySelector: () => ({ textContent: "Project interests" }),
  };
  Object.assign(choices[0], {
    focus: () => {
      focused = true;
    },
  });
  assert.deepEqual(Array.from(value(group, form)), ["web", "app"]);
  choices[0].checked = choices[1].checked = false;
  assert.throws(
    () => value(group, form),
    /Choose at least one.*Project interests/,
  );
  assert.ok(focused);
  group.dataset.checkboxRequired = "false";
  assert.equal(value(group, form), undefined);
  assert.equal(value({ ...group, disabled: true }, form), undefined);
  assert.equal(value({ type: "checkbox", checked: false }, form), false);
  const valid = runInNewContext(VALIDATION_RUNTIME + "; validationRuleValid");
  const rule = { type: "oneOf", value: "web\napp" };
  for (const invalid of [
    ["Website design"],
    ["web", "web"],
    ["unavailable"],
    [true],
  ])
    assert.equal(valid(rule, invalid), false);
  assert.equal(valid(rule, ["web", "app"]), true);
  assert.equal(valid({ type: "required" }, []), false);
});
