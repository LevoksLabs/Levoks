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
async function addSelect(
  page: Page,
  kind: string,
  name: string,
  label: string,
) {
  await selectForm(page);
  await page.getByLabel("New form control", { exact: true }).selectOption(kind);
  await page
    .getByLabel("Add control inside", { exact: true })
    .selectOption({ label: "This form" });
  await page
    .getByRole("button", { name: "Add form control", exact: true })
    .click();
  await page
    .getByRole("button", {
      name: `Edit ${kind === "select" ? "Select" : "Multi Select"}`,
      exact: true,
    })
    .last()
    .click();
  await page.getByLabel("Name", { exact: true }).fill(name);
  await page.getByLabel("Label", { exact: true }).fill(label);
  while (
    await page
      .getByRole("button", { name: "Remove choice 1", exact: true })
      .count()
  )
    await page
      .getByRole("button", { name: "Remove choice 1", exact: true })
      .click();
}
async function addChoice(page: Page, value: string, label: string, group = "") {
  await page.getByLabel("New choice", { exact: true }).fill(value);
  await page.getByLabel("New choice label", { exact: true }).fill(label);
  await page.getByLabel("New choice group", { exact: true }).fill(group);
  await page.getByRole("button", { name: "Add choice", exact: true }).click();
}

async function assignGroup(page: Page, index: number, group: string) {
  await page.getByLabel(`Choice ${index} group`, { exact: true }).fill(group);
  await page
    .getByRole("button", { name: `Apply choice ${index}`, exact: true })
    .click();
}

test("select labels, option groups, disabled options and defaults survive visual edits, text lists, history, reload, preview and the actual ZIP", async ({
  page,
}) => {
  test.setTimeout(210000);
  await openEditor(page);
  await page.getByLabel("Search elements", { exact: true }).fill("Form");
  const tile = page.getByRole("button", { name: "Add Form", exact: true }),
    bounds = await page.locator(".canvas-page").boundingBox();
  await tile.hover();
  await page.mouse.down();
  await page.mouse.move(bounds!.x + 180, bounds!.y + 45, { steps: 12 });
  await page.mouse.up();
  await addSelect(page, "select", "session", "Appointment session");
  await page.getByLabel("Required", { exact: true }).check();
  await addChoice(page, "am", "Morning appointment");
  await addChoice(page, "pm", "Afternoon appointment");
  await addChoice(page, "closed", "No appointments available");
  await page.getByLabel("Default: am", { exact: true }).check();
  await page.getByLabel("Disable choice: closed", { exact: true }).check();
  await page
    .getByLabel("Choice 1 label", { exact: true })
    .fill("Morning visit");
  await page
    .getByRole("button", { name: "Apply choice 1", exact: true })
    .click();
  await expect(page.getByLabel("Choice 1 value", { exact: true })).toHaveValue(
    "am",
  );
  await page.getByRole("button", { name: "Undo", exact: true }).click();
  await expect(page.getByLabel("Choice 1 label", { exact: true })).toHaveValue(
    "Morning appointment",
  );
  await page.getByRole("button", { name: "Redo", exact: true }).click();
  await page.getByLabel("Choice 1 value", { exact: true }).fill("morning");
  await page
    .getByRole("button", { name: "Apply choice 1", exact: true })
    .click();
  await expect(
    page.getByLabel("Default: morning", { exact: true }),
  ).toBeChecked();
  await expect(page.getByLabel("Choice 1 label", { exact: true })).toHaveValue(
    "Morning visit",
  );
  await page.getByLabel("Choice 1 value", { exact: true }).fill("pm");
  await page
    .getByRole("button", { name: "Apply choice 1", exact: true })
    .click();
  await expect(
    page.locator(".select-options-editor").getByRole("alert"),
  ).toContainText("unique");
  await page.getByLabel("Choice 1 value", { exact: true }).fill("morning");
  await page.getByLabel("Choice 1 label", { exact: true }).fill("");
  await page
    .getByRole("button", { name: "Apply choice 1", exact: true })
    .click();
  await expect(
    page.locator(".select-options-editor").getByRole("alert"),
  ).toContainText("display label");
  await page
    .getByLabel("Choice 1 label", { exact: true })
    .fill("Morning visit");
  await page.getByLabel("Disable choice: morning", { exact: true }).check();
  await expect(
    page.getByLabel("Default: morning", { exact: true }),
  ).not.toBeChecked();
  await expect(
    page.getByLabel("Default: morning", { exact: true }),
  ).toBeDisabled();
  await page.getByRole("button", { name: "Undo", exact: true }).click();
  await expect(
    page.getByLabel("Default: morning", { exact: true }),
  ).toBeChecked();
  await page
    .getByRole("button", { name: "Move choice 1 down", exact: true })
    .press("Enter");
  await expect(
    page.getByLabel("Choice 2 value", { exact: true }),
  ).toBeFocused();
  await expect(page.getByLabel("Choice 2 label", { exact: true })).toHaveValue(
    "Morning visit",
  );
  await page
    .getByRole("button", { name: "Remove choice 2", exact: true })
    .click();
  await expect(
    page.getByLabel("Default: morning", { exact: true }),
  ).toHaveCount(0);
  await page.getByRole("button", { name: "Undo", exact: true }).click();
  await page.getByText("Edit lists as text", { exact: true }).click();
  await page.getByLabel("Options", { exact: true }).fill("closed\nmorning\npm");
  await page
    .getByRole("button", { name: "Apply text lists", exact: true })
    .click();
  await expect(page.getByLabel("Choice 1 label", { exact: true })).toHaveValue(
    "No appointments available",
  );
  await expect(
    page.getByLabel("Disable choice: closed", { exact: true }),
  ).toBeChecked();
  await expect(
    page.getByLabel("Default: morning", { exact: true }),
  ).toBeChecked();
  await page.getByLabel("Value", { exact: true }).fill("closed");
  await page
    .getByRole("button", { name: "Apply text lists", exact: true })
    .click();
  await expect(
    page.locator(".select-options-editor").getByRole("alert"),
  ).toContainText("disabled choice");
  await expect(
    page.getByLabel("Default: morning", { exact: true }),
  ).toBeChecked();
  await page.getByLabel("Value", { exact: true }).fill("morning");
  await page
    .getByRole("button", { name: "Apply text lists", exact: true })
    .click();
  await assignGroup(page, 1, "Unavailable");
  await assignGroup(page, 2, "Schedule");
  await assignGroup(page, 3, "Schedule");
  await page.getByLabel("Disable choice: closed", { exact: true }).uncheck();
  await page.getByLabel("Disable group: Unavailable", { exact: true }).check();
  await page.getByLabel("Choice 1 group", { exact: true }).fill(" ");
  await page
    .getByRole("button", { name: "Apply choice 1", exact: true })
    .click();
  await expect(
    page.locator(".select-options-editor").getByRole("alert"),
  ).toContainText("Group names");
  await page.getByLabel("Choice 1 group", { exact: true }).fill("Unavailable");
  await page.getByLabel("Options", { exact: true }).fill("pm\nmorning\nclosed");
  await page
    .getByRole("button", { name: "Apply text lists", exact: true })
    .click();
  await expect(page.getByLabel("Choice 1 group", { exact: true })).toHaveValue(
    "Schedule",
  );
  await expect(page.getByLabel("Choice 3 group", { exact: true })).toHaveValue(
    "Unavailable",
  );
  await expect(
    page.getByLabel("Disable group: Unavailable", { exact: true }),
  ).toBeChecked();
  await page.getByRole("button", { name: "Undo", exact: true }).click();
  await expect(page.getByLabel("Choice 1 group", { exact: true })).toHaveValue(
    "Unavailable",
  );
  await page.getByLabel("Disable group: Schedule", { exact: true }).check();
  await expect(
    page.getByLabel("Default: morning", { exact: true }),
  ).not.toBeChecked();
  await expect(
    page.getByLabel("Default: morning", { exact: true }),
  ).toBeDisabled();
  await page.getByRole("button", { name: "Undo", exact: true }).click();
  await expect(
    page.getByLabel("Default: morning", { exact: true }),
  ).toBeChecked();
  await page.getByRole("button", { name: "Redo", exact: true }).click();
  await page.getByLabel("Disable group: Schedule", { exact: true }).uncheck();
  await expect(
    page.getByLabel("Default: morning", { exact: true }),
  ).not.toBeChecked();
  await page.getByLabel("Default: morning", { exact: true }).check();

  await addSelect(page, "multiSelect", "topics", "Project topics");
  await page.getByLabel("Required", { exact: true }).check();
  for (const [value, label] of [
    ["design", "Product design"],
    ["automation", "Workflow automation"],
    ["data", "Database design"],
    ["closed", "Currently unavailable"],
  ])
    await addChoice(page, value, label);
  await page.getByLabel("Default: design", { exact: true }).check();
  await page.getByLabel("Default: data", { exact: true }).check();
  await page.getByLabel("Disable choice: data", { exact: true }).check();
  await expect(
    page.getByLabel("Default: data", { exact: true }),
  ).not.toBeChecked();
  await page.getByRole("button", { name: "Undo", exact: true }).click();
  await expect(page.getByLabel("Default: data", { exact: true })).toBeChecked();
  await page.getByLabel("Disable choice: closed", { exact: true }).check();
  await assignGroup(page, 1, "Creative");
  await assignGroup(page, 2, "Creative");
  await assignGroup(page, 4, "Unavailable");
  await page.getByLabel("Disable choice: closed", { exact: true }).uncheck();
  await page.getByLabel("Disable group: Unavailable", { exact: true }).check();
  await page.getByLabel("Disable group: Creative", { exact: true }).check();
  await expect(
    page.getByLabel("Default: design", { exact: true }),
  ).not.toBeChecked();
  await expect(page.getByLabel("Default: data", { exact: true })).toBeChecked();
  await page.getByRole("button", { name: "Undo", exact: true }).click();
  await mkdir(".verification/select-metadata", { recursive: true });
  await page
    .getByLabel("Helper Text", { exact: true })
    .fill("Choose your priorities.");
  await page.getByLabel("Minimum selections", { exact: true }).fill("3");
  await page.getByLabel("Maximum selections", { exact: true }).fill("2");
  await page
    .getByRole("button", { name: "Apply selection limits", exact: true })
    .click();
  await expect(
    page.locator(".select-options-editor").getByRole("alert"),
  ).toContainText("Maximum selections");
  await page.getByLabel("Minimum selections", { exact: true }).fill("2");
  await page
    .getByRole("button", { name: "Apply selection limits", exact: true })
    .click();
  await expect(
    page.getByRole("button", { name: "Apply selection limits", exact: true }),
  ).toBeFocused();
  await page.getByRole("button", { name: "Undo", exact: true }).click();
  await expect(
    page.getByLabel("Minimum selections", { exact: true }),
  ).toHaveValue("");
  await page.getByRole("button", { name: "Redo", exact: true }).click();
  await expect(
    page.getByLabel("Maximum selections", { exact: true }),
  ).toHaveValue("2");
  await page.getByLabel("Default: automation", { exact: true }).click();
  await expect(
    page.locator(".select-options-editor").getByRole("alert"),
  ).toContainText("Default selections");
  await expect(
    page.getByLabel("Default: automation", { exact: true }),
  ).not.toBeChecked();
  await page.getByText("Edit lists as text", { exact: true }).click();
  await page
    .getByLabel("Selected Values", { exact: true })
    .fill("design\ndata\nautomation");
  await page
    .getByRole("button", { name: "Apply text lists", exact: true })
    .click();
  await expect(
    page.locator(".select-options-editor details").getByRole("alert"),
  ).toContainText("Default selections");
  await page
    .getByLabel("Selected Values", { exact: true })
    .fill("design\ndata");
  await page
    .getByRole("button", { name: "Apply text lists", exact: true })
    .click();
  for (const width of [1600, 1100]) {
    await page.setViewportSize({ width, height: 1000 });
    await page
      .getByLabel("Minimum selections", { exact: true })
      .scrollIntoViewIfNeeded();
    expect(
      await page
        .locator(".select-options-editor")
        .evaluate((node) => node.scrollWidth <= node.clientWidth),
    ).toBe(true);
    await page.screenshot({
      path: `.verification/select-metadata/limits-inspector-${width}.png`,
    });
  }
  await page.setViewportSize({ width: 1600, height: 1000 });
  await addSelect(page, "select", "followup", "Preferred follow-up");
  await addChoice(
    page,
    "call",
    "Call to discuss the project and next steps",
    "Support",
  );
  await addChoice(page, "closed", "Follow-up unavailable", "Unavailable");
  await page.getByLabel("Disable group: Unavailable", { exact: true }).check();
  await addSelect(page, "multiSelect", "channels", "Optional contact channels");
  await addChoice(page, "email", "Email");
  await addChoice(page, "phone", "Phone");
  await page.getByLabel("Minimum selections", { exact: true }).fill("0");
  await page.getByLabel("Maximum selections", { exact: true }).fill("0");
  await page
    .getByRole("button", { name: "Apply selection limits", exact: true })
    .click();
  await page.getByLabel("Required", { exact: true }).click();
  await expect(
    page.locator(".semantic-properties").getByRole("alert"),
  ).toContainText("including Required");
  await expect(page.getByLabel("Required", { exact: true })).not.toBeChecked();
  await page.getByLabel("Maximum selections", { exact: true }).fill("1");
  await page
    .getByRole("button", { name: "Apply selection limits", exact: true })
    .click();
  // Switching mode preserves dormant limits and remains a valid saved document.
  await expect(page.locator(".semantic-properties").getByRole("alert")).toHaveCount(0);
  await page.getByLabel("Multiple", { exact: true }).uncheck();
  await expect(
    page.getByLabel("Minimum selections", { exact: true }),
  ).toHaveCount(0);
  await page.getByLabel("Multiple", { exact: true }).check();
  await expect(
    page.getByLabel("Maximum selections", { exact: true }),
  ).toHaveValue("1");
  await selectForm(page);
  await page
    .getByLabel("Collection name", { exact: true })
    .fill("Select enquiries");
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
    .getByRole("button", { name: "Edit Appointment session", exact: true })
    .click();
  await expect(page.getByLabel("Choice 2 value", { exact: true })).toHaveValue(
    "morning",
  );
  await expect(page.getByLabel("Choice 2 label", { exact: true })).toHaveValue(
    "Morning visit",
  );
  await expect(
    page.getByLabel("Disable group: Unavailable", { exact: true }),
  ).toBeChecked();
  await expect(
    page.getByLabel("Disable choice: closed", { exact: true }),
  ).not.toBeChecked();
  await expect(page.getByLabel("Choice 2 group", { exact: true })).toHaveValue(
    "Schedule",
  );
  await selectForm(page);
  await page
    .getByRole("button", { name: "Edit Project topics", exact: true })
    .click();
  await expect(
    page.getByLabel("Minimum selections", { exact: true }),
  ).toHaveValue("2");
  await expect(
    page.getByLabel("Maximum selections", { exact: true }),
  ).toHaveValue("2");
  await page.getByRole("button", { name: "Preview", exact: true }).click();
  const frame = page.frameLocator('iframe[title="Generated frontend preview"]');
  await expect(
    frame
      .getByLabel("Appointment session", { exact: true })
      .locator("optgroup"),
  ).toHaveCount(2);
  await expect(
    frame
      .getByLabel("Project topics", { exact: true })
      .locator('optgroup[label="Creative"]'),
  ).toHaveCount(1);
  await expect(
    frame
      .getByLabel("Project topics", { exact: true })
      .locator('optgroup[label="Unavailable"]'),
  ).toHaveAttribute("disabled", "");
  await expect(
    frame.getByLabel("Appointment session", { exact: true }),
  ).toHaveValue("morning");
  await expect(
    frame.getByLabel("Project topics", { exact: true }),
  ).toHaveValues(["design", "data"]);
  await expect(
    frame.getByRole("option", {
      name: "No appointments available",
      exact: true,
    }),
  ).toBeDisabled();
  await expect(
    frame.getByLabel("Preferred follow-up", { exact: true }),
  ).toHaveValue("");
  const topics = frame.getByLabel("Project topics", { exact: true });
  await expect(topics).toHaveAttribute("data-selection-min", "2");
  await expect(topics).toHaveAccessibleDescription(
    "Choose your priorities. Select exactly 2 options.",
  );
  await expect(
    frame.getByLabel("Optional contact channels", { exact: true }),
  ).toHaveAttribute("data-selection-max", "1");
  await frame.getByPlaceholder("Your name", { exact: true }).fill("Preview visitor");
  await frame.getByPlaceholder("Your email", { exact: true }).fill("preview@example.test");
  await topics.selectOption("design");
  await frame.getByRole("button", { name: "Submit", exact: true }).click();
  await expect(frame.getByRole("status")).toContainText("Choose at least 2 options for Project topics");
  await expect(topics).toBeFocused();
  await topics.selectOption(["design", "automation", "data"]);
  await frame.getByRole("button", { name: "Submit", exact: true }).click();
  await expect(frame.getByRole("status")).toContainText("Choose at most 2 options for Project topics");
  await expect(topics).toHaveValues(["design", "automation", "data"]);
  await page
    .getByRole("button", { name: "Back To Editor", exact: true })
    .click();
  await page.getByLabel("Deploy options", { exact: true }).click();
  const downloaded = page.waitForEvent("download");
  await page
    .getByRole("button", { name: "Download application ZIP", exact: true })
    .click();
  await (await downloaded).saveAs(".verification/select-metadata-export.zip");
  const zip = await JSZip.loadAsync(
    await readFile(".verification/select-metadata-export.zip"),
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
  const rules = project.backend.services[0].blocks
    .filter((block: { type: string }) => block.type === "validation")
    .flatMap(
      (block: { config: { rules: { type: string; value: string }[] } }) =>
        block.config.rules,
    );
  expect(
    rules
      .filter((rule: { type: string }) => rule.type === "oneOf")
      .map((rule: { value: string }) => rule.value),
  ).toEqual([
    "morning\npm",
    "design\nautomation\ndata",
    "call",
    "email\nphone",
  ]);
  expect(
    rules
      .filter((rule: { type: string }) => /Items$/.test(rule.type))
      .map((rule: { type: string; value: number }) => [rule.type, rule.value]),
  ).toEqual([
    ["minItems", 2],
    ["maxItems", 2],
    ["maxItems", 1],
  ]);
});
