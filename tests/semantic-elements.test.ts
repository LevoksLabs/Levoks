import test from "node:test";
import assert from "node:assert/strict";
import {
  ELEMENT_DEFINITIONS,
  elementTemplate,
  searchElements,
} from "../src/lib/elements/registry";
import {
  customTemplate,
  customDefinitionSchema,
} from "../src/lib/elements/custom";
import { nativeMarkup, nativeTree } from "../src/lib/elements/native";
import {
  emptyProject,
  restoreProject,
  captureProject,
} from "../src/lib/project/workspace";
import { parseProject } from "../src/lib/project/schema";
import { compileProject } from "../src/lib/project/compiler";
import { generatedPreview } from "../src/lib/project/preview";
import { useEditorStore } from "../src/store/editorStore";
import { useEditorUIStore } from "../src/store/editorUIStore";
import { BACKEND_REGISTRY } from "../src/lib/backend/registry";
import { analyzeSource } from "../src/lib/source-analysis";

test("every registry definition creates, round-trips and emits parseable React deterministically", () => {
  const project = emptyProject("Registry coverage");
  restoreProject(project);
  const store = useEditorStore.getState();
  for (const definition of ELEMENT_DEFINITIONS)
    store.addElement(elementTemplate(definition.id));
  const saved = parseProject(captureProject(project.id, project.name));
  assert.ok(ELEMENT_DEFINITIONS.length >= 90);
  restoreProject(saved);
  const first = compileProject(saved),
    second = compileProject(saved);
  assert.deepEqual(first.files, second.files);
  assert.deepEqual(first.diagnostics, []);
  for (const [file, source] of Object.entries(first.files).filter(([file]) =>
    file.endsWith(".jsx"),
  ))
    assert.deepEqual(analyzeSource(file, source).issues, [], file);
  for (const element of Object.values(saved.editor.elementsById))
    assert.ok(
      first.files["frontend/app/page.css"].includes(`.el-${element.id}`),
    );
  assert.match(first.files["frontend/app/page.jsx"], /type="checkbox"/);
  assert.match(first.files["frontend/app/page.jsx"], /<select/);
  assert.match(first.files["frontend/app/page.jsx"], /<table/);
  assert.match(first.files["frontend/app/page.jsx"], /<dialog/);
  assert.equal(
    JSON.parse(first.files["levoks.ir.json"]).generatorVersion,
    "semantic-1",
  );
  for (const term of [
    "checkbox",
    "date",
    "navbar",
    "table",
    "carousel",
    "pricing",
    "upload",
  ])
    assert.ok(searchElements(term).length, term);
});

test("semantic inspector properties, geometry, responsive styles, motion and events reach export", () => {
  const project = emptyProject();
  restoreProject(project);
  const store = useEditorStore.getState();
  const id = store.addElement(elementTemplate("navigationLink"));
  const page = store.addPage("Details");
  store.switchPage(project.editor.activePageId);
  store.updateElement(id, {
    props: { content: "Read details" },
    accessibility: { label: "Details page" },
    events: { onClick: { action: "navigate", target: page } },
    motion: {
      duration: 1,
      delay: 0,
      iterations: 1,
      easing: "ease-out",
      frames: [
        { time: 0, x: 0, y: 20, scale: 1, rotation: 0, opacity: 0 },
        { time: 1, x: 0, y: 0, scale: 1, rotation: 0, opacity: 1 },
      ],
    },
  });
  store.updateElementPosition(id, 123, 234);
  useEditorUIStore.setState({ breakpoint: "mobile" });
  store.updateElement(id, { styles: { width: "100%" } });
  const snapshot = captureProject(project.id, project.name);
  const output = compileProject(snapshot);
  assert.match(output.files["frontend/app/page.jsx"], /Read details/);
  assert.match(
    output.files["frontend/app/page.jsx"],
    /aria-label="Details page"/,
  );
  assert.match(output.files["frontend/app/page.jsx"], /navigateToPage/);
  assert.match(output.files["frontend/app/page.css"], /width: 100%/);
  assert.match(output.files["frontend/app/page.css"], /@media[^}]+position: absolute/);
  assert.match(output.files["frontend/app/page.css"], /@keyframes motion-/);
  assert.equal(snapshot.editor.elementsById[id].layout.x, 123);
  assert.match(
    generatedPreview(snapshot, project.editor.activePageId),
    /levoks:preview:navigate/,
  );
  store.deletePage(page);
  assert.deepEqual(useEditorStore.getState().elementsById[id].events, {});
  store.undo();
  assert.equal(
    useEditorStore.getState().elementsById[id].events?.onClick.target,
    page,
  );
});

test("custom components preserve typed properties and source without executing it in preview", () => {
  const project = emptyProject();
  restoreProject(project);
  const store = useEditorStore.getState();
  const definition = customDefinitionSchema.parse({
    name: "PricingCard",
    version: 1,
    framework: "react",
    description: "Test",
    source:
      "export default function PricingCard({ title, price }) { return <article><h2>{title}</h2><p>{price}</p></article>; }",
    props: {
      title: { type: "string", default: "Starter" },
      price: { type: "number", default: 19 },
    },
    events: ["onSelect"],
    children: false,
    dependencies: {},
  });
  store.setCustomElement("pricing", definition);
  const id = store.addElement(customTemplate("pricing", definition));
  store.updateElement(id, { props: { price: 42 } });
  const saved = parseProject(captureProject(project.id, project.name));
  restoreProject(saved);
  const output = compileProject(saved);
  assert.equal(
    output.files["frontend/components/custom/pricing.jsx"],
    definition.source,
  );
  assert.match(output.files["frontend/app/page.jsx"], /price.*42/);
  assert.throws(
    () => generatedPreview(saved, saved.editor.activePageId),
    /custom source/,
  );
  const invalid = structuredClone(saved);
  invalid.editor.elementsById[id].props.price = "bad";
  assert.throws(() => parseProject(invalid), /Invalid custom property/);
  assert.throws(() =>
    customDefinitionSchema.parse({
      ...definition,
      dependencies: { react: "19.0.0" },
    }),
  );
});

test("legacy migration is lossless, future definitions and unsafe native fields fail closed", () => {
  const project = emptyProject();
  restoreProject(project);
  const store = useEditorStore.getState();
  const id = store.addElement(elementTemplate("button"));
  const saved = captureProject(project.id, project.name);
  delete saved.editor.elementsById[id].definitionId;
  delete saved.editor.elementsById[id].definitionVersion;
  assert.equal(compileProject(parseProject(saved)).diagnostics.length, 0);
  saved.editor.elementsById[id].definitionVersion = 99;
  assert.throws(() => parseProject(saved), /incompatible/);
  restoreProject(project);
  const nativeId = store.addElement(elementTemplate("textInput"));
  const native = captureProject(project.id, project.name);
  native.editor.elementsById[nativeId].props.onClick = "alert(1)";
  assert.throws(() => parseProject(native), /Invalid/);
  const link = {
    ...useEditorStore.getState().elementsById[nativeId],
    ...elementTemplate("navigationLink"),
    id: nativeId,
    parentId: null,
    children: [],
    layout: useEditorStore.getState().elementsById[nativeId].layout,
    props: {
      content: "<script>alert(1)</script>",
      href: "javascript:alert(1)",
    },
  };
  const markup = nativeMarkup(nativeTree(link), "html");
  assert.ok(!markup.includes("javascript:"));
  assert.ok(!markup.includes("<script>"));
});

test("backend registry exposes existing configuration validators and explicit execution strategies", () => {
  for (const definition of Object.values(BACKEND_REGISTRY))
    assert.doesNotThrow(
      () => definition.propsSchema.parse(definition.defaultConfig),
      definition.type,
    );
  assert.equal(BACKEND_REGISTRY.query.generate, "workflow");
  assert.equal(BACKEND_REGISTRY.rest_endpoint.generate, "express-route");
  assert.equal(BACKEND_REGISTRY.relation.status, "experimental");
});
