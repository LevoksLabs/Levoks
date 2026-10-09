import test from "node:test";
import assert from "node:assert/strict";
import {
  selectChoiceProps,
  selectChoices,
  selectOptionProps,
  validateSelectMetadata,
} from "../src/lib/elements/select-options";
import {
  createSubmissionDestination,
  submissionFields,
} from "../src/lib/form-destination";
import { templates } from "../src/templates";
import { runInNewContext } from "node:vm";
import { formValueRuntime } from "../src/lib/codegen/form-values";
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

test("visual select edits keep defaults atomic, bounded, undoable and compiler-compatible", () => {
  assert.deepEqual(
    selectOptionProps({ value: "One" }, ["First", "Two"], ["One", "First"]),
    { options: "First\nTwo", value: "First" },
  );
  assert.deepEqual(selectOptionProps({ value: "One" }, ["Two"]), {
    options: "Two",
    value: "",
  });
  assert.deepEqual(
    selectOptionProps(
      { multiple: true, selectedValues: "Two\nOne" },
      ["First", "Two"],
      ["One", "First"],
    ),
    { options: "First\nTwo", selectedValues: "Two\nFirst" },
  );
  assert.deepEqual(
    selectOptionProps({ multiple: true, selectedValues: "Two\nOne" }, []),
    { options: "", selectedValues: "" },
  );
  for (const options of [
    [""],
    ["One", "One"],
    ["One\nTwo"],
    ["One\rTwo"],
    ["a".repeat(10001)],
    Array.from({ length: 201 }, (_, i) => String(i)),
  ])
    assert.throws(() => selectOptionProps({}, options));
  const project = emptyProject();
  restoreProject(project);
  const editor = useEditorStore.getState();
  const id = editor.addElement({
    ...elementTemplate("multiSelect")!,
    props: {
      ...elementTemplate("multiSelect")!.props,
      options: "One\nTwo",
      selectedValues: "One\nTwo",
    },
  });
  const original = { ...useEditorStore.getState().elementsById[id].props };
  editor.updateElement(id, {
    props: selectOptionProps(original, ["First", "Two"], ["One", "First"]),
  });
  assert.equal(
    useEditorStore.getState().elementsById[id].props.selectedValues,
    "First\nTwo",
  );
  projectHistory.undo();
  assert.deepEqual(useEditorStore.getState().elementsById[id].props, original);
  projectHistory.redo();
  const saved = parseProject(captureProject(project.id, project.name));
  const compiled = compileProject(saved);
  assert.deepEqual(
    compiled.diagnostics.filter((item) => item.severity === "error"),
    [],
  );
  restoreProject(saved);
  const node = useEditorStore.getState().elementsById[id];
  assert.match(
    nativeMarkup(nativeTree(node), "jsx"),
    /defaultValue=\{\["First","Two"\]\}/,
  );
  assert.equal(
    (nativeMarkup(nativeTree(node), "html").match(/ selected/g) || []).length,
    2,
  );
});

test("select labels and disabled choices follow values through edits, defaults, history and export without changing existing backend snapshots", () => {
  const project = emptyProject();
  restoreProject(project);
  const editor = useEditorStore.getState(),
    form = editor.addElement(templates.form);
  const id = editor.addElement(elementTemplate("multiSelect"), form);
  const props = { multiple: true, selectedValues: "design\nautomation" };
  const choices = [
    {
      value: "design",
      label: "Product design <script> & {text}",
      disabled: false,
    },
    { value: "automation", label: "Workflow automation", disabled: false },
    { value: "unavailable", label: "Currently unavailable", disabled: true },
  ];
  editor.updateElement(id, {
    props: {
      ...selectChoiceProps(props, choices),
      name: "topics",
      required: true,
    },
  });
  const analysis = submissionFields(
    form,
    useEditorStore.getState().elementsById,
  );
  assert.deepEqual(analysis.problems, []);
  assert.equal(
    analysis.fields.find((field) => field.input.id === id)!.choices,
    "design\nautomation",
  );
  createSubmissionDestination(form, "Choice replies");
  const before = captureProject(project.id, project.name);
  const current = useEditorStore.getState().elementsById[id].props;
  const moved = [
    choices[2],
    { ...choices[0], value: "product", label: "Product design" },
    choices[1],
  ];
  editor.updateElement(id, {
    props: selectChoiceProps(current, moved, ["design", "product"]),
  });
  assert.equal(
    useEditorStore.getState().elementsById[id].props.selectedValues,
    "product\nautomation",
  );
  assert.equal(
    useEditorStore.getState().elementsById[id].props.optionLabels,
    "Currently unavailable\nProduct design\nWorkflow automation",
  );
  projectHistory.undo();
  assert.deepEqual(useEditorStore.getState().elementsById[id].props, current);
  projectHistory.redo();
  const saved = parseProject(captureProject(project.id, project.name));
  assert.deepEqual(saved.backend, before.backend);
  assert.deepEqual(saved.routing, before.routing);
  assert.deepEqual(
    compileProject(saved).diagnostics.filter((d) => d.severity === "error"),
    [],
  );
  restoreProject(saved);
  const rendered = nativeMarkup(
    nativeTree(useEditorStore.getState().elementsById[id]),
    "html",
  );
  assert.match(rendered, /value="unavailable" disabled>Currently unavailable/);
  assert.match(rendered, /value="product" selected>Product design/);
  const originalHTML = nativeMarkup(
    nativeTree({
      ...useEditorStore.getState().elementsById[id],
      props: { ...current },
    }),
    "html",
  );
  assert.match(
    originalHTML,
    /Product design &lt;script&gt; &amp; &#123;text&#125;/,
  );
  const disabled = selectChoiceProps(
    current,
    choices.map((choice) => ({
      ...choice,
      disabled: choice.value !== "automation",
    })),
  );
  assert.equal(disabled.selectedValues, "automation");
  const bulk = selectOptionProps({ ...current }, [
    "automation",
    "unavailable",
    "design",
    "new",
  ]);
  assert.equal(
    bulk.optionLabels,
    "Workflow automation\nCurrently unavailable\nProduct design <script> & {text}\nnew",
  );
  assert.equal(bulk.disabledValues, "unavailable");
  assert.equal(
    selectChoiceProps(
      { value: "design" },
      choices.map((choice) => ({ ...choice, disabled: true })),
    ).value,
    "",
  );
  assert.equal(
    selectChoiceProps(current, choices.slice(1)).selectedValues,
    "automation",
  );
  editor.updateElement(id, {
    props: selectChoiceProps(
      current,
      choices.map((choice) => ({ ...choice, disabled: true })),
    ),
  });
  assert.match(
    submissionFields(
      form,
      useEditorStore.getState().elementsById,
    ).problems.join(" "),
    /allowed values/,
  );
  const backendBefore = captureProject(project.id, project.name).backend;
  assert.throws(
    () => createSubmissionDestination(form, "No enabled choices"),
    /allowed values/,
  );
  assert.deepEqual(
    captureProject(project.id, project.name).backend,
    backendBefore,
  );
});

test("select metadata rejects malformed imports and drafts while preserving legacy options and native disabled-option serialization", () => {
  const base = {
    options: "one\ntwo",
    optionLabels: "First choice\nSecond choice",
    value: "one",
  };
  for (const patch of [
    { optionLabels: "Only one" },
    { optionLabels: " \nSecond choice" },
    { optionLabels: "First\rchoice\nSecond choice" },
    { optionLabels: "x".repeat(201) + "\nSecond" },
    { disabledValues: "missing" },
    { disabledValues: "two\ntwo" },
    { disabledValues: "one" },
    { options: "one\r\ntwo" },
    { value: "missing" },
    { value: "one\ntwo" },
    { multiple: true, selectedValues: "one\none" },
  ])
    assert.throws(() => validateSelectMetadata({ ...base, ...patch }));
  const project = emptyProject();
  restoreProject(project);
  const editor = useEditorStore.getState(),
    id = editor.addElement(elementTemplate("select"));
  editor.updateElement(id, { props: base });
  const valid = captureProject(project.id, project.name);
  for (const patch of [
    { optionLabels: "Missing" },
    { disabledValues: "one" },
    { disabledValues: "missing" },
  ]) {
    const invalid = structuredClone(valid);
    Object.assign(invalid.editor.elementsById[id].props, patch);
    assert.throws(() => parseProject(invalid));
    assert.throws(() => compileProject(invalid));
  }
  const duplicateLabels = selectChoiceProps({}, [
    { value: "one", label: "Same label", disabled: false },
    { value: "two", label: "Same label", disabled: false },
  ]);
  assert.equal(duplicateLabels.optionLabels, "Same label\nSame label");
  for (const label of ["", " ", "one\ntwo", "x".repeat(201)])
    assert.throws(() =>
      selectChoiceProps({}, [{ value: "one", label, disabled: false }]),
    );
  const legacy = { options: "Legacy\n" + "x".repeat(300), value: "Legacy" };
  assert.deepEqual(
    selectChoices(legacy).map((choice) => choice.label),
    legacy.options.split("\n"),
  );
  assert.doesNotThrow(() => validateSelectMetadata(legacy));
  assert.deepEqual(
    selectOptionProps(legacy, legacy.options.split("\n")),
    legacy,
  );
  const read = runInNewContext(formValueRuntime + "; formControlValue");
  const disabledOption = { disabled: true, closest: () => null, value: "two" };
  const input = {
    tagName: "SELECT",
    name: "choice",
    value: "two",
    selectedOptions: [disabledOption],
    disabled: false,
    matches: () => false,
    required: false,
  };
  assert.equal(read(input, {}), undefined);
  assert.throws(() => read({ ...input, required: true }, {}), /enabled option/);
  assert.deepEqual(
    Array.from(
      read(
        {
          ...input,
          multiple: true,
          selectedOptions: [
            disabledOption,
            { ...disabledOption, disabled: false, value: "one" },
          ],
        },
        {},
      ),
    ),
    ["one"],
  );
});
