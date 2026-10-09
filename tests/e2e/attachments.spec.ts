import { test, expect } from "@playwright/test";
import { mkdir, readFile } from "node:fs/promises";
import JSZip from "jszip";
import { openEditor } from "../helpers/open-editor";
import { compileProject } from "../../src/lib/project/compiler";

test("dragged form authors attachment limits and private inbox through history, reload, preview and real ZIP", async ({
  page,
}) => {
  test.setTimeout(120000);
  await openEditor(page);
  await page.getByLabel("Search elements", { exact: true }).fill("Form");
  const tile = page.getByRole("button", { name: "Add Form", exact: true }),
    bounds = await page.locator(".canvas-page").boundingBox();
  await tile.hover();
  await page.mouse.down();
  await page.mouse.move(bounds!.x + 200, bounds!.y + 100, { steps: 12 });
  await page.mouse.up();
  await page.getByRole("button", { name: "Content", exact: true }).click();
  await page
    .getByLabel("New form control", { exact: true })
    .selectOption("fileUpload");
  await page
    .getByRole("button", { name: "Add form control", exact: true })
    .click();
  await page
    .getByRole("button", { name: "Edit File Upload", exact: true })
    .click();
  await page.getByLabel("Name", { exact: true }).fill("attachment");
  await page.getByLabel("Label", { exact: true }).fill("Attachment");
  await page.getByLabel("Maximum file size (KiB)", { exact: true }).fill("257");
  await expect(
    page.locator(".semantic-properties").getByRole("alert"),
  ).toContainText("256");
  await page.getByLabel("Maximum file size (KiB)", { exact: true }).fill("4");
  await page
    .getByLabel("Allowed file extensions", { exact: true })
    .fill("image/*");
  await expect(
    page.locator(".semantic-properties").getByRole("alert"),
  ).toContainText("extensions");
  await page
    .getByLabel("Allowed file extensions", { exact: true })
    .fill(".txt");
  await page.getByLabel("Required", { exact: true }).check();
  await expect(
    page.locator(".semantic-properties").getByRole("alert"),
  ).toHaveCount(0);
  await mkdir(".verification/attachments", { recursive: true });
  for (const width of [1600, 1100]) {
    await page.setViewportSize({ width, height: 1000 });
    await page
      .getByLabel("Maximum file size (KiB)", { exact: true })
      .scrollIntoViewIfNeeded();
    expect(
      await page
        .locator("div.semantic-properties")
        .evaluate((node) => node.scrollWidth <= node.clientWidth),
    ).toBe(true);
    await page.screenshot({
      path: `.verification/attachments/inspector-${width}.png`,
    });
  }
  await page.setViewportSize({ width: 1600, height: 1000 });
  await page.getByRole("button", { name: "Layers", exact: true }).click();
  await page
    .locator(".layer-name")
    .filter({ hasText: /^Form$/ })
    .click();
  await page
    .getByLabel("Collection name", { exact: true })
    .fill("Attachment leads");
  await page
    .getByRole("button", { name: "Create collection and connect", exact: true })
    .click();
  await page
    .getByLabel("Clear fields after a successful save", { exact: true })
    .check();
  await page
    .getByRole("button", { name: "Add private submission inbox", exact: true })
    .click();
  await page.getByRole("button", { name: "Undo", exact: true }).click();
  await expect(
    page.getByRole("button", {
      name: "Add private submission inbox",
      exact: true,
    }),
  ).toBeVisible();
  await page.getByRole("button", { name: "Redo", exact: true }).click();
  await page.getByRole("button", { name: "Save project", exact: true }).click();
  await expect(page.locator(".workspace-status-text")).toHaveText(
    "Saved on this device",
  );
  await page.reload();
  await page.getByRole("button", { name: "Layers", exact: true }).click();
  await page
    .locator(".layer-name")
    .filter({ hasText: /^Form$/ })
    .click();
  await page.getByRole("button", { name: "Content", exact: true }).click();
  await expect(
    page.getByText("Private inbox:", { exact: false }),
  ).toBeVisible();
  await page
    .getByRole("button", { name: "Edit Attachment", exact: true })
    .click();
  await expect(
    page.getByLabel("Maximum file size (KiB)", { exact: true }),
  ).toHaveValue("4");
  await expect(
    page.getByLabel("Allowed file extensions", { exact: true }),
  ).toHaveValue(".txt");
  await page.getByRole("button", { name: "Preview", exact: true }).click();
  await expect(
    page
      .frameLocator('iframe[title="Generated frontend preview"]')
      .getByLabel("Attachment", { exact: true }),
  ).toHaveAttribute("data-levoks-file-max-bytes", "4096");
  await page
    .getByRole("button", { name: "Back To Editor", exact: true })
    .click();
  await page.getByLabel("Deploy options", { exact: true }).click();
  const download = page.waitForEvent("download");
  await page
    .getByRole("button", { name: "Download application ZIP", exact: true })
    .click();
  await (await download).saveAs(".verification/attachment-export.zip");
  const zip = await JSZip.loadAsync(
    await readFile(".verification/attachment-export.zip"),
  );
  const project = JSON.parse(
    await zip.file("levoks.project.json")!.async("string"),
  );
  const compiled = compileProject(project);
  expect(compiled.diagnostics.filter((d) => d.severity === "error")).toEqual(
    [],
  );
  for (const [file, source] of Object.entries(compiled.files))
    expect(await zip.file(file)!.async("string"), file).toBe(source);
  expect(project.backend.services).toHaveLength(2);
});

test("attachment backend limits are editable with error recovery, history and save/reload", async ({
  page,
}) => {
  await openEditor(page);
  await page.getByLabel("Search elements", { exact: true }).fill("Form");
  const tile = page.getByRole("button", { name: "Add Form", exact: true });
  const bounds = await page.locator(".canvas-page").boundingBox();
  await tile.hover();
  await page.mouse.down();
  await page.mouse.move(bounds!.x + 200, bounds!.y + 100, { steps: 12 });
  await page.mouse.up();
  await page.getByRole("button", { name: "Content", exact: true }).click();
  await page
    .getByLabel("New form control", { exact: true })
    .selectOption("fileUpload");
  await page
    .getByRole("button", { name: "Add form control", exact: true })
    .click();
  await page
    .getByRole("button", { name: "Edit File Upload", exact: true })
    .click();
  await page.getByLabel("Name", { exact: true }).fill("attachment");
  await page.getByLabel("Maximum file size (KiB)", { exact: true }).fill("4");
  await page
    .getByLabel("Allowed file extensions", { exact: true })
    .fill(".txt");
  await page.getByRole("button", { name: "Layers", exact: true }).click();
  await page
    .locator(".layer-name")
    .filter({ hasText: /^Form$/ })
    .click();
  await page
    .getByRole("button", { name: "Create collection and connect", exact: true })
    .click();
  const selectRule = async () => {
    await page.getByRole("button", { name: "Backend", exact: true }).click();
    await page
      .locator(".backend-block")
      .filter({
        has: page.locator(".backend-block-label", {
          hasText: /^Check attachment$/,
        }),
      })
      .click();
  };
  await selectRule();
  await expect(page.getByLabel("Rule 1 type", { exact: true })).toHaveValue(
    "file",
  );
  await expect(
    page.getByLabel("Rule 1 maximum file bytes", { exact: true }),
  ).toHaveValue("4096");
  await expect(
    page.getByLabel("Rule 1 allowed extensions", { exact: true }),
  ).toHaveValue(".txt");
  await page.getByLabel("Rule 1 maximum file bytes", { exact: true }).fill("0");
  await expect(
    page.getByRole("alert").filter({ hasText: "File size" }),
  ).toContainText("256 KiB");
  await page.getByRole("button", { name: "Undo", exact: true }).click();
  await expect(
    page.getByLabel("Rule 1 maximum file bytes", { exact: true }),
  ).toHaveValue("4096");
  await page
    .getByLabel("Rule 1 allowed extensions", { exact: true })
    .fill("image/*");
  await expect(
    page.getByRole("alert").filter({ hasText: "MIME" }),
  ).toBeVisible();
  await page
    .getByLabel("Rule 1 allowed extensions", { exact: true })
    .fill(".txt,.pdf");
  await page
    .getByLabel("Rule 1 message", { exact: true })
    .fill("Choose a small text or PDF attachment.");
  await page.getByRole("button", { name: "Save project", exact: true }).click();
  await expect(page.locator(".workspace-status-text")).toHaveText(
    "Saved on this device",
  );
  await page.reload();
  await selectRule();
  await expect(
    page.getByLabel("Rule 1 maximum file bytes", { exact: true }),
  ).toHaveValue("4096");
  await expect(
    page.getByLabel("Rule 1 allowed extensions", { exact: true }),
  ).toHaveValue(".txt,.pdf");
  await expect(page.getByLabel("Rule 1 message", { exact: true })).toHaveValue(
    "Choose a small text or PDF attachment.",
  );
});
