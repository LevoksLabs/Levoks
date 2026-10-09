import { test, expect, type Page } from "@playwright/test";
import { mkdir, readFile } from "node:fs/promises";
import JSZip from "jszip";
import { openEditor } from "../helpers/open-editor";
import { compileProject } from "../../src/lib/project/compiler";

async function selectForm(page: Page) {
  if (!(await page.locator(".layers-panel").isVisible()))
    await page.getByRole("button", { name: "Layers", exact: true }).click();
  await page
    .locator(".layer-name")
    .filter({ hasText: /^Form$/ })
    .click();
  await page.getByRole("button", { name: "Content", exact: true }).click();
}
async function add(page: Page, kind: string, name: string, inside?: string) {
  await selectForm(page);
  await page.getByLabel("New form control", { exact: true }).selectOption(kind);
  await page
    .getByLabel("Add control inside", { exact: true })
    .selectOption({ label: inside || "This form" });
  await page
    .getByRole("button", { name: "Add form control", exact: true })
    .click();
  await page
    .getByRole("button", { name: `Edit ${name}`, exact: true })
    .last()
    .click();
}
test("broader and nested form controls persist, reorder, validate and export through real authoring", async ({
  page,
}) => {
  test.setTimeout(120000);
  await openEditor(page);
  await page
    .getByRole("textbox", { name: "Search elements", exact: true })
    .fill("Form");
  const tile = page.getByRole("button", { name: "Add Form", exact: true }),
    bounds = await page.locator(".canvas-page").boundingBox();
  await tile.hover();
  await page.mouse.down();
  await page.mouse.move(bounds!.x + 180, bounds!.y + 45, { steps: 12 });
  await page.mouse.up();
  await page.getByRole("button", { name: "Content", exact: true }).click();
  await add(page, "select", "Select");
  await page.getByLabel("Name", { exact: true }).fill("session");
  await page.getByLabel("Options", { exact: true }).fill("Morning\nAfternoon");
  await page.getByLabel("Value", { exact: true }).fill("Afternoon");
  await page.getByLabel("Label", { exact: true }).fill("Workshop session");
  await page.getByLabel("Required", { exact: true }).check();
  await add(page, "formField", "Form Field");
  await add(page, "radioButton", "Option", "Form Field");
  await page.getByLabel("Name", { exact: true }).fill("attendance");
  await page.getByLabel("Label", { exact: true }).fill("Remote");
  await page.getByLabel("Value", { exact: true }).fill("remote");
  await page.getByLabel("Required", { exact: true }).check();
  await add(page, "radioButton", "Option", "Form Field");
  await page.getByLabel("Name", { exact: true }).fill("attendance");
  await page.getByLabel("Label", { exact: true }).fill("In person");
  await page.getByLabel("Value", { exact: true }).fill("in_person");
  await add(page, "multiSelect", "Multi Select");
  await page.getByLabel("Name", { exact: true }).fill("topics");
  await page
    .getByLabel("Options", { exact: true })
    .fill("Design\nAutomation\nDatabases");
  await page.getByLabel("Label", { exact: true }).fill("Topics");
  await page
    .getByLabel("Selected Values", { exact: true })
    .fill("Design\nAutomation");
  await page.getByLabel("Required", { exact: true }).check();
  await add(page, "dateInput", "Date Input");
  await page.getByLabel("Name", { exact: true }).fill("visit_date");
  await page.getByLabel("Label", { exact: true }).fill("Visit date");
  await page.getByLabel("Value", { exact: true }).fill("2026-10-15");
  await selectForm(page);
  const dateLayer = page.getByRole("treeitem", {
    name: "Date Input",
    exact: true,
  });
  const groupLayer = page.getByRole("treeitem", {
    name: "Form Field",
    exact: true,
  });
  const formLayer = page.getByRole("treeitem", { name: "Form", exact: true });
  const formId = await formLayer.getAttribute("data-element-id"),
    groupId = await groupLayer.getAttribute("data-element-id");
  await page
    .getByRole("button", {
      name: "Move Visit date into another group",
      exact: true,
    })
    .click();
  await expect(
    page.getByLabel("Move Visit date into", { exact: true }),
  ).toBeFocused();
  await page
    .getByRole("button", { name: "Cancel move", exact: true })
    .press("Enter");
  await expect(dateLayer).toHaveAttribute("data-parent-id", formId!);
  const moveDate = page.getByRole("button", {
    name: "Move Visit date into another group",
    exact: true,
  });
  await expect(moveDate).toBeFocused();
  await moveDate.press("Enter");
  await page.getByLabel("Move Visit date into", { exact: true }).press("End");
  await page
    .getByRole("button", { name: "Move control", exact: true })
    .press("Enter");
  await expect(dateLayer).toHaveAttribute("data-parent-id", groupId!);
  await expect(
    page.getByRole("button", {
      name: "Move Visit date into another group",
      exact: true,
    }),
  ).toBeFocused();
  await page.getByRole("button", { name: "Undo", exact: true }).click();
  await expect(dateLayer).toHaveAttribute("data-parent-id", formId!);
  await page.getByRole("button", { name: "Redo", exact: true }).click();
  await expect(dateLayer).toHaveAttribute("data-parent-id", groupId!);
  // Drag an existing control into a native group using the real Layers grip.
  const topicLayer = page.getByRole("treeitem", {
    name: "Multi Select",
    exact: true,
  });
  const grip = await topicLayer.locator(".layer-grip").boundingBox(),
    target = await groupLayer.boundingBox();
  await page.mouse.move(grip!.x + grip!.width / 2, grip!.y + grip!.height / 2);
  await page.mouse.down();
  await page.mouse.move(target!.x + 140, target!.y + target!.height / 2, {
    steps: 12,
  });
  await page.mouse.up();
  await expect(topicLayer).toHaveAttribute("data-parent-id", groupId!);
  await selectForm(page);
  await page
    .getByLabel("Clear fields after a successful save", { exact: true })
    .check();
  await page
    .getByRole("button", { name: "Move Topics earlier", exact: true })
    .click();
  await page.getByRole("button", { name: "Undo", exact: true }).click();
  await page.getByRole("button", { name: "Redo", exact: true }).click();
  await page
    .getByLabel("Collection name", { exact: true })
    .fill("Workshop signups");
  await page
    .getByRole("button", { name: "Create collection and connect", exact: true })
    .click();
  await expect(
    page
      .getByRole("status")
      .filter({ hasText: "Connected to Workshop signups" }),
  ).toBeVisible();
  await expect(
    page
      .getByLabel("Form value for body.topics", { exact: true })
      .locator("option:checked"),
  ).not.toBeDisabled();
  await page.getByRole("button", { name: "Save project", exact: true }).click();
  await page.reload();
  await selectForm(page);
  await page.getByRole("button", { name: "Edit Topics", exact: true }).click();
  await expect(page.getByLabel("Selected Values", { exact: true })).toHaveValue(
    "Design\nAutomation",
  );
  await selectForm(page);
  await mkdir(".verification/form-controls", { recursive: true });
  await page.screenshot({ path: ".verification/form-controls/inspector.png" });
  await page
    .getByLabel("New form control", { exact: true })
    .scrollIntoViewIfNeeded();
  await page.screenshot({
    path: ".verification/form-controls/controls-inspector.png",
  });
  await page.setViewportSize({ width: 1100, height: 900 });
  await page
    .getByLabel("New form control", { exact: true })
    .scrollIntoViewIfNeeded();
  expect(
    await page
      .locator(".form-controls")
      .evaluate((node) => node.scrollWidth <= node.clientWidth),
  ).toBe(true);
  await page.screenshot({
    path: ".verification/form-controls/controls-compact.png",
  });
  for (const [width, name] of [
    [1100, "compact"],
    [1600, "desktop"],
  ] as const) {
    await page.setViewportSize({ width, height: 1000 });
    await page
      .getByRole("button", {
        name: "Move Visit date into another group",
        exact: true,
      })
      .click();
    const chooser = page.getByRole("group", {
      name: "Move existing control",
      exact: true,
    });
    await expect(
      page.getByLabel("Move Visit date into", { exact: true }),
    ).toBeFocused();
    expect(
      await chooser.evaluate((node) => node.scrollWidth <= node.clientWidth),
    ).toBe(true);
    await page.screenshot({
      path: `.verification/form-controls/move-${name}.png`,
    });
    await page
      .getByRole("button", { name: "Cancel move", exact: true })
      .press("Enter");
    await expect(dateLayer).toHaveAttribute("data-parent-id", groupId!);
  }
  await page.setViewportSize({ width: 1600, height: 1000 });
  await page.getByRole("button", { name: "Preview", exact: true }).click();
  const frame = page.frameLocator('iframe[title="Generated frontend preview"]');
  await expect(frame.getByLabel("Topics", { exact: true })).toHaveValues([
    "Design",
    "Automation",
  ]);
  await frame.getByLabel("In person", { exact: true }).check();
  await expect(frame.getByLabel("Remote", { exact: true })).not.toBeChecked();
  await frame
    .getByPlaceholder("Your name", { exact: true })
    .fill("Preview visitor");
  await frame
    .getByPlaceholder("Your email", { exact: true })
    .fill("preview@example.test");
  await frame.getByRole("button", { name: "Submit", exact: true }).click();
  await expect(frame.getByRole("status")).toContainText(
    "No data was sent or saved",
  );
  await page
    .getByRole("button", { name: "Back To Editor", exact: true })
    .click();
  await page.getByLabel("Deploy options", { exact: true }).click();
  const download = page.waitForEvent("download");
  await page
    .getByRole("button", { name: "Download application ZIP", exact: true })
    .click();
  await (await download).saveAs(".verification/form-controls-export.zip");
  const zip = await JSZip.loadAsync(
    await readFile(".verification/form-controls-export.zip"),
  );
  const project = JSON.parse(
      await zip.file("levoks.project.json")!.async("string"),
    ),
    compiled = compileProject(project);
  expect(compiled.diagnostics.filter((d) => d.severity === "error")).toEqual(
    [],
  );
  for (const [file, source] of Object.entries(compiled.files))
    expect(await zip.file(file)!.async("string"), file).toBe(source);
  const service = project.backend.services[0],
    model = service.blocks.find((b: { type: string }) => b.type === "db_model");
  expect(
    model.config.fields.find((f: { name: string }) => f.name === "topics").type,
  ).toBe("array");
  expect(
    model.config.fields.filter(
      (f: { name: string }) => f.name === "attendance",
    ),
  ).toHaveLength(1);
});
