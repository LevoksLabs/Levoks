import test from "node:test";
import assert from "node:assert/strict";
import {
  selectChoices,
  selectChoiceProps,
  selectOptionProps,
  validateSelectMetadata,
} from "../src/lib/elements/select-options";
import {
  emptyProject,
  restoreProject,
  captureProject,
} from "../src/lib/project/workspace";
import { useEditorStore } from "../src/store/editorStore";
import { projectHistory } from "../src/store/projectHistory";
import { elementTemplate } from "../src/lib/elements/registry";
import { parseProject } from "../src/lib/project/schema";
import { compileProject } from "../src/lib/project/compiler";
import { nativeMarkup, nativeTree } from "../src/lib/elements/native";
import {
  createSubmissionDestination,
  submissionFields,
} from "../src/lib/form-destination";
import { templates } from "../src/templates";

test("native option groups retain order, defaults and metadata through history, storage snapshots and both export syntaxes", () => {
  const project = emptyProject();
  restoreProject(project);
  const editor = useEditorStore.getState(),
    form = editor.addElement(templates.form),
    id = editor.addElement(elementTemplate("multiSelect"), form);
  const choices = [
    {
      value: "design",
      label: "Product design",
      disabled: false,
      group: "Tools <script> & {text}",
    },
    {
      value: "automation",
      label: "Workflow automation",
      disabled: false,
      group: "Tools <script> & {text}",
    },
    { value: "data", label: "Database design", disabled: false, group: "" },
    {
      value: "legacy",
      label: "Legacy systems",
      disabled: false,
      group: "Unavailable",
    },
    {
      value: "retired",
      label: "Retired option",
      disabled: true,
      group: "Unavailable",
    },
  ];
  const initial = selectChoiceProps(
    {
      multiple: true,
      selectedValues: "design\ndata",
      disabledGroups: "Unavailable",
    },
    choices,
  );
  editor.updateElement(id, {
    props: { ...initial, name: "topics", required: true },
  });
  const analysis = submissionFields(
    form,
    useEditorStore.getState().elementsById,
  );
  assert.deepEqual(analysis.problems, []);
  assert.equal(
    analysis.fields.find((field) => field.input.id === id)!.choices,
    "design\nautomation\ndata",
  );
  createSubmissionDestination(form, "Grouped choices");
  const snapshot = captureProject(project.id, project.name);
  const current = useEditorStore.getState().elementsById[id].props;
  const disabled = selectChoiceProps(
    { ...current, disabledGroups: "Unavailable\nTools <script> & {text}" },
    selectChoices(current),
  );
  editor.updateElement(id, { props: disabled });
  assert.equal(
    useEditorStore.getState().elementsById[id].props.selectedValues,
    "data",
  );
  assert.equal(
    selectChoices(useEditorStore.getState().elementsById[id].props)[0]
      .groupDisabled,
    true,
  );
  projectHistory.undo();
  assert.deepEqual(useEditorStore.getState().elementsById[id].props, current);
  projectHistory.redo();
  assert.equal(
    useEditorStore.getState().elementsById[id].props.selectedValues,
    "data",
  );
  projectHistory.undo();
  const saved = parseProject(captureProject(project.id, project.name));
  assert.deepEqual(saved.backend, snapshot.backend);
  assert.deepEqual(saved.routing, snapshot.routing);
  assert.deepEqual(
    compileProject(saved).diagnostics.filter((d) => d.severity === "error"),
    [],
  );
  restoreProject(saved);
  const tree = nativeTree(useEditorStore.getState().elementsById[id]),
    html = nativeMarkup(tree, "html"),
    jsx = nativeMarkup(tree, "jsx");
  assert.match(
    html,
    /<optgroup label="Tools &lt;script&gt; &amp; &#123;text&#125;">/,
  );
  assert.match(
    html,
    /<option value="design" selected>Product design<\/option>/,
  );
  assert.match(html, /<option value="data" selected>Database design<\/option>/);
  assert.match(
    html,
    /<optgroup label="Unavailable" disabled><option value="legacy">/,
  );
  assert.match(jsx, /defaultValue=\{\["design","data"\]\}/);
  assert.equal((html.match(/<optgroup /g) || []).length, 2);
  const bulk = selectOptionProps(current, [
    "data",
    "automation",
    "design",
    "legacy",
    "retired",
  ]);
  assert.equal(
    bulk.optionGroups,
    "\nTools <script> & {text}\nTools <script> & {text}\nUnavailable\nUnavailable",
  );
  assert.equal(bulk.disabledGroups, "Unavailable");
  assert.equal(
    selectOptionProps(current, ["design", "automation", "data"]).disabledGroups,
    "",
  );
  const renamed = selectOptionProps(
    current,
    ["product", "automation", "data", "legacy", "retired"],
    ["design", "product"],
  );
  assert.equal(selectChoices(renamed)[0].group, choices[0].group);
  assert.equal(renamed.selectedValues, "product\ndata");
  // Preserve authored order even when a group name occurs in separate runs.
  const split = {
    ...useEditorStore.getState().elementsById[id],
    props: {
      ...current,
      optionGroups: "Tools\n\nTools\nUnavailable\nUnavailable",
    },
  };
  const ordered = nativeMarkup(nativeTree(split), "html");
  assert.equal((ordered.match(/label="Tools"/g) || []).length, 2);
  assert.ok(
    ordered.indexOf('value="design"') < ordered.indexOf('value="automation"') &&
      ordered.indexOf('value="automation"') < ordered.indexOf('value="data"'),
  );
  const single = selectChoiceProps(
    { value: "design", disabledGroups: choices[0].group },
    choices,
  );
  assert.equal(single.value, "");
  editor.updateElement(id, {
    props: selectChoiceProps(
      {
        ...current,
        disabledGroups: "Unavailable\nTools <script> & {text}\nData",
      },
      choices.map((choice) => ({ ...choice, group: choice.group || "Data" })),
    ),
  });
  assert.match(
    submissionFields(
      form,
      useEditorStore.getState().elementsById,
    ).problems.join(" "),
    /allowed values/,
  );
  assert.throws(
    () => createSubmissionDestination(form, "No enabled groups"),
    /allowed values/,
  );
  assert.deepEqual(
    captureProject(project.id, project.name).backend,
    snapshot.backend,
  );
});

test("option group imports reject malformed, oversized and disabled-default metadata in elements and reusable definitions", () => {
  const base = {
    options: "one\ntwo\nthree",
    optionGroups: "\nTools\nTools",
    value: "one",
  };
  assert.doesNotThrow(() => validateSelectMetadata(base));
  for (const patch of [
    { optionGroups: "Tools" },
    { optionGroups: "\n \nTools" },
    { optionGroups: "\nTools\r\nTools" },
    { optionGroups: "\n" + "x".repeat(101) + "\nTools" },
    { disabledGroups: "Missing" },
    { disabledGroups: "Tools\nTools" },
    { disabledGroups: "Tools", value: "two" },
    { disabledGroups: "Tools", multiple: true, selectedValues: "three" },
  ])
    assert.throws(() => validateSelectMetadata({ ...base, ...patch }));
  assert.throws(() =>
    selectChoiceProps({}, [
      { value: "one", label: "One", disabled: false, group: "Bad\nGroup" },
    ]),
  );
  assert.throws(() =>
    selectChoiceProps(
      {},
      Array.from({ length: 101 }, (_, i) => ({
        value: String(i),
        label: String(i),
        disabled: false,
        group: "x".repeat(100),
      })),
    ),
  );
  const project = emptyProject();
  restoreProject(project);
  const editor = useEditorStore.getState(),
    id = editor.addElement(elementTemplate("select"));
  editor.updateElement(id, { props: base });
  const valid = captureProject(project.id, project.name);
  const invalid = structuredClone(valid);
  invalid.editor.elementsById[id].props.disabledGroups = "Missing";
  assert.throws(() => parseProject(invalid));
  assert.throws(() => compileProject(invalid));
  editor.saveComponent(id, "Grouped choices");
  const component = captureProject(project.id, project.name),
    definition = Object.values(component.editor.components!)[0];
  definition.nodes[definition.rootId].props.disabledGroups = "Tools";
  definition.nodes[definition.rootId].props.value = "two";
  assert.throws(() => parseProject(component), /disabled group/);
  const old = { options: "one\ntwo", value: "one" };
  assert.deepEqual(selectOptionProps(old, ["one", "two"]), old);
  assert.deepEqual(
    selectChoices(old).map((choice) => choice.group),
    [undefined, undefined],
  );
});
