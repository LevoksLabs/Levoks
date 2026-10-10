import { test, expect } from "@playwright/test";
import { openEditor } from "../helpers/open-editor";
import type { DeploymentMetadata } from "../../src/lib/deployment";
import JSZip from "jszip";
import { readFile } from "node:fs/promises";
import { parse } from "yaml";

test("guests see the deployment sign-in boundary and the real API denies access", async ({
  page,
}) => {
  await openEditor(page);
  await page.getByRole("button", { name: "Deploy", exact: true }).click();
  const panel = page.getByRole("region", {
    name: "Managed frontend deployment",
  });
  await expect(
    panel.getByText("Sign in to save a deployment connection.", {
      exact: false,
    }),
  ).toBeVisible();
  const denied = await page.request.post("/api/deploy", {
    data: { action: "deploy" },
  });
  expect(denied.status()).toBe(401);
  await page
    .getByText("Run the full application on your server", { exact: true })
    .click();
  await expect(
    page.getByText("node deploy.mjs check", { exact: true }),
  ).toBeVisible();
  const downloaded = page.waitForEvent("download");
  await page
    .getByRole("button", { name: "Download full-stack ZIP", exact: true })
    .click();
  const download = await downloaded;
  const zip = await JSZip.loadAsync(await readFile((await download.path())!));
  const compose = parse(await zip.file("compose.yaml")!.async("string"));
  expect(compose.services["levoks-frontend"].ports).toEqual([
    "127.0.0.1:${FRONTEND_PORT:-3000}:3000",
  ]);
  expect(zip.file("deploy.mjs")).toBeTruthy();
  expect(zip.file("DEPLOYMENT.md")).toBeTruthy();
  expect(compose.services["levoks-proxy"].profiles).toEqual(["https"]);
  expect(compose.services["levoks-proxy"].ports).toEqual([
    "80:80",
    "443:443",
    "443:443/udp",
  ]);
  expect(await zip.file("deployment/Caddyfile")!.async("string")).toContain(
    "reverse_proxy {$LEVOKS_FRONTEND}",
  );
  expect(await zip.file("DEPLOYMENT.md")!.async("string")).toContain(
    "node deploy.mjs verify",
  );
  expect(
    Object.keys(zip.files).filter((path) =>
      /(^|\/)\.env(?!\.example$)/.test(path),
    ),
  ).toEqual([]);
});

test("managed deployment authoring, queue recovery, cancellation and history survive reload", async ({
  page,
  context,
}) => {
  await context.route("**/api/auth/session", (route) =>
    route.fulfill({
      json: {
        user: {
          id: "google:deployment-acceptance",
          name: "Deployment acceptance",
        },
        expires: "2099-01-01T00:00:00Z",
      },
    }),
  );
  let saved: DeploymentMetadata | null = null;
  let queueFailure = true;
  let queuedOperation = "";
  let replayFailure = true;
  let replayOperation = "";
  await context.route("**/api/deploy*", async (route) => {
    if (route.request().method() === "GET") {
      await route.fulfill({ json: { connection: saved, workerOnline: false } });
      return;
    }
    const body = route.request().postDataJSON();
    if (body.action === "connect") {
      expect(body.token).toBe("fixture-private-token");
      saved = {
        ...body.target,
        version: 1,
        sequence: 0,
        active: false,
        environment: {},
        history: [],
      };
    } else if (body.action === "deploy") {
      if (queueFailure) {
        queuedOperation = body.operationId;
        queueFailure = false;
        await route.fulfill({
          status: 503,
          json: { error: "Queue temporarily unavailable. Retry this request." },
        });
        return;
      }
      expect(body.operationId).toBe(queuedOperation);
      expect(body.project.id).toBe(body.projectId);
      saved!.active = true;
      saved!.sequence++;
      saved!.history.push({
        operationId: body.operationId,
        sequence: saved!.sequence,
        state: "queued",
        message: "Snapshot saved. Waiting for the deployment worker.",
        digest: "test-digest",
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      });
    } else if (body.action === "cancel") {
      expect(body.operationId).toBe(saved!.history.at(-1)!.operationId);
      saved!.active = false;
      saved!.history.at(-1)!.state = "canceled";
      saved!.history.at(-1)!.message =
        "Queued release canceled before submission.";
    } else if (body.action === "replay") {
      expect(body.sourceOperationId).toBe(saved!.history[0].operationId);
      expect(body.project).toBeUndefined();
      expect(body.environment).toBeUndefined();
      if (replayFailure) {
        replayFailure = false;
        replayOperation = body.operationId;
        await route.fulfill({
          status: 503,
          json: { error: "Archive queue interrupted. Retry this request." },
        });
        return;
      }
      expect(body.operationId).toBe(replayOperation);
      saved!.sequence++;
      saved!.active = true;
      saved!.history.push({
        ...saved!.history[0],
        operationId: body.operationId,
        sequence: saved!.sequence,
        sourceOperationId: body.sourceOperationId,
        state: "queued",
        providerId: undefined,
        providerState: undefined,
        url: undefined,
        message: "Archived source queued.",
      });
    }
    await route.fulfill({ json: saved });
  });
  await openEditor(page);
  const open = async () => {
    await page.getByRole("button", { name: "Deploy", exact: true }).click();
    const panel = page.getByRole("region", {
      name: "Managed frontend deployment",
    });
    await expect(
      panel.getByText("Worker offline · queued releases wait", { exact: true }),
    ).toBeVisible();
    return panel;
  };
  let panel = await open();
  await panel
    .getByLabel("Vercel project name", { exact: true })
    .fill("preview");
  await panel.getByLabel("Vercel project ID", { exact: true }).fill("invalid");
  await panel
    .getByLabel("Vercel token", { exact: true })
    .fill("fixture-private-token");
  await expect(
    panel.getByRole("button", { name: "Save deployment connection" }),
  ).toBeDisabled();
  await panel.getByLabel("Vercel project ID", { exact: true }).fill("prj_test");
  await panel
    .getByRole("button", { name: "Save deployment connection" })
    .click();
  await expect(
    panel.getByText("Connection saved. No deployment has been submitted."),
  ).toBeVisible();
  await expect(
    panel.getByLabel("Replacement Vercel token", { exact: true }),
  ).toHaveValue("");
  await panel.getByRole("button", { name: "Queue frontend preview" }).click();
  await expect(panel.getByRole("alert")).toContainText(
    "Queue temporarily unavailable",
  );
  await panel.getByRole("button", { name: "Retry queue request" }).click();
  await expect(
    panel.getByText("Release 1 · queued", { exact: true }),
  ).toBeVisible();
  await expect(
    panel.getByRole("button", { name: "Queue frontend preview" }),
  ).toBeDisabled();
  await page.screenshot({
    path: ".verification/deployment-desktop.png",
    fullPage: true,
  });
  await page.reload();
  panel = await open();
  await expect(
    panel.getByLabel("Vercel project name", { exact: true }),
  ).toHaveValue("preview");
  await expect(
    panel.getByText("Release 1 · queued", { exact: true }),
  ).toBeVisible();
  await panel.getByRole("button", { name: "Cancel queued release" }).click();
  await expect(
    panel.getByText("Release 1 · canceled", { exact: true }),
  ).toBeVisible();
  await expect(
    panel.getByRole("button", { name: "Queue frontend preview" }),
  ).toBeEnabled();
  // Provider readiness comes from persisted server metadata, never a locally invented URL.
  saved!.history[0] = {
    ...saved!.history[0],
    state: "ready",
    providerState: "READY",
    providerId: "dpl_test",
    url: "preview.vercel.app",
    message:
      "Frontend preview ready. Verify the website and its backend connections.",
    archiveExpiresAt: "2099-01-01T00:00:00Z",
  };
  await panel.getByRole("button", { name: "Refresh releases" }).click();
  await expect(
    panel.getByRole("link", { name: "Open frontend preview" }),
  ).toHaveAttribute("href", "https://preview.vercel.app");
  const archiveZip = new JSZip();
  archiveZip.file("frontend/README.md", "Archived release fixture");
  const archiveBytes = await archiveZip.generateAsync({ type: "nodebuffer" });
  await context.route("**/api/deploy/archive?*", (route) =>
    route.fulfill({ body: archiveBytes, contentType: "application/zip" }),
  );
  const archiveDownload = page.waitForEvent("download");
  await panel
    .getByRole("button", { name: "Download source for release 1", exact: true })
    .click();
  const downloadedSource = await archiveDownload;
  const downloadedZip = await JSZip.loadAsync(
    await readFile((await downloadedSource.path())!),
  );
  expect(await downloadedZip.file("frontend/README.md")!.async("string")).toBe(
    "Archived release fixture",
  );
  await panel
    .getByRole("button", { name: "Requeue source from release 1", exact: true })
    .scrollIntoViewIfNeeded();
  await page.screenshot({
    path: ".verification/deployment-desktop.png",
    fullPage: true,
  });
  await page.setViewportSize({ width: 1024, height: 768 });
  await panel
    .getByRole("button", { name: "Requeue source from release 1", exact: true })
    .scrollIntoViewIfNeeded();
  await page.screenshot({
    path: ".verification/deployment-compact.png",
    fullPage: true,
  });
  const bounds = await panel.evaluate((element) => ({
    width: element.clientWidth,
    content: element.scrollWidth,
  }));
  expect(bounds.content).toBeLessThanOrEqual(bounds.width + 1);
  await panel
    .getByRole("button", { name: "Requeue source from release 1", exact: true })
    .click();
  await expect(panel.getByRole("alert")).toContainText(
    "Archive queue interrupted",
  );
  await expect(
    panel.getByRole("button", { name: "Retry queue request", exact: true }),
  ).toBeDisabled();
  await panel
    .getByRole("button", {
      name: "Retry archived preview for release 1",
      exact: true,
    })
    .click();
  await expect(
    panel.getByText(
      "Archived source queued as a new frontend preview. Saved API addresses were reused.",
    ),
  ).toBeVisible();
  await expect(
    panel.getByText("Release 2 · queued", { exact: true }),
  ).toBeVisible();
  await page.reload();
  panel = await open();
  await expect(
    panel.getByText("Release 2 · queued", { exact: true }),
  ).toBeVisible();
  const storage = await page.evaluate(() =>
    JSON.stringify([localStorage, sessionStorage]),
  );
  expect(storage).not.toContain("fixture-private-token");
});
