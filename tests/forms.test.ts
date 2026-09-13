import test from "node:test";
import assert from "node:assert/strict";
import { runInNewContext } from "node:vm";
import ts from "typescript";
import { generateFrontendProject } from "../src/lib/codegen/frontend";
import {
  emptyProject,
  restoreProject,
  captureProject,
} from "../src/lib/project/workspace";
import { useEditorStore } from "../src/store/editorStore";
import { useBackendStore } from "../src/store/backendStore";
import { parseProject } from "../src/lib/project/schema";
import { templates } from "../src/templates";

test("repeated service templates retain unique names and available ports", () => {
  const p = emptyProject();
  restoreProject(p);
  const store = useBackendStore.getState();
  store.loadCrudTemplate();
  store.loadAuthTemplate();
  store.loadCrudTemplate();
  store.loadAuthTemplate();
  const saved = parseProject(captureProject(p.id, p.name));
  assert.equal(new Set(saved.backend.services.map((s) => s.port)).size, 4);
  assert.equal(new Set(saved.backend.services.map((s) => s.name)).size, 4);
});

test("exported form handler preserves typed values, encodes route parameters, and recovers after errors", async () => {
  const p = emptyProject();
  restoreProject(p);
  const id = useEditorStore.getState().addElement(templates.form);
  const elements = Object.values(useEditorStore.getState().elementsById);
  const output = generateFrontendProject(
    elements,
    [],
    p.editor.canvasSettings,
    p.editor.pages[0],
    p.editor.pages,
    undefined,
    {
      pages: [],
      services: [],
      flows: [
        {
          id: "test_flow",
          trigger: {
            elementId: id,
            elementType: "form",
            pageId: p.editor.activePageId,
            pageRoute: "/",
            event: "submit",
          },
          steps: [
            {
              type: "api_call",
              method: "PUT",
              endpoint: "/api/items/:id",
              serviceName: "items",
              servicePort: 3001,
              serviceId: "items",
              blockId: "update",
              authRequired: false,
            },
          ],
        },
      ],
    },
  );
  const source = ts.createSourceFile(
    "page.jsx",
    output.files["src/App.jsx"],
    ts.ScriptTarget.Latest,
    true,
    ts.ScriptKind.JSX,
  );
  let handler = "";
  const visit = (node: ts.Node) => {
    if (
      ts.isJsxAttribute(node) &&
      node.name.getText(source) === "onSubmit" &&
      node.initializer &&
      ts.isJsxExpression(node.initializer)
    )
      handler = node.initializer.expression!.getText(source);
    ts.forEachChild(node, visit);
  };
  visit(source);
  assert.ok(handler);
  let fields: Record<string, string> = {
    id: "a/b",
    price: "12.5",
    active: "on",
    title: "Example",
  };
  const statuses: string[] = [];
  const calls: { path: string; body: Record<string, unknown>; port: number }[] =
    [];
  const target = {
    dataset: {} as Record<string, string>,
    elements: [
      { name: "price", type: "number", value: "12.5", valueAsNumber: 12.5 },
      { name: "active", type: "checkbox", checked: false },
    ],
    setAttribute() {},
    removeAttribute() {},
  };
  const context = {
    event: { currentTarget: target, preventDefault() {} },
    FormData: class {
      entries() {
        return Object.entries(fields);
      }
    },
    URLSearchParams,
    setStatus: (value: string) => statuses.push(value),
    apiFetch: async (path: string, options: { body: string }, port: number) => {
      calls.push({ path, body: JSON.parse(options.body), port });
    },
  };
  await runInNewContext(`(${handler})(event)`, context);
  assert.equal(calls[0].path, "/api/items/a%2Fb");
  assert.deepEqual(calls[0].body, {
    price: 12.5,
    active: false,
    title: "Example",
  });
  assert.equal(calls[0].port, 3001);
  assert.equal(statuses.at(-1), "Done");
  fields = { price: "12.5" };
  await runInNewContext(`(${handler})(event)`, context);
  assert.equal(calls.length, 1);
  assert.equal(statuses.at(-1), "Missing id");
  assert.equal(target.dataset.busy, undefined);
});
