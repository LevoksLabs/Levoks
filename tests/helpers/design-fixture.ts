import { emptyProject, captureProject, restoreProject } from "../../src/lib/project/workspace";
import { useEditorStore } from "../../src/store/editorStore";
import { templates } from "../../src/templates";
export function designFixture() {
  const project = emptyProject("Design verification"); restoreProject(project);
  const store = useEditorStore.getState();
  store.updateCanvasSettings({ width: 1280, height: 1000 });
  store.setToken("brand", { name: "Brand", value: "#553388", kind: "color" });
  const tabs = store.addElement({ ...templates.tabs, label: "Product tabs", props: { tabTitles: "Overview,Details", activeTab: 0 }, layout: { w: 600, h: 180 } }, undefined, 30, 30);
  store.addElement({ ...templates.text, props: { content: "Overview content" } }, tabs, 10, 20);
  store.addElement({ ...templates.text, props: { content: "Details content" } }, tabs, 10, 20);
  const repeater = store.addElement({ ...templates.repeater, props: { repeatCount: 3, direction: "row" }, layout: { w: 700, h: 110 } }, undefined, 30, 250);
  store.addElement({ ...templates.button, props: { label: "Repeated action" }, styles: { ...templates.button.styles, backgroundColor: "var(--lv-brand)" } }, repeater);
  const gallery = store.addElement({ ...templates.gallery, props: { columns: 2, gap: 12 }, layout: { w: 400, h: 150 } }, undefined, 30, 400);
  store.addElement({ ...templates.shape, styles: { backgroundColor: "#447799" }, layout: { w: 140, h: 120 } }, gallery);
  store.addElement({ ...templates.shape, styles: { backgroundColor: "#995544" }, layout: { w: 140, h: 120 } }, gallery);
  const primitive = store.addElement({ ...templates.shape, props: { shapeType: "triangle" }, styles: { backgroundColor: "#553388" } }, undefined, 700, 410);
  const icon = store.addElement({ ...templates.icon, props: { icon: "heart", iconSize: 48, iconColor: "#553388" } }, undefined, 520, 410);
  const vector = store.addElement({ ...templates.shape, label: "Curved shape", styles: { backgroundColor: "transparent" }, vector: { points: [{ x: 0, y: 0, outX: 25, outY: 60 }, { x: 100, y: 100, inX: 80, inY: 40 }, { x: 0, y: 100 }], closed: true, stroke: "#553388", strokeWidth: 2, fill: "#ddd0ee" }, motion: { duration: 1, delay: 0, easing: "linear", iterations: 1, frames: [{ time: 0, x: 0, y: 0, scale: 1, rotation: 0, opacity: 0 }, { time: 1, x: 40, y: 0, scale: 1, rotation: 0, opacity: 1 }] } }, undefined, 30, 650);
  store.updateElement(tabs, { responsive: { mobile: { layout: { x: 12, y: 20, w: 350 } } } });
  return { project: captureProject(project.id, project.name), tabs, repeater, gallery, icon, vector, primitive };
}
