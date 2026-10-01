import { test, expect } from "@playwright/test";
import { loginProject } from "../helpers/login-fixture";

test("legacy login expands into editable steps and inspector changes survive undo, save, reload and export", async ({
  page,
}) => {
  const project = loginProject();
  const service = project.backend.services[0];
  // Simulate a saved v1 identity service from before editable login existed.
  service.blocks = service.blocks.filter(
    (block) =>
      ![
        "credential_lookup",
        "password_verify",
        "session_issue",
        "response",
      ].includes(block.type) && block.label !== "Validate credentials",
  );
  service.blocks.forEach((block) => {
    block.connections = [];
  });
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
  await workspace
    .locator('input[type="file"]')
    .setInputFiles({
      name: "login.json",
      mimeType: "application/json",
      buffer: Buffer.from(JSON.stringify(project)),
    });
  await expect(
    workspace.getByLabel("Project name", { exact: true }),
  ).toHaveValue("Login workflow (import)");
  await workspace.getByRole("button", { name: "Close workspace" }).click();
  await page.getByRole("button", { name: "Backend", exact: true }).click();
  const select = (label: string) =>
    page
      .getByRole("button", { name: `Configure ${label}`, exact: true })
      .click();
  await select("Login");
  await page
    .getByRole("button", { name: "Make login workflow editable" })
    .click();
  await expect(
    page.getByRole("button", {
      name: "Configure Verify password",
      exact: true,
    }),
  ).toBeVisible();
  await page.getByRole("button", { name: "Undo", exact: true }).click();
  await expect(
    page.getByRole("button", {
      name: "Configure Verify password",
      exact: true,
    }),
  ).toHaveCount(0);
  await page.getByRole("button", { name: "Redo", exact: true }).click();
  await select("Find account");
  await page.getByLabel("Output name", { exact: true }).fill("publicAccount");
  await select("Verify password");
  const lookupId = await page
    .getByLabel("Account lookup", { exact: true })
    .inputValue();
  expect(lookupId).toBeTruthy();
  await expect(
    page.getByLabel("Password binding", { exact: true }),
  ).toHaveValue("$request.body.password");
  await page.getByRole("button", { name: "Save project", exact: true }).click();
  await page.reload();
  await page.getByRole("button", { name: "Backend", exact: true }).click();
  await select("Find account");
  await expect(page.getByLabel("Output name", { exact: true })).toHaveValue(
    "publicAccount",
  );
  await page
    .getByRole("banner")
    .getByRole("button", { name: "Code", exact: true })
    .click();
  await workspace
    .getByLabel("Filter source files", { exact: true })
    .fill("workflow/program.json");
  const file = "backend/auth-service/workflow/program.json";
  await workspace.getByRole("button", { name: file, exact: true }).click();
  const program = JSON.parse(
    await workspace
      .getByRole("textbox", { name: `Source code for ${file}`, exact: true })
      .inputValue(),
  );
  expect(
    program.blocks.find((block: { id: string }) => block.id === lookupId).config
      .output,
  ).toBe("publicAccount");
  expect(
    program.blocks.some(
      (block: { type: string }) => block.type === "session_issue",
    ),
  ).toBe(true);
  expect(program.blocks.every((block: object) => !("position" in block))).toBe(
    true,
  );
});
