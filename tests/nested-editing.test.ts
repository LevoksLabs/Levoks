import test from "node:test";
import assert from "node:assert/strict";
import { useEditorStore } from "../src/store/editorStore";
import { useEditorUIStore } from "../src/store/editorUIStore";
import {
  emptyProject,
  restoreProject,
  captureProject,
} from "../src/lib/project/workspace";
import { parseProject } from "../src/lib/project/schema";
import { compileProject } from "../src/lib/project/compiler";
import { templates } from "../src/templates";
import { elementTemplate } from "../src/lib/elements/registry";
import { createSubmissionDestination } from "../src/lib/form-destination";
import { resolveElement } from "../src/lib/design";

test("nested form moves preserve bindings, sizes and history while normalizing flow at all saved breakpoints", () => {
  const project = emptyProject();
  restoreProject(project);
  const store = useEditorStore.getState();
  const form = store.addElement(templates.form);
  const a = store.addElement(
    {
      ...elementTemplate("formField"),
      styles: { height: "auto" },
      label: "Group A",
    },
    form,
  );
  const b = store.addElement(
    {
      ...elementTemplate("formField"),
      styles: { height: "auto" },
      label: "Group B",
    },
    a,
  );
  const field = store.addElement(
    {
      ...elementTemplate("multiSelect"),
      props: {
        ...elementTemplate("multiSelect").props,
        name: "topics",
        options: "Design\nCode",
        selectedValues: "Design",
      },
      layout: { position: "absolute", x: 25, y: 30, w: 150 },
      styles: { width: "80%", position: "absolute" },
      responsive: {
        tablet: {
          layout: { x: 50, y: 60, w: 125 },
          styles: { width: "75%", position: "absolute" },
        },
        mobile: {
          layout: { x: 5, y: 6, w: 100 },
          styles: { position: "absolute" },
        },
      },
    },
    form,
  );
  createSubmissionDestination(form, "Nested signups");
  const before = captureProject(project.id, project.name);
  useEditorUIStore.getState().setBreakpoint("mobile");
  assert.equal(store.moveElement(field, b, 0), null);
  const moved = useEditorStore.getState().elementsById[field];
  for (const bp of ["base", "tablet", "mobile"] as const) {
    const node = resolveElement(moved, bp);
    assert.equal(node.layout.position, "static");
    assert.equal(node.styles.position, "static");
    assert.deepEqual([node.layout.x, node.layout.y], [0, 0]);
  }
  assert.deepEqual(
    [
      moved.layout.w,
      moved.responsive!.tablet!.layout!.w,
      moved.responsive!.mobile!.layout!.w,
    ],
    [150, 125, 100],
  );
  assert.equal(moved.styles.width, "80%");
  assert.equal(moved.responsive!.tablet!.styles!.width, "75%");
  let current = captureProject(project.id, project.name);
  assert.deepEqual(current.routing, before.routing);
  assert.deepEqual(current.backend, before.backend);
  assert.deepEqual(
    compileProject(parseProject(current)).diagnostics.filter(
      (d) => d.severity === "error",
    ),
    [],
  );
  store.undo();
  assert.deepEqual(
    captureProject(project.id, project.name).editor.elementsById[field],
    before.editor.elementsById[field],
  );
  store.redo();
  current = captureProject(project.id, project.name);
  restoreProject(parseProject(current));
  assert.equal(useEditorStore.getState().elementsById[field].parentId, b);
  const submitIndex = useEditorStore
    .getState()
    .elementsById[form].children.findIndex(
      (id) => useEditorStore.getState().elementsById[id].type === "button",
    );
  assert.equal(store.moveElement(field, form, 999), null);
  assert.equal(
    useEditorStore.getState().elementsById[form].children.indexOf(field),
    submitIndex,
  );
  const valid = captureProject(project.id, project.name);
  assert.match(store.moveElement(a, b, 0)!, /itself|children/);
  assert.match(store.moveElement(form, b, 0)!, /itself|children/);
  const innerForm = store.addElement(templates.form);
  assert.match(store.moveElement(innerForm, a, 0)!, /another form/);
  store.deleteElement(innerForm);
  assert.deepEqual(
    captureProject(project.id, project.name).routing,
    valid.routing,
  );
  store.updateElement(a, {
    layout: {
      ...useEditorStore.getState().elementsById[a].layout,
      locked: true,
    },
  });
  assert.match(store.moveElement(field, b, 0)!, /Unlock/);
  const locked = captureProject(project.id, project.name).editor;
  store.reorderElements(
    form,
    useEditorStore.getState().elementsById[form].children.indexOf(a),
    0,
  );
  assert.deepEqual(captureProject(project.id, project.name).editor, locked);
});

test("global reparenting keeps one owning tree and rejects cross-scope, inactive-page and component-child moves", () => {
  const project = emptyProject();
  restoreProject(project);
  const store = useEditorStore.getState();
  const globalGroup = store.addGlobalElement({
    ...elementTemplate("formField"),
    children: [{ ...templates.text, label: "Global child" }],
  });
  const globalChild =
    useEditorStore.getState().elementsById[globalGroup].children[0];
  const otherGlobal = store.addGlobalElement(elementTemplate("formField"));
  const pageGroup = store.addElement(templates.container);
  assert.equal(store.moveElement(globalChild, otherGlobal, 0), null);
  assert.ok(!useEditorStore.getState().globalRootIds.includes(globalChild));
  assert.ok(!useEditorStore.getState().rootIds.includes(globalChild));
  assert.equal(store.moveElement(globalChild, null, 0), null);
  assert.ok(useEditorStore.getState().globalRootIds.includes(globalChild));
  assert.ok(!useEditorStore.getState().rootIds.includes(globalChild));
  assert.equal(store.moveElement(globalChild, otherGlobal, 0), null);
  const before = captureProject(project.id, project.name);
  assert.match(store.moveElement(globalChild, pageGroup, 0)!, /own section/);
  assert.deepEqual(
    captureProject(project.id, project.name).editor,
    before.editor,
  );
  assert.doesNotThrow(() => parseProject(before));
  store.undo();
  assert.ok(useEditorStore.getState().globalRootIds.includes(globalChild));
  store.redo();
  assert.equal(
    useEditorStore.getState().elementsById[globalChild].parentId,
    otherGlobal,
  );
  const child = store.addElement(templates.text, pageGroup);
  store.saveComponent(pageGroup, "Card");
  const outsider = store.addElement(templates.text);
  const current = captureProject(project.id, project.name);
  assert.match(store.moveElement(child, null, 0)!, /Detach/);
  assert.match(store.moveElement(outsider, pageGroup, 0)!, /Detach/);
  assert.deepEqual(
    captureProject(project.id, project.name).editor,
    current.editor,
  );
  store.detachComponent(pageGroup);
  assert.equal(store.moveElement(child, null, 0), null);
  store.switchPage(store.addPage("Other"));
  assert.match(store.moveElement(child, null, 0)!, /active page/);
  assert.match(store.moveElement(globalChild, pageGroup, 0)!, /own section/);
  assert.doesNotThrow(() =>
    parseProject(captureProject(project.id, project.name)),
  );
});

test("moves respect the persisted tree depth limit without changing a rejected subtree", () => {
  const project = emptyProject();
  restoreProject(project);
  const store = useEditorStore.getState();
  let parent: string | undefined;
  for (let depth = 0; depth < 100; depth++)
    parent = store.addElement(templates.container, parent);
  const group = store.addElement(templates.container);
  store.addElement(templates.text, group);
  const before = captureProject(project.id, project.name);
  assert.match(store.moveElement(group, parent!, 0)!, /100 levels/);
  assert.deepEqual(
    captureProject(project.id, project.name).editor,
    before.editor,
  );
  const leaf = store.addElement(templates.text);
  assert.equal(store.moveElement(leaf, parent!, 0), null);
  assert.doesNotThrow(() =>
    parseProject(captureProject(project.id, project.name)),
  );
});
