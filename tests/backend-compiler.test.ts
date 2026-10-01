import test from "node:test";
import assert from "node:assert/strict";
import { runInNewContext } from "node:vm";
import { captureProject } from "../src/lib/project/workspace";
import { loginProject } from "./helpers/login-fixture";
import { compileProject } from "../src/lib/project/compiler";
import { parseProject } from "../src/lib/project/schema";
import { lowerBackend } from "../src/lib/backend/ir";
import { generateProject } from "../src/lib/codegen";
import { PROGRAM_RUNTIME } from "../src/lib/codegen/program-runtime";
import { useEditorStore } from "../src/store/editorStore";
import { templates } from "../src/templates";

test("login validation is scoped to its workflow while legacy service rules still apply", () => {
  const project = loginProject();
  const service = project.backend.services[0];
  const validation = service.blocks.find(
    (block) =>
      block.type === "validation" && block.label === "Validate credentials",
  )!;
  if (validation.type !== "validation") throw new Error("Missing validation");
  validation.config.rules = [
    { type: "maxLength", value: 10, message: "Login-only email limit" },
  ];
  const output = compileProject(project);
  const source = output.files["backend/auth-service/middleware/validate.js"];
  assert.doesNotMatch(source, /Login-only email limit/);
  assert.match(
    output.files["backend/auth-service/workflow/program.json"],
    /Login-only email limit/,
  );
  // The existing unattached email rule remains a service-wide validation.
  assert.match(source, /"type":"email"/);
});

test("backend IR owns executable semantics, redacts secrets and is independent of canvas layout", () => {
  const project = loginProject();
  const before = compileProject(project);
  assert.deepEqual(
    before.diagnostics.filter((d) => d.severity === "error"),
    [],
  );
  const ir = lowerBackend(project.backend);
  const files = generateProject(ir);
  const service = project.backend.services[0];
  service.position = { x: 100, y: -200 };
  service.color = "#fff";
  service.collapsed = true;
  for (const block of service.blocks)
    block.position = { x: 800, y: 900, placed: true };
  assert.deepEqual(lowerBackend(project.backend), ir);
  assert.deepEqual(generateProject(lowerBackend(project.backend)), files);
  assert.equal(
    JSON.parse(before.files["levoks.ir.json"]).backend.target,
    "express-mongoose",
  );
  assert.doesNotMatch(
    files["auth-service/workflow/program.json"],
    /"position"|"collapsed"|"color"/,
  );
  const auth = service.blocks.find((b) => b.type === "auth_block")!;
  auth.config.secretKey = "do-not-export-this";
  assert.doesNotMatch(
    JSON.stringify(lowerBackend(project.backend)),
    /do-not-export-this/,
  );
  const persisted = parseProject(JSON.parse(JSON.stringify(project)));
  assert.equal(
    persisted.backend.services[0].blocks.find(
      (b) => b.type === "password_verify",
    )?.definitionVersion,
    1,
  );
  assert.throws(() =>
    parseProject({
      ...project,
      backend: {
        ...project.backend,
        services: [
          {
            ...service,
            blocks: [{ ...service.blocks[0], definitionVersion: 2 }],
          },
        ],
      },
    }),
  );
});

test("login compiler rejects missing proof, raw credential output, invalid order and undeclared inputs before emitting backend files", () => {
  const original = loginProject();
  for (const kind of [
    "proof",
    "response",
    "order",
    "input",
    "query",
    "cycle",
  ] as const) {
    const project = structuredClone(original);
    const blocks = project.backend.services[0].blocks;
    const verify = blocks.find((b) => b.type === "password_verify")!;
    const session = blocks.find((b) => b.type === "session_issue")!;
    if (kind === "proof") session.config.verificationId = "missing";
    if (kind === "response")
      blocks.find((b) => b.type === "response")!.config.value =
        "$request.body.password";
    if (kind === "input") verify.config.password = "$request.body.undeclared";
    if (kind === "order") {
      verify.connections = [];
      session.connections = [verify.id];
    }
    if (kind === "query")
      blocks.find((b) => b.type === "credential_lookup")!.connections = [
        blocks.find((b) => b.type === "db_model")!.id,
      ];
    if (kind === "cycle") verify.connections = [verify.id];
    const output = compileProject(project);
    assert.ok(
      output.diagnostics.some((d) => d.severity === "error"),
      kind,
    );
    assert.ok(
      !Object.keys(output.files).some((path) => path.startsWith("backend/")),
      kind,
    );
    assert.throws(
      () => generateProject(lowerBackend(project.backend)),
      Error,
      kind,
    );
  }
});

test("canvas form reaches POST /api/login through existing routing and frontend generation", () => {
  const initial = loginProject();
  const editor = useEditorStore.getState();
  const form = editor.addElement({
    ...templates.form,
    children: [],
    label: "Login Form",
  });
  for (const name of ["email", "password"])
    editor.addElement(
      { ...templates.input, props: { name, inputType: name, required: true } },
      form,
    );
  editor.addElement({ ...templates.button, props: { label: "Sign in" } }, form);
  const project = captureProject(initial.id, initial.name);
  const service = project.backend.services[0];
  const endpoint = service.blocks.find(
    (b) => b.type === "rest_endpoint" && b.config.route.endsWith("/login"),
  )!;
  if (endpoint.type !== "rest_endpoint") throw new Error("Missing endpoint");
  endpoint.config.route = "/api/login";
  project.routing.nodes = [
    {
      id: "page",
      type: "page",
      refId: project.editor.activePageId,
      position: { x: 0, y: 0 },
      width: 240,
      height: 180,
    },
    {
      id: "service",
      type: "service",
      refId: service.id,
      position: { x: 400, y: 0 },
      width: 240,
      height: 180,
    },
  ];
  project.routing.connections = [
    {
      id: "login-wire",
      fromNodeId: "page",
      fromPortId: `page:out:${form}`,
      toNodeId: "service",
      toPortId: `service:in:${endpoint.id}`,
    },
  ];
  const output = compileProject(parseProject(project));
  assert.deepEqual(
    output.diagnostics.filter((d) => d.severity === "error"),
    [],
  );
  assert.equal(output.graph.flows[0].trigger.event, "submit");
  assert.match(output.files["frontend/app/page.jsx"], /api\/login/);
  assert.match(
    output.files["backend/auth-service/routes/index.js"],
    /router.post\("\/api\/login".*identity.limit.*workflow/,
  );
});

test("generated login runtime keeps verification private and defers sessions until success", async () => {
  const project = loginProject();
  const service = lowerBackend(project.backend).services[0];
  const endpoint = service.blocks.find(
    (b) => b.type === "rest_endpoint" && b.config.route.endsWith("/login"),
  )!;
  let issued = 0;
  const privateUser = {
    _id: "user-1",
    email: "user@example.test",
    password: "private-hash",
  };
  const identity = {
    findAccount: async () => privateUser,
    publicAccount: () => ({ id: "user-1", email: "user@example.test" }),
    verifyPassword: async (user: unknown, password: string) => {
      assert.equal(user, privateUser);
      if (password !== "correct-password")
        throw Object.assign(new Error("Invalid credentials"), { status: 401 });
    },
    issueSession: async () => {
      issued++;
    },
  };
  const exported = {} as {
    createWorkflow: (
      program: unknown,
      models: unknown,
      db: unknown,
      audit: unknown,
      identity: unknown,
    ) => (
      id: string,
      request: unknown,
      response: unknown,
    ) => Promise<{ status: number; body: unknown }>;
  };
  runInNewContext(PROGRAM_RUNTIME, {
    exports: exported,
    structuredClone,
    Date,
    Set,
    Map,
  });
  const run = exported.createWorkflow(
    { blocks: service.blocks },
    {},
    {},
    {},
    identity,
  );
  const request = {
    body: { email: "user@example.test", password: "correct-password" },
  };
  assert.equal((await run(endpoint.id, request, {})).status, 200);
  assert.equal(issued, 1);
  await assert.rejects(
    run(endpoint.id, { body: { ...request.body, password: "wrong" } }, {}),
    /Invalid credentials/,
  );
  assert.equal(issued, 1);
  // Even forged public context cannot stand in for successful password verification.
  const verify = service.blocks.find((b) => b.type === "password_verify")!;
  const lookup = service.blocks.find((b) => b.type === "credential_lookup")!;
  lookup.connections = [...verify.connections];
  await assert.rejects(run(endpoint.id, request, {}), /Verified credentials/);
  assert.equal(issued, 1);
  lookup.connections = [verify.id];
  const response = service.blocks.find((b) => b.type === "response")!;
  response.config.value = "$result.constructor";
  await assert.rejects(run(endpoint.id, request, {}), /Invalid data binding/);
  assert.equal(issued, 1, "failed output must not create a session");
});
