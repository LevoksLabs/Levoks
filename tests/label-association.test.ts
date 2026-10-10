import test from "node:test";
import assert from "node:assert/strict";
import {
  nativeTree,
  nativeMarkup,
  nativeControlId,
} from "../src/lib/elements/native";
import { elementTemplate } from "../src/lib/elements/registry";
import { useEditorStore } from "../src/store/editorStore";
import {
  emptyProject,
  restoreProject,
  captureProject,
} from "../src/lib/project/workspace";
import { templates } from "../src/templates";
import { compileProject } from "../src/lib/project/compiler";
import { parseProject } from "../src/lib/project/schema";
import { deepCloneSubtree } from "../src/lib/idGenerator";
import {
  componentDefinition,
  componentInstance,
} from "../src/lib/design-components";

test("semantic label associations survive helper wrappers, copies, components and saved export", () => {
  const project = emptyProject();
  restoreProject(project);
  const store = useEditorStore.getState();
  const parent = store.addElement(templates.container);
  const field = store.addElement(elementTemplate("textInput"), parent);
  const label = store.addElement(
    {
      ...elementTemplate("label")!,
      props: {
        ...elementTemplate("label")!.props,
        content: "Reference caption",
        htmlFor: field,
      },
    },
    parent,
  );
  for (const help of ["", "Enter your reference"]) {
    store.updateElement(field, { props: { helperText: help } });
    const nodes = useEditorStore.getState().elementsById;
    const html = nativeMarkup(
      nativeTree(nodes[label], undefined, nodes),
      "html",
      "",
    );
    assert.ok(html.includes(`for="${nativeControlId(nodes[field])}"`));
  }
  const nodes = useEditorStore.getState().elementsById,
    copy = deepCloneSubtree(nodes[parent], nodes);
  const copiedLabel = Object.values(copy.allCloned).find(
    (n) => n.definitionId === "label",
  )!;
  const copiedField = Object.values(copy.allCloned).find(
    (n) => n.definitionId === "textInput",
  )!;
  assert.equal(copiedLabel.props.htmlFor, copiedField.id);
  const definition = componentDefinition(parent, nodes, "Fields", "test");
  const instance = componentInstance(definition, "test", nodes);
  const instanceLabel = Object.values(instance.nodes).find(
    (n) => n.definitionId === "label",
  )!;
  const instanceField = Object.values(instance.nodes).find(
    (n) => n.definitionId === "textInput",
  )!;
  assert.equal(instanceLabel.props.htmlFor, instanceField.id);
  const second = componentInstance(definition, "test", {
    ...nodes,
    ...instance.nodes,
  });
  const secondField = Object.values(second.nodes).find(
    (n) => n.definitionId === "textInput",
  )!;
  const linkedNodes = { ...nodes, ...instance.nodes, ...second.nodes };
  linkedNodes[instanceLabel.id].props.htmlFor = secondField.id;
  const published = componentDefinition(
    instance.rootId,
    linkedNodes,
    "Fields",
    "test",
  );
  const publishedLabel = Object.values(published.nodes).find(
    (n) => n.definitionId === "label",
  )!;
  assert.equal(
    publishedLabel.props.htmlFor,
    secondField.id,
    "Publishing preserves a label target in another instance instead of redirecting it to this instance.",
  );
  const compiled = compileProject(
    parseProject(captureProject(project.id, project.name)),
  );
  assert.deepEqual(
    compiled.diagnostics.filter((d) => d.severity === "error"),
    [],
  );
  assert.ok(
    compiled.files["frontend/app/page.jsx"].includes(
      `htmlFor="${nativeControlId(nodes[field])}"`,
    ),
  );
});
