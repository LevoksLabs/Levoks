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
async function addChoice(page: Page, label: string, value: string) {
  await page
    .getByLabel("New checkbox choice label", { exact: true })
    .fill(label);
  await page
    .getByLabel("New checkbox choice value", { exact: true })
    .fill(value);
  await page
    .getByRole("button", { name: "Add checkbox choice", exact: true })
    .click();
}
async function addGroup(page: Page, name: string, question: string) {
  await selectForm(page);
  await page
    .getByLabel("New form control", { exact: true })
    .selectOption("checkboxGroup");
  await page
    .getByLabel("Add control inside", { exact: true })
    .selectOption({ label: "This form" });
  await page
    .getByRole("button", { name: "Add form control", exact: true })
    .click();
  await page
    .getByRole("button", { name: "Edit Checkbox Group", exact: true })
    .last()
    .click();
  await page
    .getByLabel("Checkbox group question", { exact: true })
    .fill(question);
  await page
    .getByLabel("Checkbox group field name", { exact: true })
    .fill(name);
  await page
    .getByRole("button", { name: "Apply checkbox field name", exact: true })
    .click();
  await expect(
    page.getByRole("button", {
      name: "Apply checkbox field name",
      exact: true,
    }),
  ).toBeFocused();
}

test("visual checkbox groups retain labels, values, defaults and stable array identity through history, reload, preview and real ZIP", async ({
  page,
}) => {
  test.setTimeout(150000);
  await openEditor(page);
  await page.getByLabel("Search elements", { exact: true }).fill("Form");
  const tile = page.getByRole("button", { name: "Add Form", exact: true });
  const bounds = await page.locator(".canvas-page").boundingBox();
  await tile.hover();
  await page.mouse.down();
  await page.mouse.move(bounds!.x + 200, bounds!.y + 100, { steps: 12 });
  await page.mouse.up();
  await addGroup(page, "interests", "What would you like to build?");
  await expect(
    page.getByText("No choices yet.", { exact: false }),
  ).toBeVisible();
  await page.getByLabel("Checkbox group required", { exact: true }).check();
  await selectForm(page);
  await expect(
    page.getByRole("button", {
      name: "Create collection and connect",
      exact: true,
    }),
  ).toBeDisabled();
  await expect(
    page.getByRole("alert").filter({ hasText: "unique allowed values" }),
  ).toBeVisible();
  await page
    .getByRole("button", { name: "Edit Checkbox Group", exact: true })
    .click();
  await addChoice(page, "Website design", "website");
  await addChoice(page, "Application design", "app");
  await addChoice(page, "Unavailable option", "unavailable");
  await addChoice(page, "Workflow automation", "automation");
  await page.getByLabel("Minimum selections", {exact: true}).fill("2");
  await page.getByLabel("Maximum selections", {exact: true}).fill("1");
  await page.getByRole("button", {name: "Apply selection limits", exact: true}).click();
  await expect(page.locator(".select-options-editor").getByRole("alert")).toContainText("Maximum selections");
  await page.getByLabel("Maximum selections", {exact: true}).fill("2");
  await page.getByRole("button", {name: "Apply selection limits", exact: true}).click();
  await expect(page.getByRole("button", {name: "Apply selection limits", exact: true})).toBeFocused();
  await page.getByRole("button", {name: "Undo", exact: true}).click();
  await expect(page.getByLabel("Minimum selections", {exact: true})).toHaveValue("");
  await page.getByRole("button", {name: "Redo", exact: true}).click();
  await expect(page.getByLabel("Minimum selections", {exact: true})).toHaveValue("2");
  await page
    .getByLabel("Default checkbox choice: Website design", { exact: true })
    .check();
  await page
    .getByLabel("Default checkbox choice: Application design", { exact: true })
    .check();
  await expect(
    page.getByLabel("Default checkbox choice: Website design", { exact: true }),
  ).toBeChecked();
  await addChoice(page, "Duplicate", "website");
  await expect(
    page.locator(".select-options-editor").getByRole("alert"),
  ).toContainText("unique");
  await expect(page.locator(".select-choice-row")).toHaveCount(4);
  await page
    .getByLabel("Checkbox group field name", { exact: true })
    .fill("9invalid");
  await page
    .getByRole("button", { name: "Apply checkbox field name", exact: true })
    .click();
  await expect(
    page.locator(".select-options-editor").getByRole("alert"),
  ).toContainText("starting with a letter");
  await page
    .getByLabel("Checkbox group field name", { exact: true })
    .fill("interests");
  await page
    .getByRole("button", { name: "Apply checkbox field name", exact: true })
    .click();
  await page
    .getByLabel("Checkbox choice 1 label", { exact: true })
    .fill("Website design");
  await page.getByLabel("Checkbox choice 1 value", { exact: true }).fill("web");
  await page
    .getByRole("button", { name: "Apply checkbox choice 1", exact: true })
    .click();
  await expect(
    page.getByLabel("Checkbox choice 1 label", { exact: true }),
  ).toBeFocused();
  await page.getByRole("button", { name: "Undo", exact: true }).click();
  await expect(
    page.getByLabel("Checkbox choice 1 value", { exact: true }),
  ).toHaveValue("website");
  await page.getByRole("button", { name: "Redo", exact: true }).click();
  await page
    .getByLabel("Disable checkbox choice: Unavailable option", { exact: true })
    .check();
  await expect(
    page.getByLabel("Default checkbox choice: Unavailable option", {
      exact: true,
    }),
  ).toBeDisabled();
  await page
    .getByRole("button", { name: "Move checkbox choice 2 up", exact: true })
    .press("Enter");
  await expect(
    page.getByLabel("Checkbox choice 1 label", { exact: true }),
  ).toBeFocused();
  await expect(
    page.getByLabel("Checkbox choice 1 value", { exact: true }),
  ).toHaveValue("app");
  await mkdir(".verification/checkbox-group", { recursive: true });
  for (const width of [1600, 1100]) {
    await page.setViewportSize({ width, height: 1000 });
    await page
      .getByLabel("Minimum selections", { exact: true })
      .scrollIntoViewIfNeeded();
    expect(
      await page
        .locator("div.semantic-properties")
        .evaluate((node) => node.scrollWidth <= node.clientWidth),
    ).toBe(true);
    await page.screenshot({
      path: `.verification/checkbox-group/inspector-${width}.png`,
    });
  }
  await page.setViewportSize({ width: 1600, height: 1000 });
  await addGroup(page, "followups", "Optional followups");
  await addChoice(page, "Email reply", "email");
  await addChoice(
    page,
    "Call me to discuss the project and next steps",
    "phone",
  );
  await page.getByLabel("Maximum selections", {exact: true}).fill("1");
  await page.getByRole("button", {name: "Apply selection limits", exact: true}).click();
  await selectForm(page);
  await page
    .getByLabel("New form control", { exact: true })
    .selectOption("checkbox");
  await page
    .getByLabel("Add control inside", { exact: true })
    .selectOption({ label: "This form" });
  await page
    .getByRole("button", { name: "Add form control", exact: true })
    .click();
  await page
    .getByRole("button", { name: "Edit Checkbox", exact: true })
    .last()
    .click();
  await page.getByLabel("Name", { exact: true }).fill("consent");
  await page.getByLabel("Label", { exact: true }).fill("Accept project terms");
  await page.getByLabel("Required", { exact: true }).check();
  await selectForm(page);
  await page
    .getByLabel("Collection name", { exact: true })
    .fill("Checkbox enquiries");
  await page
    .getByRole("button", { name: "Create collection and connect", exact: true })
    .click();
  await page
    .getByLabel("Clear fields after a successful save", { exact: true })
    .check();
  await page
    .getByRole("button", { name: "Edit Checkbox Group", exact: true })
    .first()
    .click();
  await page
    .getByRole("button", { name: "Remove checkbox choice 1", exact: true })
    .click();
  await expect(
    page.getByLabel("Checkbox choice 1 value", { exact: true }),
  ).toHaveValue("web");
  await expect(
    page.getByLabel("Checkbox choice 1 label", { exact: true }),
  ).toBeFocused();
  await page.getByRole("button", { name: "Undo", exact: true }).click();
  await expect(
    page.getByLabel("Checkbox choice 1 value", { exact: true }),
  ).toHaveValue("app");
  await page.getByRole("button", { name: "Redo", exact: true }).click();
  await addChoice(page, "Application design", "app");
  await page
    .getByLabel("Default checkbox choice: Website design", { exact: true })
    .check();
  const inspectLimits = async () => {
    await page.getByRole("button", {name: "Backend", exact: true}).click();
    await page.locator(".backend-block").filter({has: page.locator(".backend-block-label", {hasText: /^Check interests$/})}).click();
    await expect(page.getByLabel("Rule 2 type", {exact: true})).toHaveValue("minItems");
    await expect(page.getByLabel("Rule 3 type", {exact: true})).toHaveValue("maxItems");
    await expect(page.getByLabel("Rule 2 value", {exact: true})).toHaveValue("2");
    await expect(page.getByLabel("Rule 3 value", {exact: true})).toHaveValue("2");
  };
  await inspectLimits();
  await page.getByLabel("Rule 2 value", {exact: true}).fill("-1");
  await expect(page.locator(".bi-rules-list").getByRole("alert")).toContainText("whole numbers");
  await page.getByRole("button", {name: "Undo", exact: true}).click();
  await expect(page.getByLabel("Rule 2 value", {exact: true})).toHaveValue("2");
  await page.getByLabel("Rule 3 value", {exact: true}).fill("3");
  await page.getByRole("button", {name: "Undo", exact: true}).click();
  await expect(page.getByLabel("Rule 3 value", {exact: true})).toHaveValue("2");
  await page.getByRole("button", {name: "General", exact: true}).click();
  await page.getByRole("button", { name: "Save project", exact: true }).click();
  await expect(page.locator(".workspace-status-text")).toHaveText(
    "Saved on this device",
  );
  await page.reload();
  await inspectLimits();
  await page.getByRole("button", {name: "General", exact: true}).click();
  await selectForm(page);
  await page
    .getByRole("button", { name: "Edit Checkbox Group", exact: true })
    .first()
    .click();
  await expect(
    page.getByLabel("Checkbox group field name", { exact: true }),
  ).toHaveValue("interests");
  await expect(
    page.getByLabel("Checkbox group required", { exact: true }),
  ).toBeChecked();
  await expect(page.getByLabel("Minimum selections", {exact: true})).toHaveValue("2");
  await expect(page.getByLabel("Maximum selections", {exact: true})).toHaveValue("2");
  await expect(
    page.getByLabel("Checkbox choice 1 value", { exact: true }),
  ).toHaveValue("web");
  await expect(
    page.getByLabel("Default checkbox choice: Website design", { exact: true }),
  ).toBeChecked();
  await expect(
    page.getByLabel("Disable checkbox choice: Unavailable option", {
      exact: true,
    }),
  ).toBeChecked();
  await page.getByRole("button", { name: "Preview", exact: true }).click();
  const frame = page.frameLocator('iframe[title="Generated frontend preview"]');
  const group = frame.getByRole("group", {
    name: "What would you like to build?",
    exact: true,
  });
  await expect(
    group.getByRole("checkbox", { name: "Website design", exact: true }),
  ).toBeChecked();
  await expect(
    group.getByRole("checkbox", { name: "Unavailable option", exact: true }),
  ).toBeDisabled();
  await expect(group.getByText("Select exactly 2 options.", {exact: true})).toBeVisible();
  await frame.getByPlaceholder("Your name", {exact: true}).fill("Preview visitor");
  await frame.getByPlaceholder("Your email", {exact: true}).fill("preview@example.test");
  await frame.getByRole("checkbox", {name: "Accept project terms", exact: true}).check();
  await frame.getByRole("button", {name: "Submit", exact: true}).click();
  await expect(frame.getByRole("status")).toContainText("Choose at least 2 options");
  await group
    .getByRole("checkbox", { name: "Application design", exact: true })
    .check();
  await expect(
    group.getByRole("checkbox", { name: "Website design", exact: true }),
  ).toBeChecked();
  await group.getByRole("checkbox", {name: "Workflow automation", exact: true}).check();
  await frame.getByRole("button", {name: "Submit", exact: true}).click();
  await expect(frame.getByRole("status")).toContainText("Choose at most 2 options");
  await expect(
    frame.getByRole("group", { name: "Optional followups", exact: true }),
  ).toBeVisible();
  await page
    .getByRole("button", { name: "Back To Editor", exact: true })
    .click();
  await page.getByLabel("Deploy options", { exact: true }).click();
  const downloaded = page.waitForEvent("download");
  await page
    .getByRole("button", { name: "Download application ZIP", exact: true })
    .click();
  await (await downloaded).saveAs(".verification/checkbox-export.zip");
  const zip = await JSZip.loadAsync(
    await readFile(".verification/checkbox-export.zip"),
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
  const wire = project.routing.connections[0];
  const checkboxMapping = wire.requestMappings.find(
    (mapping: { source: { elementId: string } }) =>
      project.editor.elementsById[mapping.source.elementId]?.props.name ===
      "interests",
  );
  expect(checkboxMapping.fieldId).toBe(checkboxMapping.source.elementId);
  expect(
    project.backend.services[0].blocks
      .find((block: { type: string }) => block.type === "db_model")
      .config.fields.filter(
        (field: { name: string }) => field.name === "interests",
      ),
  ).toHaveLength(1);
});
test("tray checkbox group grows around its choices in canvas and generated preview", async ({
  page,
}) => {
  await openEditor(page);
  await page
    .getByLabel("Search elements", { exact: true })
    .fill("Checkbox Group");
  const tile = page.getByRole("button", {
    name: "Add Checkbox Group",
    exact: true,
  });
  const bounds = await page.locator(".canvas-page").boundingBox();
  await tile.hover();
  await page.mouse.down();
  await page.mouse.move(bounds!.x + 200, bounds!.y + 100, { steps: 12 });
  await page.mouse.up();
  await page.getByRole("button", { name: "Content", exact: true }).click();
  await page
    .getByLabel("Checkbox group question", { exact: true })
    .fill("Choose a project plan");
  for (const value of ["Website", "Application", "Both"])
    await addChoice(
      page,
      `Discuss the ${value.toLowerCase()} plan and its next steps`,
      value.toLowerCase(),
    );
  const group = page.getByRole("group", {
    name: "Choose a project plan",
    exact: true,
  });
  expect(
    await group.evaluate((node) => (node as HTMLElement).offsetHeight),
  ).toBeGreaterThan(120);
  expect(
    await group.evaluate((node) => {
      const bounds = node.parentElement!.getBoundingClientRect();
      return Array.from(node.querySelectorAll("[data-element-id]")).every(
        (child) => child.getBoundingClientRect().bottom <= bounds.bottom + 1,
      );
    }),
  ).toBe(true);
  await page.getByRole("button", { name: "Preview", exact: true }).click();
  const preview = page
    .frameLocator('iframe[title="Generated frontend preview"]')
    .getByRole("group", { name: "Choose a project plan", exact: true });
  expect(
    await preview.evaluate((node) => (node as HTMLElement).offsetHeight),
  ).toBeGreaterThan(120);
  await expect(preview.getByRole("checkbox")).toHaveCount(3);
  expect(
    await preview.evaluate((node) => {
      const bounds = node.getBoundingClientRect();
      return Array.from(node.querySelectorAll("label")).every(
        (child) => child.getBoundingClientRect().bottom <= bounds.bottom + 1,
      );
    }),
  ).toBe(true);
});
