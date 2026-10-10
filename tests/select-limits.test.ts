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
import {
  selectChoiceProps,
  selectChoices,
  selectOptionProps,
  validateSelectMetadata,
} from "../src/lib/elements/select-options";
import { nativeMarkup, nativeTree } from "../src/lib/elements/native";
import { useEditorStore } from "../src/store/editorStore";
import { templates } from "../src/templates";
import {
  submissionFields,
  createSubmissionDestination,
} from "../src/lib/form-destination";
import { editFormCondition } from "../src/lib/edit-form-condition";
import { formValueRuntime } from "../src/lib/codegen/form-values";
import type { ElementNode } from "../src/types";

const props = {
  multiple: true,
  options: "web\napp\nautomation",
  selectedValues: "web\napp",
  minSelections: "2",
  maxSelections: "2",
  label: "Project services",
  helperText: "Choose your priorities.",
};

test("multiple select bounds guard defaults, imports, mode changes and enabled capacity without changing existing backend snapshots", () => {
  for (const patch of [
    { minSelections: "3" },
    { maxSelections: "1" },
    { maxSelections: "201" },
    { minSelections: "-1" },
    {
      required: true,
      minSelections: "0",
      maxSelections: "0",
      selectedValues: "",
    },
  ])
    assert.throws(() => validateSelectMetadata({ ...props, ...patch }));
  assert.throws(
    () =>
      selectChoiceProps(
        { ...props, selectedValues: "web\napp\nautomation" },
        selectChoices(props),
      ),
    /Default selections/,
  );
  assert.throws(
    () =>
      selectOptionProps(
        { ...props, selectedValues: "web\napp\nautomation" },
        props.options.split("\n"),
      ),
    /Default selections/,
  );
  const disabled = selectChoiceProps(
    props,
    selectChoices(props).map((choice) => ({
      ...choice,
      disabled: choice.value === "app",
    })),
  );
  assert.equal(
    disabled.selectedValues,
    "web",
    "Removing a default remains possible below the minimum.",
  );
  assert.doesNotThrow(
    () =>
      validateSelectMetadata({
        ...props,
        multiple: false,
        minSelections: "3",
        maxSelections: "0",
      }),
    "Single select ignores dormant bounds.",
  );
  const project = emptyProject();
  restoreProject(project);
  const store = useEditorStore.getState(),
    form = store.addElement(templates.form),
    id = store.addElement(elementTemplate("multiSelect"), form);
  store.updateElement(id, { props: { ...props, name: "services" } });
  store.updateElement(id, {
    props: { minSelections: "1", maxSelections: "3" },
  });
  store.undo();
  assert.equal(
    useEditorStore.getState().elementsById[id].props.maxSelections,
    "2",
  );
  store.redo();
  assert.equal(
    useEditorStore.getState().elementsById[id].props.maxSelections,
    "3",
  );
  store.undo();
  createSubmissionDestination(form, "Select limits");
  const saved = parseProject(captureProject(project.id, project.name));
  const validation = saved.backend.services[0].blocks.find(
    (block) =>
      block.type === "validation" && block.config.fieldName === "services",
  )!;
  if (validation.type !== "validation") throw new Error("Validation missing");
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
  for (const bound of ["minSelections", "maxSelections"]) {
    const corrupt = structuredClone(saved);
    corrupt.editor.elementsById[id].props[bound] = "201";
    assert.throws(() => parseProject(corrupt), /Selection limits/);
  }
  const corrupt = structuredClone(saved);
  corrupt.editor.elementsById[id].props.selectedValues = props.options;
  assert.throws(() => parseProject(corrupt), /Default selections/);
  const insufficient = structuredClone(saved);
  Object.assign(insufficient.editor.elementsById[id].props, {
    selectedValues: "web",
    optionGroups: "\nUnavailable\nUnavailable",
    disabledGroups: "Unavailable",
  });
  assert.ok(
    submissionFields(
      form,
      insufficient.editor.elementsById as Record<string, ElementNode>,
    ).problems.some((message) => /minimum of 2/.test(message)),
  );
  assert.ok(
    compileProject(insufficient).diagnostics.some(
      (d) =>
        d.code === "INVALID_CONTRACT_MAPPING" && /at least 2/.test(d.message),
    ),
  );
  store.updateElement(id, {
    props: { minSelections: "1", maxSelections: "3" },
  });
  assert.deepEqual(
    captureProject(project.id, project.name).backend,
    saved.backend,
  );
  store.duplicateElement(id);
  assert.equal(
    useEditorStore.getState().elementsById[
      useEditorStore.getState().selectedElementId!
    ].props.maxSelections,
    "3",
  );
  // Both select definitions permit switching modes, without unknown default props on import.
  const single = store.addElement(elementTemplate("select"));
  store.updateElement(single, { props: { ...props, multiple: true } });
  assert.doesNotThrow(() =>
    parseProject(captureProject(project.id, project.name)),
  );
});

test("conditional select limits only require the array in the active branch", () => {
  const project = emptyProject();
  restoreProject(project);
  const store = useEditorStore.getState(),
    form = store.addElement(templates.form);
  const source = store.addElement(elementTemplate("checkbox"), form);
  const group = store.addElement(elementTemplate("formField"), form);
  const select = store.addElement(elementTemplate("multiSelect"), group);
  store.updateElement(source, { props: { name: "business" } });
  store.updateElement(select, { props: { ...props, name: "services" } });
  editFormCondition(group, { sourceId: source, checked: true });
  createSubmissionDestination(form, "Conditional select limits");
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

test("selection instructions stay associated with the native control and preserve authored help in HTML and React", () => {
  restoreProject(emptyProject());
  const store = useEditorStore.getState(),
    id = store.addElement(elementTemplate("multiSelect"));
  const element = {
    ...useEditorStore.getState().elementsById[id],
    id: "topics",
    props: { ...props, required: false },
  };
  for (const mode of ["html", "jsx"] as const) {
    const markup = nativeMarkup(nativeTree(element), mode);
    assert.match(markup, /data-selection-min="2"/);
    assert.match(markup, /data-selection-max="2"/);
    assert.match(markup, /aria-describedby="topics-help"/);
    assert.match(markup, /required/);
    assert.match(markup, /Choose your priorities\. Select exactly 2 options\./);
  }
  const single = nativeMarkup(
    nativeTree({ ...element, props: { ...props, multiple: false } }),
    "html",
  );
  assert.doesNotMatch(single, /data-selection-|Select exactly|required/);
});

test("multiple select runtime counts enabled options, focuses errors, keeps failed values and preserves optional empty arrays", () => {
  const read = runInNewContext(formValueRuntime + "; formControlValue");
  let focused = 0;
  const option = (value: string, disabled = false, groupDisabled = false) => ({
    value,
    disabled,
    closest: () => (groupDisabled ? {} : null),
  });
  const input = {
    tagName: "SELECT",
    multiple: true,
    name: "services",
    labels: [{ textContent: "Project services" }],
    dataset: { selectionMin: "2", selectionMax: "2" },
    selectedOptions: [option("web")],
    matches: () => false,
    focus: () => focused++,
  };
  assert.throws(() => read(input, {}), /at least 2.*Project services/);
  assert.equal(focused, 1);
  input.selectedOptions.push(option("app"));
  assert.deepEqual(Array.from(read(input, {})), ["web", "app"]);
  input.selectedOptions.push(option("automation"));
  assert.throws(() => read(input, {}), /at most 2/);
  assert.equal(input.selectedOptions.length, 3);
  assert.equal(focused, 2);
  input.selectedOptions = [
    option("web"),
    option("app", true),
    option("automation", false, true),
  ];
  assert.throws(() => read(input, {}), /at least 2/);
  assert.equal(read({ ...input, disabled: true }, {}), undefined);
  assert.deepEqual(
    Array.from(read({ ...input, dataset: {}, selectedOptions: [] }, {})),
    [],
  );
  assert.deepEqual(
    Array.from(
      read(
        {
          ...input,
          dataset: { selectionMin: "0", selectionMax: "0" },
          selectedOptions: [],
        },
        {},
      ),
    ),
    [],
  );
  assert.throws(
    () =>
      read(
        {
          ...input,
          dataset: { selectionMax: "0" },
          selectedOptions: [option("web")],
        },
        {},
      ),
    /at most 0/,
  );
});
