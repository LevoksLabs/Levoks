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
async function add(page: Page, kind: string, name: string, group = -1) {
  await selectForm(page);
  await page.getByLabel("New form control", { exact: true }).selectOption(kind);
  const parent = page.getByLabel("Add control inside", { exact: true });
  await parent.selectOption(
    group < 0
      ? { label: "This form" }
      : (await parent
          .locator("option")
          .filter({ hasText: /^Form Field$/ })
          .nth(group)
          .getAttribute("value"))!,
  );
  await page
    .getByRole("button", { name: "Add form control", exact: true })
    .click();
  await page
    .getByRole("button", { name: `Edit ${name}`, exact: true })
    .last()
    .click();
}
test("choice-driven all/any and nested form conditions author, persist, preview and download", async ({
  page,
}) => {
  test.setTimeout(180000);
  await openEditor(page);
  await page.getByLabel("Search elements", { exact: true }).fill("Form");
  const tile = page.getByRole("button", { name: "Add Form", exact: true }),
    bounds = await page.locator(".canvas-page").boundingBox();
  await tile.hover();
  await page.mouse.down();
  await page.mouse.move(bounds!.x + 180, bounds!.y + 70, { steps: 12 });
  await page.mouse.up();
  await add(page, "checkbox", "Checkbox");
  await page.getByLabel("Name", { exact: true }).fill("business");
  await page.getByLabel("Label", { exact: true }).fill("Business");
  await add(page, "select", "Select");
  await page.getByLabel("Name", { exact: true }).fill("audience");
  await page.getByLabel("Label", { exact: true }).fill("Audience");
  await add(page, "formField", "Form Field");
  await page.getByLabel("Aria Label", { exact: true }).fill("Outer details");
  await page
    .getByLabel("Section condition checkbox", { exact: true })
    .selectOption({ label: "Business" });
  await page
    .getByRole("button", { name: "Add condition", exact: true })
    .click();
  await page
    .getByLabel("Section condition checkbox 2", { exact: true })
    .selectOption({ label: "Audience" });
  await page
    .getByLabel("Section condition option 2", { exact: true })
    .selectOption("Option two");
  await page
    .getByLabel("Section condition matching", { exact: true })
    .selectOption("any");
  await page.getByRole("button", { name: "Undo", exact: true }).click();
  await expect(
    page.getByLabel("Section condition matching", { exact: true }),
  ).toHaveValue("all");
  await page.getByRole("button", { name: "Redo", exact: true }).click();
  await expect(
    page.getByLabel("Section condition matching", { exact: true }),
  ).toHaveValue("any");
  await add(page, "textInput", "Text Input", 0);
  await page.getByLabel("Name", { exact: true }).fill("note");
  await page.getByLabel("Label", { exact: true }).fill("Outer note");
  await page.getByLabel("Required", { exact: true }).check();
  await add(page, "select", "Select", 0);
  await page.getByLabel("Name", { exact: true }).fill("plan");
  await page.getByLabel("Label", { exact: true }).fill("Plan");
  await add(page, "formField", "Form Field", 0);
  await page.getByLabel("Aria Label", { exact: true }).fill("Inner details");
  await page
    .getByLabel("Section condition checkbox", { exact: true })
    .selectOption({ label: "Plan" });
  await page
    .getByLabel("Section condition option", { exact: true })
    .selectOption("Option two");
  await add(page, "textInput", "Text Input", 1);
  await page.getByLabel("Name", { exact: true }).fill("detail");
  await page.getByLabel("Label", { exact: true }).fill("Inner note");
  await page.getByLabel("Required", { exact: true }).check();
  await add(page, "textInput", "Text Input");
  await page.getByLabel("Name", {exact:true}).fill("reference");
  await page.getByLabel("Label", {exact:true}).fill("Reference");
  await page.getByLabel("Text format", {exact:true}).selectOption("custom-mask");
  await page.getByLabel("Custom format mask", {exact:true}).fill("A{1,4}A");
  await page.getByRole("button", {name:"Apply custom format", exact:true}).click();
  await expect(page.locator(".inspector").getByRole("alert")).toContainText("Separate variable counts");
  await page.getByLabel("Custom format mask", {exact:true}).fill("L{2,6}/N{2}");
  await page.getByRole("button", {name:"Apply custom format", exact:true}).click();
  await expect(page.getByRole("button", {name:"Apply custom format", exact:true})).toBeFocused();
  await page.getByRole("button", {name:"Undo",exact:true}).click();
  await expect(page.getByLabel("Custom format mask", {exact:true})).toHaveValue("AA-0000");
  await page.getByRole("button", {name:"Redo",exact:true}).click();
  await expect(page.getByLabel("Custom format mask", {exact:true})).toHaveValue("L{2,6}/N{2}");
  await page.getByLabel("Custom format mask", {exact:true}).fill("AA-0000");
  await page.getByRole("button", {name:"Apply custom format",exact:true}).click();
  await selectForm(page);
  await page
    .getByLabel("Collection name", { exact: true })
    .fill("Compound enquiries");
  await page
    .getByRole("button", { name: "Create collection and connect", exact: true })
    .click();
  await page
    .getByLabel("Clear fields after a successful save", { exact: true })
    .check();
  await page.getByRole("button", { name: "Save project", exact: true }).click();
  await expect(page.locator(".workspace-status-text")).toHaveText(
    "Saved on this device",
  );
  await page.reload();
  await selectForm(page);
  await page
    .getByRole("button", { name: "Edit Form Field", exact: true })
    .first()
    .click();
  await expect(
    page.getByLabel("Section condition matching", { exact: true }),
  ).toHaveValue("any");
  await expect(
    page.getByLabel("Section condition option 2", { exact: true }),
  ).toHaveValue("Option two");
  await mkdir(".verification/compound-conditions", { recursive: true });
  await page.screenshot({
    path: ".verification/compound-conditions/inspector.png",
  });
  await page.getByRole("button", { name: "Preview", exact: true }).click();
  const frame = page.frameLocator('iframe[title="Generated frontend preview"]');
  await expect(frame.getByLabel("Reference",{exact:true})).toHaveAttribute("pattern","[A-Z][A-Z]-[0-9][0-9][0-9][0-9]");
  const outer = frame.locator('fieldset[aria-label="Outer details"]'),
    inner = frame.locator('fieldset[aria-label="Inner details"]');
  const toggle = frame.getByRole("checkbox", { name: "Business", exact: true }),
    audience = frame.getByLabel("Audience", { exact: true }),
    plan = frame.getByLabel("Plan", { exact: true });
  await expect(outer).toBeHidden();
  await expect(inner).toBeHidden();
  await audience.selectOption("Option two");
  await expect(outer).toBeVisible();
  await expect(inner).toBeHidden();
  await plan.selectOption("Option two");
  await expect(inner).toBeVisible();
  await inner.getByLabel("Inner note", { exact: true }).fill("Retained");
  await audience.selectOption("Option one");
  await expect(outer).toBeHidden();
  await expect(inner).toBeHidden();
  await toggle.check();
  await expect(outer).toBeVisible();
  await expect(inner).toBeVisible();
  await expect(inner.getByLabel("Inner note", { exact: true })).toHaveValue(
    "Retained",
  );
  await plan.selectOption("Option one");
  await expect(inner).toBeHidden();
  await expect(inner.getByLabel("Inner note", { exact: true })).toBeDisabled();
  await page
    .getByRole("button", { name: "Back To Editor", exact: true })
    .click();
  await page.getByLabel("Deploy options", { exact: true }).click();
  const downloaded = page.waitForEvent("download");
  await page
    .getByRole("button", { name: "Download application ZIP", exact: true })
    .click();
  await (await downloaded).saveAs(".verification/compound-export.zip");
  const zip = await JSZip.loadAsync(
      await readFile(".verification/compound-export.zip"),
    ),
    project = JSON.parse(
      await zip.file("levoks.project.json")!.async("string"),
    ),
    compiled = compileProject(project);
  expect(compiled.diagnostics.filter((d) => d.severity === "error")).toEqual(
    [],
  );
  for (const [file, source] of Object.entries(compiled.files))
    expect(await zip.file(file)!.async("string"), file).toBe(source);
});
