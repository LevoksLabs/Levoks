import test from "node:test";
import assert from "node:assert/strict";
import {
  emptyProject,
  restoreProject,
  captureProject,
} from "../src/lib/project/workspace";
import { elementTemplate } from "../src/lib/elements/registry";
import { editRadioGroup, radioChoices } from "../src/lib/elements/radio-group";
import { useEditorStore } from "../src/store/editorStore";
import { useRoutingStore } from "../src/store/routingStore";
import { templates } from "../src/templates";
import {
  createSubmissionDestination,
  submissionFields,
} from "../src/lib/form-destination";
import { compileProject } from "../src/lib/project/compiler";
import { parseProject } from "../src/lib/project/schema";
import { nativeMarkup, nativeTree } from "../src/lib/elements/native";

test("radio-group edits preserve defaults and child identity with bounded validation, atomic history and independent copies", () => {
  const project = emptyProject();
  restoreProject(project);
  const store = useEditorStore.getState(),
    form = store.addElement(templates.form);
  const group = store.addElement(
    {
      ...elementTemplate("radioGroup"),
      styles: { ...elementTemplate("radioGroup").styles, height: "auto" },
    },
    form,
  );
  editRadioGroup(group, { type: "group", name: "attendance", required: true });
  const first = editRadioGroup(group, {
    type: "add",
    label: "Remote attendance",
    value: "remote",
  })!;
  const second = editRadioGroup(group, {
    type: "add",
    label: "At the venue",
    value: "venue",
  })!;
  editRadioGroup(group, { type: "default", id: first, checked: true });
  editRadioGroup(group, { type: "default", id: second, checked: true });
  assert.equal(
    useEditorStore.getState().elementsById[first].props.checked,
    false,
  );
  editRadioGroup(group, {
    type: "choice",
    id: second,
    label: "In person",
    value: "in_person",
  });
  assert.equal(
    useEditorStore.getState().elementsById[second].props.checked,
    true,
  );
  editRadioGroup(group, { type: "move", id: second, offset: -1 });
  assert.deepEqual(useEditorStore.getState().elementsById[group].children, [
    second,
    first,
  ]);
  store.undo();
  assert.deepEqual(useEditorStore.getState().elementsById[group].children, [
    first,
    second,
  ]);
  store.redo();
  for (const edit of [
    { type: "add", label: "Duplicate", value: "remote" },
    { type: "add", label: "", value: "new" },
    { type: "add", label: "x".repeat(201), value: "too_long" },
    { type: "choice", id: first, label: "Bad", value: "x\ny" },
    { type: "group", name: "9wrong", required: false },
    { type: "move", id: second, offset: -1 },
  ] as const) {
    const before = useEditorStore.getState().elementsById;
    assert.throws(() => editRadioGroup(group, edit));
    assert.equal(useEditorStore.getState().elementsById, before);
  }
  editRadioGroup(group, { type: "disabled", id: second, disabled: true });
  assert.equal(
    useEditorStore.getState().elementsById[second].props.checked,
    false,
  );
  assert.throws(
    () => editRadioGroup(group, { type: "default", id: second, checked: true }),
    /Enable/,
  );
  editRadioGroup(group, {
    type: "group",
    name: "attendance_method",
    required: false,
  });
  store.undo();
  assert.equal(
    useEditorStore.getState().elementsById[first].props.name,
    "attendance",
  );
  store.redo();
  for (const choice of radioChoices(
    useEditorStore.getState().elementsById[group],
    useEditorStore.getState().elementsById,
  )) {
    assert.equal(choice.props.name, "attendance_method");
    assert.equal(choice.props.required, false);
  }
  store.duplicateElement(group);
  const copy = useEditorStore.getState().selectedElementId!;
  assert.notEqual(
    useEditorStore.getState().elementsById[copy].props.name,
    "attendance_method",
  );
  assert.ok(
    radioChoices(
      useEditorStore.getState().elementsById[copy],
      useEditorStore.getState().elementsById,
    ).every(
      (node) =>
        node.props.name ===
        useEditorStore.getState().elementsById[copy].props.name,
    ),
  );
  store.toggleLock(group);
  assert.throws(
    () => editRadioGroup(group, { type: "remove", id: first }),
    /Unlock/,
  );
  store.toggleLock(group);
  store.saveComponent(group, "Attendance choices");
  assert.doesNotThrow(
    () => editRadioGroup(group, { type: "add", label: "New", value: "new" }),
  );
  assert.ok(useEditorStore.getState().elementsById[group].component!.overrides.includes("structure"));
  store.detachComponent(group);
  const mixed = store.addElement(elementTemplate("textInput"), group);
  assert.throws(
    () => editRadioGroup(group, { type: "add", label: "New", value: "new" }),
    /other controls/,
  );
  store.deleteElement(mixed);
  assert.doesNotThrow(() =>
    parseProject(captureProject(project.id, project.name)),
  );
});

test("radio choices keep mapped field contracts when removing their source and preserve snapshots, scope and native fieldsets", () => {
  const project = emptyProject();
  restoreProject(project);
  const store = useEditorStore.getState(),
    form = store.addElement(templates.form);
  const group = store.addElement(elementTemplate("radioGroup"), form);
  editRadioGroup(group, { type: "group", name: "attendance", required: true });
  assert.equal(
    useEditorStore.getState().elementsById[group].styles.height,
    "auto",
  );
  assert.equal(
    useEditorStore.getState().elementsById[group].styles.minHeight,
    "120px",
  );
  assert.match(
    submissionFields(
      form,
      useEditorStore.getState().elementsById,
    ).problems.join(" "),
    /enabled radio choice/,
  );
  assert.throws(
    () => createSubmissionDestination(form, "Incomplete group"),
    /enabled radio choice/,
  );
  assert.deepEqual(
    captureProject(project.id, project.name).backend,
    project.backend,
  );
  const first = editRadioGroup(group, {
    type: "add",
    label: "Remote",
    value: "remote",
  })!;
  const second = editRadioGroup(group, {
    type: "add",
    label: "In person",
    value: "in_person",
  })!;
  store.updateElement(first, { props: { disabled: true } });
  store.updateElement(second, { props: { disabled: true } });
  assert.match(
    submissionFields(
      form,
      useEditorStore.getState().elementsById,
    ).problems.join(" "),
    /enabled radio choice/,
  );
  store.updateElement(first, { props: { disabled: false } });
  store.updateElement(second, { props: { disabled: false } });
  store.updateElement(group, {
    props: { legend: "How will you attend? <script>" },
  });
  const html = nativeMarkup(
    nativeTree(useEditorStore.getState().elementsById[group]),
    "html",
  );
  assert.match(html, /<legend>How will you attend\? &lt;script&gt;<\/legend>/);
  assert.doesNotMatch(html, /required|aria-label=/);
  createSubmissionDestination(form, "Attendance replies");
  const wire = useRoutingStore.getState().connections[0];
  const mapping = wire.requestMappings!.find(
    (item) => item.source.kind === "element" && item.source.elementId === first,
  )!;
  const before = captureProject(project.id, project.name);
  editRadioGroup(group, { type: "remove", id: first });
  assert.deepEqual(
    useRoutingStore
      .getState()
      .connections[0].requestMappings!.find(
        (item) => item.fieldId === mapping.fieldId,
      )!.source,
    { kind: "element", elementId: second },
  );
  const saved = parseProject(captureProject(project.id, project.name));
  assert.deepEqual(
    compileProject(saved).diagnostics.filter((d) => d.severity === "error"),
    [],
  );
  assert.deepEqual(
    saved.backend,
    before.backend,
    "Field schemas and rule snapshots must remain unchanged.",
  );
  store.undo();
  assert.ok(useEditorStore.getState().elementsById[first]);
  assert.deepEqual(
    useRoutingStore.getState().connections,
    before.routing.connections,
  );
  store.redo();
  assert.throws(
    () => editRadioGroup(group, { type: "remove", id: second }),
    /Disconnect or remap/,
  );
  const other = store.addElement(elementTemplate("textInput"), form);
  store.updateElement(other, { props: { name: "collision" } });
  assert.throws(
    () =>
      editRadioGroup(group, {
        type: "group",
        name: "collision",
        required: true,
      }),
    /Another control/,
  );
  const otherForm = store.addElement(templates.form),
    otherGroup = store.addElement(elementTemplate("radioGroup"), otherForm);
  assert.doesNotThrow(() =>
    editRadioGroup(otherGroup, {
      type: "group",
      name: "attendance",
      required: false,
    }),
  );
  const emptyChoice = editRadioGroup(otherGroup, {
    type: "add",
    label: "Other form",
    value: "other",
  })!;
  editRadioGroup(otherGroup, { type: "remove", id: emptyChoice });
  assert.equal(
    useEditorStore.getState().elementsById[otherGroup].children.length,
    0,
  );
});
