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
import { editFormCondition } from "../src/lib/edit-form-condition";
import { conditionSources } from "../src/lib/form-conditions";
import { deepCloneSubtree } from "../src/lib/idGenerator";
import {
  componentDefinition,
  componentInstance,
} from "../src/lib/design-components";
import { useEditorStore } from "../src/store/editorStore";
import { templates } from "../src/templates";
import { createSubmissionDestination } from "../src/lib/form-destination";
import { VALIDATION_RUNTIME } from "../src/lib/backend/validation";
import { formConditionsRuntime } from "../src/lib/codegen/form-conditions";

function fixture() {
  const project = emptyProject();
  restoreProject(project);
  const store = useEditorStore.getState(),
    form = store.addElement(templates.form);
  const source = store.addElement(
    {
      ...elementTemplate("checkbox"),
      props: {
        ...elementTemplate("checkbox").props,
        name: "business",
        label: "Business enquiry",
      },
    },
    form,
  );
  const section = store.addElement(
    {
      ...elementTemplate("formField"),
      props: {
        ...elementTemplate("formField").props,
        ariaLabel: "Company details",
      },
    },
    form,
  );
  const input = store.addElement(
    {
      ...elementTemplate("input"),
      props: {
        ...elementTemplate("input").props,
        name: "company",
        required: true,
      },
    },
    section,
  );
  editFormCondition(section, { sourceId: source, checked: true });
  return { project, store, form, source, section, input };
}

test("conditional form sections preserve history and copy references, reject unsafe scopes and compile ordinary backend branches", () => {
  const { project, store, form, source, section, input } = fixture();
  assert.deepEqual(
    conditionSources(
      store.elementsById[section] ||
        useEditorStore.getState().elementsById[section],
      useEditorStore.getState().elementsById,
    ).map((node) => node.id),
    [source],
  );
  store.undo();
  assert.equal(
    useEditorStore.getState().elementsById[section].formCondition,
    undefined,
  );
  store.redo();
  assert.equal(
    useEditorStore.getState().elementsById[section].formCondition?.sourceId,
    source,
  );
  const nodes = useEditorStore.getState().elementsById;
  const definition = componentDefinition(
    form,
    nodes,
    "Conditional form",
    "form_component",
  );
  const instance = componentInstance(definition, "form_component", nodes);
  const instanceSection = Object.values(instance.nodes).find(
    (node) => node.formCondition,
  )!;
  assert.equal(
    instance.nodes[instanceSection.formCondition!.sourceId].props.name,
    "business",
  );
  const republished = componentDefinition(
    instance.rootId,
    instance.nodes,
    "Conditional form",
    "form_component",
  );
  assert.deepEqual(
    republished.nodes[section].formCondition,
    nodes[section].formCondition,
  );
  const copy = deepCloneSubtree(nodes[form], nodes);
  const copiedSection = Object.values(copy.allCloned).find(
    (node) => node.formCondition,
  )!;
  assert.notEqual(copiedSection.formCondition!.sourceId, source);
  assert.equal(
    copy.allCloned[copiedSection.formCondition!.sourceId].props.name,
    "business",
  );
  const saved = parseProject(captureProject(project.id, project.name));
  for (const mutate of [
    (p: typeof saved) => {
      p.editor.elementsById[section].formCondition!.sourceId = input;
    },
    (p: typeof saved) => {
      p.editor.elementsById[source].props.disabled = true;
    },
    (p: typeof saved) => {
      p.editor.elementsById[source].formCondition = {
        sourceId: source,
        checked: true,
      };
    },
    (p: typeof saved) => {
      p.editor.elementsById[input].formCondition = {
        sourceId: source,
        checked: false,
      };
    },
    (p: typeof saved) => {
      p.editor.elementsById[source].parentId = section;
      p.editor.elementsById[form].children = p.editor.elementsById[
        form
      ].children.filter((id) => id !== source);
      p.editor.elementsById[section].children.push(source);
    },
  ]) {
    const invalid = structuredClone(saved);
    mutate(invalid);
    assert.throws(() => parseProject(invalid));
  }
  assert.throws(() =>
    editFormCondition(section, { sourceId: input, checked: true }),
  );
  store.updateElement(section, {
    layout: { ...nodes[section].layout, locked: true },
  });
  assert.throws(() => editFormCondition(section), /Unlock/);
  store.updateElement(section, {
    layout: { ...nodes[section].layout, locked: false },
  });
  const nested = store.addElement(elementTemplate("formField"), section);
  assert.throws(
    () => editFormCondition(nested, { sourceId: source, checked: false }),
    /nested/,
  );
  store.deleteElement(nested);
  createSubmissionDestination(form, "Conditional enquiries");
  const result = parseProject(captureProject(project.id, project.name));
  const blocks = result.backend.services[0].blocks;
  const endpoint = blocks.find((node) => node.type === "rest_endpoint")!;
  if (endpoint.type !== "rest_endpoint") throw new Error("Endpoint");
  assert.equal(
    endpoint.config.requestBody.find((field) => field.name === "business")
      ?.required,
    true,
  );
  assert.equal(
    endpoint.config.requestBody.find((field) => field.name === "company")
      ?.required,
    false,
  );
  const gate = blocks.find((node) => node.type === "logic_if")!;
  if (gate.type !== "logic_if") throw new Error("Condition");
  assert.equal(gate.config.program!.left, "$request.body.business");
  assert.ok(endpoint.connections.includes(gate.id));
  for (const id of [
    ...gate.config.program!.thenSteps,
    ...gate.config.program!.elseSteps,
  ])
    assert.ok(!endpoint.connections.includes(id));
  const compiled = compileProject(result);
  assert.deepEqual(
    compiled.diagnostics.filter((d) => d.severity === "error"),
    [],
  );
  assert.ok(
    Object.values(compiled.files).some((source) =>
      source.includes("syncFormConditions"),
    ),
  );
  const invalidContract = structuredClone(result);
  const invalidEndpoint = invalidContract.backend.services[0].blocks.find(
    (node) => node.type === "rest_endpoint",
  )!;
  if (invalidEndpoint.type !== "rest_endpoint") throw new Error("Endpoint");
  invalidEndpoint.config.requestBody.find(
    (field) => field.name === "company",
  )!.required = true;
  assert.ok(
    compileProject(invalidContract).diagnostics.some(
      (d) =>
        d.severity === "error" && d.message.includes("optional request body"),
    ),
  );
});

test("native conditional sections retain entries, disable hidden required controls, follow inverse predicates and reset defaults", async () => {
  const source = {
    id: "source-control",
    type: "checkbox",
    checked: false,
    matches: () => false,
  };
  const listeners: Record<string, (event: { target: typeof source }) => void> =
    {};
  const form = { elements: [source] };
  const group = (checked: boolean, disabled = false) => ({
    form,
    hidden: false,
    disabled: false,
    getAttribute: (key: string) =>
      ({
        "data-condition-source": "source",
        "data-condition-checked": String(checked),
        "data-condition-disabled": String(disabled),
      })[key],
  });
  const on = group(true),
    off = group(false),
    disabled = group(true, true);
  const root = {
    querySelectorAll: () => [on, off, disabled],
    addEventListener: (name: string, fn: (typeof listeners)[string]) => {
      listeners[name] = fn;
    },
    removeEventListener: (name: string) => {
      delete listeners[name];
    },
  };
  const setup = runInNewContext(
    formConditionsRuntime + ";setupFormConditions",
    { queueMicrotask },
  );
  const cleanup = setup(root);
  assert.equal(on.hidden, true);
  assert.equal(on.disabled, true);
  assert.equal(off.hidden, false);
  source.checked = true;
  listeners.change({ target: source });
  assert.equal(on.disabled, false);
  assert.equal(off.disabled, true);
  assert.equal(disabled.disabled, true);
  source.checked = false;
  listeners.reset({ target: source });
  await new Promise<void>((resolve) => queueMicrotask(resolve));
  assert.equal(on.hidden, true);
  assert.equal(off.disabled, false);
  cleanup();
  assert.deepEqual(Object.keys(listeners), []);
});

test("hidden-field validation accepts absence exclusively, including rejecting false and empty arrays", () => {
  const valid = runInNewContext(VALIDATION_RUNTIME + ";validationRuleValid");
  assert.equal(valid({ type: "absent" }, undefined), true);
  for (const value of [null, false, [], "", 0, "forged"])
    assert.equal(valid({ type: "absent" }, value), false);
});

test("several broken section conditions can be repaired one at a time without exposing values silently", () => {
  const { project, store, form, source, section } = fixture();
  const second = store.addElement(elementTemplate("formField"), form);
  editFormCondition(second, { sourceId: source, checked: false });
  const repeater = store.addElement(elementTemplate("repeater"));
  store.moveElement(form, repeater, 0);
  assert.throws(
    () => parseProject(captureProject(project.id, project.name)),
    /repeaters/,
  );
  store.moveElement(form, null, 0);
  store.deleteElement(repeater);
  store.updateElement(source, { props: { disabled: true } });
  assert.throws(
    () => parseProject(captureProject(project.id, project.name)),
    /enabled/,
  );
  editFormCondition(section);
  assert.ok(useEditorStore.getState().elementsById[second].formCondition);
  editFormCondition(second);
  assert.doesNotThrow(() =>
    parseProject(captureProject(project.id, project.name)),
  );
});
