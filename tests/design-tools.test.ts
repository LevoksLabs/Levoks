import test from "node:test";
import assert from "node:assert/strict";
import { useEditorStore } from "../src/store/editorStore";
import { useEditorUIStore } from "../src/store/editorUIStore";
import {
  captureProject,
  emptyProject,
  restoreProject,
} from "../src/lib/project/workspace";
import { compileProject } from "../src/lib/project/compiler";
import { parseProject } from "../src/lib/project/schema";
import { resolveElement, vectorPath } from "../src/lib/design";
import { templates } from "../src/templates";
import { groupElements, ungroupElements } from "../src/lib/grouping";

test("ungrouping preserves wrappers with compositing effects instead of silently losing appearance", () => {
  restoreProject(emptyProject()); const store = useEditorStore.getState();
  const first = store.addElement(templates.button), second = store.addElement(templates.text, undefined, 250, 0);
  store.selectElements([first, second]); store.groupSelection();
  const id = useEditorStore.getState().selectedElementId!;
  store.updateElementOpacity(id, 0.5);
  const before = useEditorStore.getState().elementsById;
  store.ungroupSelection(); assert.equal(useEditorStore.getState().elementsById, before);
  store.undo(); store.ungroupSelection();
  assert.deepEqual(useEditorStore.getState().rootIds, [first, second]);
});

test("grouping preserves breakpoint coordinates, stable IDs, saved trees and undo", () => {
  const project = emptyProject();
  restoreProject(project);
  const store = useEditorStore.getState();
  const a = store.addElement(templates.button, undefined, 80, 90),
    b = store.addElement(templates.button, undefined, 300, 140);
  useEditorUIStore.setState({ breakpoint: "mobile" });
  store.updateElementPosition(a, 10, 20);
  store.updateElementPosition(b, 30, 80);
  store.selectElements([a, b]);
  const original = useEditorStore.getState();
  store.groupSelection();
  const grouped = useEditorStore.getState();
  const groupId = grouped.selectedElementId!;
  assert.deepEqual(grouped.elementsById[groupId].children, [a, b]);
  for (const bp of ["base", "tablet", "mobile"] as const) {
    for (const id of [a, b]) {
      const parent = resolveElement(grouped.elementsById[groupId], bp),
        child = resolveElement(grouped.elementsById[id], bp),
        before = resolveElement(original.elementsById[id], bp);
      assert.equal(parent.layout.x + child.layout.x, before.layout.x);
      assert.equal(parent.layout.y + child.layout.y, before.layout.y);
    }
  }
  assert.doesNotThrow(() =>
    parseProject(captureProject(project.id, project.name)),
  );
  store.undo();
  assert.deepEqual(useEditorStore.getState().rootIds, [a, b]);
  store.redo();
  store.selectElements([groupId]);
  store.ungroupSelection();
  const after = useEditorStore.getState();
  for (const bp of ["base", "tablet", "mobile"] as const)
    for (const id of [a, b]) {
      assert.equal(
        resolveElement(after.elementsById[id], bp).layout.x,
        resolveElement(original.elementsById[id], bp).layout.x,
      );
      assert.equal(
        resolveElement(after.elementsById[id], bp).layout.y,
        resolveElement(original.elementsById[id], bp).layout.y,
      );
    }
  assert.equal(groupElements({ ...after, selectedElementIds: [a] }), null);
  assert.equal(ungroupElements({ ...after, selectedElementIds: [a] }), null);
});

test("breakpoints inherit, persist and emit CSS without changing desktop or unrelated inherited fields", () => {
  const project = emptyProject();
  restoreProject(project);
  const store = useEditorStore.getState(),
    id = store.addElement(templates.button, undefined, 80, 90);
  const initial = useEditorStore.getState().elementsById[id];
  useEditorUIStore.setState({ breakpoint: "tablet" });
  store.updateElement(id, {
    layout: { ...store.getElement(id)!.layout, w: 250 },
    styles: { ...store.getElement(id)!.styles, color: "#112233" },
  });
  store.updateElementPosition(id, 24, 30);
  useEditorUIStore.setState({ breakpoint: "mobile" });
  store.updateElementPosition(id, 12, 18);
  store.toggleVisibility(id);
  const node = useEditorStore.getState().elementsById[id];
  assert.deepEqual(node.layout, initial.layout);
  assert.equal(node.responsive!.tablet!.layout!.h, undefined);
  assert.equal(resolveElement(node, "mobile").layout.w, 250);
  assert.equal(resolveElement(node, "tablet").layout.x, 24);
  assert.equal(resolveElement(node, "mobile").layout.visible, false);
  const saved = captureProject(project.id, project.name);
  restoreProject(saved);
  assert.deepEqual(
    useEditorStore.getState().elementsById[id].responsive,
    node.responsive,
  );
  const css = compileProject(saved).files["frontend/app/page.css"];
  assert.match(css, /max-width: 1024px/);
  assert.match(css, /max-width: 600px/);
  assert.match(css, /left: 0\.750rem/);
  assert.match(css, /display: none/);
});

test("component publishing preserves stable wired IDs, local overrides, added children and undo", () => {
  restoreProject(emptyProject());
  const store = useEditorStore.getState();
  const root = store.addElement(templates.container),
    child = store.addElement(templates.text, root);
  store.saveComponent(root, "Card");
  const id = useEditorStore.getState().elementsById[root].component!.id;
  assert.deepEqual(useEditorStore.getState().elementsById[root].children, [
    child,
  ]);
  store.insertComponent(id);
  const instance = useEditorStore.getState().selectedElementId!;
  const instanceChild =
    useEditorStore.getState().elementsById[instance].children[0];
  store.updateElement(instanceChild, { props: { content: "Local text" } });
  store.updateElement(child, {
    props: { content: "Published text" },
    styles: { color: "#123456" },
  });
  const added = store.addElement(templates.button, root);
  store.saveComponent(root, "Card");
  let current = useEditorStore.getState();
  assert.equal(current.elementsById[instanceChild].props.content, "Local text");
  assert.equal(current.elementsById[instanceChild].styles.color, "#123456");
  assert.equal(current.elementsById[instance].children.length, 2);
  assert.ok(current.elementsById[added]);
  const saved = captureProject("components", "Components");
  assert.doesNotThrow(() => parseProject(saved));
  store.undo();
  current = useEditorStore.getState();
  assert.equal(current.elementsById[instance].children.length, 1);
  store.redo();
  assert.equal(
    useEditorStore.getState().elementsById[instance].children.length,
    2,
  );
  store.saveComponent(instanceChild, "Invalid nested publish");
  assert.equal(useEditorStore.getState().components[id].name, "Card");
});

test("token removal freezes values in responsive overrides and component definitions without touching content", () => {
  restoreProject(emptyProject());
  const store = useEditorStore.getState();
  const id = store.addElement(templates.text);
  store.setToken("font", {
    name: "Body",
    kind: "font",
    value: '"Work Sans", sans-serif',
  });
  store.updateElement(id, {
    styles: { fontFamily: "var(--lv-font)" },
    props: { content: "var(--lv-font)" },
  });
  store.saveComponent(id, "Text");
  useEditorUIStore.setState({ breakpoint: "mobile" });
  store.updateElement(id, { styles: { color: "var(--lv-font)" } });
  store.setToken("font", null);
  const current = useEditorStore.getState(),
    node = current.elementsById[id];
  assert.equal(node.styles.fontFamily, '"Work Sans", sans-serif');
  assert.equal(node.props.content, "var(--lv-font)");
  assert.equal(
    node.responsive!.mobile!.styles!.color,
    '"Work Sans", sans-serif',
  );
  assert.equal(
    Object.values(current.components)[0].nodes[id].styles.fontFamily,
    '"Work Sans", sans-serif',
  );
  store.undo();
  assert.equal(
    useEditorStore.getState().elementsById[id].styles.fontFamily,
    "var(--lv-font)",
  );
});

test("curved paths and multi-object motion validate and compile to SVG and reduced-motion-aware CSS", () => {
  const project = emptyProject();
  restoreProject(project);
  const store = useEditorStore.getState();
  const vector = {
    points: [
      { x: 0, y: 0, outX: 20, outY: 30 },
      { x: 100, y: 100, inX: 60, inY: 80 },
    ],
    closed: false,
    stroke: "#123456",
    strokeWidth: 2,
    fill: "none",
  };
  const id = store.addElement({ ...templates.shape, vector });
  store.updateElement(id, {
    motion: {
      duration: 2,
      delay: 0.5,
      iterations: 2,
      easing: "linear",
      frames: [
        { time: 0, x: 0, y: 0, scale: 1, rotation: 0, opacity: 0 },
        { time: 1, x: 100, y: 20, scale: 1.5, rotation: 45, opacity: 1 },
      ],
    },
  });
  assert.equal(vectorPath(vector), "M 0 0 C 20 30 60 80 100 100");
  const saved = parseProject(captureProject(project.id, project.name)),
    output = compileProject(saved);
  assert.match(
    output.files["frontend/app/page.jsx"],
    /M 0 0 C 20 30 60 80 100 100/,
  );
  assert.match(
    output.files["frontend/app/page.css"],
    /translate\(100px, 20px\)/,
  );
  assert.match(output.files["frontend/app/page.css"], /prefers-reduced-motion/);
  const invalid = structuredClone(saved);
  invalid.editor.elementsById[id].motion!.frames[1].time = 0;
  assert.throws(() => parseProject(invalid));
  const invalidToken = structuredClone(saved);
  invalidToken.editor.tokens = {
    evil: { name: "Bad", kind: "font", value: "url(https://evil.example)" },
  };
  assert.throws(() => parseProject(invalidToken));
});

test("asset references persist independently of placed images and freeze safely on removal", () => {
  const project = emptyProject();
  restoreProject(project);
  const store = useEditorStore.getState();
  const source = "data:image/png;base64,iVBORw0KGgo=";
  store.setAsset("logo", {
    name: "Logo",
    mime: "image/png",
    source,
    width: 10,
    height: 10,
  });
  const image = store.addElement({
    ...templates.image,
    props: { assetId: "logo", src: "", alt: "Logo" },
  });
  store.saveComponent(image, "Logo component");
  const saved = captureProject(project.id, project.name);
  restoreProject(saved);
  assert.equal(useEditorStore.getState().assets.logo.source, source);
  assert.match(
    compileProject(saved).files["frontend/app/page.jsx"],
    /data:image\/png;base64,iVBORw0KGgo=/,
  );
  store.setAsset("logo", null);
  const removed = captureProject(project.id, project.name);
  assert.doesNotThrow(() => parseProject(removed));
  assert.equal(removed.editor.elementsById[image].props.src, source);
  assert.equal(
    Object.values(removed.editor.components!)[0].nodes[image].props.assetId,
    "",
  );
  store.undo();
  assert.ok(useEditorStore.getState().assets.logo);
  const invalid = structuredClone(saved);
  invalid.editor.assets!.logo.source = "data:image/svg+xml;base64,PHN2Zz4=";
  assert.throws(() => parseProject(invalid));
});
