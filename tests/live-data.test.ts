import test from "node:test";
import assert from "node:assert/strict";
import { liveDataFixture } from "./helpers/live-data-fixture";
import { compileProject } from "../src/lib/project/compiler";
import { resolveDataSource, listEndpoint } from "../src/lib/live-data";
import { parseProject } from "../src/lib/project/schema";
import { restoreProject, captureProject } from "../src/lib/project/workspace";
import { useEditorStore } from "../src/store/editorStore";
import { projectHistory } from "../src/store/projectHistory";

test("live data survives schema/history and compiles escaped table and nested record templates", () => {
  const { project } = liveDataFixture(true);
  const node = project.editor.elementsById.live_table;
  assert.equal(resolveDataSource(node, project.backend.services).size, 2);
  restoreProject(project);
  projectHistory.clear();
  useEditorStore.getState().updateElement(node.id, {
    dataSource: { ...node.dataSource!, emptyMessage: "Nothing here yet" },
  });
  useEditorStore.getState().undo();
  assert.equal(
    useEditorStore.getState().elementsById[node.id].dataSource!.emptyMessage,
    "No entries yet.",
  );
  useEditorStore.getState().redo();
  const saved = parseProject(captureProject(project.id, project.name));
  assert.equal(
    saved.editor.elementsById[node.id].dataSource!.emptyMessage,
    "Nothing here yet",
  );
  const output = compileProject(saved);
  assert.deepEqual(
    output.diagnostics.filter((d) => d.severity === "error"),
    [],
  );
  const page = output.files["frontend/app/page.jsx"];
  assert.match(page, /LiveRecords source=/);
  assert.match(page, /recordText\(record, "title"\)/);
  assert.match(page, /recordText\(record, "quantity"\)/);
  assert.match(page, /<th scope="col">title<\/th>/);
  assert.match(page, /records\.map\(record => <article key=\{record\._id\}/);
  const renamed = structuredClone(saved);
  const model = renamed.backend.services[0].blocks.find(
    (b) => b.type === "db_model",
  )!;
  if (model.type === "db_model") model.config.fields[0].name = "headline";
  assert.match(
    compileProject(renamed).files["frontend/app/page.jsx"],
    /recordText\(record, "headline"\)/,
  );
  assert.match(output.files["levoks.ir.json"], /dataSource/);
});

test("invalid live sources, fields and record scopes block compilation without altering backend policies", () => {
  const { project, serviceId } = liveDataFixture(true);
  for (const endpointId of ["missing", "post", "get", "refresh"])
    assert.throws(() =>
      listEndpoint(project.backend.services, serviceId, endpointId),
    );
  const invalid = structuredClone(project);
  invalid.editor.elementsById.live_table.dataSource!.columns[0].fieldId =
    "deleted_field";
  assert.throws(() => compileProject(invalid), /deleted or private field/);
  const orphan = structuredClone(project);
  orphan.editor.elementsById.repeater_title.parentId = null;
  orphan.editor.elementsById.repeater_card.children =
    orphan.editor.elementsById.repeater_card.children.filter(
      (id) => id !== "repeater_title",
    );
  orphan.editor.pageElementMap[orphan.editor.activePageId].push(
    "repeater_title",
  );
  orphan.editor.rootIds = [
    ...orphan.editor.pageElementMap[orphan.editor.activePageId],
  ];
  assert.throws(() => compileProject(orphan), /missing live source or field/);
  const nested = structuredClone(project);
  nested.editor.elementsById.repeater_card.dataSource =
    nested.editor.elementsById.live_collection.dataSource;
  assert.throws(() => compileProject(nested), /Nested live sources/);
  const duplicate = structuredClone(project);
  duplicate.editor.elementsById.live_table.dataSource!.columns.push(
    duplicate.editor.elementsById.live_table.dataSource!.columns[0],
  );
  assert.throws(() => compileProject(duplicate), /distinct table columns/);
  const inherited = structuredClone(project);
  inherited.editor.elementsById.repeater_title.dataField = "toString";
  assert.throws(
    () => compileProject(inherited),
    /missing live source or field/,
  );
  const copiedTemplate = structuredClone(project);
  copiedTemplate.editor.elementsById.repeater_card.type = "repeater";
  copiedTemplate.editor.elementsById.repeater_card.definitionId = "repeater";
  assert.throws(() => compileProject(copiedTemplate), /nested repeaters/);
  const conflictingMapping = structuredClone(project);
  const post = conflictingMapping.backend.services[0].blocks.find(
    (b) => b.id === "post",
  )!;
  if (post.type === "rest_endpoint")
    post.config.responseBody = [
      { name: "title", type: "string", required: true },
    ];
  conflictingMapping.routing.connections[0].responseMappings = [
    { fieldId: "title", elementId: "repeater_title" },
  ];
  assert.throws(
    () => compileProject(conflictingMapping),
    /response mappings cannot update a repeated record template/,
  );
  const { project: privateProject, endpointId } = liveDataFixture(true, true);
  const before = JSON.stringify(privateProject.backend);
  const source = listEndpoint(
    privateProject.backend.services,
    serviceId,
    endpointId,
  );
  assert.equal(source.endpoint.config.authRequired, true);
  assert.match(source.settings.account, /operators/);
  compileProject(privateProject);
  assert.equal(JSON.stringify(privateProject.backend), before);
});
