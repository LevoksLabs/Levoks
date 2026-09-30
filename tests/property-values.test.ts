import test from "node:test";
import assert from "node:assert/strict";
import { emptyProject, restoreProject, captureProject } from "../src/lib/project/workspace";
import { parseProject } from "../src/lib/project/schema";
import { useEditorStore } from "../src/store/editorStore";
import { elementTemplate } from "../src/lib/elements/registry";
import { measurement, serializeMeasurement } from "../src/lib/property-values";

test("old radio controls migrate in saved state, and checked group changes undo together", () => {
  const project = emptyProject(); restoreProject(project);
  const store = useEditorStore.getState();
  const first = store.addElement(elementTemplate("radioButton"));
  const second = store.addElement(elementTemplate("radioButton"));
  const snapshot = captureProject(project.id, project.name), old = snapshot.editor.elementsById[first];
  delete old.props.label; old.props.ariaLabel = "Legacy choice"; old.layout.w = 28; old.layout.h = 28;
  old.styles.padding = "10px 12px";
  const migrated = parseProject(snapshot);
  assert.equal(migrated.editor.elementsById[first].props.label, "Legacy choice");
  assert.equal(migrated.editor.elementsById[first].layout.w, 200);
  restoreProject(migrated);
  store.updateElement(first, { props: { checked: true } });
  store.updateElement(second, { props: { checked: true } });
  assert.equal(useEditorStore.getState().elementsById[first].props.checked, false);
  store.undo();
  assert.equal(useEditorStore.getState().elementsById[first].props.checked, true);
  assert.equal(useEditorStore.getState().elementsById[second].props.checked, false);
});

test("unit values preserve fractional precision and resizing reconciles explicit dimensions", () => {
  assert.deepEqual(measurement("1.25rem"), { value: 1.25, unit: "rem" });
  assert.equal(serializeMeasurement({ value: 50, unit: "%" }), "50%");
  assert.equal(measurement("var(--lv-spacing)"), null);
  const project = emptyProject(); restoreProject(project); const store = useEditorStore.getState();
  const id = store.addElement(elementTemplate("tabs"));
  store.updateElement(id, { styles: { width: "50%", height: "20vh" } });
  store.updateElementSize(id, 700, 300);
  assert.equal(useEditorStore.getState().elementsById[id].styles.width, "700px");
  assert.equal(useEditorStore.getState().elementsById[id].styles.height, "20vh");
});
