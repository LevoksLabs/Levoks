import test from "node:test";
import assert from "node:assert/strict";
import {
  SITE_STARTERS,
  applySiteStarter,
  starterPreview,
  type SiteStarter,
} from "../src/lib/site-starters";
import {
  emptyProject,
  restoreProject,
  captureProject,
} from "../src/lib/project/workspace";
import { parseProject } from "../src/lib/project/schema";
import { compileProject } from "../src/lib/project/compiler";
import { useEditorStore } from "../src/store/editorStore";

test("complete starters add scoped navigation, validated storage and private inbox in one undoable action", () => {
  for (const starter of SITE_STARTERS) {
    const project = emptyProject(starter.name);
    restoreProject(project);
    const before = captureProject(project.id, project.name);
    applySiteStarter(starter);
    const saved = parseProject(captureProject(project.id, project.name)),
      compiled = compileProject(saved);
    assert.deepEqual(
      compiled.diagnostics.filter((d) => d.severity === "error"),
      [],
      starter.id,
    );
    assert.equal(saved.backend.services.length, 2);
    const nodes = Object.values(saved.editor.elementsById);
    assert.equal(nodes.filter((n) => n.type === "form").length, 1);
    for (const n of nodes.filter((n) => n.definitionId === "navigationLink"))
      assert.ok(saved.editor.elementsById[n.events!.onClick.target]);
    assert.match(starterPreview(starter), /Your name/);
    assert.doesNotMatch(starterPreview(starter), /<iframe/);
    useEditorStore.getState().undo();
    const undone = captureProject(project.id, project.name);
    assert.deepEqual(undone.editor, before.editor);
    assert.deepEqual(undone.backend, before.backend);
    assert.deepEqual(undone.routing, before.routing);
    useEditorStore.getState().redo();
    assert.doesNotThrow(() =>
      parseProject(captureProject(project.id, project.name)),
    );
  }
});

test("starter failures restore the entire project and repeated starters never cross page navigation scopes", () => {
  const project = emptyProject();
  restoreProject(project);
  applySiteStarter(SITE_STARTERS[0]);
  const editor = useEditorStore.getState();
  editor.addPage("Second");
  const before = captureProject(project.id, project.name);
  assert.throws(
    () =>
      applySiteStarter({
        ...SITE_STARTERS[0],
        collection: "",
      } as unknown as SiteStarter),
    /collection a name/,
  );
  assert.deepEqual(
    captureProject(project.id, project.name).editor,
    before.editor,
  );
  applySiteStarter(SITE_STARTERS[1]);
  const saved = parseProject(captureProject(project.id, project.name));
  assert.deepEqual(
    compileProject(saved).diagnostics.filter((d) => d.severity === "error"),
    [],
  );
});
