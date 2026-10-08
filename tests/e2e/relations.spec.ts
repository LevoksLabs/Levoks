import { test, expect } from "@playwright/test";
import { readFile } from "node:fs/promises";
import path from "node:path";
import JSZip from "jszip";
import { openEditor } from "../helpers/open-editor";
import { relationsFixture, modelConfig } from "../helpers/relations-fixture";
import { emptyProject } from "../../src/lib/project/workspace";
import { compileProject } from "../../src/lib/project/compiler";

test("relationships can be configured without code, undone, saved and exported", async ({
  page,
}) => {
  await openEditor(page);
  await page
    .getByRole("button", { name: "Untitled project", exact: true })
    .click();
  const workspace = page.getByRole("dialog", {
    name: "Levoks project workspace",
  });
  const project = emptyProject("Relationship acceptance");
  const service = relationsFixture();
  modelConfig(service, "note").fields = modelConfig(
    service,
    "note",
  ).fields.filter((f) => f.name !== "projectId");
  project.backend.services = [service];
  await workspace
    .locator('input[type="file"]')
    .setInputFiles({
      name: "relations.json",
      mimeType: "application/json",
      buffer: Buffer.from(JSON.stringify(project)),
    });
  await expect(
    workspace.getByLabel("Project name", { exact: true }),
  ).toHaveValue("Relationship acceptance (import)");
  await workspace.getByRole("button", { name: "Close workspace" }).click();
  const select = async (id: string) => {
    await page.getByRole("button", { name: "Backend", exact: true }).click();
    await page
      .locator(".backend-hierarchy .bh-block-name")
      .getByText(id, { exact: true })
      .click();
  };
  await select("notes_relation");
  const inspector = page.getByRole("region", { name: "Relationship settings" });
  await expect(inspector.getByRole("alert")).toContainText("ObjectId field");
  await inspector
    .getByRole("button", { name: "Add parent reference", exact: true })
    .click();
  await expect(
    page.getByLabel("Parent reference", { exact: true }),
  ).toHaveValue("projectId");
  await expect(inspector.getByRole("alert")).toHaveCount(0);
  await page.getByRole("button", { name: "Undo", exact: true }).click();
  await expect(inspector.getByRole("alert")).toContainText("ObjectId field");
  await page.getByRole("button", { name: "Redo", exact: true }).click();
  await expect(inspector.getByRole("alert")).toHaveCount(0);
  await select("tasks_relation");
  await page.getByLabel("tenantId", { exact: true }).uncheck();
  await expect(inspector.getByRole("alert")).toContainText(
    "cross-owner or cross-tenant",
  );
  await page.getByLabel("tenantId", { exact: true }).check();
  await select("profile_relation");
  await page
    .getByLabel("Cardinality", { exact: true })
    .selectOption("one-to-many");
  await page.getByRole("button", { name: "Undo", exact: true }).click();
  await expect(page.getByLabel("Cardinality", { exact: true })).toHaveValue(
    "one-to-one",
  );
  await page.screenshot({ path: ".verification/relations-desktop.png" });
  await page.setViewportSize({ width: 1024, height: 768 });
  await page.getByLabel("Parent reference", { exact: true }).focus();
  await page.keyboard.press("Tab");
  await expect(
    inspector.getByRole("button", {
      name: "Add parent reference",
      exact: true,
    }),
  ).toBeFocused();
  await page.screenshot({ path: ".verification/relations-compact.png" });
  await page.setViewportSize({ width: 1600, height: 1000 });
  await select("tags_relation");
  await expect(page.getByLabel("Junction model", { exact: true })).toHaveValue(
    "link",
  );
  await expect(
    page.getByLabel("Other parent reference", { exact: true }),
  ).toHaveValue("tagId");
  await page.getByRole("button", { name: "Save project", exact: true }).click();
  await page.reload();
  await select("notes_relation");
  await expect(
    page.getByLabel("Parent reference", { exact: true }),
  ).toHaveValue("projectId");
  await expect(
    page.getByLabel("When a parent is deleted", { exact: true }),
  ).toHaveValue("setNull");
  await expect(page.getByLabel("tenantId", { exact: true })).toBeChecked();
  await page.getByLabel("Deploy options", { exact: true }).click();
  const downloaded = page.waitForEvent("download");
  await page
    .getByRole("button", { name: "Download application ZIP", exact: true })
    .click();
  const destination = path.resolve(".verification/relations-export.zip");
  await (await downloaded).saveAs(destination);
  const zip = await JSZip.loadAsync(await readFile(destination));
  const snapshot = JSON.parse(
    await zip.file("levoks.project.json")!.async("string"),
  );
  const compiled = compileProject(snapshot);
  expect(compiled.diagnostics.filter((d) => d.severity === "error")).toEqual(
    [],
  );
  for (const [file, content] of Object.entries(compiled.files))
    expect(await zip.file(file)!.async("string"), file).toBe(content);
  expect(
    await zip
      .file("backend/relations-service/relations/runtime.js")!
      .async("string"),
  ).toContain("withTransaction");
  const config = JSON.parse(
    await zip
      .file("backend/relations-service/relations/config.json")!
      .async("string"),
  );
  expect(
    config.edges.find((e: { child: string }) => e.child === "note").onDelete,
  ).toBe("setNull");
});
