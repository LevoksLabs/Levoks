import test from "node:test";
import assert from "node:assert/strict";
import "fake-indexeddb/auto";
import { useEditorStore } from "../src/store/editorStore";
import { templates } from "../src/templates";
import {
  initializeWorkspace,
  flushWorkspace,
  currentProject,
  reopenSavedWorkspace,
  recoverSavedWorkspace,
  useWorkspaceStore,
  updateSource,
  applyDesign,
} from "../src/store/workspaceStore";
import { getProject, saveProject } from "../src/lib/project/storage";
import { compileProject } from "../src/lib/project/compiler";
import { bindWorkspaceAccount } from "../src/lib/project/account-scope";
import { projectHistory } from "../src/store/projectHistory";

test("workspace saves, reopens latest edits, and recovers a conflicting tab without overwriting it", async () => {
  bindWorkspaceAccount(null);
  const memory = new Map<string, string>();
  Object.defineProperty(globalThis, "localStorage", {
    configurable: true,
    value: {
      getItem: (key: string) => memory.get(key) || null,
      setItem: (key: string, value: string) => memory.set(key, value),
    },
  });
  Object.defineProperty(globalThis, "window", {
    configurable: true,
    value: new EventTarget(),
  });
  Object.defineProperty(globalThis, "document", {
    configurable: true,
    value: Object.assign(new EventTarget(), { visibilityState: "visible" }),
  });
  await initializeWorkspace();
  const id = useWorkspaceStore.getState().id;
  assert.ok(useWorkspaceStore.getState().ready);
  const form = useEditorStore.getState().addElement(templates.form);
  await reopenSavedWorkspace(id);
  assert.ok(useEditorStore.getState().elementsById[form]);
  assert.equal(useWorkspaceStore.getState().dirty, false);
  assert.ok(projectHistory.canUndo,"History restores when reopening the saved workspace.");
  useEditorStore.getState().undo();
  assert.equal(useEditorStore.getState().elementsById[form],undefined);
  await flushWorkspace("Undo after reopen");
  await reopenSavedWorkspace(id);
  assert.ok(projectHistory.canRedo,"Redo survives a second saved session.");
  useEditorStore.getState().redo();
  assert.ok(useEditorStore.getState().elementsById[form]);
  await flushWorkspace();
  const state = useWorkspaceStore.getState();
  const otherTab = { ...currentProject(), name: "Other tab version" };
  await saveProject(otherTab, state.revision);
  useEditorStore.getState().addElement(templates.button);
  await assert.rejects(flushWorkspace(), /another tab/);
  assert.equal((await getProject(id))?.name, "Other tab version");
  await recoverSavedWorkspace();
  assert.equal(useWorkspaceStore.getState().name, "Other tab version");
  assert.equal(useWorkspaceStore.getState().dirty, false);
  assert.equal(useWorkspaceStore.getState().error, "");
  const files = compileProject(currentProject()).files;
  updateSource({ ...files, "README.md": "Reviewed source" });
  await flushWorkspace("Edited source");
  await reopenSavedWorkspace(id);
  useEditorStore.getState().undo();
  assert.equal(useWorkspaceStore.getState().source,undefined);
  useEditorStore.getState().redo();
  assert.equal(useWorkspaceStore.getState().source?.files["README.md"],"Reviewed source");
  const checkpoint = currentProject();
  updateSource();
  await flushWorkspace();
  await applyDesign(checkpoint);
  assert.equal(
    useWorkspaceStore.getState().source?.files["README.md"],
    "Reviewed source",
  );
});
