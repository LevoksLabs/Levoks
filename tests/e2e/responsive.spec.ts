import { test, expect, type Page } from "@playwright/test";
import { openEditor } from "../helpers/open-editor";
import { emptyProject, restoreProject, captureProject } from "../../src/lib/project/workspace";
import { useEditorStore } from "../../src/store/editorStore";
import { templates } from "../../src/templates";
import { generatedPreview } from "../../src/lib/project/preview";

function fixture() {
  const project = emptyProject("Responsive verification");
  project.editor.canvasSettings = { width: 1280, height: 900, backgroundColor: "#fff" };
  restoreProject(project);
  const store = useEditorStore.getState();
  const stack = store.addElement({ ...templates.stack, layout: { w: 600, h: 60 }, styles: { display: "flex", flexDirection: "column", gap: "16px" } }, undefined, 80, 80);
  const text = store.addElement({ ...templates.text, layout: { position: "static", w: 500, h: 150 }, props: { content: "A responsive layout that keeps its content visible." }, styles: { fontSize: "24px", color: "#112233", backgroundColor: "#ffeeaa" } }, stack);
  store.addElement({ ...templates.button, layout: { position: "static", w: 180, h: 50 }, props: { label: "Continue" } }, stack);
  store.updateElement(stack, { responsive: { tablet: { layout: { x: 24, w: 600 } }, mobile: { layout: { x: 12, w: 280 } } } });
  store.updateElement(text, { responsive: { mobile: { styles: { fontSize: "20px" } } } });
  return { document: captureProject(project.id, project.name), stack, text };
}

async function importFixture(page: Page) {
  const data = fixture();
  await openEditor(page);
  await page.getByRole("button", { name: "Untitled project", exact: true }).click();
  const dialog = page.getByRole("dialog", { name: "Levoks project workspace" });
  await dialog.locator("input[type=file]").setInputFiles({ name: "responsive.json", mimeType: "application/json", buffer: Buffer.from(JSON.stringify(data.document)) });
  await expect(dialog.getByLabel("Project name", { exact: true })).toHaveValue("Responsive verification (import)");
  await dialog.getByRole("button", { name: "Close workspace" }).click();
  return data;
}

test("generated layouts inherit tablet geometry and keep flowing containers tall enough at every screen", async ({ page }) => {
  const { document, stack, text } = fixture();
  document.editor.elementsById[text].responsive = { tablet: { styles: { background: "linear-gradient(red, blue)" } }, mobile: { styles: { fontSize: "20px", background: "" } } };
  await page.setContent(generatedPreview(document, document.editor.activePageId));
  for (const width of [320, 600, 601, 768, 1024, 1025, 1440]) {
    await page.setViewportSize({ width, height: 900 });
    const container = page.locator(`.el-${stack}`);
    await expect(container).toHaveCSS("left", width <= 600 ? "12px" : width <= 1024 ? "24px" : "80px");
    await expect(container).toHaveCSS("width", width <= 600 ? "280px" : "600px");
    await expect(page.locator(`.el-${text}`)).toHaveCSS("font-size", width <= 600 ? "20px" : "24px");
    await expect(page.locator(`.el-${text}`)).toHaveCSS("background-color", "rgb(255, 238, 170)");
    expect(await container.evaluate(el => el.getBoundingClientRect().height)).toBeGreaterThan(200);
  }
});

test("screen switching, project save and preview retain adjustments while Cancel restores them", async ({ page }) => {
  const { stack } = await importFixture(page);
  const container = page.locator(`[data-element-id="${stack}"]`);
  const box = await container.boundingBox();
  await container.click({ position: { x: box!.width - 4, y: 4 } });
  await expect(page.locator(".element-selected")).toHaveAttribute("data-element-id", stack);
  const x = page.locator(".inspector").getByLabel("X", { exact: true });
  await page.getByRole("button", { name: "Tablet layout", exact: true }).click();
  await page.getByRole("button", { name: "Responsive", exact: true }).click();
  await x.fill("32");
  await page.getByRole("button", { name: "Mobile layout", exact: true }).click();
  await page.getByRole("button", { name: "Tablet layout", exact: true }).click();
  await expect(x).toHaveValue("32");
  await page.getByRole("button", { name: "Responsive", exact: true }).click();
  await x.fill("40");
  await page.getByRole("button", { name: "Cancel responsive changes" }).click();
  await expect(x).toHaveValue("32");
  await page.getByRole("button", { name: "Responsive", exact: true }).click();
  await x.fill("48");
  await x.press("Enter");
  await expect(page.locator(`[data-element-id="${stack}"]`)).toHaveCSS("left", "48px");
  await page.getByRole("button", { name: "Save project", exact: true }).click();
  await expect(page.getByRole("button", { name: "Cancel responsive changes" })).toHaveCount(0);
  await expect(page.getByRole("status", { name: "Saved on this device", exact: true })).toBeVisible();
  await expect(page.locator(`[data-element-id="${stack}"]`)).toHaveCSS("left", "48px");
  await page.reload();
  await expect(page.getByRole("button", { name: "Save project", exact: true })).toBeEnabled();
  await page.getByRole("button", { name: "Tablet layout", exact: true }).click();
  await expect(page.locator(`[data-element-id="${stack}"]`)).toHaveCSS("left", "48px");
  await page.getByRole("button", { name: "Preview", exact: true }).click();
  const frame = page.locator('iframe[title="Generated frontend preview"]');
  await expect(frame).toHaveJSProperty("clientWidth", 820);
  await expect(page.frameLocator('iframe[title="Generated frontend preview"]').locator(`.el-${stack}`)).toHaveCSS("left", "48px");
  await page.getByLabel("Preview breakpoint").selectOption("mobile");
  await expect(frame).toHaveJSProperty("clientWidth", 390);
  await page.getByRole("button", { name: "Back To Editor", exact: true }).click();
  await expect(page.getByRole("button", { name: "Tablet layout", exact: true })).toHaveAttribute("aria-pressed", "true");
});

test("editor screens and panels stay usable at phone, tablet and desktop widths", async ({ page }) => {
  await openEditor(page);
  for (const width of [1440, 1024, 768, 320]) {
    await page.setViewportSize({ width, height: 900 });
    await page.getByRole("button", { name: "Mobile layout", exact: true }).click();
    await expect(page.locator(".canvas-page")).toHaveCSS("width", "390px");
    await expect.poll(async () => {
      const artboard = await page.locator(".canvas-page").boundingBox();
      const workspace = await page.locator(".canvas-workspace").boundingBox();
      return Boolean(artboard && workspace && artboard.x >= workspace.x && artboard.x + artboard.width <= workspace.x + workspace.width);
    }).toBe(true);
    expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(width);
    if (width <= 900) {
      await page.getByRole("button", { name: "Toggle inspector", exact: true }).click();
      await expect(page.locator(".inspector")).toBeVisible();
      await page.getByRole("button", { name: "Close inspector", exact: true }).click();
      await expect(page.locator(".inspector")).toBeHidden();
    }
    await page.screenshot({ path: `.verification/responsive-editor-${width}.png` });
  }
});
