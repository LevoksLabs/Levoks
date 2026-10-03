import { openEditor } from "../helpers/open-editor";
import { test, expect } from "@playwright/test";
import { readFile, mkdir } from "node:fs/promises";
import JSZip from "jszip";
import {
  emptyProject,
  restoreProject,
  captureProject,
} from "../../src/lib/project/workspace";
import { useEditorStore } from "../../src/store/editorStore";
import { elementTemplate } from "../../src/lib/elements/registry";

test("registry search, drag, typed inspector, custom library, persistence and ZIP preserve semantics", async ({
  page,
}) => {
  await openEditor(page);
  await expect(
    page.getByRole("button", { name: "Save project", exact: true }),
  ).toBeEnabled();
  const search = page.getByRole("textbox", {
    name: "Search elements",
    exact: true,
  });
  await search.fill("checkbox");
  const tile = page.getByRole("button", { name: "Add Checkbox", exact: true });
  await expect(tile).toBeVisible();
  const canvas = page.locator(".canvas-page");
  const bounds = await canvas.boundingBox();
  await tile.hover();
  await page.mouse.down();
  await page.mouse.move(bounds!.x + 220, bounds!.y + 180, { steps: 15 });
  await page.mouse.up();
  await expect(canvas.locator('input[type="checkbox"]')).toHaveCount(1);
  await page.getByRole("button", { name: "Content", exact: true }).click();
  await page.getByRole("checkbox", { name: "Checked", exact: true }).check();
  await expect(canvas.locator('input[type="checkbox"]')).toBeChecked();
  const checkboxBounds = await canvas.locator('input[type="checkbox"]').boundingBox();
  await page.mouse.click(checkboxBounds!.x + 5, checkboxBounds!.y + 5);
  await expect(canvas.locator('input[type="checkbox"]')).toBeChecked();
  await page
    .getByRole("textbox", { name: "Name", exact: true })
    .fill("consent");
  await search.fill("");
  await page.getByText("Create Custom Element", { exact: true }).click();
  await page
    .getByRole("button", { name: "Add to element library", exact: true })
    .click();
  await expect(
    page.getByRole("status").filter({ hasText: "PricingCard added" }),
  ).toBeVisible();
  await search.fill("PricingCard");
  await page
    .getByRole("button", { name: "Add PricingCard", exact: true })
    .dblclick();
  await page.getByRole("button", { name: "Content", exact: true }).click();
  await page.getByRole("spinbutton", { name: "price", exact: true }).fill("42");
  await expect(page.locator(".canvas-page .semantic-boundary")).toContainText(
    "price: 42",
  );
  await page.getByRole("button", { name: "Save project", exact: true }).click();
  await page.reload();
  await expect(page.locator(".canvas-page .semantic-boundary")).toContainText(
    "price: 42",
  );
  await mkdir(".verification/semantic", { recursive: true });
  await page.screenshot({ path: ".verification/semantic/desktop.png" });
  await page.setViewportSize({ width: 1024, height: 768 });
  await page.screenshot({ path: ".verification/semantic/compact.png" });
  await page.setViewportSize({ width: 1600, height: 1000 });
  await page.getByLabel("Deploy options", { exact: true }).click();
  const download = page.waitForEvent("download");
  await page
    .getByRole("button", { name: "Download application ZIP", exact: true })
    .click();
  await (await download).saveAs(".verification/semantic/application.zip");
  const zip = await JSZip.loadAsync(
    await readFile(".verification/semantic/application.zip"),
  );
  const project = JSON.parse(
    await zip.file("levoks.project.json")!.async("string"),
  );
  expect(
    Object.values(project.editor.elementsById).some(
      (node: unknown) =>
        (node as { props: { name?: string } }).props.name === "consent",
    ),
  ).toBe(true);
  expect(
    zip.file("frontend/components/custom/custom_PricingCard.jsx"),
  ).not.toBeNull();
  expect(await zip.file("frontend/app/page.jsx")!.async("string")).toContain(
    '"price":42',
  );
});

test("generated preview executes registry controls, dialog, carousel and semantic navigation", async ({
  page,
}) => {
  const project = emptyProject("Semantic preview");
  restoreProject(project);
  const store = useEditorStore.getState();
  store.addElement(elementTemplate("dialog"), undefined, 40, 40);
  store.addElement(elementTemplate("carousel"), undefined, 40, 240);
  store.addElement(elementTemplate("select"), undefined, 40, 470);
  const link = store.addElement(
    elementTemplate("navigationLink"),
    undefined,
    40,
    560,
  );
  const destination = store.addPage("Details");
  store.addElement({
    ...elementTemplate("heading"),
    props: { content: "Destination reached", level: 1 },
  });
  store.switchPage(project.editor.activePageId);
  store.updateElement(link, {
    props: { content: "Go to details" },
    events: { onClick: { action: "navigate", target: destination } },
  });
  const saved = captureProject(project.id, project.name);
  await openEditor(page);
  await expect(
    page.getByRole("button", { name: "Save project", exact: true }),
  ).toBeEnabled();
  await page
    .getByRole("button", { name: "Untitled project", exact: true })
    .click();
  const workspace = page.getByRole("dialog", {
    name: "Levoks project workspace",
  });
  await workspace
    .locator('input[type="file"]')
    .setInputFiles({
      name: "semantic.json",
      mimeType: "application/json",
      buffer: Buffer.from(JSON.stringify(saved)),
    });
  await expect(
    workspace.getByLabel("Project name", { exact: true }),
  ).toHaveValue("Semantic preview (import)");
  await workspace.getByRole("button", { name: "Close workspace" }).click();
  await page.getByRole("button", { name: "Preview", exact: true }).click();
  const frame = page.frameLocator('iframe[title="Generated frontend preview"]');
  await frame.getByRole("button", { name: "Open dialog", exact: true }).click();
  await expect(
    frame.getByRole("dialog", { name: "Dialog", exact: true }),
  ).toBeVisible();
  await frame.getByRole("button", { name: "Close", exact: true }).click();
  await expect(
    frame.getByRole("dialog", { name: "Dialog", exact: true }),
  ).toHaveCount(0);
  await frame.getByRole("button", { name: "Next slide", exact: true }).click();
  await expect(frame.getByText("Second slide", { exact: true })).toBeVisible();
  await frame
    .getByRole("combobox", { name: "Select", exact: true })
    .selectOption("Option two");
  await expect(
    frame.getByRole("combobox", { name: "Select", exact: true }),
  ).toHaveValue("Option two");
  await frame.getByRole("link", { name: "Go to details", exact: true }).click();
  await expect(
    frame.getByRole("heading", { name: "Destination reached", exact: true }),
  ).toBeVisible();
});
