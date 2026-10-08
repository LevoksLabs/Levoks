import test from "node:test";
import assert from "node:assert/strict";
import {
  emptyProject,
  restoreProject,
  captureProject,
} from "../src/lib/project/workspace";
import { parseProject } from "../src/lib/project/schema";
import { useEditorStore } from "../src/store/editorStore";
import { useBackendStore } from "../src/store/backendStore";
import { templates } from "../src/templates";
import { compileProject } from "../src/lib/project/compiler";
import { publishReadiness } from "../src/lib/project/readiness";
import { relationsFixture } from "./helpers/relations-fixture";
import type { FlowGraph } from "../src/types/ir";

test("readiness reports unfinished forms/actions and ignores form submit controls, disabled and hidden content", () => {
  const initial = emptyProject("Readiness");
  restoreProject(initial);
  const store = useEditorStore.getState();
  const form = store.addElement({
    ...templates.form,
    props: { ...templates.form.props, requestUrl: "" },
  });
  const button = store.addElement(templates.button);
  const disabled = store.addElement({
    ...templates.button,
    props: { ...templates.button.props, disabled: true },
  });
  const hidden = store.addElement({
    ...templates.container,
    layout: { visible: false },
  });
  store.addElement(templates.button, hidden);
  const project = parseProject(captureProject(initial.id, initial.name));
  const findings = publishReadiness(project);
  assert.equal(
    findings.filter((f) => f.id.startsWith("button-action")).length,
    1,
  );
  assert.deepEqual(
    findings.find((f) => f.id.startsWith("button-action"))!.target,
    { kind: "element", elementId: button, pageId: initial.editor.activePageId },
  );
  assert.ok(
    findings.some(
      (f) =>
        f.id.startsWith("form-destination") &&
        f.target.kind === "element" &&
        f.target.elementId === form,
    ),
  );
  assert.ok(
    !findings.some(
      (f) => f.target.kind === "element" && f.target.elementId === disabled,
    ),
  );
  assert.ok(findings.some((f) => f.severity === "runtime"));
  store.updateElement(button, { props: { href: "/" } });
  const updated = parseProject(captureProject(initial.id, initial.name));
  const graph: FlowGraph = {
    pages: updated.editor.pages,
    services: [],
    flows: [
      {
        id: "form-flow",
        trigger: {
          elementId: form,
          elementType: "form",
          pageId: initial.editor.activePageId,
          pageRoute: "/",
          event: "submit",
        },
        steps: [
          {
            type: "navigate",
            pageId: initial.editor.activePageId,
            pageRoute: "/",
            pageTitle: "Home",
          },
        ],
      },
    ],
  };
  // A navigation-only form flow still cannot save a submission.
  assert.ok(
    publishReadiness(updated, graph).some((f) =>
      f.id.startsWith("form-destination"),
    ),
  );
  assert.ok(
    !publishReadiness(updated, graph).some((f) =>
      f.id.startsWith("button-action"),
    ),
  );
  graph.flows[0].steps.push({
    type: "api_call",
    method: "POST",
    endpoint: "/submit",
    serviceName: "Forms",
    servicePort: 3001,
    serviceId: "forms",
    blockId: "submit",
    authRequired: false,
  });
  assert.ok(
    !publishReadiness(updated, graph).some((f) =>
      f.id.startsWith("form-destination"),
    ),
  );
  store.updateElement(hidden, {
    responsive: { mobile: { layout: { visible: true } } },
  });
  const mobile = parseProject(captureProject(initial.id, initial.name));
  assert.equal(
    publishReadiness(mobile, graph).filter((f) =>
      f.id.startsWith("button-action"),
    ).length,
    1,
    "the otherwise hidden child is visible and checked on mobile",
  );
});

test("compiler blockers locate real backend configuration and runtime setup stays explicit", () => {
  const project = emptyProject();
  project.backend.services = [relationsFixture()];
  const relation = project.backend.services[0].blocks.find(
    (b) => b.id === "tasks_relation",
  )!;
  if (relation.type === "relation") relation.config.foreignKey = "missing";
  const output = compileProject(project);
  const findings = publishReadiness(
    output.project,
    output.graph,
    output.diagnostics,
  );
  const error = findings.find(
    (f) =>
      f.severity === "error" &&
      f.target.kind === "backend" &&
      f.target.blockId === "tasks_relation",
  )!;
  assert.ok(error);
  assert.equal(
    error.target.kind === "backend" && error.target.serviceId,
    project.backend.services[0].id,
  );
  assert.equal(findings[0].severity, "error");
  assert.ok(
    findings.some(
      (f) => f.id === "runtime-environment" && /not proof/.test(f.message),
    ),
  );
  assert.ok(!JSON.stringify(findings).includes("secretKey"));
  restoreProject(project);
  useBackendStore
    .getState()
    .updateBlockConfig(project.backend.services[0].id, "tasks_relation", {
      foreignKey: "projectId",
    });
  const repaired = compileProject(captureProject(project.id, project.name));
  assert.ok(
    !publishReadiness(
      repaired.project,
      repaired.graph,
      repaired.diagnostics,
    ).some((f) => f.severity === "error"),
  );
});

test("readiness catches missing local links, excludes intentional noindex pages, and identifies source errors", () => {
  const initial = emptyProject();
  restoreProject(initial);
  const store = useEditorStore.getState();
  const button = store.addElement({
    ...templates.button,
    props: { ...templates.button.props, href: "/absent?from=home" },
  });
  store.updatePageSeo(initial.editor.activePageId, { noIndex: true });
  const project = parseProject(captureProject(initial.id, initial.name));
  const findings = publishReadiness(
    project,
    undefined,
    [],
    "Invalid configuration",
  );
  assert.ok(
    findings.some(
      (f) =>
        f.id.startsWith("missing-page") &&
        f.target.kind === "element" &&
        f.target.elementId === button,
    ),
  );
  assert.ok(!findings.some((f) => f.id.startsWith("page-description")));
  store.updateElement(button, { props: { href: "" }, actions: { type: "redirect", target: "/" } });
  assert.ok(!publishReadiness(parseProject(captureProject(initial.id, initial.name))).some((f) => f.id.startsWith("button-action") || f.id.startsWith("missing-page")));
  store.updateElement(button, { actions: { type: "redirect", target: "javascript:alert(1)" } });
  assert.ok(publishReadiness(parseProject(captureProject(initial.id, initial.name))).some((f) => f.id.startsWith("button-action")));
  assert.equal(findings[0].title, "Project validation failed");
  assert.deepEqual(findings[0].target, { kind: "source" });
});
