import { test, expect } from "@playwright/test";
import { mappedLoginFixture } from "../helpers/mapped-login-fixture";
test("routing contract inspector persists field identities and failure behavior through undo and reload", async ({
  page,
}) => {
  const { project, email } = mappedLoginFixture();
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
  await workspace.locator('input[type="file"]').setInputFiles({
    name: "mapped.json",
    mimeType: "application/json",
    buffer: Buffer.from(JSON.stringify(project)),
  });
  await expect(
    workspace.getByLabel("Project name", { exact: true }),
  ).toHaveValue("Login workflow (import)");
  await workspace.getByRole("button", { name: "Close workspace" }).click();
  await page.getByRole("button", { name: "Routes", exact: true }).click();
  const wire = page.getByRole("button", {
    name: "Select connection login_wire",
    exact: true,
  });
  await wire.focus();
  await wire.press("Enter");
  await expect(page.getByLabel("Source for body.email")).toHaveValue(
    `element:${email}`,
  );
  await page
    .getByLabel("Failure message", { exact: true })
    .fill("Unable to sign in");
  await page.getByRole("button", { name: "Undo", exact: true }).click();
  await expect(page.getByLabel("Failure message", { exact: true })).toHaveValue(
    "",
  );
  await page.getByRole("button", { name: "Redo", exact: true }).click();
  await expect(page.getByLabel("Failure message", { exact: true })).toHaveValue(
    "Unable to sign in",
  );
  await page.screenshot({
    path: ".verification/routing-contract-inspector.png",
  });
  await page.getByRole("button", { name: "Save project", exact: true }).click();
  await page.reload();
  await page.getByRole("button", { name: "Routes", exact: true }).click();
  await wire.focus();
  await wire.press("Enter");
  await expect(page.getByLabel("Source for body.email")).toHaveValue(
    `element:${email}`,
  );
  await expect(page.getByLabel("Failure message", { exact: true })).toHaveValue(
    "Unable to sign in",
  );
});
