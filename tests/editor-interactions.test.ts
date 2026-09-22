import test from "node:test";
import assert from "node:assert/strict";
import { useEditorStore } from "../src/store/editorStore";
import { emptyProject, restoreProject } from "../src/lib/project/workspace";
import { templates } from "../src/templates";
import { alignSelection } from "../src/lib/editor-selection";

test("multi-element gestures and alignment undo together without mutating their starting snapshot", () => {
  restoreProject(emptyProject());
  const state = useEditorStore.getState();
  const a = state.addElement(templates.button, undefined, 30, 50),
    b = state.addElement(templates.button, undefined, 180, 130);
  const before = useEditorStore.getState().elementsById;
  state.selectElements([a, b]);
  state.beginInteraction();
  state.updateElementPosition(a, 40, 60);
  state.updateElementPosition(b, 190, 140);
  state.endInteraction();
  state.undo();
  assert.equal(useEditorStore.getState().elementsById[a].layout.x, 30);
  assert.equal(useEditorStore.getState().elementsById[b].layout.y, 130);
  assert.equal(before[a].layout.x, 30);
  state.redo();
  assert.equal(useEditorStore.getState().elementsById[b].layout.x, 190);
  alignSelection("top");
  assert.equal(useEditorStore.getState().elementsById[b].layout.y, 60);
  state.undo();
  assert.equal(useEditorStore.getState().elementsById[b].layout.y, 140);
  state.beginInteraction();
  state.updateElementPosition(a, 999, 999);
  state.endInteraction(true);
  assert.equal(useEditorStore.getState().elementsById[a].layout.x, 40);
});

test("global layer ordering never changes page ordering and supports undo", () => {
  restoreProject(emptyProject()); const store = useEditorStore.getState();
  const page = store.addElement(templates.text);
  const first = store.addGlobalElement(templates.button), second = store.addGlobalElement(templates.text);
  store.reorderElements(null, 0, 1, "global");
  assert.deepEqual(useEditorStore.getState().globalRootIds, [second, first]);
  assert.deepEqual(useEditorStore.getState().rootIds, [page]);
  store.undo(); assert.deepEqual(useEditorStore.getState().globalRootIds, [first, second]);
  store.bringToFront(first); assert.deepEqual(useEditorStore.getState().globalRootIds, [second, first]);
  store.sendToBack(first); assert.deepEqual(useEditorStore.getState().globalRootIds, [first, second]);
});

test("copying a multi-selection includes each subtree once, preserves spacing and pastes as one undo", () => {
  restoreProject(emptyProject());
  const store = useEditorStore.getState();
  const parent = store.addElement(templates.container, undefined, 40, 60);
  const child = store.addElement(templates.text, parent, 10, 20);
  const sibling = store.addElement(templates.button, undefined, 440, 160);
  store.copyElements([parent, child, sibling]);
  store.deleteElement(parent);
  const beforePaste = useEditorStore.getState().rootIds;
  store.pasteElement();
  const next = useEditorStore.getState();
  assert.equal(next.selectedElementIds.length, 2);
  const [a, b] = next.selectedElementIds.map((id) => next.elementsById[id]);
  assert.equal(a.children.length, 1);
  assert.notEqual(a.children[0], child);
  assert.equal(next.elementsById[a.children[0]].parentId, a.id);
  assert.equal(b.layout.x - a.layout.x, 400);
  store.undo();
  assert.deepEqual(useEditorStore.getState().rootIds, beforePaste);
  store.redo();
  assert.equal(
    useEditorStore.getState().rootIds.length,
    beforePaste.length + 2,
  );
});
