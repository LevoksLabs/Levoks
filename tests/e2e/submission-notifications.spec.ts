import { test, expect } from "@playwright/test";
import { mkdir, readFile } from "node:fs/promises";
import JSZip from "jszip";
import { openEditor } from "../helpers/open-editor";
import { compileProject } from "../../src/lib/project/compiler";

test("dragged form enables durable submission alerts with undo, disable and save/reload", async ({
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
    .getByRole("button", { name: "Create collection and connect", exact: true })
    .click();
  await page
    .getByRole("button", { name: "Add private submission inbox", exact: true })
    .click();
  await expect(
    page.getByText("Private inbox:", { exact: false }),
  ).toBeVisible();
  await page.keyboard.press("Control+z");
  await expect(
    page.getByRole("button", {
      name: "Add private submission inbox",
      exact: true,
    }),
  ).toBeVisible();
  await page.keyboard.press("Control+Shift+z");
  await expect(
    page.getByText("Private inbox:", { exact: false }),
  ).toBeVisible();
  const alerts = page.getByLabel("Email alerts for new submissions", {
    exact: true,
  });
  await alerts.check();
  await expect(
    page.getByLabel("Email alert subject", { exact: true }),
  ).toBeVisible();
  await alerts.blur();
  await page.keyboard.press("Control+z");
  await expect(alerts).not.toBeChecked();
  await page.keyboard.press("Control+Shift+z");
  await expect(alerts).toBeChecked();
  await alerts.uncheck();
  await expect(
    page.getByRole("status").filter({ hasText: "Already queued alerts" }),
  ).toBeVisible();
  await alerts.check();
  await page
    .getByLabel("Email alert subject", { exact: true })
    .fill("New website enquiry");
  await page.getByRole("button", { name: "Save project", exact: true }).click();
  await page.reload();
  await page.getByRole("button", { name: "Layers", exact: true }).click();
  await page
    .locator(".layer-name")
    .filter({ hasText: /^Form$/ })
    .click();
  await page.getByRole("button", { name: "Content", exact: true }).click();
  await expect(
    page.getByText("Private inbox:", { exact: false }),
  ).toBeVisible();
  await mkdir(".verification/notifications", { recursive: true });
  await page
    .getByText("Private inbox:", { exact: false })
    .scrollIntoViewIfNeeded();
  await page.screenshot({
    path: ".verification/notifications/editor-desktop.png",
  });
  await page.setViewportSize({ width: 1024, height: 768 });
  await expect(
    page.getByText("Private inbox:", { exact: false }),
  ).toBeVisible();
  await page.screenshot({
    path: ".verification/notifications/editor-compact.png",
  });
  await page.setViewportSize({ width: 1600, height: 1000 });
  await page.getByRole("button", { name: "Backend", exact: true }).click();
  await page
    .locator(".backend-hierarchy .bh-block-name")
    .getByText("Submission email alerts", { exact: true })
    .click();
  await expect(
    page.getByLabel("Email alerts for new submissions", { exact: true }),
  ).toBeChecked();
  await expect(page.getByLabel("Email subject", { exact: true })).toHaveValue(
    "New website enquiry",
  );
  const inboxSelection = page.getByLabel("Private inbox endpoint", {
    exact: true,
  });
  const selectedInbox = await inboxSelection.inputValue();
  await inboxSelection.selectOption("");
  await page.getByRole("button", { name: "Undo", exact: true }).click();
  await expect(inboxSelection).toHaveValue(selectedInbox);
  await page.screenshot({
    path: ".verification/notifications/inspector-desktop.png",
  });
  await page.setViewportSize({ width: 1024, height: 768 });
  await page.getByLabel("Email subject", { exact: true }).focus();
  await page.screenshot({
    path: ".verification/notifications/inspector-compact.png",
  });
  await page.setViewportSize({ width: 1600, height: 1000 });
  await page.getByLabel("Deploy options", { exact: true }).click();
  const download = page.waitForEvent("download");
  await page
    .getByRole("button", { name: "Download application ZIP", exact: true })
    .click();
  await (await download).saveAs(".verification/notifications-export.zip");
  const zip = await JSZip.loadAsync(
    await readFile(".verification/notifications-export.zip"),
  );
  const project = JSON.parse(
    await zip.file("levoks.project.json")!.async("string"),
  );
  const compiled = compileProject(project);
  expect(compiled.diagnostics.filter((d) => d.severity === "error")).toEqual(
    [],
  );
  for (const [file, content] of Object.entries(compiled.files))
    expect(await zip.file(file)!.async("string"), file).toBe(content);
  expect(project.backend.services).toHaveLength(2);
  const configs = project.backend.services[0].blocks.filter(
    (b: { type: string }) => b.type === "submission_notification",
  );
  expect(configs).toHaveLength(1);
  expect(configs[0].config).toMatchObject({
    enabled: true,
    subject: "New website enquiry",
  });
  expect(
    zip.file("backend/website-leads/workers/submission-email.js"),
  ).toBeTruthy();
  expect(zip.file("NOTIFICATIONS.md")).toBeTruthy();
  expect(
    await zip.file("backend/website-leads/.env.example")!.async("string"),
  ).not.toContain("RESEND_API_KEY");
  const inbox = project.backend.services[0].blocks.find(
    (b: { config: { view: string } }) => b.config.view === "submissionInbox",
  );
  expect(inbox.config).toMatchObject({ method: "GET", authRequired: true });
  expect(
    zip.file(
      `frontend/app/%5F%5Flevoks/inbox/website-leads/${inbox.id}/page.jsx`,
    ),
  ).toBeTruthy();
  expect(await zip.file("SUBMISSIONS.md")!.async("string")).toContain(
    "Remove the setup code",
  );
  expect(
    await zip
      .file("backend/website-leads-operators/.env.example")!
      .async("string"),
  ).toContain("OPERATOR_SETUP_TOKEN=\n");
  expect(JSON.stringify(project)).not.toContain("OPERATOR_SETUP_TOKEN");
});
