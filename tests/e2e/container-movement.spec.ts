import { test, expect, type Page, type Locator } from "@playwright/test";
import { openEditor } from "../helpers/open-editor";
import { emptyProject, restoreProject, captureProject } from "../../src/lib/project/workspace";
import { useEditorStore } from "../../src/store/editorStore";
import { templates } from "../../src/templates";

async function setup(page: Page, autoHeight = false) {
  const project = emptyProject("Container movement");
  project.editor.canvasSettings = { width: 1000, height: 700, backgroundColor: "#ffffff" };
  restoreProject(project);
  const store = useEditorStore.getState();
  const outer = store.addElement({
    ...templates.container, label: "Outer container",
    layout: { w: 240, h: 120 },
    styles: { width: "420px", height: "250px", border: "4px solid #64748b", padding: "24px" },
  }, undefined, 40, 60);
  const nested = store.addElement({
    ...templates.container, label: "Nested container",
    layout: { w: 190, h: 130, position: "absolute" },
    styles: { position: "absolute", padding: "16px", border: "2px solid #64748b" },
  }, outer, 30, 35);
  const child = store.addElement({
    ...templates.button, label: "Nested child", props: { label: "Move me" },
    layout: { w: 90, h: 40 }, styles: { padding: "4px", position: "absolute" },
  }, nested, 25, 30);
  const first = store.addElement({
    ...templates.button, label: "Group first", props: { label: "First" },
    layout: { w: 100, h: 40 }, styles: { position: "absolute", padding: "4px" },
  }, outer, 250, 35);
  const second = store.addElement({
    ...templates.button, label: "Group second", props: { label: "Second" },
    layout: { w: 100, h: 40 }, styles: { position: "absolute", padding: "4px" },
  }, outer, 250, 105);
  const flow = store.addElement({
    ...templates.container, label: "Flow container",
    layout: { w: 240, h: 120 },
    styles: { width: "420px", height: autoHeight ? "auto" : "240px", display: "flex", flexDirection: "column", gap: "20px", padding: "24px", border: "4px solid #64748b" },
  }, undefined, 500, 350);
  store.addElement(autoHeight
    ? { ...templates.spacer, layout: { position: "static", w: 200, h: 130 }, styles: { height: "130px" }, props: { spacerHeight: 130 } }
    : { ...templates.text, layout: { position: "static", w: 200 }, props: { content: "Before the button" } }, flow);
  const flowChild = store.addElement({
    ...templates.button, label: "Flow child", props: { label: "Flow child" },
    layout: { position: "static", w: 140, h: 44 }, styles: { position: "static", marginLeft: "8px" },
  }, flow);
  const root = store.addElement({
    ...templates.button, label: "Root child", props: { label: "Drop me" },
    layout: { w: 100, h: 40 }, styles: { padding: "4px" },
  }, undefined, 600, 100);
  await openEditor(page);
  await page.getByRole("button", { name: "Untitled project", exact: true }).click();
  const workspace = page.getByRole("dialog", { name: "Levoks project workspace" });
  await workspace.locator('input[type="file"]').setInputFiles({
    name: "containers.json", mimeType: "application/json",
    buffer: Buffer.from(JSON.stringify(captureProject(project.id, project.name))),
  });
  await expect(workspace.getByLabel("Project name", { exact: true })).toHaveValue("Container movement (import)");
  await workspace.getByRole("button", { name: "Close workspace", exact: true }).click();
  await page.getByRole("button", { name: "Layers", exact: true }).click();
  return { outer, nested, child, first, second, flow, flowChild, root };
}

const element = (page: Page, id: string) => page.locator(`.canvas-page [data-element-id="${id}"]`);
const row = (page: Page, name: string) => page.getByRole("treeitem", { name, exact: true });

async function dragBy(page: Page, source: Locator, dx: number, dy: number, release = true) {
  const bounds = (await source.boundingBox())!;
  const x = bounds.x + bounds.width / 2, y = bounds.y + bounds.height / 2;
  await page.mouse.move(x, y);
  await page.mouse.down();
  await page.mouse.move(x + dx, y + dy, { steps: 12 });
  if (release) await page.mouse.up();
}

async function contained(child: Locator, parent: Locator) {
  await expect.poll(async () => {
    const a = (await child.boundingBox())!, b = (await parent.boundingBox())!;
    return a.x >= b.x - 1 && a.y >= b.y - 1 && a.x + a.width <= b.x + b.width + 1 && a.y + a.height <= b.y + b.height + 1;
  }).toBe(true);
}

for (const zoom of [50, 100]) {
  test(`nested children stay inside their container throughout dragging at ${zoom}% zoom`, async ({ page }) => {
    const ids = await setup(page);
    await page.getByLabel("Canvas zoom", { exact: true }).selectOption(String(zoom));
    const child = element(page, ids.child), parent = element(page, ids.nested);
    const before = (await child.boundingBox())!;
    await dragBy(page, child, 200, 140, false);
    await contained(child, parent);
    await expect(row(page, "Nested child")).toHaveAttribute("data-parent-id", ids.nested);
    await page.mouse.up();
    await contained(child, parent);
    await page.getByRole("button", { name: "Undo", exact: true }).click();
    await expect.poll(async () => (await child.boundingBox())!.x).toBeCloseTo(before.x, 0);
    await page.getByRole("button", { name: "Redo", exact: true }).click();
    await contained(child, parent);
    await dragBy(page, child, -200, -140, false);
    await contained(child, parent);
    await page.mouse.up();
    await expect(row(page, "Nested child")).toHaveAttribute("data-parent-id", ids.nested);
    await page.getByRole("button", { name: "Save project", exact: true }).click();
    await page.reload();
    await page.getByRole("button", { name: "Layers", exact: true }).click();
    await expect(row(page, "Nested child")).toHaveAttribute("data-parent-id", ids.nested);
    await contained(element(page, ids.child), element(page, ids.nested));
  });
}

test("flow children start moving from their visible position and use rendered container bounds", async ({ page }) => {
  const ids = await setup(page);
  await page.getByLabel("Canvas zoom", { exact: true }).selectOption("100");
  const child = element(page, ids.flowChild), parent = element(page, ids.flow);
  await child.click();
  await expect(child).toHaveCSS("position", "static");
  const before = (await child.boundingBox())!;
  await dragBy(page, child, 40, 32);
  await expect.poll(async () => (await child.boundingBox())!.x - before.x).toBeCloseTo(40, -1);
  await expect.poll(async () => (await child.boundingBox())!.y - before.y).toBeCloseTo(32, -1);
  await expect(child).toHaveCSS("position", "absolute");
  await expect(row(page, "Flow child")).toHaveAttribute("data-parent-id", ids.flow);
  await page.getByRole("button", { name: "Undo", exact: true }).click();
  await expect(child).toHaveCSS("position", "static");
  await expect.poll(async () => (await child.boundingBox())!.x).toBeCloseTo(before.x, 0);
  await page.getByRole("button", { name: "Redo", exact: true }).click();
  await dragBy(page, child, 400, 300);
  await contained(child, parent);
  const a = (await child.boundingBox())!, b = (await parent.boundingBox())!;
  expect(a.x + a.width).toBeCloseTo(b.x + b.width - 4, 0);
  expect(a.y + a.height).toBeCloseTo(b.y + b.height - 4, 0);
});

test("group movement preserves spacing and containment; dropped page elements remain movable inside", async ({ page }) => {
  const ids = await setup(page);
  await page.getByLabel("Canvas zoom", { exact: true }).selectOption("100");
  const first = element(page, ids.first), second = element(page, ids.second), parent = element(page, ids.outer);
  await first.click();
  await second.click({ modifiers: ["Shift"] });
  const beforeA = (await first.boundingBox())!, beforeB = (await second.boundingBox())!;
  await dragBy(page, first, 250, 180, false);
  await contained(first, parent);
  await contained(second, parent);
  await page.mouse.up();
  const afterA = (await first.boundingBox())!, afterB = (await second.boundingBox())!;
  expect(afterB.y - afterA.y).toBeCloseTo(beforeB.y - beforeA.y, 1);
  await expect(row(page, "Group first")).toHaveAttribute("data-parent-id", ids.outer);
  await expect(row(page, "Group second")).toHaveAttribute("data-parent-id", ids.outer);
  await page.keyboard.press("Escape");
  const root = element(page, ids.root), rootBox = (await root.boundingBox())!, parentBox = (await parent.boundingBox())!;
  await dragBy(page, root, parentBox.x + 100 - rootBox.x, parentBox.y + 180 - rootBox.y);
  await expect(row(page, "Root child")).toHaveAttribute("data-parent-id", ids.outer);
  await contained(root, parent);
  await dragBy(page, root, 500, 100);
  await expect(row(page, "Root child")).toHaveAttribute("data-parent-id", ids.outer);
  await contained(root, parent);
});

test("dragging a flow child preserves an auto-height container and cancellation restores its flow", async ({ page }) => {
  const ids = await setup(page, true);
  await page.getByLabel("Canvas zoom", { exact: true }).selectOption("100");
  const child = element(page, ids.flowChild), parent = element(page, ids.flow);
  const before = (await child.boundingBox())!, parentBefore = (await parent.boundingBox())!;
  await dragBy(page, child, 40, -32, false);
  await contained(child, parent);
  expect((await parent.boundingBox())!.height).toBeCloseTo(parentBefore.height, 1);
  // Cancel through the same pointer event path used when a touch is interrupted.
  await child.dispatchEvent("pointercancel", { pointerId: 1, bubbles: true });
  await page.mouse.up();
  await expect(child).toHaveCSS("position", "static");
  await expect.poll(async () => (await child.boundingBox())!.y).toBeCloseTo(before.y, 0);
  await dragBy(page, child, 40, -32);
  await contained(child, parent);
  expect((await parent.boundingBox())!.height).toBeCloseTo(parentBefore.height, 1);
  await expect(row(page, "Flow child")).toHaveAttribute("data-parent-id", ids.flow);
});
