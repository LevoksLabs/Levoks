import test from "node:test";
import assert from "node:assert/strict";
import { runInNewContext } from "node:vm";
import { VALIDATION_RUNTIME } from "../src/lib/backend/validation";
import {
  textFormats,
  textConfigError,
} from "../src/lib/backend/text-validation";
import { backendBlockSchema, parseProject } from "../src/lib/project/schema";
import {
  emptyProject,
  restoreProject,
  captureProject,
} from "../src/lib/project/workspace";
import { useEditorStore } from "../src/store/editorStore";
import { useBackendStore } from "../src/store/backendStore";
import { elementTemplate } from "../src/lib/elements/registry";
import { templates } from "../src/templates";
import { createSubmissionDestination } from "../src/lib/form-destination";
import { compileProject } from "../src/lib/project/compiler";
import { generateServiceCode } from "../src/lib/codegen/express";
import type { ValidationRule, ValidationConfig } from "../src/types/backend";

const valid = (rule: Partial<ValidationRule>, value: unknown) =>
  runInNewContext(`${VALIDATION_RUNTIME}\nvalidationRuleValid(rule,value)`, {
    rule,
    value,
    URL,
  });
test("text formats and UTF-16 limits are bounded, strict and optional; URL validation does not fetch", () => {
  const cases = [
    [1, "123", "１２３"],
    [2, "É東京", "John Smith"],
    [3, "É東京123", "a-b"],
    [4, "product-123", "product--123"],
  ] as const;
  for (const [index, accepted, rejected] of cases) {
    const rule = {
      type: "text" as const,
      text: { pattern: textFormats[index].pattern },
    };
    assert.equal(valid(rule, accepted), true);
    assert.equal(valid(rule, rejected), false);
    assert.equal(valid(rule, accepted + "\n"), false);
    assert.equal(valid(rule, ""), true);
    for (const value of [false, 0, null, {}, []])
      assert.equal(valid(rule, value), false);
  }
  assert.equal(
    valid({ type: "text", text: { minLength: 3, maxLength: 4 } }, "ab"),
    false,
  );
  assert.equal(
    valid({ type: "text", text: { minLength: 3, maxLength: 4 } }, "abcd"),
    true,
  );
  assert.equal(valid({ type: "text", text: { maxLength: 1 } }, "😀"), false);
  assert.equal(valid({ type: "text", text: { maxLength: 2 } }, "😀"), true);
  assert.equal(valid({ type: "text", text: { maxLength: 0 } }, ""), true);
  assert.equal(valid({ type: "text", text: { maxLength: 0 } }, "a"), false);
  assert.equal(valid({ type: "text", text: { minLength: 3 } }, ""), true);
  assert.equal(valid({ type: "text" }, undefined), true);
  assert.equal(valid({ type: "text" }, "x".repeat(10001)), false);
  assert.equal(valid({ type: "text", text: { pattern: "(a+)+" } }, "a"), false);
  for (const value of [
    "https://example.test/path?q=one#section",
    "http://localhost:3000",
    "mailto:hello@example.test",
    "https://例え.テスト",
    "ftp://example.test",
    "https://[::1]:3000/path",
    "https://exam%70le.test/hello%20world",
    "javascript:alert(1)",
    "",
  ])
    assert.equal(valid({ type: "url" }, value), true, value);
  for (const value of [
    "/relative",
    "example.test",
    "https://",
    "http://a b",
    "http://a%20b",
    "https://exa%23mple.test",
    " https://example.test",
    "https://example.test\n",
    false,
    {},
    null,
    [],
  ])
    assert.equal(valid({ type: "url" }, value), false, JSON.stringify(value));
  for (const text of [
    { minLength: -1 },
    { maxLength: 10001 },
    { minLength: 1.5 },
    { minLength: 4, maxLength: 2 },
    { pattern: "(a+)+" },
    { pattern: "[" },
  ]) {
    assert.ok(textConfigError(text));
    assert.equal(
      backendBlockSchema.safeParse({
        id: "v",
        type: "validation",
        label: "Limits",
        position: { x: 0, y: 0 },
        connections: [],
        config: {
          fieldName: "text",
          rules: [{ type: "text", text, message: "Invalid" }],
        },
      }).success,
      false,
    );
  }
});

test("guided text/URL rules compile through history and legacy middleware; invalid constraints mutate nothing", () => {
  const project = emptyProject();
  restoreProject(project);
  const editor = useEditorStore.getState(),
    form = editor.addElement(templates.form);
  for (const [kind, props] of [
    [
      "textInput",
      {
        name: "code",
        minLength: "3",
        maxLength: "12",
        pattern: textFormats[4].pattern,
      },
    ],
    ["urlInput", { name: "website" }],
    ["textarea", { name: "notes", minLength: "5", maxLength: "100" }],
    ["textInput", { name: "empty", maxLength: "0" }],
    ["textInput", { name: "long", minLength: "5000" }],
  ] as const)
    editor.addElement(
      {
        ...elementTemplate(kind),
        props: { ...elementTemplate(kind)!.props, ...props },
      },
      form,
    );
  createSubmissionDestination(form, "Text signups");
  const service = useBackendStore.getState().services[0];
  const checks = service.blocks.filter((b) => b.type === "validation");
  const rules = (name: string) =>
    (
      checks.find((b) => (b.config as ValidationConfig).fieldName === name)!
        .config as ValidationConfig
    ).rules;
  assert.deepEqual(rules("code")[0].text, {
    minLength: 3,
    maxLength: 12,
    pattern: textFormats[4].pattern,
  });
  assert.equal(rules("website")[1].type, "url");
  assert.equal(rules("empty")[0].text?.maxLength, 0);
  assert.equal(rules("long")[0].text?.maxLength, 5000);
  const saved = captureProject(project.id, project.name);
  assert.deepEqual(
    compileProject(parseProject(saved)).diagnostics.filter(
      (d) => d.severity === "error",
    ),
    [],
  );
  editor.undo();
  assert.equal(useBackendStore.getState().services.length, 0);
  editor.redo();
  assert.deepEqual(
    captureProject(project.id, project.name).backend,
    saved.backend,
  );
  const legacy = structuredClone(service),
    ids = new Set(checks.map((b) => b.id));
  for (const block of legacy.blocks)
    block.connections = block.connections.filter((id) => !ids.has(id));
  const exports: {
    validateRules?: (req: object, res: object, next: () => void) => void;
  } = {};
  runInNewContext(
    generateServiceCode(legacy)["text-signups/middleware/validate.js"],
    { exports, URL },
  );
  for (const [body, expected] of [
    [{}, 200],
    [
      {
        code: "abc-1",
        website: "https://example.test",
        notes: "hello",
        empty: "",
      },
      200,
    ],
    [{ code: "a" }, 400],
    [{ code: "abc--1" }, 400],
    [{ website: "relative" }, 400],
    [{ notes: "hi" }, 400],
    [{ empty: "x" }, 400],
  ] as const) {
    let status = 200,
      next = false;
    const res = {
      status(code: number) {
        status = code;
        return this;
      },
      json() {},
    };
    exports.validateRules!({ method: "POST", body }, res, () => {
      next = true;
    });
    assert.equal(status, expected);
    assert.equal(next, expected === 200);
  }
  const code = Object.values(useEditorStore.getState().elementsById).find(
    (n) => n.props.name === "code",
  )!;
  const invalidProps: Record<string, string>[] = [
    { minLength: "13" },
    { pattern: "(a+)+" },
    { maxLength: "1.5" },
    { maxLength: "1e2" },
  ];
  for (const props of invalidProps) {
    editor.updateElement(code.id, { props });
    assert.throws(() => createSubmissionDestination(form, "Invalid text"));
    assert.equal(useBackendStore.getState().services.length, 1);
    editor.undo();
  }
});
