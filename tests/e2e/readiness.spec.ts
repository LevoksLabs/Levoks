import { test, expect } from "@playwright/test";
import { openEditor } from "../helpers/open-editor";
import {
  emptyProject,
  restoreProject,
  captureProject,
} from "../../src/lib/project/workspace";
import { useEditorStore } from "../../src/store/editorStore";
import { useBackendStore } from "../../src/store/backendStore";
import { templates } from "../../src/templates";
import { block, programFixture } from "../helpers/program-fixture";

test("readiness links to compiler blockers, form actions and page settings, and rechecks saved repairs", async ({
  page,
}) => {
  const initial = emptyProject("Readiness acceptance");
  restoreProject(initial);
  const editor = useEditorStore.getState();
  const form = editor.addElement(
    {
      ...templates.form,
      label: "Contact form",
      props: { ...templates.form.props, requestUrl: "" },
    },
    undefined,
    20,
    20,
  );
  const button = editor.addElement(
    { ...templates.button, label: "Work button" },
    undefined,
    20,
    380,
  );
  const service = programFixture();
  service.name = "Readiness Service";
  service.blocks = [
    block("parent", "db_model", {
      tableName: "Project",
      fields: [{ name: "title", type: "string", required: true }],
    }),
    block("child", "db_model", {
      tableName: "Task",
      fields: [{ name: "title", type: "string", required: true }],
    }),
    block("relation", "relation"),
  ];
  useBackendStore.setState({ services: [service], connections: [] });
  const project = captureProject(initial.id, initial.name);
  await openEditor(page);
  await page
    .getByRole("button", { name: "Untitled project", exact: true })
    .click();
  const workspace = page.getByRole("dialog", {
    name: "Levoks project workspace",
  });
  await workspace.locator('input[type="file"]').setInputFiles({
    name: "readiness.json",
    mimeType: "application/json",
    buffer: Buffer.from(JSON.stringify(project)),
  });
  await expect(
    workspace.getByLabel("Project name", { exact: true }),
  ).toHaveValue("Readiness acceptance (import)");
  await workspace.getByRole("button", { name: "Close workspace" }).click();
  const open = async () => {
    await page.getByRole("button", { name: "Deploy", exact: true }).click();
    await expect(workspace).toBeVisible();
  };
  const checklist = workspace.getByRole("region", {
    name: "Publish-readiness checklist",
  });
  await open();
  await expect(checklist.getByRole("status")).toContainText("compiler blocker");
  await expect(
    workspace.getByRole("button", {
      name: "Download full-stack ZIP",
      exact: true,
    }),
  ).toBeDisabled();
  await page.screenshot({ path: ".verification/readiness-desktop.png" });
  await page.setViewportSize({ width: 1024, height: 768 });
  await page.screenshot({ path: ".verification/readiness-compact.png" });
  await page.setViewportSize({ width: 1600, height: 1000 });
  const blocker = checklist
    .locator("li")
    .filter({ hasText: "Choose existing models" });
  await blocker.getByRole("button").click();
  await expect(workspace).not.toBeVisible();
  const relation = page.getByRole("region", { name: "Relationship settings" });
  await expect(relation).toBeVisible();
  await page.getByLabel("Parent model", { exact: true }).selectOption("parent");
  await page
    .getByLabel("Dependent model", { exact: true })
    .selectOption("child");
  await relation
    .getByRole("button", { name: "Add parent reference", exact: true })
    .click();
  await expect(relation.getByRole("alert")).toHaveCount(0);
  await open();
  await expect(checklist.getByRole("status")).toContainText(
    "No compiler blockers",
  );
  await expect(
    workspace.getByRole("button", {
      name: "Download full-stack ZIP",
      exact: true,
    }),
  ).toBeEnabled();
  await checklist
    .getByRole("button", { name: /Review Form has no submission destination/ })
    .click();
  await expect(
    page.locator(`.canvas-page [data-element-id="${form}"]`),
  ).toHaveClass(/selected/);
  await expect(
    page.getByRole("button", { name: "Content", exact: true }),
  ).toBeFocused();
  await page
    .getByLabel("Request URL", { exact: true })
    .fill("https://forms.example.test/contact");
  await open();
  await expect(
    checklist.getByText("Form has no submission destination", { exact: true }),
  ).toHaveCount(0);
  await expect(
    checklist.getByText("Direct form submission needs verification", {
      exact: true,
    }),
  ).toHaveCount(1);
  await checklist
    .getByRole("button", { name: /Review Button has no working action/ })
    .click();
  await expect(
    page.locator(`.canvas-page [data-element-id="${button}"]`),
  ).toHaveClass(/selected/);
  await page.getByLabel("Link URL", { exact: true }).fill("/");
  await open();
  await expect(
    checklist.getByText("Button has no working action", { exact: true }),
  ).toHaveCount(0);
  await checklist
    .getByRole("button", { name: /Review Search description is missing/ })
    .click();
  await expect(
    page.getByText("Search & sharing", { exact: true }),
  ).toBeFocused();
  await page
    .getByLabel("Search description for Home", { exact: true })
    .fill(
      "A local acceptance project with a contact form and working home link.",
    );
  await page.getByRole("button", { name: "Save project", exact: true }).click();
  await page.reload();
  await open();
  await expect(checklist.getByRole("status")).toContainText(
    "No compiler blockers",
  );
  await expect(
    checklist.getByText("Search description is missing", { exact: true }),
  ).toHaveCount(0);
  await expect(
    checklist.getByText("Button has no working action", { exact: true }),
  ).toHaveCount(0);
  await expect(
    checklist.getByText("Run the exported application before publishing", {
      exact: true,
    }),
  ).toHaveCount(1);
  const downloaded = page.waitForEvent("download");
  await workspace
    .getByRole("button", { name: "Download full-stack ZIP", exact: true })
    .click();
  await (await downloaded).saveAs(".verification/readiness-export.zip");
});

test("readiness reviews a thousand-element project without mounting a thousand check rows", async ({
  page,
}) => {
  const initial = emptyProject("Large readiness project");
  restoreProject(initial);
  const store = useEditorStore.getState();
  store.updatePageSeo(initial.editor.activePageId, { noIndex: true });
  for (let i = 0; i < 1000; i++)
    store.addElement(
      { ...templates.button, label: `Action ${i + 1}` },
      undefined,
      20 + (i % 5) * 200,
      20 + Math.floor(i / 5) * 80,
    );
  const project = captureProject(initial.id, initial.name);
  await openEditor(page);
  await page
    .getByRole("button", { name: "Untitled project", exact: true })
    .click();
  const workspace = page.getByRole("dialog", {
    name: "Levoks project workspace",
  });
  await workspace.locator('input[type="file"]').setInputFiles({
    name: "large.json",
    mimeType: "application/json",
    buffer: Buffer.from(JSON.stringify(project)),
  });
  await expect(
    workspace.getByLabel("Project name", { exact: true }),
  ).toHaveValue("Large readiness project (import)");
  await workspace.getByRole("button", { name: "Close workspace" }).click();
  await page.getByRole("button", { name: "Deploy", exact: true }).click();
  const checklist = workspace.getByRole("region", {
    name: "Publish-readiness checklist",
  });
  await expect(checklist.getByRole("status")).toContainText(
    "1000 items to review",
  );
  await expect(checklist.locator("li")).toHaveCount(20);
  await checklist
    .getByRole("button", {
      name: "Show more checks (20 of 1001 shown)",
      exact: true,
    })
    .click();
  await expect(checklist.locator("li")).toHaveCount(40);
  await expect(
    checklist.getByRole("button", {
      name: "Show more checks (40 of 1001 shown)",
      exact: true,
    }),
  ).toBeEnabled();
});
