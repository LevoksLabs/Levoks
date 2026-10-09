import test from "node:test";
import assert from "node:assert/strict";
import { runInNewContext, Script } from "node:vm";
import { createRequire } from "node:module";
import { addSubmissionFormTemplate } from "../src/lib/form-destination";
import { createSubmissionInbox } from "../src/lib/submission-inbox";
import { setSubmissionNotifications } from "../src/lib/backend/submission-notifications";
import {
  emptyProject,
  restoreProject,
  captureProject,
} from "../src/lib/project/workspace";
import { parseProject } from "../src/lib/project/schema";
import { compileProject } from "../src/lib/project/compiler";
import { useBackendStore } from "../src/store/backendStore";
import { projectHistory } from "../src/store/projectHistory";
import { defaultDatabase } from "../src/lib/backend/database";

function fixture() {
  const initial = emptyProject();
  restoreProject(initial);
  addSubmissionFormTemplate();
  const service = useBackendStore.getState().services[0];
  const submit = service.blocks.find((b) => b.type === "rest_endpoint")!;
  createSubmissionInbox(service.id, submit.id);
  const before = captureProject(initial.id, initial.name);
  setSubmissionNotifications(service.id, submit.id, true);
  const project = parseProject(captureProject(initial.id, initial.name));
  return { initial, service, submit, before, project };
}
test("submission alerts persist and undo atomically, disable without duplicating and export separate private worker settings", () => {
  const { initial, service, submit, before, project } = fixture();
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
  setSubmissionNotifications(service.id, submit.id, false);
  let saved = parseProject(captureProject(initial.id, initial.name));
  assert.equal(
    saved.backend.services[0].blocks.filter(
      (b) => b.type === "submission_notification",
    ).length,
    1,
  );
  const disabled = saved.backend.services[0].blocks.find(
    (b) => b.type === "submission_notification",
  )!;
  assert.equal(disabled.config.enabled, false);
  setSubmissionNotifications(service.id, submit.id, true);
  saved = parseProject(captureProject(initial.id, initial.name));
  const output = compileProject(saved);
  assert.deepEqual(
    output.diagnostics.filter((d) => d.severity === "error"),
    [],
  );
  const prefix = "backend/contact-submissions/";
  for (const [name, source] of Object.entries(output.files))
    if (name.startsWith("backend/") && name.endsWith(".js"))
      new Script(source, { filename: name });
  assert.match(
    output.files[prefix + "models/Submission.js"],
    /_levoksSubmissionMail:.*select: false/,
  );
  assert.match(
    output.files[prefix + "models/Submission.js"],
    /delete value._levoksSubmissionMail/,
  );
  assert.match(
    output.files[prefix + "notifications/.env.example"],
    /RESEND_API_KEY=\n/,
  );
  assert.match(
    output.files[prefix + "workers/submission-email.js"],
    /path: "notifications\/\.env"/,
  );
  assert.ok(
    output.files[prefix + ".dockerignore"].split("\n").includes("**/.env*"),
  );
  assert.doesNotMatch(
    output.files[prefix + ".env.example"],
    /RESEND_API_KEY|SUBMISSION_EMAIL_TO/,
  );
  const compose = output.files["backend/docker-compose.yml"];
  const [api, worker] = compose.split(
    "  contact-submissions-submission-worker:",
  );
  assert.doesNotMatch(api, /RESEND_API_KEY|SUBMISSION_EMAIL_TO/);
  assert.match(worker, /profiles: \["notifications"\]/);
  assert.match(worker, /CONTACT_SUBMISSIONS_RESEND_API_KEY:-/);
  assert.doesNotMatch(
    worker.split("  contact-submissions-operators:")[0],
    /JWT_SECRET|OPERATOR_SETUP_TOKEN|ports:/,
  );
  assert.match(output.files["NOTIFICATIONS.md"], /23 hours/);
  assert.doesNotMatch(
    JSON.stringify(saved),
    /RESEND_API_KEY|SUBMISSION_EMAIL_TO/,
  );
});
test("notification export rejects unsupported storage, unsafe bindings, duplicate queues and provider settings in project blocks", () => {
  const { project } = fixture();
  const mutations: ((p: typeof project) => void)[] = [
    (p) => {
      p.backend.services[0].database = {
        ...defaultDatabase(),
        engine: "sqlite",
      };
    },
    (p) => {
      const c = p.backend.services[0].blocks.find(
        (b) => b.type === "submission_notification",
      )!;
      c.config.inboxEndpointId = "missing";
    },
    (p) => {
      const c = p.backend.services[0].blocks.find(
        (b) => b.type === "submission_notification",
      )!;
      c.config.queryId = "missing";
    },
    (p) => {
      const e = p.backend.services[0].blocks.find(
        (b) => b.type === "rest_endpoint" && b.config.method === "POST",
      )!;
      if (e.type === "rest_endpoint") e.config.authRequired = true;
    },
    (p) => {
      const c = p.backend.services[0].blocks.find(
        (b) => b.type === "submission_notification",
      )!;
      p.backend.services[0].blocks.push({
        ...structuredClone(c),
        id: "duplicate",
      });
    },
    (p) => {
      const m = p.backend.services[0].blocks.find(
        (b) => b.type === "db_model",
      )!;
      if (m.type === "db_model")
        m.config.fields.push({
          ...m.config.fields[0],
          id: "reserved",
          name: "_levoksSubmissionMail",
        });
    },
    (p) => {
      p.backend.services[0].blocks.push({
        id: "secret",
        type: "env_var",
        label: "Mail key",
        position: { x: 0, y: 0 },
        connections: [],
        config: {
          key: "RESEND_API_KEY",
          value: "",
          isSecret: false,
          description: "",
        },
      });
    },
  ];
  for (const mutate of mutations) {
    const changed = structuredClone(project);
    mutate(changed);
    const result = compileProject(changed);
    assert.ok(result.diagnostics.some((d) => d.severity === "error"));
    assert.equal(
      result.files["backend/contact-submissions/server.js"],
      undefined,
    );
  }
  const changed = structuredClone(project);
  const c = changed.backend.services[0].blocks.find(
    (b) => b.type === "submission_notification",
  )!;
  c.config.subject = "Header\r\ninjection";
  assert.throws(() => parseProject(changed));
});
test("executed generated create queues only enabled alerts atomically and never exposes the hidden job", async () => {
  const { project, submit } = fixture();
  const files = compileProject(project).files,
    prefix = "backend/contact-submissions/";
  const program = JSON.parse(files[prefix + "workflow/program.json"]);
  let inserted: Record<string, unknown> = {};
  const model = {
    create: async (values: Record<string, unknown>[]) => {
      inserted = values[0];
      return [{ ...inserted, _id: "507f1f77bcf86cd799439011" }];
    },
  };
  const output: {
    createWorkflow?: (
      program: unknown,
      models: unknown,
      database: unknown,
    ) => (id: string, request: unknown) => Promise<unknown>;
  } = {};
  runInNewContext(files[prefix + "workflow/runtime.js"], {
    exports: output,
    require: createRequire(import.meta.url),
    Date,
    Set,
    structuredClone,
    AbortController,
    setTimeout,
    clearTimeout,
    Buffer,
  });
  const modelId = program.blocks.find(
    (b: { type: string }) => b.type === "db_model",
  ).id;
  const execute = output.createWorkflow!(program, { [modelId]: model }, {});
  const response = await execute(submit.id, {
    body: { name: "Private visitor", email: "private@example.test" },
    headers: {},
    query: {},
    params: {},
  });
  assert.ok(inserted._levoksSubmissionMail);
  assert.doesNotMatch(
    JSON.stringify(response),
    /_levoksSubmissionMail|Private visitor|private@example/,
  );
  const job = inserted._levoksSubmissionMail as Record<string, unknown>;
  assert.match(
    String(job.inboxPath),
    /^\/__levoks\/inbox\/contact-submissions\//,
  );
  assert.equal(job.status, "queued");
  assert.equal(job.attempts, 0);
  assert.doesNotMatch(JSON.stringify(job), /private@example|Private visitor/);
  program.blocks.find(
    (b: { type: string }) => b.type === "submission_notification",
  ).config.enabled = false;
  await execute(submit.id, {
    body: { name: "Second visitor", email: "second@example.test" },
    headers: {},
    query: {},
    params: {},
  });
  assert.equal(inserted._levoksSubmissionMail, undefined);
});

test("worker settings reject malformed mail headers, unsafe origins and non-loopback test transports before delivery", () => {
  const { project } = fixture();
  const source =
    compileProject(project).files[
      "backend/contact-submissions/notifications/index.js"
    ];
  const base = {
    NODE_ENV: "test",
    SUBMISSION_EMAIL_FROM: "alerts@example.test",
    SUBMISSION_EMAIL_TO: "reader@example.test",
    SUBMISSION_PUBLIC_ORIGIN: "http://127.0.0.1:3000",
    RESEND_API_KEY: "local-only",
    SUBMISSION_EMAIL_TEST_ENDPOINT: "http://127.0.0.1:4000/emails",
  };
  for (const overrides of [
    { SUBMISSION_EMAIL_TO: "reader@example.test\r\nBcc: other@example.test" },
    { SUBMISSION_EMAIL_FROM: "" },
    { SUBMISSION_PUBLIC_ORIGIN: "https://reader:password@example.test" },
    { SUBMISSION_PUBLIC_ORIGIN: "https://example.test/inbox" },
    { SUBMISSION_EMAIL_TEST_ENDPOINT: "https://example.test/emails" },
    { RESEND_API_KEY: "" },
    { NODE_ENV: "production" },
  ]) {
    const output: { ready?: () => unknown } = {};
    runInNewContext(source, {
      exports: output,
      URL,
      process: { env: { ...base, ...overrides } },
      require: (name: string) =>
        name === "node:crypto"
          ? createRequire(import.meta.url)(name)
          : name === "./config.json"
            ? []
            : {},
    });
    assert.throws(() => output.ready!());
  }
});
