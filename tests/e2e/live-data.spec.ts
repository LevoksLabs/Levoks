import { test, expect, type Page } from "@playwright/test";
import { mkdir, readFile } from "node:fs/promises";
import JSZip from "jszip";
import { openEditor } from "../helpers/open-editor";
import { liveDataFixture } from "../helpers/live-data-fixture";
import { compileProject } from "../../src/lib/project/compiler";
import type { PreviewState } from "../../src/lib/project/fullstack-preview";

async function importProject(page: Page, project: unknown) {
  await openEditor(page);
  await page
    .getByRole("button", { name: "Untitled project", exact: true })
    .click();
  const dialog = page.getByRole("dialog", { name: "Levoks project workspace" });
  await dialog.locator('input[type="file"]').setInputFiles({
    name: "records.json",
    mimeType: "application/json",
    buffer: Buffer.from(JSON.stringify(project)),
  });
  await expect(dialog.getByLabel("Project name", { exact: true })).toHaveValue(
    "Canvas application (import)",
  );
  await dialog.getByRole("button", { name: "Close workspace" }).click();
}
async function selectLayer(page: Page, name: string) {
  if (!(await page.locator(".layers-panel").isVisible()))
    await page.getByRole("button", { name: "Layers", exact: true }).click();
  await page
    .locator(".layer-name")
    .filter({ hasText: new RegExp(`^${name}$`) })
    .click();
  await page.getByRole("button", { name: "Content", exact: true }).click();
}
async function startPreview(page: Page) {
  await page.getByRole("button", { name: "Preview", exact: true }).click();
  await page.getByLabel("Preview mode").selectOption("fullstack");
  const response = page.waitForResponse(
    (r) => r.request().method() === "POST" && r.url().endsWith("/api/preview"),
  );
  await page
    .getByRole("button", { name: "Start full-stack preview", exact: true })
    .click();
  const r = await response;
  expect(r.status(), await r.text()).toBe(202);
  let state: PreviewState = await r.json();
  await expect
    .poll(
      async () => {
        state = await (
          await page.request.get(`/api/preview?id=${state.id}`)
        ).json();
        if (state.phase === "failed") throw new Error(state.message);
        return state.phase;
      },
      { timeout: 180000 },
    )
    .toBe("ready");
  await expect(
    page.locator('iframe[title="Full-stack application preview"]'),
  ).toBeVisible();
  return state;
}

test("an orphaned record field can be repaired from the inspector after moving it out of a template", async ({
  page,
}) => {
  const { project } = liveDataFixture(true);
  const child = project.editor.elementsById.repeater_title;
  child.parentId = null;
  child.layout = { ...child.layout, x: 20, y: 280, position: "absolute" };
  project.editor.elementsById.repeater_card.children =
    project.editor.elementsById.repeater_card.children.filter(
      (id) => id !== child.id,
    );
  project.editor.pageElementMap[project.editor.activePageId].push(child.id);
  project.editor.rootIds = [
    ...project.editor.pageElementMap[project.editor.activePageId],
  ];
  await importProject(page, project);
  await selectLayer(page, "Repeater title");
  await expect(
    page
      .getByRole("alert")
      .filter({ hasText: "This field has no live record source" }),
  ).toBeVisible();
  await page.getByLabel("Record field", { exact: true }).selectOption("");
  await expect(
    page
      .getByRole("alert")
      .filter({ hasText: "This field has no live record source" }),
  ).toHaveCount(0);
  await page.getByRole("button", { name: "Undo", exact: true }).first().click();
  await expect(page.getByLabel("Record field", { exact: true })).toHaveValue(
    "field_title",
  );
  await page.getByLabel("Record field", { exact: true }).selectOption("");
  await page.getByRole("button", { name: "Save project", exact: true }).click();
  await page.reload();
  await selectLayer(page, "Repeater title");
  await expect(page.getByLabel("Record field", { exact: true })).toHaveCount(0);
});

test("dragged table and nested collection/repeater bindings survive history/save/export and read actual paginated records", async ({
  page,
}) => {
  test.setTimeout(300000);
  page.setDefaultTimeout(20000);
  const fixture = liveDataFixture();
  await importProject(page, fixture.project);
  await page
    .getByRole("textbox", { name: "Search elements", exact: true })
    .fill("Table");
  const tile = page.getByRole("button", { name: "Add Table", exact: true }),
    bounds = await page.locator(".canvas-page").boundingBox();
  await tile.hover();
  await page.mouse.down();
  await page.mouse.move(bounds!.x + 220, bounds!.y + 220, { steps: 15 });
  await page.mouse.up();
  await expect(page.locator(".canvas-page table")).toHaveCount(1);
  await page.getByRole("button", { name: "Content", exact: true }).click();
  const source = `${fixture.serviceId}/${fixture.endpointId}`;
  await page.getByLabel("Record source", { exact: true }).selectOption(source);
  await expect(
    page.getByLabel("Column 1 heading", { exact: true }),
  ).toHaveValue("title");
  await page.keyboard.press("Control+z");
  await expect(page.getByLabel("Record source", { exact: true })).toHaveValue(
    "",
  );
  await page.keyboard.press("Control+Shift+z");
  await expect(page.getByLabel("Record source", { exact: true })).toHaveValue(
    source,
  );
  await page.getByLabel("Column 1 heading", { exact: true }).fill("Entry name");
  await page
    .getByRole("button", { name: "Move column 3 earlier", exact: true })
    .click();
  await expect(
    page.getByLabel("Column 2 heading", { exact: true }),
  ).toHaveValue("active");
  await page
    .getByLabel("Empty records message", { exact: true })
    .fill("No entries yet.");
  await mkdir(".verification/live-data", { recursive: true });
  await page.screenshot({ path: ".verification/live-data/inspector.png" });
  for (const [name, field] of [
    ["Entry repeater", ""],
    ["Repeater title", "field_title"],
    ["Repeater quantity", "field_quantity"],
    ["Entry collection", ""],
    ["Collection title", "field_title"],
  ]) {
    await selectLayer(page, name);
    await page
      .getByLabel(field ? "Record field" : "Record source", { exact: true })
      .selectOption(field || source);
  }
  await selectLayer(page, "Entry collection");
  await page
    .getByRole("button", { name: "Disconnect live records", exact: true })
    .click();
  await page.keyboard.press("Control+z");
  await selectLayer(page, "Collection title");
  await expect(page.getByLabel("Record field", { exact: true })).toHaveValue(
    "field_title",
  );
  await page.getByRole("button", { name: "Save project", exact: true }).click();
  await page.reload();
  await selectLayer(page, "Collection title");
  await expect(page.getByLabel("Record field", { exact: true })).toHaveValue(
    "field_title",
  );
  await page.getByLabel("Deploy options", { exact: true }).click();
  const download = page.waitForEvent("download");
  await page
    .getByRole("button", { name: "Download application ZIP", exact: true })
    .click();
  await (await download).saveAs(".verification/live-data-export.zip");
  const zip = await JSZip.loadAsync(
    await readFile(".verification/live-data-export.zip"),
  );
  const project = JSON.parse(
    await zip.file("levoks.project.json")!.async("string"),
  );
  const expected = compileProject(project).files;
  for (const [file, content] of Object.entries(expected))
    expect(await zip.file(file)!.async("string"), file).toBe(content);
  const table = Object.values(project.editor.elementsById).find(
    (n: unknown) => (n as { definitionId: string }).definitionId === "table",
  ) as { id: string; dataSource: { columns: { label: string }[] } };
  expect(table.dataSource.columns.map((c) => c.label)).toEqual([
    "Entry name",
    "active",
    "quantity",
  ]);
  await page.keyboard.press("Escape");
  const run = await startPreview(page),
    frame = page.frameLocator('iframe[title="Full-stack application preview"]');
  const tableView = frame.locator(`.el-${table.id}`),
    repeater = frame.locator(".el-live_repeater"),
    collection = frame.locator(".el-live_collection");
  await expect(
    tableView.getByText("No entries yet.", { exact: true }),
  ).toBeVisible();
  const names = [
    "<img src=x onerror=alert(1)> & entry",
    "Second entry",
    "Third entry",
  ];
  for (const [index, name] of names.entries()) {
    await frame.getByPlaceholder("Entry title", { exact: true }).fill(name);
    await frame
      .getByPlaceholder("Quantity", { exact: true })
      .fill(String(index));
    const result = page.waitForResponse(
      (r) =>
        r.request().method() === "POST" &&
        r.url().includes(`/__levoks/api/`) &&
        r.url().endsWith("/entries"),
    );
    await frame
      .getByRole("button", { name: "Save entry", exact: true })
      .click();
    expect((await result).status()).toBe(200);
    await expect(tableView.locator("tbody tr")).toHaveCount(
      Math.min(index + 1, 2),
    );
  }
  await expect(tableView.getByText(names[0], { exact: true })).toBeVisible();
  await expect(tableView.locator("img")).toHaveCount(0);
  await expect(tableView.locator("tbody tr").first().locator("td")).toHaveText([
    names[0],
    "false",
    "0",
  ]);
  await expect(repeater.locator("article")).toHaveCount(2);
  await expect(repeater.getByText(names[0], { exact: true })).toBeVisible();
  await expect(collection.getByText(names[0], { exact: true })).toBeVisible();
  await tableView
    .getByRole("button", { name: "Next page", exact: true })
    .click();
  await expect(tableView.locator("tbody tr")).toHaveCount(1);
  await expect(
    tableView.getByText("Third entry", { exact: true }),
  ).toBeVisible();
  await expect(
    tableView.getByRole("button", { name: "Next page", exact: true }),
  ).toBeDisabled();
  await expect(repeater.locator("article")).toHaveCount(2);
  await page.route(`**/__levoks/api/*/entries?*`, (route) =>
    route.fulfill({
      status: 503,
      contentType: "application/json",
      body: '{"error":"temporary test outage"}',
    }),
  );
  await tableView
    .getByRole("button", { name: "Refresh records", exact: true })
    .click();
  await expect(tableView.getByRole("alert")).toHaveText(
    "Records could not be loaded. Please retry.",
  );
  await expect(tableView.locator("tbody tr")).toHaveCount(0);
  await page.unroute(`**/__levoks/api/*/entries?*`);
  await tableView
    .getByRole("button", { name: "Retry loading records", exact: true })
    .click();
  await expect(
    tableView.getByText("Third entry", { exact: true }),
  ).toBeVisible();
  await page.getByLabel("Preview breakpoint").selectOption("mobile");
  await expect(
    tableView.getByText("Third entry", { exact: true }),
  ).toBeVisible();
  const boundsCheck = await tableView
    .locator(".live-records-table")
    .evaluate((el) => ({
      width: el.getBoundingClientRect().width,
      viewport: innerWidth,
      scroll: document.documentElement.scrollWidth,
    }));
  expect(boundsCheck.width).toBeLessThanOrEqual(boundsCheck.viewport);
  expect(boundsCheck.scroll).toBeLessThanOrEqual(boundsCheck.viewport);
  await page.screenshot({ path: ".verification/live-data/mobile.png" });
  await page.getByRole("button", { name: "Stop preview", exact: true }).click();
  await expect
    .poll(async () =>
      (await page.request.get(`/api/preview?id=${run.id}`)).status(),
    )
    .toBe(404);
});

test("live canvas widgets preserve private inbox authorization and discard records after access is revoked", async ({
  page,
}) => {
  test.setTimeout(300000);
  page.setDefaultTimeout(20000);
  const fixture = liveDataFixture(true, true);
  await importProject(page, fixture.project);
  const run = await startPreview(page),
    frame = page.frameLocator('iframe[title="Full-stack application preview"]');
  const table = frame.locator(".el-live_table");
  await expect(table.getByRole("alert")).toHaveText(
    "Sign in to view these records.",
  );
  await expect(table.locator("tbody tr")).toHaveCount(0);
  const operator = run.accounts.find((a) => a.setupCode)!;
  const identityPath = operator.path;
  const runtime = JSON.parse(
    await readFile(`.levoks-preview/sessions/${run.id}/runtime.json`, "utf8"),
  );
  const identity = runtime.services.find(
    (s: { setupCode: string }) => !!s.setupCode,
  );
  const resource = runtime.services.find(
    (s: { id: string }) => s.id === fixture.serviceId,
  );
  const api = (port: number, path: string) =>
    run.origin + `/__levoks/api/${port}${path}`;
  const submit = await page.request.post(api(resource.port, "/entries"), {
    headers: { Origin: run.origin! },
    data: { title: "Private record", quantity: 0, active: false },
  });
  expect(submit.status()).toBe(200);
  const user = {
    email: "reader@preview.test",
    name: "Record operator",
    password: "preview-password-123",
  };
  const regular = { ...user, email: "ordinary@preview.test" };
  expect(
    (
      await page.request.post(api(identity.port, "/api/auth/register"), {
        headers: { Origin: run.origin! },
        data: regular,
      })
    ).status(),
  ).toBe(201);
  expect(
    (
      await page.request.post(api(identity.port, "/api/auth/login"), {
        headers: { Origin: run.origin! },
        data: regular,
      })
    ).status(),
  ).toBe(200);
  await table
    .getByRole("button", { name: "Retry loading records", exact: true })
    .click();
  await expect(table.getByRole("alert")).toHaveText(
    "This account cannot view these records.",
  );
  await expect(table.locator("tbody tr")).toHaveCount(0);
  expect(
    (
      await page.request.post(api(identity.port, "/api/auth/logout-all"), {
        headers: { Origin: run.origin! },
        data: {},
      })
    ).status(),
  ).toBe(204);
  expect(
    (
      await page.request.post(api(identity.port, "/api/auth/operator-setup"), {
        headers: { Origin: run.origin! },
        data: { ...user, setupCode: operator.setupCode },
      })
    ).status(),
  ).toBe(201);
  expect(
    (
      await page.request.post(api(identity.port, "/api/auth/login"), {
        headers: { Origin: run.origin! },
        data: user,
      })
    ).status(),
  ).toBe(200);
  await table
    .getByRole("button", { name: "Retry loading records", exact: true })
    .click();
  await expect(
    table.getByText("Private record", { exact: true }),
  ).toBeVisible();
  expect(identityPath).toContain("operators");
  expect(
    (
      await page.request.post(api(identity.port, "/api/auth/logout-all"), {
        headers: { Origin: run.origin! },
        data: {},
      })
    ).status(),
  ).toBe(204);
  await table
    .getByRole("button", { name: "Refresh records", exact: true })
    .click();
  await expect(table.getByRole("alert")).toHaveText(
    "Sign in to view these records.",
  );
  await expect(table.locator("tbody tr")).toHaveCount(0);
  await page.getByRole("button", { name: "Stop preview", exact: true }).click();
});
