import test from "node:test";
import assert from "node:assert/strict";
import { runInNewContext } from "node:vm";
import {
  emptyProject,
  restoreProject,
  captureProject,
} from "../src/lib/project/workspace";
import { useEditorStore } from "../src/store/editorStore";
import { templates } from "../src/templates";
import { compileProject } from "../src/lib/project/compiler";
import { observabilityRuntime } from "../src/lib/codegen/observability";
import { useBackendStore } from "../src/store/backendStore";

test("untouched form children flow and a new field precedes Submit through project restore", () => {
  const project = emptyProject();
  restoreProject(project);
  const store = useEditorStore.getState();
  const form = store.addElement(templates.form);
  const company = store.addElement(
    { ...templates.input, props: { name: "company" } },
    form,
  );
  const saved = captureProject(project.id, project.name);
  restoreProject(saved);
  const nodes = useEditorStore.getState().elementsById;
  const children = nodes[form].children;
  assert.ok(
    children.indexOf(company) <
      children.findIndex((id) => nodes[id].type === "button"),
  );
  for (const id of children) assert.equal(nodes[id].layout.position, "static");
  for (const id of children)
    useEditorStore
      .getState()
      .updateElement(id, {
        layout: { ...nodes[id].layout, position: "absolute" },
      });
  useEditorStore.getState().arrangeFormFields(form);
  for (const id of children)
    assert.equal(
      useEditorStore.getState().elementsById[id].layout.position,
      "static",
    );
  useEditorStore.getState().undo();
  for (const id of children)
    assert.equal(
      useEditorStore.getState().elementsById[id].layout.position,
      "absolute",
    );
});

test("page search settings survive restore and produce safe server metadata with patched dependencies", () => {
  const project = emptyProject();
  restoreProject(project);
  const store = useEditorStore.getState();
  store.updatePageSeo(project.editor.activePageId, {
    title: "Studio </script>",
    description: "Independent designers",
    noIndex: true,
  });
  store.addPage();
  const work = useEditorStore.getState().activePageId;
  store.updatePageRoute(work, "/work");
  store.updatePageSeo(work, {
    title: "Our work",
    description: "Selected projects",
    noIndex: false,
  });
  const saved = captureProject(project.id, project.name);
  restoreProject(saved);
  const output = compileProject(saved);
  assert.match(
    output.files["frontend/app/layout.jsx"],
    /Studio \\u003c\/script>/,
  );
  assert.match(output.files["frontend/app/layout.jsx"], /"index":false/);
  assert.match(output.files["frontend/app/work/layout.jsx"], /Our work/);
  assert.match(output.files["frontend/app/work/layout.jsx"], /"openGraph"/);
  assert.equal(
    JSON.parse(output.files["frontend/package.json"]).dependencies.next,
    "16.4.0",
  );
});

test("error handler exposes authored identity errors and hides internals", () => {
  restoreProject(emptyProject());
  useBackendStore.getState().loadAuthTemplate();
  const service = useBackendStore.getState().services[0];
  const exports: Record<string, (...args: unknown[]) => void> = {};
  runInNewContext(observabilityRuntime(service), {
    exports,
    require: () => ({}),
    console,
  });
  let status = 0,
    body = { error: { message: "", code: "" } };
  const res = {
    status(code: number) {
      status = code;
      return this;
    },
    json(value: typeof body) {
      body = value;
    },
  };
  exports.error(
    {
      status: 403,
      publicMessage: "Verify your email",
      publicCode: "email_verification_required",
    },
    {},
    res,
    () => {},
  );
  assert.equal(status, 403);
  assert.equal(body.error.message, "Verify your email");
  assert.equal(body.error.code, "email_verification_required");
  exports.error(
    {
      status: 500,
      message: "database password",
      publicMessage: "database password",
    },
    {},
    res,
    () => {},
  );
  assert.equal(status, 500);
  assert.notEqual(body.error.message, "database password");
});
