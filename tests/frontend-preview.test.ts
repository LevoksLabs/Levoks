import test from "node:test";
import assert from "node:assert/strict";
import { runInNewContext } from "node:vm";
import { generatedPreview } from "../src/lib/project/preview";
import { compileProject } from "../src/lib/project/compiler";
import { designFingerprint } from "../src/lib/project/schema";
import { canvasAppFixture } from "./helpers/canvas-app-fixture";
import { generateAnimationSetup } from "../src/lib/codegen/animationCodegen";

test("preview rejects stale/manual source and invalid backend IR instead of showing an unrelated success", () => {
  const { project } = canvasAppFixture();
  const output = compileProject(project);
  assert.deepEqual(
    output.diagnostics.filter((item) => item.severity === "error"),
    [],
  );
  project.source = { basedOn: designFingerprint(project), files: output.files };
  assert.throws(
    () => generatedPreview(project, project.editor.activePageId),
    /Source edits require/,
  );
  delete project.source;
  project.backend.services[0].blocks.find(
    (block) => block.type === "query",
  )!.connections = ["missing"];
  assert.throws(() => generatedPreview(project, project.editor.activePageId));
});

test("shared animation runtime cleans up listeners/timers before remount and preserves reduced-motion content", () => {
  let reduced = false,
    ticks: (() => void)[] = [],
    listeners = 0,
    disconnected = 0;
  const element = {
    textContent: "Readable text",
    style: { opacity: "0" },
    classList: { add() {}, remove() {} },
    addEventListener() {
      listeners++;
    },
    removeEventListener() {
      listeners--;
    },
  };
  const source = generateAnimationSetup([
    {
      className: "animated",
      anim: {
        type: "typewriter",
        trigger: "onClick",
        duration: 1,
        delay: 0,
        easing: "linear",
        iterationCount: 1,
        direction: "normal",
        fillMode: "forwards",
      },
    },
    {
      className: "scroll",
      anim: {
        type: "fadeIn",
        trigger: "onScroll",
        duration: 1,
        delay: 0,
        easing: "linear",
        iterationCount: 1,
        direction: "normal",
        fillMode: "forwards",
      },
    },
  ]);
  const context = {
    root: { querySelectorAll: () => [element] },
    window: { matchMedia: () => ({ matches: reduced }) },
    setInterval: (tick: () => void) => {
      ticks.push(tick);
      return tick;
    },
    clearInterval: (tick: () => void) => {
      ticks = ticks.filter((item) => item !== tick);
    },
    IntersectionObserver: class {
      observe() {}
      disconnect() {
        disconnected++;
      }
    },
  };
  const setup = runInNewContext(source + "; setupAnimations", context);
  const cleanup = setup(context.root);
  ticks[0]();
  assert.equal(element.textContent, "R");
  cleanup();
  assert.equal(element.textContent, "Readable text");
  assert.equal(listeners, 0);
  assert.equal(ticks.length, 0);
  assert.equal(disconnected, 1);
  setup(context.root)();
  assert.equal(element.textContent, "Readable text");
  reduced = true;
  setup(context.root)();
  assert.equal(element.style.opacity, "1");
  assert.equal(element.textContent, "Readable text");
  assert.equal(ticks.length, 0);
});

test("compiler blocks workflow inputs that endpoint validation would silently discard", () => {
  const { project } = canvasAppFixture();
  const endpoint = project.backend.services[0].blocks.find(
    (block) => block.id === "post",
  )!;
  if (endpoint.type !== "rest_endpoint")
    throw new Error("Missing fixture endpoint");
  endpoint.config.requestBody = endpoint.config.requestBody.filter(
    (field) => field.name !== "quantity",
  );
  const failures = compileProject(project).diagnostics.filter(
    (item) => item.severity === "error",
  );
  assert.ok(
    failures.some(
      (item) =>
        item.nodeId === "post" &&
        /Declare quantity.*Request Body/.test(item.message),
    ),
  );
  assert.throws(
    () => generatedPreview(project, project.editor.activePageId),
    /Declare quantity/,
  );
});

test("backend routing can return to its trigger page without restarting the flow", () => {
  const { project, refresh } = canvasAppFixture();
  const output = compileProject(project);
  const flow = output.graph.flows.find(
    (flow) => flow.trigger.elementId === refresh,
  )!;
  assert.deepEqual(
    flow.steps.map((step) => step.type),
    ["api_call", "navigate"],
  );
  const destination = flow.steps[1];
  assert.ok(
    destination.type === "navigate" &&
      destination.pageId === flow.trigger.pageId,
  );
});

test("routing executes distinct endpoints in one service and rejects repeated endpoint cycles", () => {
  const { project, refresh } = canvasAppFixture();
  const response = project.routing.connections.find(
    (edge) => edge.id === "refresh-home",
  )!;
  response.toNodeId = "service";
  response.toPortId = "service:in:confirm";
  const output = compileProject(project);
  assert.deepEqual(
    output.diagnostics.filter((item) => item.severity === "error"),
    [],
  );
  const flow = output.graph.flows.find(
    (flow) => flow.trigger.elementId === refresh,
  )!;
  assert.deepEqual(
    flow.steps.map((step) =>
      step.type === "api_call" ? step.endpoint : step.type,
    ),
    ["/refresh", "/confirm", "navigate"],
  );

  const confirmation = project.routing.connections.find(
    (edge) => edge.id === "confirm-home",
  )!;
  confirmation.toNodeId = "service";
  confirmation.toPortId = "service:in:refresh";
  const failures = compileProject(project).diagnostics.filter(
    (item) => item.severity === "error",
  );
  assert.equal(failures.length, 1);
  assert.equal(failures[0].code, "ROUTING_CYCLE");
  assert.equal(failures[0].flowId, flow.id);
  assert.throws(
    () => generatedPreview(project, project.editor.activePageId),
    /circular connection/,
  );
});
