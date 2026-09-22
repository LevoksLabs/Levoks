import { test, expect } from "@playwright/test";
import { emptyProject } from "../../src/lib/project/workspace";
import { programFixture } from "../helpers/program-fixture";

test("aggregate inspector configuration survives undo, reload and generated source", async ({
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
  const project = emptyProject("Aggregate report");
  await workspace
    .locator('input[type="file"]')
    .setInputFiles({
      name: "aggregate.json",
      mimeType: "application/json",
      buffer: Buffer.from(
        JSON.stringify({
          ...project,
          backend: { ...project.backend, services: [programFixture()] },
        }),
      ),
    });
  await expect(
    workspace.getByLabel("Project name", { exact: true }),
  ).toHaveValue("Aggregate report (import)");
  await workspace.getByRole("button", { name: "Close workspace" }).click();
  const selectQuery = async () => {
    await page.getByRole("button", { name: "Backend", exact: true }).click();
    await page
      .locator(".backend-block")
      .filter({
        has: page.locator(".backend-block-label", { hasText: /^list$/ }),
      })
      .click();
  };
  await selectQuery();
  await page.getByLabel("Operation", { exact: true }).selectOption("aggregate");
  await page
    .getByLabel("Aggregate group field", { exact: true })
    .selectOption("title");
  await page.getByRole("button", { name: "Undo", exact: true }).click();
  await expect(
    page.getByLabel("Aggregate group field", { exact: true }),
  ).toHaveValue("");
  await page.getByRole("button", { name: "Redo", exact: true }).click();
  await page.getByLabel("Metric 1 name", { exact: true }).fill("entries");
  await page.getByLabel("Maximum results", { exact: true }).fill("5");
  await page.getByRole("button", { name: "Save project", exact: true }).click();
  await page.reload();
  await selectQuery();
  await expect(
    page.getByLabel("Aggregate group field", { exact: true }),
  ).toHaveValue("title");
  await expect(page.getByLabel("Metric 1 name", { exact: true })).toHaveValue(
    "entries",
  );
  await page
    .getByRole("banner")
    .getByRole("button", { name: "Code", exact: true })
    .click();
  await workspace
    .getByLabel("Filter source files", { exact: true })
    .fill("workflow/program.json");
  const file = "backend/workflow-service/workflow/program.json";
  await workspace.getByRole("button", { name: file, exact: true }).click();
  const source = JSON.parse(
    await workspace
      .getByRole("textbox", { name: `Source code for ${file}`, exact: true })
      .inputValue(),
  );
  const query = source.blocks.find(
    (block: { id: string }) => block.id === "list",
  );
  expect(query.config.operation).toBe("aggregate");
  expect(query.config.limit).toBe(5);
  expect(query.config.aggregation).toEqual({
    groupBy: "title",
    metrics: [{ name: "entries", operation: "count", field: "" }],
  });
});
