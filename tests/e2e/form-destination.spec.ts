import { test, expect } from "@playwright/test";
import { mkdir, readFile } from "node:fs/promises";
import JSZip from "jszip";
import { openEditor } from "../helpers/open-editor";
import { mappedLoginFixture } from "../helpers/mapped-login-fixture";

test("dragged form connects to private submission storage, survives history/reload and exports the real app", async ({
  page,
}) => {
  await openEditor(page);
  await page
    .getByRole("textbox", { name: "Search elements", exact: true })
    .fill("Form");
  const tile = page.getByRole("button", { name: "Add Form", exact: true });
  const bounds = await page.locator(".canvas-page").boundingBox();
  await tile.hover();
  await page.mouse.down();
  await page.mouse.move(bounds!.x + 220, bounds!.y + 180, { steps: 15 });
  await page.mouse.up();
  await expect(page.locator(".canvas-page form")).toHaveCount(1);
  await page.getByRole("button", { name: "Content", exact: true }).click();
  await page
    .getByLabel("Collection name", { exact: true })
    .fill("Website leads");
  await page
    .getByLabel("Success message", { exact: true })
    .fill("Thank you. Your enquiry has been saved.");
  await page
    .getByLabel("Clear fields after a successful save", { exact: true })
    .check();
  await page
    .getByRole("button", { name: "Create collection and connect", exact: true })
    .click();
  await expect(
    page.getByRole("status").filter({ hasText: "Connected to Website leads" }),
  ).toBeVisible();
  await page.keyboard.press("Control+z");
  await expect(
    page.getByRole("button", {
      name: "Create collection and connect",
      exact: true,
    }),
  ).toBeVisible();
  await page.keyboard.press("Control+Shift+z");
  await expect(
    page.getByRole("button", { name: "Disconnect form", exact: true }),
  ).toBeVisible();
  await page
    .getByRole("button", { name: "Disconnect form", exact: true })
    .click();
  await expect(
    page.getByRole("button", { name: "Disconnect form", exact: true }),
  ).toHaveCount(0);
  await page.keyboard.press("Control+z");
  await expect(
    page.getByRole("button", { name: "Disconnect form", exact: true }),
  ).toBeVisible();
  await page.getByRole("button", { name: "Save project", exact: true }).click();
  await page.reload();
  await expect(page.locator(".canvas-page form")).toHaveCount(1);
  // Select the form through its layer rather than selecting an input inside it.
  await page.getByRole("button", { name: "Layers", exact: true }).click();
  await page
    .locator(".layer-name")
    .filter({ hasText: /^Form$/ })
    .click();
  await page.getByRole("button", { name: "Content", exact: true }).click();
  await expect(page.getByLabel("Success message", { exact: true })).toHaveValue(
    "Thank you. Your enquiry has been saved.",
  );
  await expect(
    page.getByRole("status").filter({ hasText: "Connected to Website leads" }),
  ).toBeVisible();
  await mkdir(".verification/submissions", { recursive: true });
  await page.screenshot({
    path: ".verification/submissions/destination-desktop.png",
  });
  await page.setViewportSize({ width: 1024, height: 768 });
  await expect(
    page.getByLabel("Form destination", { exact: true }),
  ).toBeVisible();
  await page.screenshot({
    path: ".verification/submissions/destination-compact.png",
  });
  await page.setViewportSize({ width: 1600, height: 1000 });
  await page.getByRole("button", { name: "Preview", exact: true }).click();
  const frame = page.frameLocator('iframe[title="Generated frontend preview"]');
  await frame
    .getByPlaceholder("Your name", { exact: true })
    .fill("Preview visitor");
  await frame
    .getByPlaceholder("Your email", { exact: true })
    .fill("preview@example.test");
  await frame.getByRole("button", { name: "Submit", exact: true }).click();
  await expect(frame.getByRole("status")).toContainText(
    "No data was sent or saved",
  );
  await expect(
    frame.getByPlaceholder("Your name", { exact: true }),
  ).toHaveValue("Preview visitor");
  await page
    .locator("select")
    .filter({ has: page.locator('option[value="mobile"]') })
    .selectOption("mobile");
  await expect(
    frame.getByRole("button", { name: "Submit", exact: true }),
  ).toBeVisible();
  await page.screenshot({ path: ".verification/submissions/form-mobile.png" });
  await page
    .getByRole("button", { name: "Back To Editor", exact: true })
    .click();
  await page.getByLabel("Deploy options", { exact: true }).click();
  const pending = page.waitForEvent("download");
  await page
    .getByRole("button", { name: "Download application ZIP", exact: true })
    .click();
  await (await pending).saveAs(".verification/submissions-export.zip");
  const zip = await JSZip.loadAsync(
    await readFile(".verification/submissions-export.zip"),
  );
  const project = JSON.parse(
    await zip.file("levoks.project.json")!.async("string"),
  );
  expect(project.backend.services).toHaveLength(1);
  const blocks = project.backend.services[0].blocks;
  expect(
    blocks.filter((b: { type: string }) => b.type === "rest_endpoint"),
  ).toHaveLength(1);
  expect(
    blocks.find((b: { type: string }) => b.type === "rest_endpoint").config,
  ).toMatchObject({
    method: "POST",
    route: "/api/submissions",
    authRequired: false,
  });
  expect(project.routing.connections[0].requestMappings).toHaveLength(2);
  expect(await zip.file("frontend/app/page.jsx")!.async("string")).toContain(
    "Thank you. Your enquiry has been saved.",
  );
});

test("working contact template adds a complete undoable form without replacing existing content", async ({
  page,
}) => {
  await openEditor(page);
  await page
    .getByRole("textbox", { name: "Search elements", exact: true })
    .fill("Heading");
  await page
    .getByRole("button", { name: "Add Heading", exact: true })
    .dblclick();
  const heading = page.locator(
    ".canvas-page h1, .canvas-page h2, .canvas-page h3",
  );
  await expect(heading).toHaveCount(1);
  await page.getByRole("button", { name: "Templates", exact: true }).click();
  await page
    .getByRole("button", { name: "Add working contact form", exact: true })
    .click();
  await expect(page.locator(".canvas-page form")).toHaveCount(1);
  await expect(heading).toHaveCount(1);
  await page.getByRole("button", { name: "Content", exact: true }).click();
  await expect(
    page
      .getByRole("status")
      .filter({ hasText: "Connected to Contact submissions" }),
  ).toBeVisible();
  await page.keyboard.press("Control+z");
  await expect(page.locator(".canvas-page form")).toHaveCount(0);
  await expect(heading).toHaveCount(1);
  await page.keyboard.press("Control+Shift+z");
  await expect(page.locator(".canvas-page form")).toHaveCount(1);
  await page.getByRole("button", { name: "Save project", exact: true }).click();
  await page.reload();
  await expect(page.locator(".canvas-page form")).toHaveCount(1);
});

test("existing endpoint mappings remain editable with stable differently named inputs", async ({
  page,
}) => {
  const fixture = mappedLoginFixture();
  await page.goto("/");
  await page.locator('input[type="file"]').setInputFiles({
    name: "mapped.json",
    mimeType: "application/json",
    buffer: Buffer.from(JSON.stringify(fixture.project)),
  });
  await page
    .getByRole("link", {
      name: `Open ${fixture.project.name} (import)`,
      exact: true,
    })
    .click();
  await expect(
    page.getByRole("button", { name: "Save project", exact: true }),
  ).toBeEnabled();
  await page.getByRole("button", { name: "Layers", exact: true }).click();
  await page.getByRole("treeitem", { name: "Login", exact: true }).click();
  await page.getByRole("button", { name: "Content", exact: true }).click();
  await expect(
    page.getByLabel("Form value for body.email", { exact: true }),
  ).toHaveValue(fixture.email);
  await page
    .getByLabel("Form value for body.email", { exact: true })
    .selectOption("");
  await expect(
    page.getByRole("button", { name: "Apply form destination", exact: true }),
  ).toBeDisabled();
  await page
    .getByLabel("Form value for body.email", { exact: true })
    .selectOption(fixture.email);
  await page
    .getByRole("button", { name: "Apply form destination", exact: true })
    .click();
  await expect(
    page.getByRole("button", { name: "Apply form destination", exact: true }),
  ).toBeEnabled();
  await page.getByRole("button", { name: "Save project", exact: true }).click();
});
