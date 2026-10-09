import test from "node:test";
import assert from "node:assert/strict";
import { runInNewContext } from "node:vm";
import {
  emptyProject,
  restoreProject,
  captureProject,
} from "../src/lib/project/workspace";
import { parseProject } from "../src/lib/project/schema";
import { compileProject } from "../src/lib/project/compiler";
import { elementTemplate } from "../src/lib/elements/registry";
import { nativeTree, nativeMarkup } from "../src/lib/elements/native";
import {
  formControls,
  submissionFields,
  createSubmissionDestination,
  suggestedFormMappings,
} from "../src/lib/form-destination";
import { useEditorStore } from "../src/store/editorStore";
import { projectHistory } from "../src/store/projectHistory";
import { templates } from "../src/templates";
import { compatibleFormField } from "../src/lib/contracts";
import { formValueRuntime } from "../src/lib/codegen/form-values";
import { generateServiceCode } from "../src/lib/codegen/express";
import { useBackendStore } from "../src/store/backendStore";
import type { ValidationConfig } from "../src/types/backend";

test("nested radio groups and multiple selections retain field identities, compatible mappings and required validation", () => {
  const project = emptyProject();
  restoreProject(project);
  const editor = useEditorStore.getState();
  const form = editor.addElement({ ...templates.form, children: [] });
  const submit = editor.addElement(
    {
      ...templates.button,
      props: { ...templates.button.props, type: "submit" },
    },
    form,
  );
  const group = editor.addElement(elementTemplate("formField"), form);
  const first = editor.addElement(
    {
      ...elementTemplate("radioButton"),
      props: {
        ...elementTemplate("radioButton")!.props,
        name: "attendance",
        value: "remote",
      },
    },
    group,
  );
  const second = editor.addElement(
    {
      ...elementTemplate("radioButton"),
      props: {
        ...elementTemplate("radioButton")!.props,
        name: "attendance",
        value: "onsite",
        required: true,
      },
    },
    group,
  );
  const topics = editor.addElement(
    {
      ...elementTemplate("multiSelect"),
      props: {
        ...elementTemplate("multiSelect")!.props,
        name: "topics",
        options: "Design\nAutomation",
        selectedValues: "Design\nAutomation",
        required: true,
      },
    },
    form,
  );
  const disabled = editor.addElement(
    {
      ...elementTemplate("formField"),
      props: { ...elementTemplate("formField")!.props, disabled: true },
    },
    form,
  );
  const hidden = editor.addElement(elementTemplate("textInput"), disabled);
  assert.equal(
    useEditorStore.getState().elementsById[form].children.at(-1),
    submit,
  );
  assert.ok(
    formControls(form, useEditorStore.getState().elementsById, true).some(
      (n) => n.id === hidden,
    ),
  );
  assert.ok(
    !formControls(form, useEditorStore.getState().elementsById).some(
      (n) => n.id === hidden,
    ),
  );
  const analysis = submissionFields(
    form,
    useEditorStore.getState().elementsById,
  );
  assert.deepEqual(analysis.problems, []);
  assert.deepEqual(
    analysis.fields.map(({ field }) => [
      field.id,
      field.name,
      field.type,
      field.required,
    ]),
    [
      [first, "attendance", "string", true],
      [topics, "topics", "array", true],
    ],
  );
  const before = captureProject(project.id, project.name);
  createSubmissionDestination(form, "Workshop signups");
  const authoredElements = useEditorStore.getState().elementsById;
  const saved = parseProject(captureProject(project.id, project.name));
  const endpoint = saved.backend.services[0].blocks.find(
    (b) => b.type === "rest_endpoint",
  )!;
  if (endpoint.type !== "rest_endpoint") throw Error("Endpoint");
  assert.equal(
    suggestedFormMappings(form, authoredElements, endpoint.config).find(
      (m) => m.fieldId === topics,
    )?.source.kind,
    "element",
  );
  assert.equal(
    saved.routing.connections[0].requestMappings!.filter(
      (m) => m.fieldId === first,
    ).length,
    1,
  );
  assert.ok(
    saved.backend.services[0].blocks.some(
      (b) =>
        b.type === "validation" &&
        b.config.fieldName === "topics" &&
        b.config.rules.some((r) => r.type === "required"),
    ),
  );
  assert.deepEqual(
    compileProject(saved).diagnostics.filter((d) => d.severity === "error"),
    [],
  );
  projectHistory.undo();
  assert.deepEqual(
    captureProject(project.id, project.name).backend,
    before.backend,
  );
  projectHistory.redo();
  editor.updateElement(second, { props: { name: "attendance" } });
  const node = authoredElements[topics];
  assert.ok(compatibleFormField(node, { type: "array", location: "body" }));
  assert.ok(!compatibleFormField(node, { type: "array", location: "query" }));
  assert.ok(!compatibleFormField(node, { type: "string", location: "body" }));
  assert.ok(
    !compatibleFormField(authoredElements[first], {
      type: "array",
      location: "body",
    }),
  );
  assert.match(
    nativeMarkup(nativeTree(node), "jsx"),
    /defaultValue=\{\["Design","Automation"\]\}/,
  );
  assert.equal(
    (nativeMarkup(nativeTree(node), "html").match(/ selected/g) || []).length,
    2,
  );
  for (const props of [
    { options: "Design\nDesign" },
    { selectedValues: "Unknown" },
    { selectedValues: "Design\nDesign" },
  ]) {
    const invalid = structuredClone(saved);
    Object.assign(invalid.editor.elementsById[topics].props, props);
    assert.throws(() => parseProject(invalid), /Select options/);
  }
  const invalidMapping = structuredClone(saved);
  const target = invalidMapping.backend.services[0].blocks.find(
    (b) => b.type === "rest_endpoint",
  )!;
  if (target.type !== "rest_endpoint") throw Error("Endpoint");
  target.config.requestBody.find((field) => field.id === topics)!.type =
    "string";
  assert.ok(
    compileProject(invalidMapping).diagnostics.some(
      (d) => d.code === "INVALID_CONTRACT_MAPPING",
    ),
  );
  // The same Required rule must work outside explicit workflows as well.
  const legacyService = structuredClone(useBackendStore.getState().services[0]);
  const validations = new Set(
    legacyService.blocks
      .filter((b) => b.type === "validation")
      .map((b) => b.id),
  );
  for (const block of legacyService.blocks)
    block.connections = block.connections.filter((id) => !validations.has(id));
  for (const block of legacyService.blocks)
    if (block.type === "validation") {
      const config = block.config as ValidationConfig;
      config.rules = config.rules.filter(rule => rule.type === "required");
    }
  const files = generateServiceCode(legacyService);
  const exports: {
    validateRules?: (
      req: { method: string; body: object },
      res: object,
      next: () => void,
    ) => void;
  } = {};
  runInNewContext(files["workshop-signups/middleware/validate.js"], {
    exports,
  });
  for (const value of [[], ["Design"], false, 0]) {
    let status = 200,
      passed = false;
    const response = {
      status(code: number) {
        status = code;
        return this;
      },
      json() {},
    };
    exports.validateRules!(
      { method: "POST", body: { topics: value } },
      response,
      () => {
        passed = true;
      },
    );
    assert.equal(status, Array.isArray(value) && !value.length ? 400 : 200);
    assert.equal(passed, status === 200);
  }
});

test("native values select the checked radio, preserve zero/false and omit disabled controls", async () => {
  const run = (input: object, elements: object[] = []) =>
    runInNewContext(
      `${formValueRuntime}\nformControlValue(input, {elements})`,
      { input, elements, Error },
    );
  const radio = {
    type: "radio",
    name: "attendance",
    checked: false,
    value: "remote",
  };
  assert.equal(
    run(radio, [radio, { ...radio, checked: true, value: "onsite" }]),
    "onsite",
  );
  assert.equal(run(radio, [radio]), undefined);
  assert.equal(
    run({ ...radio, disabled: true }, [
      { ...radio, disabled: true },
      { ...radio, value: "onsite", checked: true },
    ]),
    "onsite",
  );
  assert.equal(
    run({ type: "radio", name: "", checked: false, value: "x" }),
    undefined,
  );
  assert.equal(run({ type: "number", value: "0", valueAsNumber: 0 }), 0);
  assert.equal(run({ type: "checkbox", checked: false }), false);
  assert.equal(run({ type: "number", value: "" }), undefined);
  assert.equal(run({ tagName: "SELECT", value: "", required: false }), undefined);
  assert.equal(run({ value: "hidden", matches: () => true }), undefined);
  assert.throws(
    () => run({ type: "number", value: "oops", valueAsNumber: NaN }),
    /valid number/,
  );
  await assert.rejects(run({ type: "file", files: [{size:262145}], name:"attachment" }), /allowed size/);
  assert.equal(await run({type:"file",files:[]}),undefined);
  const options = [
    { value: "Design", closest: () => null },
    { value: "Ignored", disabled: true },
    { value: "Group disabled", closest: () => ({}) },
  ];
  assert.deepEqual(
    JSON.parse(
      JSON.stringify(
        run({ tagName: "SELECT", multiple: true, selectedOptions: options }),
      ),
    ),
    ["Design"],
  );
});
