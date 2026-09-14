import { test, expect } from "@playwright/test";
import { readFile } from "node:fs/promises";
import JSZip from "jszip";
import { emptyProject } from "../../src/lib/project/workspace";
import { parseProject } from "../../src/lib/project/schema";
import { applyProjectPatch } from "../../src/lib/project/patch";
import { programFixture, block } from "../helpers/program-fixture";

test("Connections shows authentication errors without falsely reporting a connected provider", async ({
  page,
}) => {
  await page.goto("/");
  await page
    .getByRole("button", { name: "Untitled project", exact: true })
    .click();
  const dialog = page.getByRole("dialog", { name: "Levoks project workspace" });
  await dialog
    .getByRole("button", { name: "Connections", exact: true })
    .click();
  await expect(dialog.getByRole("alert")).toContainText("Sign in");
  await expect(dialog.getByRole("status")).toHaveText(
    "No repository connected",
  );
  await expect(
    dialog.getByRole("button", { name: "Find repositories", exact: true }),
  ).toBeDisabled();
  const unauthorized = await page.request.get(
    "/api/connections/github?projectId=other-project",
  );
  expect(unauthorized.status()).toBe(401);
});
test("incremental AI review requires explicit application and rejects overwriting later edits", async ({
  page,
}) => {
  // Controlled model output exercises the actual browser review/save boundary;
  // live inference remains a separate credential-gated provider acceptance test.
  await page.route("**/api/ai", async (route) => {
    const body = route.request().postDataJSON();
    expect(body.mode).toBe("patch");
    const result = applyProjectPatch(parseProject(body.project), [
      { op: "test", path: "/name", value: body.project.name },
      { op: "replace", path: "/name", value: "Reviewed project" },
    ]);
    await route.fulfill({ json: { summary: "Review this rename", ...result } });
  });
  await page.goto("/");
  await page
    .getByRole("button", { name: "Untitled project", exact: true })
    .click();
  const dialog = page.getByRole("dialog");
  await dialog
    .getByRole("button", { name: "AI assistant", exact: true })
    .click();
  await dialog.getByLabel("API key", { exact: true }).fill("local-fixture-key");
  await dialog.getByLabel("Model ID", { exact: true }).fill("fixture/model");
  await dialog
    .getByLabel("Your request", { exact: true })
    .fill("Rename this project");
  await dialog
    .getByRole("button", { name: "Generate proposal", exact: true })
    .click();
  await expect(
    dialog.getByText("1 affected fields", { exact: true }),
  ).toBeVisible();
  await dialog.getByRole("button", { name: "Projects", exact: true }).click();
  await expect(dialog.getByLabel("Project name", { exact: true })).toHaveValue(
    "Untitled project",
  );
  await dialog
    .getByRole("button", { name: "AI assistant", exact: true })
    .click();
  await dialog
    .getByRole("button", { name: "Apply proposal", exact: true })
    .click();
  await expect(
    dialog.getByText("Proposal applied and saved.", { exact: true }),
  ).toBeVisible();
  await dialog
    .getByRole("button", { name: "Generate proposal", exact: true })
    .click();
  await expect(
    dialog.getByRole("button", { name: "Apply proposal", exact: true }),
  ).toBeVisible();
  await dialog.getByRole("button", { name: "Projects", exact: true }).click();
  await dialog
    .getByLabel("Project name", { exact: true })
    .fill("Later user edit");
  await dialog
    .getByRole("button", { name: "AI assistant", exact: true })
    .click();
  await dialog
    .getByRole("button", { name: "Apply proposal", exact: true })
    .click();
  await expect(dialog.getByRole("alert")).toContainText("Your project changed");
  await dialog.getByRole("button", { name: "Projects", exact: true }).click();
  await expect(dialog.getByLabel("Project name", { exact: true })).toHaveValue(
    "Later user edit",
  );
  await dialog
    .getByRole("button", { name: "Save checkpoint", exact: true })
    .click();
  await expect(
    dialog.getByText("Checkpoint saved.", { exact: true }),
  ).toBeVisible();
  await page.reload();
  await page
    .getByRole("button", { name: "Later user edit", exact: true })
    .click();
  await expect(dialog.getByLabel("Project name", { exact: true })).toHaveValue(
    "Later user edit",
  );
});
test("streamed AI output remains a preview until validation and cancellation discards partial output", async ({
  page,
}) => {
  // Controlled native browser stream; provider/route HTTP framing is independently
  // exercised by the real local HTTP integration suite.
  await page.addInitScript(() => {
    const original = window.fetch.bind(window);
    window.fetch = async (input, init) => {
      if (input !== "/api/ai") return original(input, init);
      document.documentElement.dataset.aiRequest = String(init?.body);
      return new Response(
        new ReadableStream({
          start(controller) {
            const cleanup = () => {
              window.removeEventListener("levoks-test-stream", emit);
              init?.signal?.removeEventListener("abort", abort);
            };
            const emit = (event: Event) => {
              const value = (event as CustomEvent).detail;
              if (value === null) {
                cleanup();
                controller.close();
              } else
                controller.enqueue(
                  new TextEncoder().encode(JSON.stringify(value) + "\n"),
                );
            };
            const abort = () => {
              cleanup();
              controller.error(new DOMException("Cancelled", "AbortError"));
            };
            window.addEventListener("levoks-test-stream", emit);
            init?.signal?.addEventListener("abort", abort, { once: true });
          },
        }),
        { headers: { "Content-Type": "application/x-ndjson" } },
      );
    };
  });
  const emit = (event: unknown) =>
    page.evaluate(
      (value) =>
        window.dispatchEvent(
          new CustomEvent("levoks-test-stream", { detail: value }),
        ),
      event,
    );
  await page.goto("/");
  await page
    .getByRole("button", { name: "Untitled project", exact: true })
    .click();
  const dialog = page.getByRole("dialog");
  await dialog
    .getByRole("button", { name: "AI assistant", exact: true })
    .click();
  await dialog.getByLabel("API key", { exact: true }).fill("local-fixture-key");
  await dialog.getByLabel("Model ID", { exact: true }).fill("fixture/model");
  await dialog.getByLabel("Your request", { exact: true }).fill("Rename");
  const generate = dialog.getByRole("button", {
    name: "Generate proposal",
    exact: true,
  });
  await generate.click();
  await emit({ type: "delta", text: "A partial proposal 🌍" });
  await expect(
    dialog.getByText("A partial proposal 🌍", { exact: true }),
  ).toBeVisible();
  await expect(
    dialog.getByRole("button", { name: "Apply proposal", exact: true }),
  ).toHaveCount(0);
  await dialog.getByRole("button", { name: "Cancel generation", exact: true }).click();
  await expect(
    dialog.getByText("Generation cancelled. No changes were applied.", {
      exact: true,
    }),
  ).toBeVisible();
  await expect(
    dialog.getByRole("button", { name: "Apply proposal", exact: true }),
  ).toHaveCount(0);
  await generate.click();
  const body = JSON.parse(
    await page.evaluate(() => document.documentElement.dataset.aiRequest!),
  );
  expect(body.stream).toBe(true);
  const result = applyProjectPatch(parseProject(body.project), [
    { op: "replace", path: "/name", value: "Stream reviewed" },
  ]);
  await emit({ type: "status", message: "Validating proposal…" });
  await emit({
    type: "proposal",
    value: { summary: "Stream review", ...result },
  });
  await expect(
    dialog.getByRole("button", { name: "Apply proposal", exact: true }),
  ).toHaveCount(0);
  await emit(null);
  await expect(
    dialog.getByText("Proposal validated and ready for review.", {
      exact: true,
    }),
  ).toBeVisible();
  await dialog
    .getByRole("button", { name: "Apply proposal", exact: true })
    .click();
  await expect(
    dialog.getByText("Proposal applied and saved.", { exact: true }),
  ).toBeVisible();
  await page.reload();
  await expect(
    page.getByRole("button", { name: "Stream reviewed", exact: true }),
  ).toBeVisible();
});

test("observability inspector settings survive reload and affect the exported readiness, audit and error implementation", async ({
  page,
}) => {
  await page.goto("/");
  await page
    .getByRole("button", { name: "Untitled project", exact: true })
    .click();
  const dialog = page.getByRole("dialog");
  const source = emptyProject("Health editor"),
    service = programFixture();
  service.blocks = [
    block("health", "health_check"),
    block("audit", "audit_log"),
    block("errors", "error_handler"),
  ];
  const snapshot = parseProject({
    ...source,
    backend: { ...source.backend, services: [service] },
  });
  await dialog.locator('input[type="file"]').setInputFiles({
    name: "health.json",
    mimeType: "application/json",
    buffer: Buffer.from(JSON.stringify(snapshot)),
  });
  await expect(dialog.getByLabel("Project name", { exact: true })).toHaveValue(
    "Health editor (import)",
  );
  await dialog.getByRole("button", { name: "Close workspace" }).click();
  await page.getByTitle("Backend Builder", { exact: true }).click();
  await page
    .locator(".backend-block")
    .filter({
      has: page.locator(".backend-block-label", { hasText: /^health$/ }),
    })
    .click();
  await page.getByLabel("Readiness route", { exact: true }).fill("/ready");
  await page.getByLabel("Probe timeout (ms)", { exact: true }).fill("1200");
  await page
    .locator(".backend-block")
    .filter({
      has: page.locator(".backend-block-label", { hasText: /^audit$/ }),
    })
    .click();
  await page
    .getByLabel("Audit event name", { exact: true })
    .fill("application.changed");
  await page.getByLabel("Retention (days)", { exact: true }).fill("45");
  await page
    .locator(".backend-block")
    .filter({
      has: page.locator(".backend-block-label", { hasText: /^errors$/ }),
    })
    .click();
  await page
    .getByLabel("Default client message", { exact: true })
    .fill("Please retry this request.");
  await page.getByRole("button", { name: "Save project", exact: true }).click();
  await page.reload();
  await page
    .getByRole("banner")
    .getByRole("button", { name: "Code", exact: true })
    .click();
  await dialog
    .getByLabel("Filter source files", { exact: true })
    .fill("observability/health.js");
  await dialog
    .getByRole("button", {
      name: "backend/workflow-service/observability/health.js",
      exact: true,
    })
    .click();
  const sourceCode = await dialog
    .getByRole("textbox", {
      name: "Source code for backend/workflow-service/observability/health.js",
      exact: true,
    })
    .inputValue();
  expect(sourceCode).toContain('"route":"/ready"');
  expect(sourceCode).toContain('"timeoutMs":1200');
  const downloadEvent = page.waitForEvent("download");
  await dialog.getByRole("button", { name: "ZIP", exact: true }).click();
  const download = await downloadEvent;
  const zip = await JSZip.loadAsync(await readFile((await download.path())!));
  const exportedSnapshot = JSON.parse(
    await zip.file("levoks.project.json")!.async("string"),
  );
  expect(exportedSnapshot.backend.services[0].blocks[0].config.route).toBe(
    "/ready",
  );
  expect(
    await zip.file("backend/workflow-service/server.js")!.async("string"),
  ).toContain("health.mount(app)");
  const emitted = await zip
    .file("backend/workflow-service/observability/index.js")!
    .async("string");
  expect(emitted).toContain('"event":"application.changed"');
  expect(emitted).toContain('"retentionDays":45');
  expect(emitted).toContain('"fallbackMessage":"Please retry this request."');
});

test("project autosave survives reload and ZIP contains all imported backend operations", async ({
  page,
}) => {
  const errors: string[] = [];
  page.on("pageerror", (error) => errors.push(error.message));
  await page.goto("/");
  await page
    .getByRole("button", { name: "Untitled project", exact: true })
    .click();
  const dialog = page.getByRole("dialog", { name: "Levoks project workspace" });
  await dialog
    .getByLabel("Project name", { exact: true })
    .fill("Persistent browser project");
  await dialog
    .getByRole("button", { name: "Save checkpoint", exact: true })
    .click();
  await expect(dialog.getByText("Checkpoint saved.")).toBeVisible();
  await page.reload();
  await page
    .getByRole("button", { name: "Persistent browser project", exact: true })
    .click();
  await expect(dialog.getByLabel("Project name", { exact: true })).toHaveValue(
    "Persistent browser project",
  );
  const source = emptyProject("Executable browser project");
  const upload = {
    ...source,
    backend: { ...source.backend, services: [programFixture()] },
  };
  await dialog.locator('input[type="file"]').setInputFiles({
    name: "project.json",
    mimeType: "application/json",
    buffer: Buffer.from(JSON.stringify(upload)),
  });
  await expect(dialog.getByLabel("Project name", { exact: true })).toHaveValue(
    "Executable browser project (import)",
  );
  await dialog
    .getByRole("button", { name: "Source & checks", exact: true })
    .click();
  await expect(dialog.getByRole("alert")).toHaveCount(0);
  const downloadEvent = page.waitForEvent("download");
  await dialog.getByRole("button", { name: "ZIP", exact: true }).click();
  const download = await downloadEvent;
  const zip = await JSZip.loadAsync(await readFile((await download.path())!));
  const program = JSON.parse(
    await zip
      .file("backend/workflow-service/workflow/program.json")!
      .async("string"),
  );
  expect(
    program.blocks.some((block: { type: string }) => block.type === "query"),
  ).toBe(true);
  expect(
    program.blocks.some(
      (block: { type: string }) => block.type === "access_policy",
    ),
  ).toBe(true);
  expect(zip.file("frontend/app/page.jsx")).not.toBeNull();
  expect(errors).toEqual([]);
});

test("backend query inspector changes persisted IR and emitted source", async ({
  page,
}) => {
  await page.goto("/");
  await page
    .getByRole("button", { name: "Untitled project", exact: true })
    .click();
  const dialog = page.getByRole("dialog");
  const source = emptyProject("Inspector workflow");
  await dialog.locator('input[type="file"]').setInputFiles({
    name: "workflow.json",
    mimeType: "application/json",
    buffer: Buffer.from(
      JSON.stringify({
        ...source,
        backend: { ...source.backend, services: [programFixture()] },
      }),
    ),
  });
  await expect(dialog.getByLabel("Project name", { exact: true })).toHaveValue(
    "Inspector workflow (import)",
  );
  await dialog.getByRole("button", { name: "Close workspace" }).click();
  await page.getByTitle("Backend Builder", { exact: true }).click();
  await page
    .locator(".backend-block")
    .filter({
      has: page.locator(".backend-block-label", { hasText: /^list$/ }),
    })
    .click();
  await page.getByLabel("Maximum results", { exact: true }).fill("7");
  await page.getByRole("button", { name: "Save project", exact: true }).click();
  await page
    .getByRole("banner")
    .getByRole("button", { name: "Code", exact: true })
    .click();
  await dialog
    .getByLabel("Filter source files", { exact: true })
    .fill("workflow/program.json");
  await dialog
    .getByRole("button", {
      name: "backend/workflow-service/workflow/program.json",
      exact: true,
    })
    .click();
  const text = await dialog
    .getByRole("textbox", {
      name: "Source code for backend/workflow-service/workflow/program.json",
      exact: true,
    })
    .inputValue();
  expect(
    JSON.parse(text).blocks.find((block: { id: string }) => block.id === "list")
      .config.limit,
  ).toBe(7);
});
