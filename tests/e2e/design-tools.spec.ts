import { test, expect, type Page } from "@playwright/test";
import {
  emptyProject,
  captureProject,
  restoreProject,
} from "../../src/lib/project/workspace";
import { useEditorStore } from "../../src/store/editorStore";
import { templates } from "../../src/templates";
import { useRoutingStore } from "../../src/store/routingStore";
import { parseProject } from "../../src/lib/project/schema";
import { designFixture } from "../helpers/design-fixture";
import { block, programFixture } from "../helpers/program-fixture";

test("undo restores deleted pages with routing connections and survives canvas navigation", async ({
  page,
}) => {
  await open(page);
  await page.getByRole("button", { name: "Routes", exact: true }).click();
  await page
    .getByRole("button", {
      name: "Home: Primary button output port",
      exact: true,
    })
    .click();
  await page
    .locator(".routing-node")
    .filter({ hasText: "Details" })
    .getByRole("button", { name: /input port$/ })
    .first()
    .click();
  await expect(page.locator(".graph-connection-status")).toContainText(
    "1 connections",
  );
  await page.keyboard.press("Control+z");
  await expect(page.locator(".graph-connection-status")).toContainText(
    "0 connections",
  );
  await page.getByRole("button", { name: "Redo", exact: true }).click();
  await expect(page.locator(".graph-connection-status")).toContainText(
    "1 connections",
  );
  await page.getByRole("button", { name: "Pages", exact: true }).click();
  await page
    .getByRole("button", { name: "Delete page Details", exact: true })
    .click();
  await expect(
    page.getByRole("button", { name: "Open page Details", exact: true }),
  ).toHaveCount(0);
  await page.getByRole("button", { name: "Undo", exact: true }).click();
  await expect(
    page.getByRole("button", { name: "Open page Details", exact: true }),
  ).toBeVisible();
  await page.getByRole("button", { name: "Routes", exact: true }).click();
  await expect(page.locator(".graph-connection-status")).toContainText(
    "1 connections",
  );
  await page.getByRole("button", { name: "Save project", exact: true }).click();
  await page.reload();
  await page.getByRole("button", { name: "Routes", exact: true }).click();
  await expect(page.locator(".graph-connection-status")).toContainText(
    "1 connections",
  );
  await expect(
    page.getByRole("button", { name: "Undo", exact: true }),
  ).toBeDisabled();
});

test("workflow ports persist execution steps, reject cycles and retain dragged positions", async ({
  page,
}) => {
  await open(page);
  const project = emptyProject("Workflow studio");
  project.backend.services = parseProject({
    ...project,
    backend: {
      ...project.backend,
      services: [
        {
          ...programFixture(),
          blocks: [
            block("entry", "rest_endpoint", { route: "/hello" }),
            block("build", "transform", { fields: { message: "Hello" } }),
            block("reply", "response"),
          ],
        },
      ],
    },
  }).backend.services;
  await page
    .getByRole("button", { name: "Design studio (import)", exact: true })
    .click();
  const workspace = page.getByRole("dialog", {
    name: "Levoks project workspace",
  });
  await workspace.locator("input[type=file]").setInputFiles({
    name: "workflow.json",
    mimeType: "application/json",
    buffer: Buffer.from(JSON.stringify(project)),
  });
  await expect(
    workspace.getByLabel("Project name", { exact: true }),
  ).toHaveValue("Workflow studio (import)");
  await workspace.getByRole("button", { name: "Close workspace" }).click();
  await page.getByRole("button", { name: "Backend", exact: true }).click();
  await page
    .getByRole("button", { name: "Open workflow", exact: true })
    .click();
  await page.getByRole("button", { name: "Fit workflow", exact: true }).click();
  for (const [from, to] of [
    ["entry", "build"],
    ["build", "reply"],
  ]) {
    await page
      .getByRole("button", { name: `${from}: Next output`, exact: true })
      .press("Enter");
    await page
      .getByRole("button", { name: `Connect to ${to}`, exact: true })
      .press("Enter");
  }
  await expect(page.locator(".workflow-wires path")).toHaveCount(2);
  await page
    .getByRole("button", { name: "reply: Next output", exact: true })
    .click();
  await page
    .getByRole("button", { name: "Connect to build", exact: true })
    .click();
  await expect(
    page.locator(".workflow-status").getByRole("alert"),
  ).toContainText("creates a cycle");
  await page
    .getByRole("button", { name: "Cancel connection", exact: true })
    .click();
  const node = page
    .locator(".workflow-block")
    .filter({ has: page.getByRole("button", { name: "build", exact: true }) });
  const bounds = await node.boundingBox();
  await page.mouse.move(bounds!.x + 80, bounds!.y + 48);
  await page.mouse.down();
  await page.mouse.move(bounds!.x + 110, bounds!.y + 115, { steps: 5 });
  await page.mouse.up();
  const top = await node.evaluate((el) => (el as HTMLElement).style.top);
  expect(top).not.toBe("0px");
  await page.getByRole("button", { name: "Undo", exact: true }).click();
  await expect(node).toHaveCSS("top", "0px");
  await page.keyboard.press("Control+Shift+z");
  await expect(node).toHaveCSS("top", top);

  await page.getByRole("button", { name: "Save project", exact: true }).click();
  await page.reload();
  await page.getByRole("button", { name: "Backend", exact: true }).click();
  await page
    .getByRole("button", { name: "Open workflow", exact: true })
    .click();
  await expect(page.locator(".workflow-wires path")).toHaveCount(2);
  await expect(node).toHaveCSS("top", top);
  await page.screenshot({ path: ".verification/design-workflow.png" });
});

test("group and ungroup preserve canvas placement and pointer mode cycles", async ({
  page,
}) => {
  const { button, other } = await open(page);
  const first = page.locator(`.canvas-page [data-element-id="${button}"]`),
    second = page.locator(`.canvas-page [data-element-id="${other}"]`);
  await first.click();
  await second.click({ modifiers: ["Shift"] });
  const before = await second.boundingBox();
  await page.keyboard.press("Control+g");
  await expect(
    page.locator('.canvas-page [data-element-type="container"]'),
  ).toHaveCount(1);
  const grouped = await second.boundingBox();
  expect(grouped!.x).toBeCloseTo(before!.x, 0);
  expect(grouped!.y).toBeCloseTo(before!.y, 0);
  await page.keyboard.press("Control+Shift+g");
  await expect(
    page.locator('.canvas-page [data-element-type="container"]'),
  ).toHaveCount(0);
  await expect(second).toHaveCSS("left", "360px");
  const tool = page.getByRole("button", {
    name: "Cycle pointer tool",
    exact: true,
  });
  for (const mode of ["hand", "marquee", "select"]) {
    await tool.click();
    await expect(tool).toHaveAttribute("data-tool", mode);
  }
});

async function open(page: Page) {
  const project = emptyProject("Design studio");
  project.editor.canvasSettings = {
    width: 1280,
    height: 900,
    backgroundColor: "#ffffff",
  };
  restoreProject(project);
  const store = useEditorStore.getState();
  const button = store.addElement(
    {
      ...templates.button,
      label: "Primary button",
      props: { label: "Start building" },
    },
    undefined,
    80,
    100,
  );
  const other = store.addElement(
    {
      ...templates.button,
      label: "Secondary button",
      props: { label: "Learn more" },
    },
    undefined,
    360,
    100,
  );
  const details = store.addPage("Details");
  store.updatePageRoute(details, "/details");
  store.switchPage(project.editor.activePageId);
  const routing = useRoutingStore.getState();
  useEditorStore
    .getState()
    .pages.forEach((page) => routing.addNode("page", page.id));
  await page.goto("/");
  await expect(
    page.getByRole("button", { name: "Save project", exact: true }),
  ).toBeEnabled();
  await page
    .getByRole("button", { name: "Untitled project", exact: true })
    .click();
  const workspace = page.getByRole("dialog", {
    name: "Levoks project workspace",
  });
  await workspace.locator("input[type=file]").setInputFiles({
    name: "design.json",
    mimeType: "application/json",
    buffer: Buffer.from(
      JSON.stringify(captureProject(project.id, project.name)),
    ),
  });
  await expect(
    workspace.getByLabel("Project name", { exact: true }),
  ).toHaveValue("Design studio (import)");
  await workspace.getByRole("button", { name: "Close workspace" }).click();
  await page.getByRole("button", { name: "Fit canvas", exact: true }).click();
  return { button, other };
}

test("responsive overrides, token bindings and component instances survive save and match generated CSS", async ({
  page,
}) => {
  const { button } = await open(page);
  const element = page.locator(`.canvas-page [data-element-id="${button}"]`),
    inspector = page.locator(".inspector");
  await element.click();
  await page.getByLabel("Editing breakpoint").selectOption("mobile");
  await inspector.getByLabel("X", { exact: true }).fill("24");
  await inspector.getByLabel("W", { exact: true }).fill("280");
  await expect(element).toHaveCSS("left", "24px");
  await page.getByLabel("Editing breakpoint").selectOption("base");
  await expect(element).toHaveCSS("left", "80px");
  await page
    .getByRole("button", { name: "Design library", exact: true })
    .click();
  await page.getByLabel("Token name", { exact: true }).fill("Brand");
  await page.getByLabel("Token value", { exact: true }).fill("#334477");
  await page.getByRole("button", { name: "Add token", exact: true }).click();
  await inspector.getByText("Design token bindings", { exact: true }).click();
  await inspector
    .getByLabel("Fill token", { exact: true })
    .selectOption({ label: "Brand" });
  await expect(element).toHaveCSS("background-color", "rgb(51, 68, 119)");
  await page.getByLabel("Component name", { exact: true }).fill("Action");
  await page
    .getByRole("button", { name: "Save selection as component", exact: true })
    .click();
  await page
    .getByRole("button", { name: "Insert Action", exact: true })
    .click();
  await expect(
    page.locator('.canvas-page [data-element-type="button"]'),
  ).toHaveCount(3);
  await page.getByLabel("Token Brand", { exact: true }).fill("#774433");
  await page.getByLabel("Token Brand", { exact: true }).press("Enter");
  await expect(element).toHaveCSS("background-color", "rgb(119, 68, 51)");
  await page.getByRole("button", { name: "Save project", exact: true }).click();
  await page.reload();
  await expect(
    page.getByRole("button", { name: "Save project", exact: true }),
  ).toBeEnabled();
  await page.getByLabel("Editing breakpoint").selectOption("mobile");
  await expect(element).toHaveCSS("width", "280px");
  await page.getByRole("button", { name: "Preview", exact: true }).click();
  await page.getByLabel("Preview mode").selectOption("generated");
  const frame = page.frameLocator('iframe[title="Generated frontend preview"]');
  await expect(frame.locator(`.el-${button}`)).toHaveCSS("left", "24px");
  await expect(frame.locator(`.el-${button}`)).toHaveCSS(
    "background-color",
    "rgb(119, 68, 51)",
  );
  await expect(
    page.locator('iframe[title="Generated frontend preview"]'),
  ).toHaveAttribute("sandbox", "allow-scripts");
  const isolated = await frame.locator("body").evaluate(() => {
    try {
      void parent.document.body;
      return false;
    } catch {
      return true;
    }
  });
  expect(isolated).toBe(true);
  await page.screenshot({
    path: ".verification/design-responsive-preview.png",
  });
});

test("routing ports, panel sizing and source diagnostics work from the keyboard", async ({
  page,
}) => {
  await open(page);
  const separator = page.getByRole("separator", {
    name: "Resize inspector",
    exact: true,
  });
  const before = Number(await separator.getAttribute("aria-valuenow"));
  await separator.focus();
  await separator.press("ArrowLeft");
  await expect(separator).toHaveAttribute("aria-valuenow", String(before + 16));
  await page.getByRole("button", { name: "Routes", exact: true }).click();
  const start = page.getByRole("button", {
    name: "Home: Primary button output port",
    exact: true,
  });
  await start.focus();
  await start.press("Enter");
  await expect(page.locator(".graph-connection-status")).toContainText(
    "Connecting Primary button",
  );
  const end = page
    .locator(".routing-node")
    .filter({ hasText: "Details" })
    .getByRole("button", { name: /input port$/ })
    .first();
  await end.focus();
  await end.press("Enter");
  await expect(page.locator(".graph-connection-status")).toContainText(
    "1 connections",
  );
  await page.getByRole("button", { name: "Settings", exact: true }).click();
  await expect(
    page.getByLabel("Routing canvas", { exact: true }),
  ).toBeVisible();
  await page
    .getByRole("banner")
    .getByRole("button", { name: "Code", exact: true })
    .click();
  const dialog = page.getByRole("dialog", { name: "Levoks project workspace" });
  await dialog
    .getByRole("button", { name: "frontend/app/page.jsx", exact: true })
    .click();
  const source = dialog.getByRole("textbox", {
    name: "Source code for frontend/app/page.jsx",
    exact: true,
  });
  const original = await source.inputValue();
  await source.fill("export const broken = ;");
  await expect(dialog.locator(".source-issues")).toContainText(
    "Expression expected",
  );
  await source.fill(original);
  await expect(dialog.locator(".source-issues")).toContainText(
    "No syntax errors",
  );
  await dialog
    .getByLabel("Find in source", { exact: true })
    .fill("Start building");
  await dialog
    .getByLabel("Replace in source", { exact: true })
    .fill("Explore today");
  await dialog
    .getByRole("button", { name: "Replace all", exact: true })
    .click();
  await expect(source).toHaveValue(/Explore today/);
  await page.screenshot({
    path: ".verification/design-source-diagnostics.png",
  });
});

test("generated widgets switch tabs, repeat content, lay out galleries and render icons", async ({
  page,
}) => {
  await open(page);
  const fixture = designFixture();
  await page
    .getByRole("button", { name: "Design studio (import)", exact: true })
    .click();
  const workspace = page.getByRole("dialog", {
    name: "Levoks project workspace",
  });
  await workspace.locator("input[type=file]").setInputFiles({
    name: "widgets.json",
    mimeType: "application/json",
    buffer: Buffer.from(JSON.stringify(fixture.project)),
  });
  await expect(
    workspace.getByLabel("Project name", { exact: true }),
  ).toHaveValue("Design verification (import)");
  await workspace.getByRole("button", { name: "Close workspace" }).click();
  await page.getByRole("button", { name: "Preview", exact: true }).click();
  await page.getByLabel("Preview mode").selectOption("generated");
  const frame = page.frameLocator('iframe[title="Generated frontend preview"]');
  await expect(
    frame.getByText("Overview content", { exact: true }),
  ).toBeVisible();
  await expect(
    frame.getByText("Details content", { exact: true }),
  ).toBeHidden();
  await frame
    .getByRole("tab", { name: "Overview", exact: true })
    .press("ArrowRight");
  await expect(
    frame.getByText("Details content", { exact: true }),
  ).toBeVisible();
  await expect(
    frame.getByRole("button", { name: "Repeated action", exact: true }),
  ).toHaveCount(3);
  await expect(frame.locator(`.el-${fixture.gallery}`)).toHaveCSS(
    "display",
    "grid",
  );
  await expect(frame.locator(`.el-${fixture.icon} svg path`)).toHaveAttribute(
    "d",
    /^M12 21/,
  );
  await expect(frame.locator(`.el-${fixture.vector} path`)).toHaveAttribute(
    "d",
    / C /,
  );
  await page.screenshot({ path: ".verification/design-generated-widgets.png" });
});

test("asset library keeps uploads after deletion, supports reuse and exports actual image content", async ({
  page,
}) => {
  await open(page);
  await page.getByRole("button", { name: "Assets", exact: true }).click();
  const png = Buffer.from(
    "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+a/rQAAAAASUVORK5CYII=",
    "base64",
  );
  await page
    .locator('.asset-library input[type="file"]')
    .setInputFiles({ name: "pixel.png", mimeType: "image/png", buffer: png });
  await expect(
    page.locator('.canvas-page [data-element-type="image"] img'),
  ).toHaveCount(1);
  await page
    .locator(".inspector")
    .getByRole("button", { name: "Delete", exact: true })
    .click();
  await expect(
    page.locator('.canvas-page [data-element-type="image"]'),
  ).toHaveCount(0);
  await page.getByRole("button", { name: "Insert image", exact: true }).click();
  await page.getByRole("button", { name: "Save project", exact: true }).click();
  await page.reload();
  await expect(
    page.locator('.canvas-page [data-element-type="image"] img'),
  ).toHaveAttribute("src", /^data:image\/png;base64,/);
  await page.getByRole("button", { name: "Preview", exact: true }).click();
  await page.getByLabel("Preview mode").selectOption("generated");
  const image = page
    .frameLocator('iframe[title="Generated frontend preview"]')
    .getByRole("img", { name: "pixel", exact: true });
  await expect(image).toBeVisible();
  expect(
    await image.evaluate(
      (node: HTMLImageElement) => node.complete && node.naturalWidth > 0,
    ),
  ).toBe(true);
});

test("pen curves, reusable shapes, multiple motion tracks and layer keyboard controls are executable", async ({
  page,
}) => {
  const { button, other } = await open(page);
  await page.getByRole("button", { name: "Pen tool", exact: true }).click();
  const surface = page.getByLabel("Vector drawing surface"),
    rect = await surface.boundingBox();
  const x = rect!.x + rect!.width * 0.25,
    y = rect!.y + rect!.height * 0.45;
  await page.mouse.click(x, y);
  await page.mouse.move(x + 100, y - 70);
  await page.mouse.down();
  await page.mouse.move(x + 130, y - 30, { steps: 6 });
  await page.mouse.up();
  await page.mouse.click(x + 180, y + 70);
  await page.getByRole("button", { name: "Close shape", exact: true }).click();
  const shape = page.locator('.canvas-page [data-element-type="shape"]');
  await expect(shape).toHaveCount(1);
  await expect(shape.locator("svg > path")).toHaveAttribute("d", / C /);
  await page
    .locator(".inspector")
    .getByLabel("Point 1 x", { exact: true })
    .fill("5");
  await expect(shape.locator("svg > path")).toHaveAttribute("d", /^M 5 /);
  await page
    .getByRole("button", { name: "Design library", exact: true })
    .click();
  await page.getByLabel("Component name", { exact: true }).fill("Petal");
  await page
    .getByRole("button", { name: "Save selection as component", exact: true })
    .click();
  await page.getByRole("button", { name: "Insert Petal", exact: true }).click();
  await expect(shape).toHaveCount(2);
  await page.locator(`.canvas-page [data-element-id="${button}"]`).click();
  await page
    .locator(`.canvas-page [data-element-id="${other}"]`)
    .click({ modifiers: ["Shift"] });
  await page
    .getByRole("button", { name: "Motion timeline", exact: true })
    .click();
  const motion = page.getByRole("region", {
    name: "Motion timeline",
    exact: true,
  });
  await motion
    .getByRole("button", { name: "Animate selection", exact: true })
    .click();
  await expect(motion.locator(".motion-tracks > button")).toHaveCount(2);
  await motion
    .getByRole("button", { name: "Primary button", exact: true })
    .click();
  await motion.getByLabel("Keyframe 2 x", { exact: true }).fill("80");
  await motion.getByLabel("Animation playhead", { exact: true }).fill("1");
  await expect(
    page.locator(`.canvas-page [data-element-id="${button}"]`),
  ).toHaveCSS("transform", "matrix(1, 0, 0, 1, 80, 0)");
  await expect(page.locator(".floating-toolbar")).toHaveCount(0);
  await page.screenshot({ path: ".verification/design-motion.png" });
  await motion
    .getByRole("button", { name: "Close motion timeline", exact: true })
    .click();
  await page.getByRole("button", { name: "Layers", exact: true }).click();
  const first = page.getByRole("treeitem", {
    name: "Primary button",
    exact: true,
  });
  await first.focus();
  await first.press("ArrowDown");
  const second = page.getByRole("treeitem", {
    name: "Secondary button",
    exact: true,
  });
  await expect(second).toBeFocused();
  await second.press("F2");
  await page.getByLabel("Layer name", { exact: true }).fill("Secondary action");
  await page.getByLabel("Layer name", { exact: true }).press("Enter");
  await expect(
    page.getByRole("treeitem", { name: "Secondary action", exact: true }),
  ).toBeVisible();
  await page.getByRole("button", { name: "Save project", exact: true }).click();
  await page.reload();
  await expect(shape).toHaveCount(2);
  await page
    .getByRole("button", { name: "Motion timeline", exact: true })
    .click();
  await expect(page.locator(".motion-tracks > button")).toHaveCount(2);
});
