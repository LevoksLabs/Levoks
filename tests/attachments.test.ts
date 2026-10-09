import test from "node:test";
import assert from "node:assert/strict";
import { runInNewContext } from "node:vm";
import { VALIDATION_RUNTIME } from "../src/lib/backend/validation";
import {
  fileConfigError,
  MAX_SUBMISSION_FILE_BYTES,
} from "../src/lib/backend/files";
import {
  emptyProject,
  restoreProject,
  captureProject,
} from "../src/lib/project/workspace";
import { useEditorStore } from "../src/store/editorStore";
import { useBackendStore } from "../src/store/backendStore";
import { templates } from "../src/templates";
import { elementTemplate } from "../src/lib/elements/registry";
import { createSubmissionDestination } from "../src/lib/form-destination";
import { createSubmissionInbox } from "../src/lib/submission-inbox";
import { parseProject, backendBlockSchema } from "../src/lib/project/schema";
import { compileProject } from "../src/lib/project/compiler";
import { compatibleFormField } from "../src/lib/contracts";
import { generateServiceCode } from "../src/lib/codegen/express";
import type { ValidationConfig } from "../src/types/backend";

test("attachment validation bounds canonical bytes, size, names and extensions without filesystem access", () => {
  const valid = (
    value: unknown,
    file = { maxBytes: 256, extensions: ".txt, .pdf" },
  ) =>
    runInNewContext(
      `${VALIDATION_RUNTIME}\nvalidationRuleValid({type:'file',file},value)`,
      { value, file, atob, btoa },
    );
  const data = { name: "résumé.TXT", size: 1, data: "YQ==" };
  assert.equal(valid(data), true);
  assert.equal(valid(undefined), true);
  assert.equal(valid({ name: "empty.txt", size: 0, data: "" }), true);
  for (const value of [
    null,
    false,
    [],
    {},
    "text",
    { ...data, extra: true },
    { ...data, name: "../test.txt" },
    { ...data, name: "x\\test.txt" },
    { ...data, name: "x\n.txt" },
    { ...data, name: "x.exe" },
    { ...data, size: 2 },
    { ...data, size: -1 },
    { ...data, size: 1.5 },
    { ...data, data: "YR==" },
    { ...data, data: "not base64" },
    { ...data, data: "YQ==\n" },
    { ...data, name: "a".repeat(121) },
  ])
    assert.equal(valid(value), false, JSON.stringify(value));
  const full = Buffer.alloc(MAX_SUBMISSION_FILE_BYTES, 255);
  assert.equal(
    valid(
      { name: "max.txt", size: full.length, data: full.toString("base64") },
      { maxBytes: full.length, extensions: "" },
    ),
    true,
  );
  assert.equal(
    valid(
      {
        name: "over.txt",
        size: full.length + 1,
        data: Buffer.alloc(full.length + 1).toString("base64"),
      },
      { maxBytes: full.length, extensions: "" },
    ),
    false,
  );
  for (const file of [
    { maxBytes: 0 },
    { maxBytes: 262145 },
    { maxBytes: 1.5 },
    { extensions: "image/*" },
    { extensions: ".txt\n.exe" },
  ]) {
    assert.ok(fileConfigError(file));
    assert.equal(
      backendBlockSchema.safeParse({
        id: "v",
        type: "validation",
        label: "File",
        position: { x: 0, y: 0 },
        connections: [],
        config: {
          fieldName: "attachment",
          rules: [{ type: "file", file, message: "Invalid file" }],
        },
      }).success,
      false,
    );
  }
});

test("guided attachments retain object mappings, atomic history, server rules and private downloads", () => {
  const project = emptyProject();
  restoreProject(project);
  const editor = useEditorStore.getState();
  const form = editor.addElement(templates.form);
  const id = editor.addElement(
    {
      ...elementTemplate("fileUpload")!,
      props: {
        ...elementTemplate("fileUpload")!.props,
        name: "attachment",
        label: "Attachment",
        maxFileKB: 4,
        accept: ".txt",
        required: true,
      },
    },
    form,
  );
  const node = useEditorStore.getState().elementsById[id];
  assert.ok(compatibleFormField(node, { type: "object", location: "body" }));
  assert.ok(!compatibleFormField(node, { type: "string", location: "body" }));
  assert.ok(!compatibleFormField(node, { type: "object", location: "query" }));
  editor.updateElement(id, { props: { multiple: true } });
  const before = captureProject(project.id, project.name);
  assert.throws(
    () => createSubmissionDestination(form, "Attachments"),
    /one file/,
  );
  const after = captureProject(project.id, project.name);
  assert.deepEqual(after.editor, before.editor);
  assert.deepEqual(after.backend, before.backend);
  assert.deepEqual(after.routing, before.routing);
  editor.updateElement(id, { props: { multiple: false } });
  const destination = createSubmissionDestination(form, "Attachments");
  const service = useBackendStore.getState().services[0];
  const validation = service.blocks.find(
    (b) =>
      b.type === "validation" &&
      (b.config as ValidationConfig).fieldName === "attachment",
  )!;
  assert.deepEqual((validation.config as ValidationConfig).rules[0].file, {
    maxBytes: 4096,
    extensions: ".txt",
  });
  editor.undo();
  assert.equal(useBackendStore.getState().services.length, 0);
  editor.redo();
  createSubmissionInbox(destination.serviceId, destination.endpointId);
  const saved = parseProject(captureProject(project.id, project.name));
  const compiled = compileProject(saved);
  assert.deepEqual(
    compiled.diagnostics.filter((d) => d.severity === "error"),
    [],
  );
  const page = Object.entries(compiled.files).find(
    ([file]) => file.includes("/inbox/") && file.endsWith("page.jsx"),
  )![1];
  assert.match(page, /"pageSize":5/);
  assert.match(page, /Download/);
  assert.match(page, /application\/octet-stream/);
  const legacy = structuredClone(service);
  for (const block of legacy.blocks)
    block.connections = block.connections.filter(
      (target) => target !== validation.id,
    );
  const exports: {
    validateRules?: (req: object, res: object, next: () => void) => void;
  } = {};
  runInNewContext(
    generateServiceCode(legacy)["attachments/middleware/validate.js"],
    { exports, atob, btoa, URL },
  );
  for (const [attachment, expected] of [
    [{ name: "test.txt", size: 1, data: "YQ==" }, 200],
    [{ name: "test.exe", size: 1, data: "YQ==" }, 400],
    [{ name: "test.txt", size: 2, data: "YQ==" }, 400],
  ] as const) {
    let status = 200,
      called = false;
    const res = {
      status(code: number) {
        status = code;
        return this;
      },
      json() {},
    };
    exports.validateRules!(
      { method: "POST", body: { attachment } },
      res,
      () => {
        called = true;
      },
    );
    assert.equal(status, expected);
    assert.equal(called, expected === 200);
  }
});
