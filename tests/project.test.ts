import test from "node:test";
import assert from "node:assert/strict";
import "fake-indexeddb/auto";
import ts from "typescript";
import { Script } from "node:vm";
import {
  emptyProject,
  captureProject,
  restoreProject,
} from "../src/lib/project/workspace";
import {
  parseProject,
  redactProject,
  designFingerprint,
} from "../src/lib/project/schema";
import { compileProject } from "../src/lib/project/compiler";
import { validateFiles } from "../src/lib/codegen/files";
import { useEditorStore } from "../src/store/editorStore";
import { useBackendStore } from "../src/store/backendStore";
import { templates } from "../src/templates";
import { siteTemplates } from "../src/templates/siteTemplates";
import {
  saveProject,
  getProject,
  listCheckpoints,
} from "../src/lib/project/storage";

test("nested form templates are inserted, restored and generated exactly once", () => {
  const p = emptyProject();
  restoreProject(p);
  const id = useEditorStore.getState().addElement(templates.form);
  const project = parseProject(captureProject(p.id, p.name));
  assert.equal(project.editor.elementsById[id].children.length, 4);
  const { files } = compileProject(project);
  assert.equal(
    (files["frontend/app/page.jsx"].match(/Your email/g) || []).length,
    1,
  );
  assert.match(files["frontend/app/page.jsx"], /name="email"/);
  restoreProject(project);
  assert.notEqual(useEditorStore.getState().addElement(templates.form), id);
});

test("deleting inactive and active pages preserves other pages and removes descendants", () => {
  const p = emptyProject();
  restoreProject(p);
  const home = useEditorStore.getState().addElement(templates.form);
  const other = useEditorStore.getState().addPage("About");
  const about = useEditorStore.getState().addElement(templates.button);
  useEditorStore.getState().deletePage(p.editor.activePageId);
  assert.equal(useEditorStore.getState().rootIds[0], about);
  assert.equal(useEditorStore.getState().elementsById[home], undefined);
  assert.equal(useEditorStore.getState().activePageId, other);
  // Delete a non-home active page in a fresh workspace.
  restoreProject(p);
  useEditorStore.getState().addElement(templates.form);
  const second = useEditorStore.getState().addPage();
  useEditorStore.getState().addElement(templates.form);
  useEditorStore.getState().deletePage(second);
  assert.doesNotThrow(() => parseProject(captureProject(p.id, p.name)));
});

test("replacing a page template does not leave orphaned elements", () => {
  const p = emptyProject();
  restoreProject(p);
  useEditorStore.getState().addElement(templates.form);
  useEditorStore.getState().loadTemplate(siteTemplates[0].elements);
  assert.doesNotThrow(() => parseProject(captureProject(p.id, p.name)));
});

test("project imports reject broken references, cycles, duplicate routes and unsupported versions", () => {
  const p = emptyProject();
  assert.throws(() => parseProject({ ...p, schemaVersion: 2 }));
  assert.throws(() =>
    parseProject({ ...p, editor: { ...p.editor, rootIds: ["missing"] } }),
  );
  assert.throws(() =>
    parseProject({
      ...p,
      editor: {
        ...p.editor,
        pages: [
          ...p.editor.pages,
          { id: "page_2", title: "Duplicate", route: "/" },
        ],
      },
    }),
  );
  restoreProject(p);
  const id = useEditorStore.getState().addElement(templates.container);
  const cyclic = captureProject(p.id, p.name);
  cyclic.editor.elementsById[id].children = [id];
  assert.throws(() => parseProject(cyclic), /cycle/);
});

test("export paths reject traversal, environment secrets, git internals and private keys", () => {
  for (const path of [
    "../escape.js",
    "/absolute.js",
    "C:\\secrets",
    "x/../../file",
    ".git/config",
    "frontend/.env.local",
    "private.pem",
  ])
    assert.throws(() => validateFiles({ [path]: "secret" }));
  assert.deepEqual(validateFiles({ "frontend/.env.example": "API_KEY=" }), {
    "frontend/.env.example": "API_KEY=",
  });
});

test("all pages and their nested action routes are compiled", () => {
  const p = emptyProject();
  restoreProject(p);
  const form = useEditorStore.getState().addElement(templates.form);
  const page2 = useEditorStore.getState().addPage("About");
  const button = useEditorStore.getState().addElement(templates.button);
  const project = captureProject(p.id, p.name);
  project.routing.nodes = project.editor.pages.map((page, i) => ({
    id: `node_${i}`,
    type: "page",
    refId: page.id,
    position: { x: i * 300, y: 0 },
    width: 240,
    height: 180,
  }));
  project.routing.connections = [
    {
      id: "edge_1",
      fromNodeId: "node_0",
      toNodeId: "node_1",
      fromPortId: `node_0:out:${form}`,
      toPortId: "node_1:in:page",
    },
    {
      id: "edge_2",
      fromNodeId: "node_1",
      toNodeId: "node_0",
      fromPortId: `node_1:out:${button}`,
      toPortId: "node_0:in:page",
    },
  ];
  const { files, graph } = compileProject(project);
  assert.equal(graph.flows.length, 2);
  assert.ok(files["frontend/app/page-2/page.jsx"]);
  assert.match(
    files["frontend/app/page.jsx"],
    /window.location.href = "\/page-2"/,
  );
  assert.equal(
    graph.flows.find((f) => f.trigger.elementId === button)?.trigger.pageId,
    page2,
  );
});

test("generated JSX escapes hostile content and is syntactically valid", () => {
  const p = emptyProject();
  restoreProject(p);
  useEditorStore
    .getState()
    .addElement({
      ...templates.text,
      props: { content: '<script>alert("x")</script> {bad}' },
    });
  useBackendStore.getState().loadCrudTemplate();
  const { files } = compileProject(captureProject(p.id, p.name));
  assert.doesNotMatch(files["frontend/app/page.jsx"], /<script>/);
  for (const [path, content] of Object.entries(files)) {
    if (path.endsWith(".jsx")) {
      const parsed = ts.createSourceFile(
        path,
        content,
        ts.ScriptTarget.Latest,
        true,
        ts.ScriptKind.JSX,
      );
      const errors = (
        parsed as ts.SourceFile & { parseDiagnostics: ts.Diagnostic[] }
      ).parseDiagnostics;
      assert.equal(
        errors.length,
        0,
        `${path}: ${errors.map((e) => e.messageText).join(", ")}`,
      );
    }
    if (path.startsWith("backend/") && path.endsWith(".js"))
      assert.doesNotThrow(() => new Script(content), path);
    if (path.endsWith("package.json")) assert.ok(JSON.parse(content).name);
  }
  assert.match(files["backend/docker-compose.yml"], /build: .\/crud-api/);
  assert.doesNotMatch(files["backend/docker-compose.yml"], /27017:27017/);
});

test("secrets are redacted from saved projects and generated files", () => {
  const p = emptyProject();
  restoreProject(p);
  useBackendStore.getState().loadAuthTemplate();
  const service = useBackendStore.getState().services[0];
  const auth = service.blocks.find((b) => b.type === "auth_block")!;
  useBackendStore
    .getState()
    .updateBlockConfig(service.id, auth.id, {
      secretKey: "a-very-private-value",
    });
  const project = captureProject(p.id, p.name);
  assert.doesNotMatch(
    JSON.stringify(redactProject(project)),
    /a-very-private-value/,
  );
  assert.doesNotMatch(
    JSON.stringify(compileProject(project).files),
    /a-very-private-value|your-secret-key/,
  );
});

test("source edits become stale when the design changes", () => {
  const p = emptyProject();
  const files = compileProject(p).files;
  p.source = { files, basedOn: designFingerprint(p) };
  assert.equal(
    compileProject(p).diagnostics.filter((d) => d.severity === "error").length,
    0,
  );
  p.editor.canvasSettings.width = 800;
  assert.ok(
    compileProject(p).diagnostics.some((d) => /canvas changed/.test(d.message)),
  );
});

test("IndexedDB saves are atomic, reject stale revisions, and retain bounded checkpoints", async () => {
  const p = emptyProject();
  let revision = await saveProject(p, 0, "Initial");
  await assert.rejects(
    saveProject({ ...p, name: "Stale tab" }, 0),
    /another tab/,
  );
  assert.equal((await getProject(p.id))?.name, p.name);
  for (let i = 0; i < 22; i++) {
    p.updatedAt = new Date(Date.now() + i * 1000).toISOString();
    revision = await saveProject(p, revision, `Checkpoint ${i}`);
  }
  assert.equal((await listCheckpoints(p.id)).length, 20);
  assert.equal((await getProject(p.id))?.revision, 23);
});
