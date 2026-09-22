import test from "node:test";
import assert from "node:assert/strict";
import { useEditorStore } from "../src/store/editorStore";
import { useBackendStore } from "../src/store/backendStore";
import { useRoutingStore } from "../src/store/routingStore";
import { projectHistory } from "../src/store/projectHistory";
import {
  emptyProject,
  restoreProject,
  captureProject,
} from "../src/lib/project/workspace";
import { compileProject } from "../src/lib/project/compiler";
import { parseProject } from "../src/lib/project/schema";
import { templates } from "../src/templates";

function connectedProject() {
  const project = emptyProject();
  restoreProject(project);
  const e = useEditorStore.getState(),
    b = useBackendStore.getState(),
    r = useRoutingStore.getState();
  const button = e.addElement(templates.button);
  b.addService("API");
  const service = useBackendStore.getState().services[0].id;
  b.addBlock(service, "rest_endpoint", "GET");
  r.addNode("page", project.editor.activePageId);
  r.addNode("service", service);
  const [pageNode, serviceNode] = useRoutingStore.getState().nodes;
  const output = r
    .getPortsForNode(pageNode.id)
    .find((port) => port.elementId === button)!;
  const input = r
    .getPortsForNode(serviceNode.id)
    .find((port) => port.portType === "input")!;
  r.addConnection(output.id, input.id, pageNode.id, serviceNode.id);
  projectHistory.clear();
  return { project, e, b, r, button, service, pageNode, serviceNode };
}

test("service and element deletion undo restores routing and the compiled application atomically", () => {
  const { project, e, b, button, service } = connectedProject();
  const before = captureProject(project.id, project.name);
  b.removeService(service);
  assert.equal(useRoutingStore.getState().connections.length, 0);
  assert.equal(useRoutingStore.getState().nodes.length, 1);
  e.undo();
  assert.deepEqual(
    captureProject(project.id, project.name).backend,
    before.backend,
  );
  assert.deepEqual(
    captureProject(project.id, project.name).routing,
    before.routing,
  );
  assert.deepEqual(
    compileProject({
      ...captureProject(project.id, project.name),
      updatedAt: before.updatedAt,
    }).files,
    compileProject(before).files,
  );
  e.redo();
  assert.equal(useBackendStore.getState().services.length, 0);
  e.undo();
  e.deleteElement(button);
  assert.equal(useRoutingStore.getState().connections.length, 0);
  e.undo();
  assert.equal(useRoutingStore.getState().connections.length, 1);
  assert.ok(useEditorStore.getState().elementsById[button]);
});

test("page navigation preserves history and undo restores deleted pages and their content", () => {
  const { project, e, r, button } = connectedProject();
  const second = e.addPage("Details");
  const text = e.addElement(templates.text);
  r.addNode("page", second);
  projectHistory.clear();
  e.updateElement(text, { props: { content: "Saved on another page" } });
  e.switchPage(project.editor.activePageId);
  e.undo();
  assert.equal(useEditorStore.getState().activePageId, second);
  assert.notEqual(
    useEditorStore.getState().elementsById[text].props.content,
    "Saved on another page",
  );
  e.redo();
  assert.equal(
    useEditorStore.getState().elementsById[text].props.content,
    "Saved on another page",
  );
  e.deletePage(project.editor.activePageId);
  assert.ok(!useEditorStore.getState().elementsById[button]);
  e.undo();
  assert.ok(useEditorStore.getState().elementsById[button]);
  assert.equal(useRoutingStore.getState().nodes.length, 3);
  assert.doesNotThrow(() =>
    parseProject(captureProject(project.id, project.name)),
  );
});

test("graph gestures form one undo step, cancellation restores state, and a new project clears history", () => {
  const { project, e, b, r, service, serviceNode } = connectedProject();
  projectHistory.begin("backend");
  for (let x = 1; x <= 20; x++)
    b.updateService(service, { position: { x, y: x } });
  projectHistory.end();
  e.undo();
  assert.equal(useBackendStore.getState().services[0].position, undefined);
  assert.equal(projectHistory.canUndo, false);
  e.redo();
  assert.deepEqual(useBackendStore.getState().services[0].position, {
    x: 20,
    y: 20,
  });
  const before = captureProject(project.id, project.name);
  projectHistory.begin("routing");
  r.moveNode(serviceNode.id, 800, 900);
  projectHistory.end(true);
  assert.deepEqual(
    captureProject(project.id, project.name).routing,
    before.routing,
  );
  e.updateCanvasSettings({ width: 1200 });
  e.undo();
  assert.equal(useEditorStore.getState().canvasSettings.width, 1920);
  restoreProject(emptyProject("Different project"));
  e.undo();
  assert.equal(useBackendStore.getState().services.length, 0);
  assert.equal(projectHistory.canUndo, false);
  assert.equal(projectHistory.canRedo, false);
});
