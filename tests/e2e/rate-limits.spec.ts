import { test, expect } from "@playwright/test";
import { emptyProject } from "../../src/lib/project/workspace";
import { programFixture, block } from "../helpers/program-fixture";

test("rate limit scope and endpoint attachment survive history, save and generated source", async ({
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
  const project = emptyProject("Endpoint limits");
  const service = {
    ...programFixture(),
    blocks: [
      block("limit", "middleware", { middlewareType: "rateLimit" }),
      block("endpoint", "rest_endpoint", {
        route: "/report",
        authRequired: true,
      }),
    ],
  };
  await workspace.locator('input[type="file"]').setInputFiles({
    name: "limits.json",
    mimeType: "application/json",
    buffer: Buffer.from(
      JSON.stringify({
        ...project,
        backend: { ...project.backend, services: [service] },
      }),
    ),
  });
  await expect(
    workspace.getByLabel("Project name", { exact: true }),
  ).toHaveValue("Endpoint limits (import)");
  await workspace.getByRole("button", { name: "Close workspace" }).click();
  await page.getByRole("button", { name: "Backend", exact: true }).click();
  await page
    .getByRole("button", { name: "Configure limit", exact: true })
    .click();
  await page
    .getByLabel("Rate limit scope", { exact: true })
    .selectOption("endpoints");
  await page
    .getByLabel("Rate limit client identity", { exact: true })
    .selectOption("identity");
  await page
    .getByLabel("Rate limit counter storage", { exact: true })
    .selectOption("mongodb");
  await page
    .getByLabel("Rate limit maximum requests", { exact: true })
    .fill("7");
  await page.getByLabel("Rate limit window minutes", { exact: true }).fill("2");
  await page
    .getByLabel("Rate limit response message", { exact: true })
    .fill("Report quota exceeded");
  await page.screenshot({ path: ".verification/rate-limit-inspector.png" });
  await page
    .getByRole("button", { name: "Configure endpoint", exact: true })
    .click();
  await page.getByLabel("Apply limit", { exact: true }).check();
  await page.getByRole("button", { name: "Undo", exact: true }).click();
  await expect(
    page.getByLabel("Apply limit", { exact: true }),
  ).not.toBeChecked();
  await page.getByRole("button", { name: "Redo", exact: true }).click();
  await page.getByRole("button", { name: "Save project", exact: true }).click();
  await page.reload();
  await page.getByRole("button", { name: "Backend", exact: true }).click();
  await page
    .getByRole("button", { name: "Configure endpoint", exact: true })
    .click();
  await expect(page.getByLabel("Apply limit", { exact: true })).toBeChecked();
  await page
    .getByRole("button", { name: "Configure limit", exact: true })
    .getByRole("button", { name: "Remove block", exact: true })
    .click();
  await expect(page.getByLabel("Apply limit", { exact: true })).toHaveCount(0);
  await page.getByRole("button", { name: "Undo", exact: true }).click();
  await page
    .getByRole("button", { name: "Configure endpoint", exact: true })
    .click();
  await expect(page.getByLabel("Apply limit", { exact: true })).toBeChecked();
  await page
    .getByRole("banner")
    .getByRole("button", { name: "Code", exact: true })
    .click();
  const file = "backend/workflow-service/middleware/rate-limits.js";
  await workspace
    .getByLabel("Filter source files", { exact: true })
    .fill("rate-limits.js");
  await workspace.getByRole("button", { name: file, exact: true }).click();
  const source = await workspace
    .getByRole("textbox", { name: `Source code for ${file}`, exact: true })
    .inputValue();
  expect(source).toContain('"scope":"endpoints","windowMs":120000,"limit":7');
  expect(source).toContain("Report quota exceeded");
  expect(source).toContain('"storage":"mongodb"');
  expect(source).toContain('"strategy":"identity"');
});
