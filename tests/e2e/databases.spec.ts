import { openEditor } from "../helpers/open-editor";
import { test, expect } from "@playwright/test";
import { readFile } from "node:fs/promises";
import path from "node:path";
import JSZip from "jszip";
import { emptyProject } from "../../src/lib/project/workspace";
import { modelLifecycleFixture } from "../helpers/model-lifecycle-fixture";

test("database chooser persists engine and storage through history, reload and exported runtime", async ({
  page,
}) => {
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
  const initial = emptyProject("Database choice");
  await workspace.locator('input[type="file"]').setInputFiles({
    name: "database.json",
    mimeType: "application/json",
    buffer: Buffer.from(
      JSON.stringify({
        ...initial,
        backend: { ...initial.backend, services: [modelLifecycleFixture()] },
      }),
    ),
  });
  await expect(
    workspace.getByLabel("Project name", { exact: true }),
  ).toHaveValue("Database choice (import)");
  await workspace.getByRole("button", { name: "Close workspace" }).click();
  const settings = async () => {
    await page.getByRole("button", { name: "Backend", exact: true }).click();
    await page
      .locator(".service-header")
      .getByTitle("Settings", { exact: true })
      .click();
  };
  await settings();
  const engine = page.getByLabel("Database engine", { exact: true });
  await expect(engine).toHaveValue("mongodb");
  for (const value of ["postgresql", "mysql", "mariadb", "sqlite"]) {
    await engine.selectOption(value);
    await expect(engine).toHaveValue(value);
  }
  await page
    .getByLabel("Database file name", { exact: true })
    .fill("products.sqlite");
  await page
    .getByLabel("Connection environment variable", { exact: true })
    .fill("PRODUCT_DATA_FILE");
  await page.getByRole("button", { name: "Undo", exact: true }).click();
  await expect(
    page.getByLabel("Connection environment variable", { exact: true }),
  ).toHaveValue("DATABASE_FILE");
  await page.getByRole("button", { name: "Redo", exact: true }).click();
  await page.getByRole("button", { name: "Save project", exact: true }).click();
  await page.reload();
  await settings();
  await expect(engine).toHaveValue("sqlite");
  await expect(
    page.getByLabel("Database file name", { exact: true }),
  ).toHaveValue("products.sqlite");
  await page.getByLabel("Deploy options", { exact: true }).click();
  const downloaded = page.waitForEvent("download");
  await page
    .getByRole("button", { name: "Download application ZIP", exact: true })
    .click();
  const destination = path.resolve(".verification/database-choice.zip");
  await (await downloaded).saveAs(destination);
  const zip = await JSZip.loadAsync(await readFile(destination));
  const configuration = JSON.parse(
    await zip
      .file("backend/workflow-service/database.config.json")!
      .async("string"),
  );
  expect(configuration).toMatchObject({
    engine: "sqlite",
    connectionEnv: "PRODUCT_DATA_FILE",
    fileName: "products.sqlite",
  });
  expect(
    await zip.file("backend/workflow-service/database.js")!.async("string"),
  ).toContain("require('knex')");
  expect(
    await zip.file("backend/docker-compose.yml")!.async("string"),
  ).toContain("/data/products.sqlite");
  await engine.selectOption("postgresql");
  await page
    .getByLabel("Store application data", { exact: true })
    .selectOption("remote");
  await expect(page.getByLabel("Require TLS", { exact: true })).toBeChecked();
  await page
    .getByLabel("Connection environment variable", { exact: true })
    .fill("HOSTED_DATABASE_URL");
  await page
    .getByLabel("Store application data", { exact: true })
    .scrollIntoViewIfNeeded();
  await page.getByRole("button", { name: "General", exact: true }).click();
  await page.screenshot({
    path: ".verification/database-settings-desktop.png",
  });
  await page.setViewportSize({ width: 1024, height: 768 });
  await page
    .getByLabel("Store application data", { exact: true })
    .scrollIntoViewIfNeeded();
  await page.screenshot({
    path: ".verification/database-settings-compact.png",
  });
  await page.getByRole("button", { name: "Save project", exact: true }).click();
  await page.reload();
  await settings();
  await expect(engine).toHaveValue("postgresql");
  await expect(
    page.getByLabel("Store application data", { exact: true }),
  ).toHaveValue("remote");
  await expect(
    page.getByLabel("Connection environment variable", { exact: true }),
  ).toHaveValue("HOSTED_DATABASE_URL");
});
