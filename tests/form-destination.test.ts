import test from "node:test";
import assert from "node:assert/strict";
import { runInNewContext } from "node:vm";
import ts from "typescript";
import {
  addSubmissionFormTemplate,
  createSubmissionDestination,
  submissionFields,
  connectFormDestination,
  suggestedFormMappings,
} from "../src/lib/form-destination";
import {
  emptyProject,
  restoreProject,
  captureProject,
} from "../src/lib/project/workspace";
import { parseProject } from "../src/lib/project/schema";
import { compileProject } from "../src/lib/project/compiler";
import { useEditorStore } from "../src/store/editorStore";
import { useBackendStore } from "../src/store/backendStore";
import { useRoutingStore } from "../src/store/routingStore";
import { projectHistory } from "../src/store/projectHistory";
import { templates } from "../src/templates";
import { elementTemplate } from "../src/lib/elements/registry";
import { mappedLoginFixture } from "./helpers/mapped-login-fixture";
import type { EndpointConfig } from "../src/types/backend";

test("working contact template creates ordinary validated blocks and wires, all restored in one history entry", () => {
  const initial = emptyProject();
  restoreProject(initial);
  const id = addSubmissionFormTemplate();
  const saved = parseProject(captureProject(initial.id, initial.name));
  const output = compileProject(saved);
  assert.deepEqual(
    output.diagnostics.filter((d) => d.severity === "error"),
    [],
  );
  assert.equal(output.graph.flows.length, 1);
  assert.equal(saved.routing.connections.length, 1);
  assert.equal(
    saved.backend.services[0].blocks.filter((b) => b.type === "rest_endpoint")
      .length,
    1,
  );
  assert.equal(
    saved.backend.services[0].blocks.find((b) => b.type === "rest_endpoint")!
      .config.method,
    "POST",
  );
  assert.equal(saved.editor.elementsById[id].props.resetOnSuccess, true);
  projectHistory.undo();
  assert.deepEqual(useEditorStore.getState().rootIds, []);
  assert.equal(useBackendStore.getState().services.length, 0);
  assert.equal(useRoutingStore.getState().nodes.length, 0);
  projectHistory.redo();
  assert.deepEqual(
    captureProject(initial.id, initial.name).backend,
    saved.backend,
  );
  assert.deepEqual(
    captureProject(initial.id, initial.name).routing,
    saved.routing,
  );
  const input = Object.values(useEditorStore.getState().elementsById).find(
    (node) => node.type === "input",
  )!;
  useEditorStore
    .getState()
    .updateElement(input.id, {
      props: { inputType: "file", multiple: true, maxFiles: 11 },
    });
  const before = captureProject(initial.id, initial.name);
  assert.throws(
    () => createSubmissionDestination(id, "Uploads"),
    /maximum from 1 to 5 files/,
  );
  assert.deepEqual(
    captureProject(initial.id, initial.name).backend,
    before.backend,
  );
  restoreProject(saved);
  assert.deepEqual(
    compileProject(captureProject(initial.id, initial.name)).diagnostics.filter(
      (d) => d.severity === "error",
    ),
    [],
  );
  // New collections have distinct database fallbacks even without copied .env files.
  const second = createSubmissionDestination(id, "Contact submissions");
  const secondService = useBackendStore
    .getState()
    .services.find((service) => service.id === second.serviceId)!;
  assert.notEqual(secondService.port, saved.backend.services[0].port);
  const multi = compileProject(captureProject(initial.id, initial.name));
  assert.deepEqual(
    multi.diagnostics.filter((d) => d.severity === "error"),
    [],
  );
  assert.match(
    multi.files["backend/contact-submissions/database.js"],
    /contact_submissions_db/,
  );
  assert.match(
    multi.files["backend/contact-submissions-2/database.js"],
    /contact_submissions_2_db/,
  );
  useEditorStore
    .getState()
    .switchPage(useEditorStore.getState().addPage("Other page"));
  const disconnectedPage = captureProject(initial.id, initial.name);
  assert.throws(
    () => createSubmissionDestination(id, "Wrong page"),
    /active page/,
  );
  assert.deepEqual(
    captureProject(initial.id, initial.name).backend,
    disconnectedPage.backend,
  );
  assert.deepEqual(
    captureProject(initial.id, initial.name).routing,
    disconnectedPage.routing,
  );
});

test("form destinations map stable identities, reject invalid ownership, and collect only successful controls", () => {
  const fixture = mappedLoginFixture();
  restoreProject(fixture.project);
  const service = useBackendStore.getState().services[0],
    endpoint = service.blocks.find((b) => b.id === fixture.endpointId)!;
  if (endpoint.type !== "rest_endpoint") throw new Error("Endpoint");
  assert.deepEqual(
    suggestedFormMappings(
      fixture.form,
      useEditorStore.getState().elementsById,
      endpoint.config as EndpointConfig,
    ),
    [],
  );
  connectFormDestination(
    fixture.form,
    service.id,
    endpoint.id,
    fixture.project.routing.connections[0].requestMappings!,
  );
  assert.equal(
    useRoutingStore
      .getState()
      .connections.filter((c) => c.fromPortId.endsWith(`:out:${fixture.form}`))
      .length,
    1,
  );
  assert.deepEqual(
    useRoutingStore
      .getState()
      .connections.find((connection) =>
        connection.fromPortId.endsWith(`:out:${fixture.form}`),
      )?.responseMappings,
    fixture.project.routing.connections[0].responseMappings,
  );
  const current = captureProject(fixture.project.id, fixture.project.name);
  assert.deepEqual(
    compileProject(current).diagnostics.filter((d) => d.severity === "error"),
    [],
  );
  assert.throws(
    () => connectFormDestination(fixture.form, service.id, endpoint.id, []),
    /Choose a value/,
  );
  const editor = useEditorStore.getState();
  const form = editor.addElement({ ...templates.form, children: [] });
  editor.addElement(templates.button, form);
  editor.updateElement(
    useEditorStore.getState().elementsById[form].children[0],
    { props: { type: "submit" } },
  );
  const reserved = editor.addElement(
    { ...templates.input, props: { name: "constructor" } },
    form,
  );
  editor.addElement(
    { ...templates.input, props: { name: "constructor" } },
    form,
  );
  const disabled = editor.addElement(
    { ...elementTemplate("radioGroup"), props: { disabled: true } },
    form,
  );
  editor.addElement(elementTemplate("textInput"), disabled);
  const nested = editor.addElement({ ...templates.form, children: [] }, form);
  editor.addElement(templates.input, nested);
  const analysis = submissionFields(
    form,
    useEditorStore.getState().elementsById,
  );
  assert.deepEqual(analysis.problems, []);
  assert.deepEqual(
    analysis.fields.map((item) => item.field.name),
    ["field_constructor", "field_constructor_2"],
  );
  assert.throws(
    () =>
      connectFormDestination(fixture.form, service.id, endpoint.id, [
        {
          fieldId: "login_email",
          location: "body",
          source: { kind: "element", elementId: reserved },
        },
        {
          fieldId: "login_password",
          location: "body",
          source: { kind: "element", elementId: fixture.password },
        },
      ]),
    /no longer available/,
  );
});

test("generated form resets and confirms only after success, keeps values on failure, and omits disabled fieldset controls", async () => {
  const initial = emptyProject();
  restoreProject(initial);
  const form = addSubmissionFormTemplate();
  const editor = useEditorStore.getState();
  const extra = editor.addElement(
    { ...templates.input, props: { name: "optional", required: false } },
    form,
  );
  const service = useBackendStore.getState().services[0];
  const endpoint = service.blocks.find((b) => b.type === "rest_endpoint")!;
  if (endpoint.type !== "rest_endpoint") throw new Error("Endpoint");
  useBackendStore.getState().updateBlockConfig(service.id, endpoint.id, {
    requestBody: [
      ...(endpoint.config as EndpointConfig).requestBody,
      { id: extra, name: "optional", type: "string", required: false },
    ],
  });
  const mappings = useRoutingStore.getState().connections[0].requestMappings!;
  connectFormDestination(form, service.id, endpoint.id, [
    ...mappings,
    {
      fieldId: extra,
      location: "body",
      source: { kind: "element", elementId: extra },
    },
  ]);
  const source = compileProject(captureProject(initial.id, initial.name)).files[
    "frontend/app/page.jsx"
  ];
  const ast = ts.createSourceFile(
    "page.jsx",
    source,
    ts.ScriptTarget.Latest,
    true,
    ts.ScriptKind.JSX,
  );
  let handler = "";
  const visit = (node: ts.Node) => {
    if (
      ts.isJsxAttribute(node) &&
      node.name.getText(ast) === "onSubmit" &&
      node.initializer &&
      ts.isJsxExpression(node.initializer)
    )
      handler = node.initializer.expression!.getText(ast);
    ts.forEachChild(node, visit);
  };
  visit(ast);
  assert.ok(handler);
  let resets = 0,
    calls = 0;
  const statuses: string[] = [],
    bodies: unknown[] = [];
  const target = {
    dataset: {},
    elements: submissionFields(form, editor.elementsById).fields.map(
      ({ input }) => ({
        id: input.id,
        value: input.props.name === "email" ? "hello@example.test" : "Hello",
        matches: () => input.id === extra,
      }),
    ),
    setAttribute() {},
    removeAttribute() {},
    reset() {
      resets++;
    },
  };
  const run = (fail = false) =>
    runInNewContext(`(${handler})(event)`, {
      event: { currentTarget: target, preventDefault() {} },
      Error,
      URLSearchParams,
      setStatus: (status: string) => statuses.push(status),
      setFlowValues() {},
      apiFetch: async (_url: string, options: { body: string }) => {
        calls++;
        bodies.push(JSON.parse(options.body));
        if (fail) throw new Error("Unavailable");
        return { message: "received" };
      },
    });
  await run();
  assert.equal(resets, 1);
  assert.equal(statuses.at(-1), "Thanks — your message has been saved.");
  assert.equal((bodies[0] as { optional?: string }).optional, undefined);
  await run(true);
  assert.equal(resets, 1);
  assert.equal(calls, 2);
  assert.equal(statuses.at(-1), "Unavailable");
  assert.equal(target.elements[0].value, "Hello");
  assert.equal(Object.keys(target.dataset).length, 0);
});
