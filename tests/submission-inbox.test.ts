import test from "node:test";
import assert from "node:assert/strict";
import { addSubmissionFormTemplate } from "../src/lib/form-destination";
import { createSubmissionInbox } from "../src/lib/submission-inbox";
import {
  emptyProject,
  restoreProject,
  captureProject,
} from "../src/lib/project/workspace";
import { parseProject } from "../src/lib/project/schema";
import { compileProject } from "../src/lib/project/compiler";
import { useBackendStore } from "../src/store/backendStore";
import { projectHistory } from "../src/store/projectHistory";

function fixture() {
  const initial = emptyProject();
  restoreProject(initial);
  addSubmissionFormTemplate();
  const service = useBackendStore.getState().services[0];
  const submit = service.blocks.find((b) => b.type === "rest_endpoint")!;
  const before = captureProject(initial.id, initial.name);
  const id = createSubmissionInbox(service.id, submit.id);
  return {
    initial,
    before,
    id,
    service,
    submit,
    project: parseProject(captureProject(initial.id, initial.name)),
  };
}
test("private inbox and separate operator identity persist, compile and undo atomically without closing submissions", () => {
  const { initial, before, id, service, submit, project } = fixture();
  assert.equal(project.backend.services.length, 2);
  assert.equal(createSubmissionInbox(service.id, submit.id), id);
  const result = compileProject(project);
  assert.deepEqual(
    result.diagnostics.filter((d) => d.severity === "error"),
    [],
  );
  const routes = result.files["backend/contact-submissions/routes/index.js"];
  assert.match(routes, /router\.post\("\/api\/submissions", (?!auth)/);
  assert.match(routes, /router\.get\("\/api\/submissions\/inbox", [\s\S]*auth/);
  assert.match(
    result.files["backend/contact-submissions-operators/models/User.js"],
    /operatorBootstrap:.*select: false, unique: true, sparse: true/,
  );
  assert.match(
    result.files["backend/contact-submissions-operators/server.js"],
    /models\/User'\)\.init\(\)/,
  );
  assert.match(
    result.files["backend/docker-compose.yml"],
    /OPERATOR_SETUP_TOKEN: "\$\{CONTACT_SUBMISSIONS_OPERATORS_OPERATOR_SETUP_TOKEN:-\}"/,
  );
  assert.equal(
    (
      result.files["backend/docker-compose.yml"].match(
        /      OPERATOR_SETUP_TOKEN:/g,
      ) || []
    ).length,
    1,
  );
  assert.match(
    result.files["backend/.env.example"],
    /CONTACT_SUBMISSIONS_OPERATORS_OPERATOR_SETUP_TOKEN=\n/,
  );
  assert.match(
    result.files[
      "frontend/app/%5F%5Flevoks/account/contact-submissions-operators/page.jsx"
    ],
    /Set up first operator/,
  );
  assert.match(
    result.files[
      `frontend/app/%5F%5Flevoks/inbox/contact-submissions/${id}/page.jsx`
    ],
    /AbortController/,
  );
  assert.match(result.files["SUBMISSIONS.md"], /Remove the setup code/);
  assert.equal(JSON.stringify(project).includes("OPERATOR_SETUP_TOKEN"), false);
  projectHistory.undo();
  assert.deepEqual(
    captureProject(initial.id, initial.name).backend,
    before.backend,
  );
  projectHistory.redo();
  assert.deepEqual(
    captureProject(initial.id, initial.name).backend,
    project.backend,
  );
});
test("edited unsafe or unsupported inbox contracts are rejected before exporting executable backends", () => {
  const { project, id } = fixture();
  for (const mutate of [
    (p: typeof project) => {
      const e = p.backend.services[0].blocks.find((b) => b.id === id)!;
      if (e.type === "rest_endpoint") e.config.authRequired = false;
    },
    (p: typeof project) => {
      const e = p.backend.services[0].blocks.find((b) => b.id === id)!;
      if (e.type === "rest_endpoint") e.config.policyIds = [];
    },
    (p: typeof project) => {
      const q = p.backend.services[0].blocks.find(
        (b) => b.type === "query" && b.config.operation === "find",
      )!;
      if (q.type === "query") q.config.limit = 100;
    },
    (p: typeof project) => {
      const a = p.backend.services[0].blocks.find(
        (b) => b.type === "auth_block",
      )!;
      if (a.type === "auth_block") delete a.config.identityServiceId;
    },
  ]) {
    const changed = structuredClone(project);
    mutate(changed);
    const result = compileProject(changed);
    assert(
      result.diagnostics.some((d) =>
        d.message.startsWith("Submission inbox requires"),
      ),
    );
    assert.equal(
      result.files["backend/contact-submissions/server.js"],
      undefined,
    );
  }
  const changed = structuredClone(project);
  const setup = changed.backend.services[1].blocks.find(
    (b) =>
      b.type === "rest_endpoint" && b.config.route.endsWith("/operator-setup"),
  )!;
  if (setup.type === "rest_endpoint")
    setup.config.requestBody.push({
      name: "role",
      type: "string",
      required: false,
    });
  assert(
    compileProject(changed).diagnostics.some((d) =>
      d.message.startsWith("Operator setup requires"),
    ),
  );
  const secretProject = structuredClone(project);
  const env = secretProject.backend.services[1].blocks.find(
    (b) => b.type === "rest_endpoint",
  )!;
  secretProject.backend.services[1].blocks.push({
    ...env,
    id: "reserved-setup-env",
    type: "env_var",
    connections: [],
    config: {
      key: "OPERATOR_SETUP_TOKEN",
      value: "",
      isSecret: false,
      description: "",
    },
  });
  assert(
    compileProject(secretProject).diagnostics.some((d) =>
      d.message.startsWith("Operator setup codes belong"),
    ),
  );
});
test("guided inbox leaves existing access rules untouched on rejection", () => {
  const { before, service, submit } = fixture();
  restoreProject(before);
  useBackendStore.getState().addBlock(service.id, "auth_block");
  const snapshot = structuredClone(useBackendStore.getState().services);
  assert.throws(
    () => createSubmissionInbox(service.id, submit.id),
    /already has access rules/,
  );
  assert.deepEqual(useBackendStore.getState().services, snapshot);
});
