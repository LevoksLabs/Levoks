import { test, expect } from "@playwright/test";
import { openEditor } from "../helpers/open-editor";
import { emptyProject, restoreProject, captureProject } from "../../src/lib/project/workspace";
import { useEditorStore } from "../../src/store/editorStore";
import { templates } from "../../src/templates";
import { generatedPreview } from "../../src/lib/project/preview";
import { compileProject } from "../../src/lib/project/compiler";
import { canvasAppFixture } from "../helpers/canvas-app-fixture";

test("absolute sections below the canvas remain reachable by normal scrolling", async ({ page }) => {
  const document = emptyProject("Long portfolio");
  document.editor.canvasSettings = { width: 1440, height: 900, backgroundColor: "#fff" };
  restoreProject(document);
  const store = useEditorStore.getState();
  const heading = store.addElement({ ...templates.title, props: { content: "Portfolio start" }, styles: { width: "85%" } }, undefined, 20, 100);
  store.updateElement(heading, { responsive: { mobile: { styles: { fontSize: "32px" } } } });
  const section = store.addElement({ ...templates.container, layout: { w: 300, h: 100 }, styles: { width: "85%", height: "auto", display: "flex", flexDirection: "column" } }, undefined, 20, 1800);
  store.addElement({ ...templates.title, props: { content: "Below the original canvas" }, styles: { position: "static", width: "100%", fontSize: "28px" } }, section);
  const accordion = store.addElement({ ...templates.accordion, props: { headerText: "Read project details", expanded: false }, styles: { position: "static", width: "100%" } }, section);
  store.addElement({ ...templates.paragraph, props: { content: "Expanded project details" }, layout: { w: 250, h: 700 }, styles: { position: "static", width: "100%" } }, accordion);
  const saved = captureProject(document.id, document.name);
  // The standalone application must use the same non-clipping page CSS.
  expect(compileProject(saved).files["frontend/app/page.css"]).toMatch(/\.page\s*\{[^}]*overflow: visible/);
  for (const width of [1440, 768, 390, 320]) {
    await page.setViewportSize({ width, height: 700 });
    await page.setContent(generatedPreview(saved, saved.editor.activePageId));
    expect(await page.evaluate(() => window.document.scrollingElement!.scrollHeight)).toBeGreaterThan(1900);
    await page.mouse.move(width / 2, 350);
    await page.mouse.wheel(0, 1800);
    await expect(page.getByRole("heading", { name: "Below the original canvas" })).toBeInViewport();
    await page.getByText("Read project details", { exact: true }).click();
    expect(await page.evaluate(() => window.document.scrollingElement!.scrollHeight)).toBeGreaterThan(2500);
    await page.keyboard.press("Control+End");
    await expect(page.getByText("Expanded project details", { exact: true })).toBeInViewport();
    await page.getByText("Read project details", { exact: true }).click();
  }
});

test("collapsed compact trays reopen on the first click after inspector use", async ({ page }) => {
  await page.setViewportSize({ width: 838, height: 900 });
  await openEditor(page);
  const layers = page.getByRole("button", { name: "Layers", exact: true });
  const title = page.getByRole("heading", { name: "Layers", exact: true });
  await layers.click();
  await expect(title).toBeVisible();
  await page.getByRole("button", { name: "Toggle inspector", exact: true }).click();
  await expect(page.locator(".inspector")).toBeVisible();
  await layers.click();
  await expect(title).toBeVisible();
  await expect(page.locator(".inspector")).toBeHidden();
  await page.getByRole("button", { name: "Close editor panels", exact: true }).click();
  await layers.click();
  await expect(title).toBeVisible();
  await page.getByRole("button", { name: "Toggle sub-tray", exact: true }).click();
  await layers.click();
  await expect(title).toBeVisible();
});

test("opening Deploy with unconfigured backend origins does not crash", async ({ page }) => {
  const { project } = canvasAppFixture();
  await openEditor(page);
  await page.getByRole("button", { name: "Untitled project", exact: true }).click();
  const workspace = page.getByRole("dialog", { name: "Levoks project workspace" });
  await workspace.locator("input[type=file]").setInputFiles({ name: "backend-project.json", mimeType: "application/json", buffer: Buffer.from(JSON.stringify(project)) });
  await workspace.getByRole("button", { name: "Close workspace" }).click();
  await page.getByRole("button", { name: "Deploy", exact: true }).click();
  await expect(page.getByRole("region", { name: "Managed frontend deployment" })).toBeVisible();
  await expect(page.getByText("Sign in to save a deployment connection.", { exact: false })).toBeVisible();
  await expect(page.getByText("This page couldn’t load", { exact: true })).toHaveCount(0);
});

test("page size saves through the inspector and survives a clean reload", async ({ page }) => {
  await openEditor(page);
  if (!(await page.getByRole("spinbutton", { name: "Width", exact: true }).isVisible()))
    await page.getByRole("button", { name: "Toggle inspector", exact: true }).click();
  await page.getByRole("spinbutton", { name: "Width", exact: true }).fill("1440");
  await page.getByRole("spinbutton", { name: "Height", exact: true }).fill("3500");
  await page.getByRole("button", { name: "Untitled project", exact: true }).click();
  const workspace = page.getByRole("dialog", { name: "Levoks project workspace" });
  await workspace.getByRole("button", { name: "Save checkpoint", exact: true }).click();
  await expect(workspace.getByText("Checkpoint saved.", { exact: true })).toBeVisible();
  await page.reload();
  await expect(page.getByRole("button", { name: "Save project", exact: true })).toBeEnabled();
  if (!(await page.getByRole("spinbutton", { name: "Width", exact: true }).isVisible()))
    await page.getByRole("button", { name: "Toggle inspector", exact: true }).click();
  await expect(page.getByRole("spinbutton", { name: "Width", exact: true })).toHaveValue("1440");
  await expect(page.getByRole("spinbutton", { name: "Height", exact: true })).toHaveValue("3500");
  await expect(page.getByRole("alert").filter({ hasText: "changed in another tab" })).toHaveCount(0);
});
