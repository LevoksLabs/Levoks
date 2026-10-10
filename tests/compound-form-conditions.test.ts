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
import {
  conditionDefault,
  conditionSources,
  remapCondition,
} from "../src/lib/form-conditions";
import { createSubmissionDestination } from "../src/lib/form-destination";
import { deepCloneSubtree } from "../src/lib/idGenerator";
import {
  componentDefinition,
  componentInstance,
} from "../src/lib/design-components";
import { useEditorStore } from "../src/store/editorStore";
import { templates } from "../src/templates";
import { PROGRAM_RUNTIME } from "../src/lib/codegen/program-runtime";
import type { FormCondition, ElementNode } from "../src/types";

test("a deeply conditional large form fails atomically before exceeding the workflow budget", () => {
  const project = emptyProject();
  restoreProject(project);
  const store = useEditorStore.getState(),
    form = store.addElement(templates.form);
  const controllers = Array.from({ length: 8 }, (_, index) =>
    store.addElement(
      {
        ...elementTemplate("checkbox"),
        props: {
          ...elementTemplate("checkbox").props,
          name: `controller${index}`,
        },
      },
      form,
    ),
  );
  let parent = form;
  for (let depth = 0; depth < 2; depth++) {
    parent = store.addElement(elementTemplate("formField"), parent);
    editFormCondition(parent, {
      sourceId: controllers[0],
      checked: true,
      match: "all",
      rules: controllers
        .slice(1)
        .map((sourceId) => ({ sourceId, checked: true })),
    });
  }
  for (let index = 0; index < 60; index++)
    store.addElement(
      {
        ...elementTemplate("textInput"),
        props: {
          ...elementTemplate("textInput").props,
          name: `answer${index}`,
          required: true,
        },
      },
      parent,
    );
  const before = captureProject(project.id, project.name);
  assert.throws(
    () => createSubmissionDestination(form, "Large survey"),
    /1,000 workflow blocks/,
  );
  const after = captureProject(project.id, project.name);
  assert.deepEqual(after.editor, before.editor);
  assert.deepEqual(after.backend, before.backend);
  assert.deepEqual(after.routing, before.routing);
});

function fixture(match: "all" | "any") {
  const project = emptyProject();
  restoreProject(project);
  const store = useEditorStore.getState();
  const form = store.addElement(templates.form);
  const add = (kind: string, parent: string, props = {}) =>
    store.addElement(
      {
        ...elementTemplate(kind),
        props: { ...elementTemplate(kind).props, ...props },
      },
      parent,
    );
  const toggle = add("checkbox", form, { name: "business", label: "Business" });
  const select = add("select", form, {
    name: "audience",
    options: "personal\n$business",
    value: "personal",
    placeholder: "",
  });
  const outer = add("formField", form, { ariaLabel: "Outer" });
  const note = add("textInput", outer, { name: "note", required: true });
  const innerChoice = add("select", outer, {
    name: "plan",
    options: "basic\npremium",
    value: "basic",
    placeholder: "",
  });
  const inner = add("formField", outer, { ariaLabel: "Inner" });
  const detail = add("textInput", inner, { name: "detail", required: true });
  const condition: FormCondition = {
    sourceId: toggle,
    checked: true,
    match,
    rules: [
      { sourceId: select, checked: true, operator: "eq", value: "$business" },
    ],
  };
  editFormCondition(outer, condition);
  editFormCondition(inner, {
    sourceId: innerChoice,
    checked: true,
    operator: "eq",
    value: "premium",
  });
  return {
    project,
    store,
    form,
    toggle,
    select,
    outer,
    note,
    innerChoice,
    inner,
    detail,
    condition,
    add,
  };
}

test("compound and nested conditions execute every truth-table branch in the generated backend", async () => {
  for (const match of ["all", "any"] as const) {
    const f = fixture(match);
    createSubmissionDestination(f.form, "Enquiries");
    const project = parseProject(captureProject(f.project.id, f.project.name));
    const service = project.backend.services[0];
    const compiled = compileProject(project);
    assert.deepEqual(
      compiled.diagnostics.filter((d) => d.severity === "error"),
      [],
    );
    const endpoint = service.blocks.find(
      (block) => block.type === "rest_endpoint",
    )!;
    const blocks = service.blocks.filter((block) =>
      [
        "logic_if",
        "validation",
        "rest_endpoint",
        "transform",
        "response",
      ].includes(block.type),
    );
    endpoint.connections = endpoint.connections.filter((id) =>
      blocks.some((block) => block.id === id),
    );
    const exports = {} as {
      createWorkflow: (
        program: unknown,
        models: unknown,
        database: unknown,
      ) => (id: string, req: unknown) => Promise<unknown>;
    };
    runInNewContext(PROGRAM_RUNTIME, { exports, structuredClone, Date, Set });
    const execute = exports.createWorkflow({ blocks }, {}, {});
    for (const checked of [false, true])
      for (const selected of ["personal", "$business"])
        for (const plan of ["basic", "premium"]) {
          const outerActive =
            match === "all"
              ? checked && selected === "$business"
              : checked || selected === "$business";
          const innerActive = outerActive && plan === "premium";
          const body = {
            business: checked,
            audience: selected,
            ...(outerActive ? { note: "Outer entry", plan } : {}),
            ...(innerActive ? { detail: "Inner entry" } : {}),
          };
          await assert.doesNotReject(() => execute(endpoint.id, { body }));
          await assert.rejects(() =>
            execute(endpoint.id, {
              body: { ...body, note: outerActive ? undefined : "forged" },
            }),
          );
          await assert.rejects(() =>
            execute(endpoint.id, {
              body: { ...body, detail: innerActive ? undefined : "forged" },
            }),
          );
          const nodes = structuredClone(project.editor.elementsById);
          nodes[f.toggle].props.checked = checked;
          nodes[f.select].props.value = selected;
          nodes[f.innerChoice].props.value = plan;
          assert.equal(
            conditionDefault(
              nodes[f.outer] as ElementNode,
              nodes as Record<string, ElementNode>,
            ),
            outerActive,
          );
          assert.equal(
            conditionDefault(
              nodes[f.inner] as ElementNode,
              nodes as Record<string, ElementNode>,
            ),
            innerActive,
          );
        }
  }
});

test("compound conditions preserve all source references in clones and reusable definitions", () => {
  const f = fixture("any"),
    nodes = useEditorStore.getState().elementsById;
  const clone = deepCloneSubtree(nodes[f.form], nodes);
  const cloned = Object.values(clone.allCloned).find(
    (node) => node.props.ariaLabel === "Outer",
  )!;
  assert.notEqual(cloned.formCondition!.sourceId, f.toggle);
  assert.notEqual(cloned.formCondition!.rules![0].sourceId, f.select);
  assert.equal(
    clone.allCloned[cloned.formCondition!.rules![0].sourceId].props.name,
    "audience",
  );
  const definition = componentDefinition(f.form, nodes, "Enquiry form", "form");
  const instance = componentInstance(definition, "form", nodes);
  const republished = componentDefinition(
    instance.rootId,
    instance.nodes,
    "Enquiry form",
    "form",
  );
  assert.deepEqual(
    republished.nodes[f.outer].formCondition,
    nodes[f.outer].formCondition,
  );
  assert.equal(
    remapCondition(f.condition, (id) => "copy_" + id).rules![0].sourceId,
    "copy_" + f.select,
  );
});

test("nested conditions reject siblings, cycles, unavailable options and invalid comparisons with repairable history", () => {
  const f = fixture("all");
  const sibling = f.add("formField", f.form);
  const siblingSource = f.add("select", sibling);
  editFormCondition(sibling, { sourceId: f.toggle, checked: true });
  assert.ok(
    !conditionSources(
      useEditorStore.getState().elementsById[f.inner],
      useEditorStore.getState().elementsById,
    ).some((node) => node.id === siblingSource),
  );
  for (const rule of [
    { sourceId: f.detail, checked: true },
    {
      sourceId: f.select,
      checked: true,
      operator: "includes" as const,
      value: "$business",
    },
    {
      sourceId: f.select,
      checked: true,
      operator: "eq" as const,
      value: "missing",
    },
    {
      sourceId: f.select,
      checked: true,
      operator: "eq" as const,
      value: "$business",
      rules: Array(8).fill({ sourceId: f.toggle, checked: true }),
    },
  ])
    assert.throws(() => editFormCondition(f.inner, rule));
  assert.equal(
    useEditorStore.getState().elementsById[f.inner].formCondition!.sourceId,
    f.innerChoice,
  );
  editFormCondition(f.inner, {
    sourceId: f.innerChoice,
    checked: true,
    operator: "ne",
    value: "basic",
  });
  f.store.undo();
  assert.equal(
    useEditorStore.getState().elementsById[f.inner].formCondition!.operator,
    "eq",
  );
  f.store.redo();
  assert.equal(
    useEditorStore.getState().elementsById[f.inner].formCondition!.operator,
    "ne",
  );
  const saved = captureProject(f.project.id, f.project.name);
  saved.editor.elementsById[f.select].props.disabled = true;
  assert.throws(() => parseProject(saved), /enabled/);
});

test("radio and multiple select controllers compile scalar and membership conditions including empty selections", async () => {
  const f = fixture("all");
  const multiple = f.add("multiSelect", f.form, {
    name: "interests",
    options: "web\napp",
    selectedValues: "web",
  });
  const radio = f.add("radioGroup", f.form, { name: "tier", legend: "Tier" });
  f.add("radioButton", radio, {
    name: "tier",
    value: "free",
    label: "Free",
    checked: false,
  });
  f.add("radioButton", radio, {
    name: "tier",
    value: "paid",
    label: "Paid",
    checked: true,
  });
  editFormCondition(f.outer, {
    sourceId: multiple,
    checked: true,
    operator: "excludes",
    value: "app",
    match: "all",
    rules: [{ sourceId: radio, checked: true, operator: "eq", value: "paid" }],
  });
  assert.equal(
    conditionDefault(
      useEditorStore.getState().elementsById[f.outer],
      useEditorStore.getState().elementsById,
    ),
    true,
  );
  createSubmissionDestination(f.form, "Choices");
  const project = parseProject(captureProject(f.project.id, f.project.name));
  assert.deepEqual(
    compileProject(project).diagnostics.filter((d) => d.severity === "error"),
    [],
  );
  const endpoint = project.backend.services[0].blocks.find(
    (block) => block.type === "rest_endpoint",
  )!;
  if (endpoint.type !== "rest_endpoint") throw new Error("endpoint");
  assert.equal(
    endpoint.config.requestBody.find((field) => field.name === "tier")!.type,
    "string",
  );
  assert.equal(
    endpoint.config.requestBody.find((field) => field.name === "interests")!
      .type,
    "array",
  );
});
