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
async function add(
  page: Page,
  kind: string,
  name: string,
  inside = "This form",
) {
  await selectForm(page);
  await page.getByLabel("New form control", { exact: true }).selectOption(kind);
  const destination = page.getByLabel("Add control inside", { exact: true });
  await destination.selectOption(
    inside === "Last Form Field"
      ? (await destination
          .locator("option")
          .filter({ hasText: /^Form Field$/ })
          .last()
          .getAttribute("value"))!
      : { label: inside },
  );
  await page
    .getByRole("button", { name: "Add form control", exact: true })
    .click();
  await page
    .getByRole("button", { name: `Edit ${name}`, exact: true })
    .last()
    .click();
}

test("checkbox-controlled sections survive visual authoring, undo, reload, preview and an actual application download", async ({
  page,
}) => {
  test.setTimeout(150000);
  await openEditor(page);
  await page.getByLabel("Search elements", { exact: true }).fill("Form");
  const tile = page.getByRole("button", { name: "Add Form", exact: true }),
    bounds = await page.locator(".canvas-page").boundingBox();
  await tile.hover();
  await page.mouse.down();
  await page.mouse.move(bounds!.x + 180, bounds!.y + 80, { steps: 12 });
  await page.mouse.up();
  await add(page, "checkbox", "Checkbox");
  await page.getByLabel("Name", { exact: true }).fill("business");
  await page.getByLabel("Label", { exact: true }).fill("Business enquiry");
  await add(page, "formField", "Form Field");
  await page.getByLabel("Aria Label", { exact: true }).fill("Company details");
  await page
    .getByLabel("Section condition checkbox", { exact: true })
    .selectOption({ label: "Business enquiry" });
  await page
    .getByLabel("Section condition state", { exact: true })
    .selectOption("false");
  await page.getByRole("button", { name: "Undo", exact: true }).click();
  await expect(
    page.getByLabel("Section condition state", { exact: true }),
  ).toHaveValue("true");
  await page.getByRole("button", { name: "Redo", exact: true }).click();
  await expect(
    page.getByLabel("Section condition state", { exact: true }),
  ).toHaveValue("false");
  await page
    .getByLabel("Section condition state", { exact: true })
    .selectOption("true");
  await mkdir(".verification/form-conditions", { recursive: true });
  await page.screenshot({
    path: ".verification/form-conditions/inspector.png",
  });
  await add(page, "textInput", "Text Input", "Form Field");
  await page.getByLabel("Name", { exact: true }).fill("company");
  await page.getByLabel("Label", { exact: true }).fill("Company name");
  await page.getByLabel("Required", { exact: true }).check();
  await add(page, "checkboxGroup", "Checkbox Group");
  await page
    .getByLabel("Checkbox group question", { exact: true })
    .fill("Business services");
  await page
    .getByLabel("Checkbox group field name", { exact: true })
    .fill("services");
  await page
    .getByRole("button", { name: "Apply checkbox field name", exact: true })
    .click();
  await page.getByLabel("Checkbox group required", { exact: true }).check();
  for (const value of ["Website", "Application"]) {
    await page
      .getByLabel("New checkbox choice label", { exact: true })
      .fill(value);
    await page
      .getByLabel("New checkbox choice value", { exact: true })
      .fill(value.toLowerCase());
    await page
      .getByRole("button", { name: "Add checkbox choice", exact: true })
      .click();
  }
  await page
    .getByLabel("Section condition checkbox", { exact: true })
    .selectOption({ label: "Business enquiry" });
  await add(page, "formField", "Form Field");
  await page.getByLabel("Aria Label", { exact: true }).fill("Personal details");
  await page
    .getByLabel("Section condition checkbox", { exact: true })
    .selectOption({ label: "Business enquiry" });
  await page
    .getByLabel("Section condition state", { exact: true })
    .selectOption("false");
  await add(page, "textInput", "Text Input", "Last Form Field");
  await page.getByLabel("Name", { exact: true }).fill("personalNote");
  await page.getByLabel("Label", { exact: true }).fill("Personal note");
  await page.getByLabel("Value", { exact: true }).fill("Personal enquiry");
  await page.getByLabel("Required", { exact: true }).check();
  await selectForm(page);
  await page
    .getByLabel("Collection name", { exact: true })
    .fill("Conditional enquiries");
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
    page
      .getByLabel("Section condition checkbox", { exact: true })
      .locator("option:checked"),
  ).toHaveText("Business enquiry");
  await page.getByRole("button", { name: "Preview", exact: true }).click();
  const frame = page.frameLocator('iframe[title="Generated frontend preview"]');
  const details = frame.locator('fieldset[aria-label="Company details"]');
  const personal = frame.locator('fieldset[aria-label="Personal details"]');
  await expect(personal).toBeVisible();
  await expect(details).toBeHidden();
  await expect(details.locator("input")).toBeDisabled();
  await frame
    .getByRole("checkbox", { name: "Business enquiry", exact: true })
    .check();
  await expect(details).toBeVisible();
  await expect(personal).toBeHidden();
  await details
    .getByLabel("Company name", { exact: true })
    .fill("Preview company");
  await frame
    .getByRole("checkbox", { name: "Business enquiry", exact: true })
    .uncheck();
  await expect(details).toBeHidden();
  await frame
    .getByRole("checkbox", { name: "Business enquiry", exact: true })
    .check();
  await expect(details.getByLabel("Company name", { exact: true })).toHaveValue(
    "Preview company",
  );
  await page
    .getByRole("button", { name: "Back To Editor", exact: true })
    .click();
  await page.getByLabel("Deploy options", { exact: true }).click();
  const downloaded = page.waitForEvent("download");
  await page
    .getByRole("button", { name: "Download application ZIP", exact: true })
    .click();
  await (await downloaded).saveAs(".verification/conditional-export.zip");
  const zip = await JSZip.loadAsync(
    await readFile(".verification/conditional-export.zip"),
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
  expect(
    Object.values(project.editor.elementsById).filter(
      (node: unknown) => (node as { formCondition?: unknown }).formCondition,
    ),
  ).toHaveLength(3);
});
