import { test, expect } from "@playwright/test";
import { access, readFile, mkdir } from "node:fs/promises";
import path from "node:path";
import { openEditor } from "../helpers/open-editor";
import { emptyProject } from "../../src/lib/project/workspace";
import { canvasAppFixture } from "../helpers/canvas-app-fixture";
import type { PreviewState } from "../../src/lib/project/fullstack-preview";

const editorOrigin = "http://127.0.0.1:3200";
test("dragged form runs actual APIs, operator login, private inbox and captured email inside editor; stop and rebuild discard data", async ({
  page,
  browser,
}, info) => {
  test.setTimeout(300000);
  page.setDefaultTimeout(20000);
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
  await page
    .getByLabel("Email alerts for new submissions", { exact: true })
    .check();
  await page
    .getByLabel("Email alert subject", { exact: true })
    .fill("Preview website enquiry");
  await page.getByRole("button", { name: "Preview", exact: true }).click();
  await page.getByLabel("Preview mode").selectOption("fullstack");
  const panel = page.getByRole("region", {
    name: "Full-stack preview",
    exact: true,
  });
  const frame = page.frameLocator(
    'iframe[title="Full-stack application preview"]',
  );
  let run: PreviewState | undefined;
  const start = async () => {
    const response = page.waitForResponse(
      (r) =>
        r.request().method() === "POST" && r.url().endsWith("/api/preview"),
    );
    await panel
      .getByRole("button", {
        name: run ? "Rebuild with latest changes" : "Start full-stack preview",
        exact: true,
      })
      .click();
    const r = await response;
    expect(r.status(), await r.text()).toBe(202);
    run = await r.json();
    await expect
      .poll(
        async () => {
          const r = await page.request.get(`/api/preview?id=${run!.id}`);
          run = await r.json();
          if (run!.phase === "failed") {
            const logs = await readFile(
              path.resolve(".levoks-preview/sessions", run!.id, "runtime.log"),
              "utf8",
            ).catch(() => "No runtime log");
            throw new Error(run!.message + "\n" + logs);
          }
          return run!.phase;
        },
        { timeout: 180000, intervals: [1000, 2000] },
      )
      .toBe("ready");
    await expect(panel.getByRole("status")).toContainText("ready");
  };
  const stop = async () => {
    const id = run!.id,
      origin = run!.origin!;
    const plan = JSON.parse(
      await readFile(
        path.resolve(".levoks-preview/sessions", id, "runtime.json"),
        "utf8",
      ),
    );
    await panel
      .getByRole("button", { name: "Stop preview", exact: true })
      .click();
    await expect(
      panel.getByRole("button", {
        name: "Start full-stack preview",
        exact: true,
      }),
    ).toBeEnabled();
    expect((await page.request.get(`/api/preview?id=${id}`)).status()).toBe(
      404,
    );
    await expect
      .poll(() =>
        access(path.resolve(".levoks-preview/sessions", id)).then(
          () => true,
          () => false,
        ),
      )
      .toBe(false);
    await expect
      .poll(() =>
        fetch(origin, { signal: AbortSignal.timeout(1000) }).then(
          () => true,
          () => false,
        ),
      )
      .toBe(false);
    run = undefined;
    for (const service of plan.services) {
      await expect
        .poll(() =>
          fetch(`http://127.0.0.1:${service.port}/health`, {
            signal: AbortSignal.timeout(1000),
          }).then(
            () => true,
            () => false,
          ),
        )
        .toBe(false);
    }
  };
  const enroll = async () => {
    await frame
      .getByRole("link", { name: "Sign in or set up operator", exact: true })
      .click();
    await panel.getByText("Test operator setup codes", { exact: true }).click();
    const setupCode = await panel
      .getByLabel("Website leads operators preview setup code", { exact: true })
      .inputValue();
    await frame
      .getByRole("button", { name: "Set up first operator", exact: true })
      .click();
    await frame
      .getByLabel("Email address", { exact: true })
      .fill("operator@example.test");
    await frame.getByLabel("Name", { exact: true }).fill("Preview operator");
    await frame
      .getByLabel("Password", { exact: true })
      .fill("Preview password 123!");
    await frame.getByLabel("Setup code", { exact: true }).fill(setupCode);
    await frame
      .getByRole("button", { name: "Create first operator", exact: true })
      .click();
    await expect(frame.getByRole("status")).toContainText(
      "Operator account created",
    );
    await frame
      .getByLabel("Password", { exact: true })
      .fill("Preview password 123!");
    await frame
      .getByRole("button", { name: "Sign in to account", exact: true })
      .click();
    await expect(
      frame.getByRole("heading", { name: "Welcome, Preview operator" }),
    ).toBeVisible();
  };
  try {
    await start();
    const firstOrigin = run!.origin!;
    const iframe = panel.locator("iframe");
    await expect(iframe).toHaveAttribute(
      "sandbox",
      "allow-scripts allow-forms allow-same-origin",
    );
    expect(new URL(firstOrigin).port).not.toBe("3200");
    const visitor = await browser.newContext();
    expect(
      (await visitor.request.get(editorOrigin + "/api/preview")).status(),
    ).toBe(200);
    expect(
      (
        await visitor.request.get(editorOrigin + `/api/preview?id=${run!.id}`)
      ).status(),
    ).toBe(404);
    expect(
      (
        await visitor.request.delete(editorOrigin + "/api/preview", {
          data: { id: run!.id },
          headers: { Origin: editorOrigin },
        })
      ).status(),
    ).toBe(404);
    await visitor.close();
    expect(
      (
        await page.request.delete("/api/preview", {
          data: { id: run!.id },
          headers: { Origin: "https://hostile.test" },
        })
      ).status(),
    ).toBe(403);
    await frame
      .getByPlaceholder("Your name", { exact: true })
      .fill("Private preview visitor");
    expect(
      await frame.locator("body").evaluate(() => {
        try {
          return Boolean(window.parent.document.body);
        } catch {
          return false;
        }
      }),
    ).toBe(false);
    await frame
      .getByPlaceholder("Your email", { exact: true })
      .fill("preview-visitor@example.test");
    const saved = page.waitForResponse(
      (r) =>
        r.url().includes("/__levoks/api/") &&
        r.url().endsWith("/api/submissions"),
    );
    await frame.getByRole("button", { name: "Submit", exact: true }).click();
    expect((await saved).status()).toBe(201);
    await expect
      .poll(
        async () =>
          (await (await page.request.get(`/api/preview?id=${run!.id}`)).json())
            .emails.length,
        { timeout: 30000 },
      )
      .toBe(1);
    const state: PreviewState = await (
      await page.request.get(`/api/preview?id=${run!.id}`)
    ).json();
    expect(state.emails[0].subject).toBe("Preview website enquiry");
    expect(state.emails[0].text).toContain(firstOrigin + state.inboxes[0].path);
    expect(JSON.stringify(state.emails)).not.toContain(
      "Private preview visitor",
    );
    await panel
      .getByRole("button", { name: "Website leads inbox", exact: true })
      .click();
    await expect(frame.locator("main").getByRole("alert")).toContainText(
      "Sign in",
    );
    await enroll();
    await panel
      .getByRole("button", { name: "Reload page", exact: true })
      .click();
    await expect(
      frame.getByRole("heading", { name: "Welcome, Preview operator" }),
    ).toBeVisible();
    await panel
      .getByRole("button", { name: "Website leads inbox", exact: true })
      .click();
    await expect(
      frame.getByText("Private preview visitor", { exact: true }),
    ).toBeVisible();
    await panel
      .getByRole("button", { name: "Reload page", exact: true })
      .click();
    await expect(
      frame.getByText("Private preview visitor", { exact: true }),
    ).toBeVisible();
    await mkdir(".verification/fullstack-preview", { recursive: true });
    await panel.getByText("Test operator setup codes", { exact: true }).click();
    await page.screenshot({
      path: ".verification/fullstack-preview/desktop.png",
    });
    await page.getByLabel("Preview breakpoint").selectOption("mobile");
    await expect(
      frame.getByText("Private preview visitor", { exact: true }),
    ).toBeVisible();
    expect(
      await iframe.evaluate((el) => el.getBoundingClientRect().width),
    ).toBeLessThanOrEqual(420);
    await page.screenshot({
      path: ".verification/fullstack-preview/mobile.png",
    });
    await start();
    expect(run!.origin).not.toBe(firstOrigin);
    expect(run!.emails).toHaveLength(0);
    await panel
      .getByRole("button", { name: "Website leads inbox", exact: true })
      .click();
    await expect(frame.locator("main").getByRole("alert")).toContainText(
      "Sign in",
    );
    await enroll();
    await panel
      .getByRole("button", { name: "Website leads inbox", exact: true })
      .click();
    await expect(frame.getByRole("status")).toContainText(
      "No submissions on this page.",
    );
    await stop();
  } finally {
    if (run) {
      const logs = await readFile(
        path.resolve(".levoks-preview/sessions", run.id, "runtime.log"),
        "utf8",
      ).catch(() => "No runtime log");
      await info.attach("preview-runtime-log", {
        body: logs,
        contentType: "text/plain",
      });
      await page.request.delete("/api/preview", {
        data: { id: run.id },
        headers: { Origin: editorOrigin },
      });
    }
  }
});

test("frontend-only preview follows real page routes, rejects forged navigation and cleans up on close", async ({
  page,
}) => {
  test.setTimeout(120000);
  page.setDefaultTimeout(20000);
  const { project } = canvasAppFixture();
  project.backend = { services: [], connections: [] };
  project.routing.nodes = project.routing.nodes.filter(
    (node) => node.type === "page",
  );
  project.routing.connections = project.routing.connections.filter(
    (edge) =>
      edge.fromNodeId.startsWith("page") && edge.toNodeId.startsWith("page"),
  );
  await openEditor(page);
  await page
    .getByRole("button", { name: "Untitled project", exact: true })
    .click();
  const workspace = page.getByRole("dialog", {
    name: "Levoks project workspace",
  });
  await workspace.locator('input[type="file"]').setInputFiles({
    name: "static-site.json",
    mimeType: "application/json",
    buffer: Buffer.from(JSON.stringify(project)),
  });
  await expect(
    workspace.getByLabel("Project name", { exact: true }),
  ).toHaveValue("Canvas application (import)");
  await workspace.getByRole("button", { name: "Close workspace" }).click();
  await page.getByRole("button", { name: "Preview", exact: true }).click();
  await page.getByLabel("Preview mode").selectOption("fullstack");
  const response = page.waitForResponse(
    (r) => r.request().method() === "POST" && r.url().endsWith("/api/preview"),
  );
  await page
    .getByRole("button", { name: "Start full-stack preview", exact: true })
    .click();
  const state: PreviewState = await (await response).json();
  const panel = page.getByRole("region", { name: "Full-stack preview" });
  await expect(panel.getByRole("status")).toContainText("ready", {
    timeout: 60000,
  });
  const frame = page.frameLocator(
    'iframe[title="Full-stack application preview"]',
  );
  await frame
    .getByRole("button", { name: "Browse entries", exact: true })
    .click();
  await expect(
    frame.getByRole("heading", { name: "Entry saved", exact: true }),
  ).toBeVisible();
  await page.evaluate(
    (id) =>
      window.postMessage(
        { type: "levoks-preview-location", id, path: "/" },
        window.location.origin,
      ),
    state.id,
  );
  await panel.getByRole("button", { name: "Reload page", exact: true }).click();
  await expect(
    frame.getByRole("heading", { name: "Entry saved", exact: true }),
  ).toBeVisible();
  await frame
    .getByRole("button", { name: "Back to form", exact: true })
    .click();
  await expect(
    frame.getByPlaceholder("Entry title", { exact: true }),
  ).toBeVisible();
  await page
    .getByRole("button", { name: "Back To Editor", exact: true })
    .click();
  await expect
    .poll(async () =>
      (await page.request.get(`/api/preview?id=${state.id}`)).status(),
    )
    .toBe(404);
  await expect
    .poll(() =>
      access(path.resolve(".levoks-preview/sessions", state.id)).then(
        () => true,
        () => false,
      ),
    )
    .toBe(false);
});

test("preview rejects custom source and SQL without starting processes, and cancellation removes a starting runtime", async ({
  page,
}) => {
  test.setTimeout(60000);
  await openEditor(page);
  await page.request.get("/api/preview");
  const initial = emptyProject("Preview boundary test");
  const post = (project: unknown) =>
    page.request.post("/api/preview", {
      data: { project },
      headers: { Origin: editorOrigin },
    });
  const manual = {
    ...initial,
    source: {
      basedOn: "test",
      files: {
        "frontend/app/page.jsx": "export default function Page(){return null}",
      },
    },
  };
  const denied = await post(manual);
  expect(denied.status()).toBe(400);
  expect(await denied.text()).toContain("container sandbox");
  const { project } = canvasAppFixture();
  project.backend.services[0].database = {
    engine: "sqlite",
    location: "local",
    connectionEnv: "DATABASE_FILE",
    fileName: "app.sqlite",
    tls: false,
  };
  const sql = await post(project);
  expect(sql.status()).toBe(400);
  expect(await sql.text()).toContain("isolated preview adapter");
  delete project.backend.services[0].database;
  const started = await post(project);
  expect(started.status(), await started.text()).toBe(202);
  const state: PreviewState = await started.json();
  expect((await post(project)).status()).toBe(409);
  const stopped = await page.request.delete("/api/preview", {
    data: { id: state.id },
    headers: { Origin: editorOrigin },
  });
  expect(stopped.status()).toBe(200);
  await expect
    .poll(() =>
      access(path.resolve(".levoks-preview/sessions", state.id)).then(
        () => true,
        () => false,
      ),
    )
    .toBe(false);
  expect((await page.request.get(`/api/preview?id=${state.id}`)).status()).toBe(
    404,
  );
});
