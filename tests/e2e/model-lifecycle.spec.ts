import { test, expect } from "@playwright/test";
import { readFile } from "node:fs/promises";
import path from "node:path";
import JSZip from "jszip";
import { emptyProject } from "../../src/lib/project/workspace";
import { compileProject } from "../../src/lib/project/compiler";
import { modelLifecycleFixture } from "../helpers/model-lifecycle-fixture";

test("model defaults and deleted-record controls persist and reach the downloaded application", async ({
  page,
}) => {
  await page.goto("/");
  await expect(
    page.getByRole("button", { name: "Save project", exact: true }),
  ).toBeEnabled();
  await page
    .getByRole("button", { name: "Untitled project", exact: true })
    .click();
  const workspace = page.getByRole("dialog", {
    name: "Levoks project workspace",
  });
  const initial = emptyProject("Model lifecycle");
  await workspace
    .locator('input[type="file"]')
    .setInputFiles({
      name: "lifecycle.json",
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
  ).toHaveValue("Model lifecycle (import)");
  await workspace.getByRole("button", { name: "Close workspace" }).click();
  const select = async (id: string) => {
    await page.getByRole("button", { name: "Backend", exact: true }).click();
    await page
      .locator(".backend-block")
      .filter({
        has: page.locator(".backend-block-label", {
          hasText: new RegExp(`^${id}$`),
        }),
      })
      .click();
  };
  await select("model");
  await expect(
    page.getByLabel("Model soft delete", { exact: true }),
  ).toBeChecked();
  await page
    .getByText("Default for quantity: configured", { exact: true })
    .click();
  const quantity = page.getByLabel("Default value for quantity", {
    exact: true,
  });
  await quantity.fill("invalid");
  await expect(quantity).toHaveAttribute("aria-invalid", "true");
  await expect(
    page.locator(".bi-field-default").getByRole("alert"),
  ).toContainText("valid JSON");
  await quantity.fill("7");
  await expect(quantity).toHaveAttribute("aria-invalid", "false");
  await page.getByRole("button", { name: "Undo", exact: true }).click();
  await expect(quantity).toHaveValue("invalid");
  await page.getByRole("button", { name: "Redo", exact: true }).click();
  await expect(quantity).toHaveValue("7");
  await page.screenshot({ path: ".verification/model-defaults-desktop.png" });
  await page.setViewportSize({ width: 1024, height: 768 });
  await quantity.scrollIntoViewIfNeeded();
  await page.screenshot({ path: ".verification/model-defaults-compact.png" });
  await page.setViewportSize({ width: 1600, height: 1000 });
  await select("list");
  await page
    .getByLabel("Deleted records", { exact: true })
    .selectOption("only");
  await select("restore");
  await page.getByLabel("Operation", { exact: true }).selectOption("purge");
  await expect(page.locator(".backend-inspector")).toContainText("Permanently");
  await page.getByRole("button", { name: "Undo", exact: true }).click();
  await expect(page.getByLabel("Operation", { exact: true })).toHaveValue(
    "restore",
  );
  await page.getByRole("button", { name: "Save project", exact: true }).click();
  await page.reload();
  await select("list");
  await expect(page.getByLabel("Deleted records", { exact: true })).toHaveValue(
    "only",
  );
  await select("model");
  await page
    .getByText("Default for quantity: configured", { exact: true })
    .click();
  await expect(quantity).toHaveValue("7");
  await page.getByLabel("Deploy options", { exact: true }).click();
  const downloaded = page.waitForEvent("download");
  await page
    .getByRole("button", { name: "Download application ZIP", exact: true })
    .click();
  const destination = path.resolve(".verification/model-lifecycle-export.zip");
  await (await downloaded).saveAs(destination);
  const zip = await JSZip.loadAsync(await readFile(destination));
  const snapshot = JSON.parse(
    await zip.file("levoks.project.json")!.async("string"),
  );
  const output = compileProject(snapshot);
  expect(output.diagnostics.filter((d) => d.severity === "error")).toEqual([]);
  for (const [file, content] of Object.entries(output.files))
    expect(await zip.file(file)!.async("string"), file).toBe(content);
  expect(
    await zip.file("backend/workflow-service/models/Entry.js")!.async("string"),
  ).toContain("default: 7");
  const program = JSON.parse(
    await zip
      .file("backend/workflow-service/workflow/program.json")!
      .async("string"),
  );
  expect(
    program.blocks.find((b: { id: string }) => b.id === "list").config.deleted,
  ).toBe("only");
  expect(
    program.blocks.find((b: { id: string }) => b.id === "restore").config
      .operation,
  ).toBe("restore");
});
