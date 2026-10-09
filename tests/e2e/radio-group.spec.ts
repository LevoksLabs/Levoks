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
  await page.getByLabel("New radio choice label", { exact: true }).fill(label);
  await page.getByLabel("New radio choice value", { exact: true }).fill(value);
  await page
    .getByRole("button", { name: "Add radio choice", exact: true })
    .click();
}
async function addGroup(page: Page, name: string, question: string) {
  await selectForm(page);
  await page
    .getByLabel("New form control", { exact: true })
    .selectOption("radioGroup");
  await page
    .getByLabel("Add control inside", { exact: true })
    .selectOption({ label: "This form" });
  await page
    .getByRole("button", { name: "Add form control", exact: true })
    .click();
  await page
    .getByRole("button", { name: "Edit Radio Group", exact: true })
    .last()
    .click();
  await page.getByLabel("Radio group question", { exact: true }).fill(question);
  await page.getByLabel("Radio group field name", { exact: true }).fill(name);
  await page
    .getByRole("button", { name: "Apply radio field name", exact: true })
    .click();
  await expect(
    page.getByRole("button", { name: "Apply radio field name", exact: true }),
  ).toBeFocused();
}

test("visual radio groups retain labels, values, defaults and mapped identity through history, reload, preview and real ZIP", async ({
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
  await addGroup(page, "attendance", "How will you attend?");
  await expect(
    page.getByText("No choices yet.", { exact: false }),
  ).toBeVisible();
  await page.getByLabel("Radio group required", { exact: true }).check();
  await selectForm(page);
  await expect(
    page.getByRole("button", {
      name: "Create collection and connect",
      exact: true,
    }),
  ).toBeDisabled();
  await expect(
    page.getByRole("alert").filter({ hasText: "enabled radio choice" }),
  ).toBeVisible();
  await page
    .getByRole("button", { name: "Edit Radio Group", exact: true })
    .click();
  await addChoice(page, "Remote attendance", "remote");
  await addChoice(page, "In person at the venue", "in_person");
  await addChoice(page, "Unavailable option", "unavailable");
  await page
    .getByLabel("Default radio choice: Remote attendance", { exact: true })
    .check();
  await page
    .getByLabel("Default radio choice: In person at the venue", { exact: true })
    .check();
  await expect(
    page.getByLabel("Default radio choice: Remote attendance", { exact: true }),
  ).not.toBeChecked();
  await addChoice(page, "Duplicate", "remote");
  await expect(
    page.locator(".select-options-editor").getByRole("alert"),
  ).toContainText("unique");
  await expect(page.locator(".select-choice-row")).toHaveCount(3);
  await page
    .getByLabel("Radio group field name", { exact: true })
    .fill("9invalid");
  await page
    .getByRole("button", { name: "Apply radio field name", exact: true })
    .click();
  await expect(
    page.locator(".select-options-editor").getByRole("alert"),
  ).toContainText("starting with a letter");
  await page
    .getByLabel("Radio group field name", { exact: true })
    .fill("attendance");
  await page
    .getByRole("button", { name: "Apply radio field name", exact: true })
    .click();
  await page
    .getByLabel("Radio choice 1 label", { exact: true })
    .fill("Online attendance");
  await page.getByLabel("Radio choice 1 value", { exact: true }).fill("online");
  await page
    .getByRole("button", { name: "Apply radio choice 1", exact: true })
    .click();
  await expect(
    page.getByLabel("Radio choice 1 label", { exact: true }),
  ).toBeFocused();
  await page.getByRole("button", { name: "Undo", exact: true }).click();
  await expect(
    page.getByLabel("Radio choice 1 value", { exact: true }),
  ).toHaveValue("remote");
  await page.getByRole("button", { name: "Redo", exact: true }).click();
  await page
    .getByLabel("Disable radio choice: Unavailable option", { exact: true })
    .check();
  await expect(
    page.getByLabel("Default radio choice: Unavailable option", {
      exact: true,
    }),
  ).toBeDisabled();
  await page
    .getByRole("button", { name: "Move radio choice 2 up", exact: true })
    .press("Enter");
  await expect(
    page.getByLabel("Radio choice 1 label", { exact: true }),
  ).toBeFocused();
  await expect(
    page.getByLabel("Radio choice 1 value", { exact: true }),
  ).toHaveValue("in_person");
  await mkdir(".verification/radio-group", { recursive: true });
  for (const width of [1600, 1100]) {
    await page.setViewportSize({ width, height: 1000 });
    await page
      .getByLabel("Radio choice 1 label", { exact: true })
      .scrollIntoViewIfNeeded();
    expect(
      await page
        .locator("div.semantic-properties")
        .evaluate((node) => node.scrollWidth <= node.clientWidth),
    ).toBe(true);
    await page.screenshot({
      path: `.verification/radio-group/inspector-${width}.png`,
    });
  }
  await page.setViewportSize({ width: 1600, height: 1000 });
  await addGroup(page, "reply_method", "Preferred reply");
  await addChoice(page, "Email reply", "email");
  await addChoice(
    page,
    "Call me to discuss the project and next steps",
    "phone",
  );
  await selectForm(page);
  await page
    .getByLabel("Collection name", { exact: true })
    .fill("Radio enquiries");
  await page
    .getByRole("button", { name: "Create collection and connect", exact: true })
    .click();
  await page
    .getByLabel("Clear fields after a successful save", { exact: true })
    .check();
  await page
    .getByRole("button", { name: "Edit Radio Group", exact: true })
    .first()
    .click();
  await page
    .getByRole("button", { name: "Remove radio choice 1", exact: true })
    .click();
  await expect(
    page.getByLabel("Radio choice 1 value", { exact: true }),
  ).toHaveValue("online");
  await expect(
    page.getByLabel("Radio choice 1 label", { exact: true }),
  ).toBeFocused();
  await page.getByRole("button", { name: "Undo", exact: true }).click();
  await expect(
    page.getByLabel("Radio choice 1 value", { exact: true }),
  ).toHaveValue("in_person");
  await page.getByRole("button", { name: "Redo", exact: true }).click();
  await addChoice(page, "In person at the venue", "in_person");
  await page
    .getByLabel("Default radio choice: Online attendance", { exact: true })
    .check();
  await page.getByRole("button", { name: "Save project", exact: true }).click();
  await expect(page.locator(".workspace-status-text")).toHaveText(
    "Saved on this device",
  );
  await page.reload();
  await selectForm(page);
  await page
    .getByRole("button", { name: "Edit Radio Group", exact: true })
    .first()
    .click();
  await expect(
    page.getByLabel("Radio group field name", { exact: true }),
  ).toHaveValue("attendance");
  await expect(
    page.getByLabel("Radio group required", { exact: true }),
  ).toBeChecked();
  await expect(
    page.getByLabel("Radio choice 1 value", { exact: true }),
  ).toHaveValue("online");
  await expect(
    page.getByLabel("Default radio choice: Online attendance", { exact: true }),
  ).toBeChecked();
  await expect(
    page.getByLabel("Disable radio choice: Unavailable option", {
      exact: true,
    }),
  ).toBeChecked();
  await page.getByRole("button", { name: "Preview", exact: true }).click();
  const frame = page.frameLocator('iframe[title="Generated frontend preview"]');
  const group = frame.getByRole("group", {
    name: "How will you attend?",
    exact: true,
  });
  await expect(
    group.getByRole("radio", { name: "Online attendance", exact: true }),
  ).toBeChecked();
  await expect(
    group.getByRole("radio", { name: "Unavailable option", exact: true }),
  ).toBeDisabled();
  await group
    .getByRole("radio", { name: "In person at the venue", exact: true })
    .check();
  await expect(
    group.getByRole("radio", { name: "Online attendance", exact: true }),
  ).not.toBeChecked();
  await expect(
    frame.getByRole("group", { name: "Preferred reply", exact: true }),
  ).toBeVisible();
  await page
    .getByRole("button", { name: "Back To Editor", exact: true })
    .click();
  await page.getByLabel("Deploy options", { exact: true }).click();
  const downloaded = page.waitForEvent("download");
  await page
    .getByRole("button", { name: "Download application ZIP", exact: true })
    .click();
  await (await downloaded).saveAs(".verification/radio-export.zip");
  const zip = await JSZip.loadAsync(
    await readFile(".verification/radio-export.zip"),
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
  const radioMapping = wire.requestMappings.find(
    (mapping: { source: { elementId: string } }) =>
      project.editor.elementsById[mapping.source.elementId]?.props.name ===
      "attendance",
  );
  expect(radioMapping.fieldId).not.toBe(radioMapping.source.elementId);
  expect(
    project.backend.services[0].blocks
      .find((block: { type: string }) => block.type === "db_model")
      .config.fields.filter(
        (field: { name: string }) => field.name === "attendance",
      ),
  ).toHaveLength(1);
});

test("tray radio group grows around its choices in canvas and generated preview", async ({
  page,
}) => {
  await openEditor(page);
  await page.getByLabel("Search elements", { exact: true }).fill("Radio Group");
  const tile = page.getByRole("button", {
    name: "Add Radio Group",
    exact: true,
  });
  const bounds = await page.locator(".canvas-page").boundingBox();
  await tile.hover();
  await page.mouse.down();
  await page.mouse.move(bounds!.x + 200, bounds!.y + 100, { steps: 12 });
  await page.mouse.up();
  await page.getByRole("button", { name: "Content", exact: true }).click();
  await page
    .getByLabel("Radio group question", { exact: true })
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
  await expect(preview.getByRole("radio")).toHaveCount(3);
  expect(
    await preview.evaluate((node) => {
      const bounds = node.getBoundingClientRect();
      return Array.from(node.querySelectorAll("label")).every(
        (child) => child.getBoundingClientRect().bottom <= bounds.bottom + 1,
      );
    }),
  ).toBe(true);
});
