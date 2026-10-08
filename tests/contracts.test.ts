import test from "node:test";
import assert from "node:assert/strict";
import { runInNewContext } from "node:vm";
import ts from "typescript";
import { mappedLoginFixture } from "./helpers/mapped-login-fixture";
import { compileProject } from "../src/lib/project/compiler";
import { parseProject } from "../src/lib/project/schema";
import { resolveContract } from "../src/lib/contracts";
import type { IRDiagnostic } from "../src/types/ir";

function fixture(withHeaders = false) {
  const fixture = mappedLoginFixture(withHeaders);
  return { ...fixture, output: compileProject(fixture.project) };
}
function handler(source: string) {
  const file = ts.createSourceFile(
    "page.jsx",
    source,
    ts.ScriptTarget.Latest,
    true,
    ts.ScriptKind.JSX,
  );
  let text = "";
  const visit = (node: ts.Node) => {
    if (
      ts.isJsxAttribute(node) &&
      node.name.getText(file) === "onSubmit" &&
      node.initializer &&
      ts.isJsxExpression(node.initializer)
    )
      text = node.initializer.expression!.getText(file);
    ts.forEachChild(node, visit);
  };
  visit(file);
  assert.ok(text);
  return text;
}

test("generated mapped form sends scalar headers and refuses control characters before fetching", async () => {
  const {project,email,password} = fixture(true);
  const target = {dataset:{}, elements:[{id:email,value:"person@example.test"},{id:password,value:"password-123456"}],setAttribute(){},removeAttribute(){}};
  const calls: {headers: Record<string,string>;body:string}[] = [];
  const statuses: string[] = [];
  const context = {event:{currentTarget:target,preventDefault(){}},window:{location:{href:""}},URLSearchParams,Error,setStatus:(value:string)=>statuses.push(value),setFlowValues:()=>{},apiFetch:async (_path:string,options:{headers:Record<string,string>;body:string})=>{calls.push(options);return {email:"person@example.test"};}};
  await runInNewContext(`(${handler(compileProject(project).files["frontend/app/page.jsx"])})(event)`,context);
  assert.deepEqual(JSON.parse(JSON.stringify(calls[0].headers)), {"x-app-version":"7"});
  assert.deepEqual(JSON.parse(calls[0].body), {email:"person@example.test",password:"password-123456"});
  for (const disabled of [{disabled:true}, {getAttribute:()=>"true"}]) {
    await runInNewContext(`(${handler(compileProject(project).files["frontend/app/page.jsx"])})(event)`,{...context,event:{currentTarget:{...target,...disabled},preventDefault(){}}});
    assert.equal(calls.length,1,"disabled controls must not run a wired request");
  }
  const endpoint = project.backend.services[0].blocks.find(b=>b.type==="rest_endpoint" && b.config.route.endsWith("/login"))!;
  if(endpoint.type!=="rest_endpoint")throw new Error("Endpoint");
  endpoint.config.requestHeaders![0].type="string";
  project.routing.connections[0].requestMappings!.at(-1)!.source={kind:"literal",value:"bad\r\nX-Forged: yes"};
  await runInNewContext(`(${handler(compileProject(project).files["frontend/app/page.jsx"])})(event)`,context);
  assert.equal(calls.length,1);
  assert.match(statuses.at(-1)!,/Invalid header/);
});
test("stable contract identities survive input renames and reject deleted mappings and competing form actions", () => {
  const { project, email, submit, form } = fixture();
  project.editor.elementsById[email].props.name = "anotherImplementationName";
  assert.equal(
    compileProject(parseProject(project)).diagnostics.filter(
      (d) => d.severity === "error",
    ).length,
    0,
  );
  project.routing.connections[0].fromPortId = `page:out:${submit}`;
  assert.equal(compileProject(project).graph.flows[0].trigger.elementId, form);
  project.routing.connections.push({
    ...project.routing.connections[0],
    id: "duplicate",
    fromPortId: `page:out:${form}`,
  });
  assert.ok(
    compileProject(project).diagnostics.some(
      (d) => d.code === "FORM_ACTION_CONFLICT",
    ),
  );
  project.routing.connections.pop();
  project.routing.connections[0].requestMappings![0].fieldId = "deleted";
  assert.ok(
    compileProject(project).diagnostics.some(
      (d) => d.code === "INVALID_CONTRACT_MAPPING",
    ),
  );
});
test("field rename resolves by identity, response dependencies and required contracts fail closed", () => {
  const { project, form } = fixture();
  const connection = project.routing.connections[0];
  const block = project.backend.services[0].blocks.find(
    (b) =>
      b.type === "rest_endpoint" &&
      b.id === connection.toPortId.split(":").at(-1),
  )!;
  if (block.type !== "rest_endpoint") throw new Error("endpoint");
  block.config.requestBody[0].name = "contact";
  const diagnostics: IRDiagnostic[] = [];
  const resolved = resolveContract(
    connection,
    block.config,
    undefined,
    Object.values(
      project.editor.elementsById,
    ) as import("../src/types").ElementNode[],
    form,
    project.editor.pages,
    diagnostics,
  );
  assert.equal(resolved.requestMappings![0].name, "contact");
  assert.equal(diagnostics.length, 0);
  connection.requestMappings![0].source = {
    kind: "response",
    fieldId: "missing",
  };
  resolveContract(
    connection,
    block.config,
    undefined,
    Object.values(
      project.editor.elementsById,
    ) as import("../src/types").ElementNode[],
    form,
    project.editor.pages,
    diagnostics,
  );
  assert.ok(diagnostics.some((d) => /previous response/.test(d.message)));
});
test("generated mapped handler submits only contract fields, displays responses and suppresses success on failure", async () => {
  const { output, email, password, status } = fixture();
  assert.deepEqual(
    output.diagnostics.filter((d) => d.severity === "error"),
    [],
  );
  const source = handler(output.files["frontend/app/page.jsx"]);
  const target = {
    dataset: {},
    elements: [
      { id: email, name: "wrong", value: "person@example.test" },
      { id: password, value: "secret-password" },
      { id: "unmapped", name: "admin", value: true },
    ],
    setAttribute() {},
    removeAttribute() {},
  };
  const calls: unknown[] = [],
    statuses: string[] = [];
  let values: Record<string, string> = {};
  const window = { location: { href: "" } };
  const context = {
    event: { currentTarget: target, preventDefault() {} },
    window,
    URLSearchParams,
    setStatus: (message: string) => statuses.push(message),
    setFlowValues: (update: (previous: typeof values) => typeof values) => {
      values = update(values);
    },
    apiFetch: async (_path: string, options: { body: string }) => {
      calls.push(JSON.parse(options.body));
      return { email: "person@example.test" };
    },
  };
  await runInNewContext(`(${source})(event)`, context);
  assert.deepEqual(calls, [
    { email: "person@example.test", password: "secret-password" },
  ]);
  assert.equal(values[status], "person@example.test");
  assert.equal(window.location.href, "/dashboard");
  window.location.href = "";
  await runInNewContext(`(${source})(event)`, {
    ...context,
    apiFetch: async () => {
      throw new Error("Backend unavailable");
    },
    Error,
  });
  assert.equal(window.location.href, "");
  assert.equal(statuses.at(-1), "Backend unavailable");
  assert.deepEqual(target.dataset, {});
});

test("generated mapping separates path/query/body and passes declared response fields to subsequent endpoints", async () => {
  const { project, output, email, password, status } = fixture();
  const { generateFrontendProject } =
    await import("../src/lib/codegen/frontend");
  const { pageElements } = await import("../src/lib/project/compiler");
  const graph = output.graph,
    flow = graph.flows[0],
    first = flow.steps[0];
  if (first.type !== "api_call") throw new Error("api");
  first.method = "GET";
  first.endpoint = "/api/items/:slug";
  first.requestMappings = [
    {
      fieldId: "slug",
      name: "slug",
      type: "string",
      required: true,
      location: "path",
      source: { kind: "element", elementId: email },
    },
    {
      fieldId: "page",
      name: "page",
      type: "number",
      required: true,
      location: "query",
      source: { kind: "element", elementId: password },
    },
  ];
  first.responseMappings = [];
  flow.steps = [
    first,
    {
      ...first,
      endpoint: "/api/use-result",
      method: "POST",
      requestMappings: [
        {
          fieldId: "record",
          name: "recordId",
          type: "string",
          required: true,
          location: "body",
          responseName: "id",
          source: { kind: "response", fieldId: "result-id" },
        },
      ],
      responseMappings: [{ name: "message", elementId: status }],
      failure: { message: "Please retry", pageRoute: "/failed" },
    },
  ];
  const generated = generateFrontendProject(
    pageElements(project, project.editor.activePageId),
    [],
    project.editor.canvasSettings,
    project.editor.pages[0],
    project.editor.pages,
    undefined,
    graph,
  );
  const target = {
    dataset: {},
    elements: [
      { id: email, value: "item/a" },
      { id: password, value: "2" },
    ],
    setAttribute() {},
    removeAttribute() {},
  };
  const requests: { url: string; body?: string }[] = [],
    statuses: string[] = [];
  const window = { location: { href: "" } };
  const context = {
    event: { currentTarget: target, preventDefault() {} },
    window,
    URLSearchParams,
    setStatus: (message: string) => statuses.push(message),
    setFlowValues() {},
    apiFetch: async (url: string, options: { body?: string }) => {
      requests.push({ url, body: options.body });
      if (requests.length === 1) return { id: "record-42" };
      throw new Error("Unavailable");
    },
  };
  await runInNewContext(
    `(${handler(generated.files["src/App.jsx"])})(event)`,
    context,
  );
  assert.equal(requests[0].url, "/api/items/item%2Fa?page=2");
  assert.equal(requests[0].body, undefined);
  assert.deepEqual(JSON.parse(requests[1].body!), { recordId: "record-42" });
  assert.equal(statuses.at(-1), "Please retry");
  assert.equal(window.location.href, "/failed");
});
