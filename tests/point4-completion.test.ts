import { canGroup, canUngroup } from "../src/lib/grouping";
import { execFileSync } from "node:child_process";
import { projectHistory } from "../src/store/projectHistory";
import test from "node:test";
import assert from "node:assert/strict";
import {
  emptyProject,
  restoreProject,
  captureProject,
} from "../src/lib/project/workspace";
import { useEditorStore } from "../src/store/editorStore";
import { useEditorUIStore } from "../src/store/editorUIStore";
import { templates } from "../src/templates";
import { elementTemplate } from "../src/lib/elements/registry";
import { resolveElement, breakpointForWidth } from "../src/lib/design";
import { parseProject } from "../src/lib/project/schema";
import { generatedPreview } from "../src/lib/project/preview";
import { compileProject } from "../src/lib/project/compiler";
import { projectivePlane } from "../src/lib/projective-plane";
import { formatSpans, replaceRichText } from "../src/lib/elements/rich-content";

test("custom breakpoints cascade in width order, survive schema/export, and rename/remove atomically across component definitions", () => {
  const project = emptyProject();
  restoreProject(project);
  const store = useEditorStore.getState();
  store.setBreakpoints([
    { name: "Compact", width: 900 },
    { name: "Small phone", width: 400 },
    { name: "Large", width: 1400 },
  ]);
  const id = store.addElement(templates.text);
  for (const [bp, styles] of [
    ["base", { color: "black", fontSize: "24px" }],
    ["tablet", { color: "blue" }],
    ["custom_900", { fontSize: "20px" }],
    ["mobile", { color: "red" }],
    ["custom_400", { fontSize: "16px" }],
  ] as const) {
    useEditorUIStore.getState().setBreakpoint(bp);
    store.updateElement(id, { styles });
  }
  let node = useEditorStore.getState().elementsById[id];
  assert.equal(resolveElement(node, "custom_400").styles.color, "red");
  assert.equal(resolveElement(node, "mobile").styles.fontSize, "20px");
  assert.equal(
    breakpointForWidth(
      850,
      useEditorStore.getState().canvasSettings.breakpoints,
    ),
    "custom_900",
  );
  store.saveComponent(id, "Responsive text");
  store.setBreakpoints(
    [
      { name: "Compact", width: 880 },
      { name: "Small phone", width: 400 },
      { name: "Large", width: 1400 },
    ],
    { from: 900, to: 880 },
  );
  node = useEditorStore.getState().elementsById[id];
  assert.ok(node.responsive?.custom_880);
  assert.equal(node.responsive?.custom_900, undefined);
  const saved = parseProject(captureProject(project.id, project.name));
  const output = compileProject(saved);
  assert.match(Object.values(output.files).join("\n"), /max-width: 880px/);
  assert.ok(
    Object.values(saved.editor.components!)[0].nodes[id].responsive?.custom_880,
  );
  store.setBreakpoints([]);
  assert.deepEqual(
    Object.keys(useEditorStore.getState().elementsById[id].responsive!),
    ["tablet", "mobile"],
  );
  store.undo();
  assert.ok(useEditorStore.getState().elementsById[id].responsive?.custom_880);
  assert.throws(() =>
    store.setBreakpoints([{ name: "Duplicate", width: 600 }]),
  );
  const invalid = structuredClone(saved);
  invalid.editor.canvasSettings.breakpoints = [];
  assert.throws(() => parseProject(invalid), /missing custom breakpoint/);
});
test("projective pointer conversion round-trips corners and interior points through perspective, and rejects collapsed planes", () => {
  const plane = projectivePlane(
    [
      { x: 80, y: 40 },
      { x: 450, y: 75 },
      { x: 380, y: 360 },
      { x: 110, y: 280 },
    ],
    300,
    200,
  );
  for (const [x, y] of [
    [0, 0],
    [300, 0],
    [300, 200],
    [0, 200],
    [40, 100],
    [200, 80],
  ]) {
    const s = plane.toScreen(x, y),
      l = plane.toLocal(s.x, s.y);
    assert.ok(Math.hypot(x - l.x, y - l.y) < 1e-8);
  }
  assert.throws(
    () =>
      projectivePlane(
        [
          { x: 0, y: 0 },
          { x: 0, y: 0 },
          { x: 0, y: 4 },
          { x: 0, y: 4 },
        ],
        10,
        10,
      ),
    /edge-on/,
  );
});
test("rich formatting and native widget contracts emit escaped semantic content and validated maps", () => {
  const project = emptyProject();
  restoreProject(project);
  const store = useEditorStore.getState();
  const spans = formatSpans([{ text: "Hello world" }], 6, 11, { bold: true });
  assert.deepEqual(spans, [{ text: "Hello " }, { text: "world", bold: true }]);
  assert.deepEqual(replaceRichText(spans, "Hello worlds"), [
    { text: "Hello " },
    { text: "world", bold: true },
    { text: "s", bold: true },
  ]);
  store.addElement({
    ...elementTemplate("richText"),
    props: {
      richDocument: JSON.stringify([
        {
          kind: "p",
          spans: [
            { text: "<script>", bold: true },
            { text: "Link", href: "/" },
          ],
        },
      ]),
    },
  });
  store.addElement({
    ...elementTemplate("timeline"),
    props: {
      timelineEvents: JSON.stringify([
        { title: "Launch", date: "2026", description: "Our milestone" },
      ]),
    },
  });
  for (const id of ["map", "drawer", "popover", "tooltip", "toast"])
    store.addElement(elementTemplate(id));
  compileProject(captureProject(project.id, project.name));
  assert.match(
    generatedPreview(
      captureProject(project.id, project.name),
      project.editor.activePageId,
    ),
    /<strong>&lt;script&gt;<\/strong>/,
  );
  assert.match(
    generatedPreview(
      captureProject(project.id, project.name),
      project.editor.activePageId,
    ),
    /data-timeline/,
  );
  assert.match(
    generatedPreview(
      captureProject(project.id, project.name),
      project.editor.activePageId,
    ),
    /openstreetmap.org\/export\/embed.html/,
  );
  assert.match(
    generatedPreview(
      captureProject(project.id, project.name),
      project.editor.activePageId,
    ),
    /popover="manual"/,
  );
  assert.match(
    generatedPreview(
      captureProject(project.id, project.name),
      project.editor.activePageId,
    ),
    /data-drawer="right"/,
  );
  assert.match(
    generatedPreview(
      captureProject(project.id, project.name),
      project.editor.activePageId,
    ),
    /data-toast/,
  );
  const invalid = captureProject(project.id, project.name);
  Object.values(invalid.editor.elementsById).find(
    (n) => n.definitionId === "map",
  )!.props.latitude = 90;
  assert.throws(() => parseProject(invalid), /latitude/);
});

test("durable history remains bounded and ignores invalid intermediate drafts", () => {
  restoreProject(emptyProject());
  const store = useEditorStore.getState();
  const id = store.addElement(templates.text);
  store.updateElement(id, { props: { content: "invalid draft" } });
  store.updateElement(id, { props: { content: "valid content" } });
  const normalize = (value: Record<string, Record<string, unknown>>) => {
    if (JSON.stringify(value).includes("invalid draft"))
      throw new Error("Invalid draft");
    return value;
  };
  const journal = projectHistory.serialize(normalize);
  assert.equal(journal.past.length, 0);
  assert.doesNotThrow(() => JSON.stringify(journal));
  projectHistory.clear();
  store.updateElement(id, { props: { content: "x".repeat(2_000_000) } });
  for (let i = 0; i < 50; i++) store.updateElementPosition(id, i, i);
  const bounded = projectHistory.serialize((value) => value);
  assert.ok(JSON.stringify(bounded).length < 10_000_100);
  assert.ok(bounded.past.length < 50);
  const head = structuredClone(bounded.head);
  head.editor.canvasSettings = {
    width: 10,
    height: 10,
    backgroundColor: "red",
  };
  assert.equal(
    projectHistory.hydrate({ ...bounded, head }, (value) => value),
    false,
  );
  assert.equal(projectHistory.canUndo, false);
});

test("shared widget and animation export sources are current and deterministic across compilers", () => {
  assert.doesNotThrow(() =>
    execFileSync(
      process.execPath,
      ["scripts/sync-export-runtimes.mjs", "--check"],
      { windowsHide: true },
    ),
  );
});

test("ungroup preserves wrappers when 3D compositing cannot be flattened safely", () => {
  restoreProject(emptyProject());
  const store = useEditorStore.getState();
  const a = store.addElement(templates.shape),
    b = store.addElement(templates.shape);
  store.selectElements([a, b]);
  store.groupSelection();
  const group = useEditorStore.getState().selectedElementId!;
  store.updateElement(group, {
    layout: { ...store.getElement(group)!.layout, rotation: 30 },
  });
  assert.equal(canUngroup(useEditorStore.getState()), true);
  store.updateElement(a, {
    layout: { ...store.getElement(a)!.layout, rotateX: 20 },
  });
  assert.equal(canUngroup(useEditorStore.getState()), false);
  store.updateElement(group, {
    layout: {
      ...store.getElement(group)!.layout,
      rotation: 0,
      perspective: 800,
    },
  });
  assert.equal(canUngroup(useEditorStore.getState()), false);
  store.updateElement(group, {
    layout: { ...store.getElement(group)!.layout, perspective: 0 },
  });
  assert.equal(canUngroup(useEditorStore.getState()), true);
});

test("autosave journals an active typing gesture without ending the interaction", () => {
  restoreProject(emptyProject());
  const store = useEditorStore.getState();
  const id = store.addElement(templates.text);
  projectHistory.clear();
  const previous = store.getElement(id)!.props.content;
  projectHistory.begin();
  store.updateElement(id, { props: { content: "Autosaved typing" } });
  const journal = projectHistory.serialize((value) => value);
  assert.equal(projectHistory.canUndo, false);
  assert.equal(journal.past.length, 1);
  projectHistory.end();
  assert.equal(
    projectHistory.hydrate(journal, (value) => value),
    true,
  );
  store.undo();
  assert.equal(store.getElement(id)!.props.content, previous);
  store.redo();
  assert.equal(store.getElement(id)!.props.content, "Autosaved typing");
});

test("grouping retains flow roots rather than baking their ignored coordinates", () => {
  restoreProject(emptyProject());
  const store = useEditorStore.getState();
  const a = store.addElement(templates.text, undefined, 40, 60);
  const b = store.addElement(templates.text, undefined, 300, 60);
  store.selectElements([a, b]);
  assert.equal(canGroup(useEditorStore.getState()), true);
  store.updateElement(a, { styles: { position: "static" } });
  assert.equal(canGroup(useEditorStore.getState()), false);
  store.updateElement(a, {
    styles: { position: "absolute" },
    responsive: { tablet: { styles: { position: "relative" } } },
  });
  assert.equal(canGroup(useEditorStore.getState()), false);
  store.updateElement(a, {
    responsive: { tablet: { styles: { position: "absolute" } } },
  });
  assert.equal(canGroup(useEditorStore.getState()), true);
});
