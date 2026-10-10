import test from "node:test";
import assert from "node:assert/strict";
import { spawn, execFile, type ChildProcess } from "node:child_process";
import { createServer } from "node:net";
import { randomBytes } from "node:crypto";
import { mkdir, readFile } from "node:fs/promises";
import path from "node:path";
import { MongoMemoryServer } from "mongodb-memory-server";
import { MongoClient } from "mongodb";

async function freePort() {
  const server = createServer();
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
  const port = (server.address() as { port: number }).port;
  await new Promise<void>((resolve) => server.close(() => resolve()));
  return port;
}
async function stop(child: ChildProcess) {
  if (child.exitCode !== null || child.signalCode !== null) return;
  await new Promise<void>((resolve) => {
    if (process.platform === "win32")
      execFile(
        "taskkill",
        ["/PID", String(child.pid), "/T", "/F"],
        { windowsHide: true },
        () => resolve(),
      );
    else {
      child.once("exit", () => resolve());
      child.kill();
    }
  });
}

test(
  "downloaded production attachments validate, persist, recover and download only through an authorized inbox",
  { timeout: 180000 },
  async () => {
    process.env.PLAYWRIGHT_BROWSERS_PATH ||= path.resolve(
      ".verification/browsers",
    );
    const { chromium, expect } = await import("@playwright/test");
    const root = path.resolve(".verification/attachment-app");
    const project = JSON.parse(
      await readFile(path.join(root, "levoks.project.json"), "utf8"),
    );
    const inbox = project.backend.services[0].blocks.find(
      (block: { config: { view?: string } }) =>
        block.config.view === "submissionInbox",
    );
    const origin = `http://127.0.0.1:${await freePort()}`,
      apiOrigin = `http://127.0.0.1:${await freePort()}`,
      identityOrigin = `http://127.0.0.1:${await freePort()}`;
    const jwt = randomBytes(32).toString("hex"),
      setup = randomBytes(32).toString("hex");
    const mongo = await MongoMemoryServer.create({
      binary: { downloadDir: path.resolve(".verification/mongodb-bin") },
    });
    const client = new MongoClient(mongo.getUri());
    const children: ChildProcess[] = [];
    let logs = "";
    const launch = (
      file: string,
      cwd: string,
      env: Record<string, string>,
      args: string[] = [],
    ) => {
      const child = spawn(process.execPath, [file, ...args], {
        cwd,
        env: { ...process.env, ...env },
        windowsHide: true,
        stdio: ["ignore", "pipe", "pipe"],
      });
      for (const stream of [child.stdout!, child.stderr!])
        stream.on("data", (chunk) => {
          logs = (logs + String(chunk)).slice(-20000);
        });
      children.push(child);
      return child;
    };
    const resourceRoot = path.join(root, "backend/attachment-leads"),
      identityRoot = path.join(root, "backend/attachment-leads-operators");
    const startResource = () =>
      launch(path.join(resourceRoot, "server.js"), resourceRoot, {
        NODE_ENV: "production",
        PORT: new URL(apiOrigin).port,
        MONGO_URI: mongo.getUri("attachment_records"),
        CORS_ORIGINS: origin,
        JWT_SECRET: jwt,
        AUTH_IDENTITY_ORIGIN: identityOrigin,
      });
    const ready = (url: string) =>
      expect
        .poll(
          () =>
            fetch(url)
              .then((response) => response.status)
              .catch(() => 0),
          { timeout: 30000 },
        )
        .toBe(200);
    let browser: Awaited<ReturnType<typeof chromium.launch>> | undefined;
    try {
      await client.connect();
      const records = client.db("attachment_records").collection("submissions"),
        users = client.db("attachment_accounts").collection("users");
      launch(path.join(identityRoot, "server.js"), identityRoot, {
        NODE_ENV: "production",
        PORT: new URL(identityOrigin).port,
        MONGO_URI: mongo.getUri("attachment_accounts"),
        CORS_ORIGINS: origin,
        JWT_SECRET: jwt,
        OPERATOR_SETUP_TOKEN: setup,
      });
      let resource = startResource();
      launch(
        path.join(root, "frontend/node_modules/next/dist/bin/next"),
        path.join(root, "frontend"),
        {
          NODE_ENV: "production",
          APP_ORIGIN: origin,
          API_ORIGIN_3001: apiOrigin,
          API_ORIGIN_3002: identityOrigin,
          NEXT_TELEMETRY_DISABLED: "1",
        },
        ["start", "--hostname", "127.0.0.1", "--port", new URL(origin).port],
      );
      await ready(identityOrigin + "/health");
      await ready(apiOrigin + "/health");
      await ready(origin);
      browser = await chromium.launch();
      const page = await browser.newPage({
        viewport: { width: 1440, height: 1000 },
      });
      const errors: string[] = [];
      page.on("pageerror", (error) => errors.push(error.message));
      await page.goto(origin);
      const file = page.getByLabel("Attachment", { exact: true }),
        submit = page.getByRole("button", { name: "Submit", exact: true });
      let posts = 0;
      page.on("request", (request) => {
        if (
          request.method() === "POST" &&
          request.url().endsWith("/api/submissions")
        )
          posts++;
      });
      await page
        .getByPlaceholder("Your name", { exact: true })
        .fill("Attachment visitor");
      await page
        .getByPlaceholder("Your email", { exact: true })
        .fill("visitor@example.test");
      await submit.click();
      assert.equal(posts, 0);
      assert.equal(
        await file.evaluate(
          (node) => (node as HTMLInputElement).validity.valueMissing,
        ),
        true,
      );
      await file.setInputFiles({
        name: "large.txt",
        mimeType: "text/plain",
        buffer: Buffer.alloc(4097),
      });
      await submit.click();
      await expect(page.getByRole("status")).toContainText("allowed size");
      assert.equal(posts, 0);
      await file.setInputFiles({
        name: "wrong.exe",
        mimeType: "text/plain",
        buffer: Buffer.from("safe bytes"),
      });
      await submit.click();
      await expect(page.getByRole("status")).toContainText("extension");
      assert.equal(posts, 0);
      assert.equal(await records.countDocuments(), 0);
      const bytes = Buffer.from(Array.from({ length: 256 }, (_, i) => i));
      const filename = "résumé.txt";
      await file.setInputFiles({
        name: filename,
        mimeType: "text/plain",
        buffer: bytes,
      });
      const evidenceBytes = Buffer.alloc(450 * 1024, 42);
      const evidence = page.getByLabel("Evidence", { exact: true });
      await evidence.setInputFiles(
        Array.from({ length: 4 }, (_, i) => ({
          name: `extra${i}.txt`,
          mimeType: "text/plain",
          buffer: Buffer.from("x"),
        })),
      );
      await submit.click();
      await expect(page.getByRole("status")).toContainText("at most 3");
      assert.equal(posts, 0);
      await evidence.setInputFiles([
        { name: "large.txt", mimeType: "text/plain", buffer: evidenceBytes },
        {
          name: "second.txt",
          mimeType: "text/plain",
          buffer: evidenceBytes,
        },
      ]);
      const savedResponse = page.waitForResponse(
        (response) =>
          response.request().method() === "POST" &&
          response.url().endsWith("/api/submissions"),
      );
      await submit.click();
      const saved = await savedResponse;
      assert.equal(saved.status(), 201);
      const body = saved.request().postDataJSON();
      assert.deepEqual(body.attachment, {
        name: filename,
        size: bytes.length,
        data: bytes.toString("base64"),
      });
      assert.equal(body.evidence.length, 2);
      assert.equal(body.evidence[0].size, evidenceBytes.length);
      assert.equal(
        Buffer.from(body.evidence[0].data, "base64").equals(evidenceBytes),
        true,
      );
      assert.deepEqual(
        (await records.findOne({ email: body.email }))!.evidence,
        body.evidence,
      );
      assert.deepEqual(await saved.json(), { message: "Submission received." });
      await expect(page.getByRole("status")).toHaveText("Done");
      await expect.poll(() => records.countDocuments()).toBe(1);
      assert.deepEqual(
        (await records.findOne({ email: body.email }))!.attachment,
        body.attachment,
      );
      assert.equal(
        await file.evaluate((node) => (node as HTMLInputElement).files!.length),
        0,
      );
      for (const patch of [
        { ...body.attachment, name: "../résumé.txt" },
        { ...body.attachment, name: "bad\n.txt" },
        { ...body.attachment, name: "wrong.pdf" },
        { ...body.attachment, size: 3 },
        { ...body.attachment, data: "not base64" },
        { ...body.attachment, data: "YR==", size: 1 },
        { ...body.attachment, extra: true },
        {
          name: "over.txt",
          size: 4097,
          data: Buffer.alloc(4097).toString("base64"),
        },
        null,
        "bytes",
      ]) {
        const rejected = await fetch(apiOrigin + "/api/submissions", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ ...body, attachment: patch }),
        });
        assert.equal(rejected.status, 400, JSON.stringify(patch));
      }
      for (const evidence of [
        body.attachment,
        Array(4).fill(body.evidence[1]),
        [{ ...body.evidence[1], name: "bad.exe" }],
        Array(3).fill({
          ...body.evidence[0],
          size: 512 * 1024,
          data: Buffer.alloc(512 * 1024).toString("base64"),
        }),
      ]) {
        const response = await fetch(apiOrigin + "/api/submissions", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ ...body, evidence }),
        });
        assert.ok([400, 413].includes(response.status));
      }
      const oversized = await fetch(
        origin + "/__levoks/api/3001/api/submissions",
        {
          method: "POST",
          headers: { "Content-Type": "application/json", Origin: origin },
          body: JSON.stringify({ ...body, evidence: "x".repeat(2097152) }),
        },
      );
      assert.equal(oversized.status, 413);
      assert.equal(await records.countDocuments(), 1);
      assert.equal(
        (await fetch(apiOrigin + "/api/submissions/inbox")).status,
        401,
      );
      assert.equal((await fetch(apiOrigin + "/api/submissions")).status, 404);
      await page
        .getByPlaceholder("Your name", { exact: true })
        .fill("Retry visitor");
      await page
        .getByPlaceholder("Your email", { exact: true })
        .fill("retry@example.test");
      await file.setInputFiles({
        name: "retry.txt",
        mimeType: "text/plain",
        buffer: Buffer.from("retry bytes"),
      });
      await stop(resource);
      await submit.click();
      await expect(page.getByRole("status")).not.toHaveText(/Working|Done/);
      assert.equal(
        await file.evaluate(
          (node) => (node as HTMLInputElement).files![0].name,
        ),
        "retry.txt",
      );
      await expect(
        page.getByPlaceholder("Your name", { exact: true }),
      ).toHaveValue("Retry visitor");
      resource = startResource();
      await ready(apiOrigin + "/health");
      assert.deepEqual(
        (await records.findOne({ email: body.email }))!.attachment,
        body.attachment,
      );
      const retriedResponse = page.waitForResponse(
        (response) =>
          response.request().method() === "POST" &&
          response.url().endsWith("/api/submissions"),
      );
      await submit.click();
      assert.equal((await retriedResponse).status(), 201);
      await expect.poll(() => records.countDocuments()).toBe(2);
      await expect(page.getByRole("status")).toHaveText("Done");
      assert.equal(
        await file.evaluate((node) => (node as HTMLInputElement).files!.length),
        0,
      );
      await mkdir(".verification/attachments", { recursive: true });
      for (const width of [320, 768, 1024, 1440]) {
        await page.setViewportSize({ width, height: 1000 });
        assert.ok(
          await page.evaluate(
            () => document.documentElement.scrollWidth <= innerWidth,
          ),
        );
        const fits = await file.evaluate((node) => {
          const box = node.getBoundingClientRect(),
            form = node.closest("form")!.getBoundingClientRect();
          return (
            box.right <= form.right &&
            box.left >= form.left &&
            box.bottom <= form.bottom
          );
        });
        assert.ok(fits, `file containment at ${width}px`);
        assert.ok(
          await page.locator("[data-field]").evaluateAll((fields) =>
            fields.every((field) => {
              const box = field.getBoundingClientRect();
              return Array.from(
                field.querySelectorAll("input,label,small"),
              ).every((child) => {
                const content = child.getBoundingClientRect();
                return (
                  content.left >= box.left &&
                  content.right <= box.right &&
                  content.bottom <= box.bottom
                );
              });
            }),
          ),
          `file labels and instructions fit at ${width}px`,
        );
        assert.ok(
          await page.locator("form").evaluate((form) => {
            const boxes = Array.from(form.children)
              .filter((node) => node.className.startsWith("el-"))
              .map((node) => node.getBoundingClientRect());
            return boxes.every(
              (box, i) => i === 0 || box.top >= boxes[i - 1].bottom - 1,
            );
          }),
          `form siblings do not overlap at ${width}px`,
        );
        if (width === 320 || width === 1440)
          await page.screenshot({
            path: `.verification/attachments/form-${width}.png`,
            fullPage: true,
          });
      }
      await page.goto(origin + `/__levoks/inbox/attachment-leads/${inbox.id}`);
      await expect(page.locator("main").getByRole("alert")).toContainText(
        "Sign in",
      );
      await page
        .getByRole("link", { name: "Sign in or set up operator", exact: true })
        .click();
      await page
        .getByRole("button", { name: "Set up first operator", exact: true })
        .click();
      await page
        .getByLabel("Email address", { exact: true })
        .fill("operator@example.test");
      await page
        .getByLabel("Name", { exact: true })
        .fill("Attachment operator");
      await page
        .getByLabel("Password", { exact: true })
        .fill("Local attachment password 123!");
      await page.getByLabel("Setup code", { exact: true }).fill(setup);
      await page
        .getByRole("button", { name: "Create first operator", exact: true })
        .click();
      await expect(page.getByRole("status")).toContainText(
        "Operator account created",
      );
      await page
        .getByLabel("Password", { exact: true })
        .fill("Local attachment password 123!");
      await page
        .getByRole("button", { name: "Sign in to account", exact: true })
        .click();
      await expect(
        page.getByRole("heading", {
          name: "Welcome, Attachment operator",
          exact: true,
        }),
      ).toBeVisible();
      await page
        .getByRole("link", {
          name: "Attachment leads submissions",
          exact: true,
        })
        .click();
      const downloadButton = page.getByRole("button", {
        name: `Download ${filename} (${bytes.length} bytes)`,
        exact: true,
      });
      await expect(downloadButton).toBeVisible();
      const download = page.waitForEvent("download");
      await downloadButton.click();
      const downloaded = await download;
      assert.equal(downloaded.suggestedFilename(), filename);
      assert.deepEqual(await readFile((await downloaded.path())!), bytes);
      const multiDownload = page.waitForEvent("download");
      await page
        .getByRole("button", {
          name: `Download large.txt (${evidenceBytes.length} bytes)`,
          exact: true,
        })
        .click();
      assert.deepEqual(
        await readFile((await (await multiDownload).path())!),
        evidenceBytes,
      );
      const fixtures = await records.insertMany(
        Array.from({ length: 5 }, (_, i) => ({
          name: `Pagination fixture ${i}`,
          email: `fixture${i}@example.test`,
          attachment:
            i === 0
              ? { name: "invalid.txt", size: 2, data: "not base64" }
              : { name: `fixture${i}.txt`, size: 0, data: "" },
          deletedAt: null,
        })),
      );
      await page
        .getByRole("button", { name: "Refresh submissions", exact: true })
        .click();
      await expect(page.locator("tbody tr")).toHaveCount(5);
      await expect(
        page.getByText("Attachment unavailable", { exact: true }),
      ).toBeVisible();
      await expect(
        page.getByRole("button", {
          name: "Download invalid.txt (2 bytes)",
          exact: true,
        }),
      ).toHaveCount(0);
      await expect(downloadButton).toHaveCount(0);
      await page
        .getByRole("button", { name: "Next page", exact: true })
        .click();
      await expect(page.getByText("Page 2", { exact: true })).toBeVisible();
      await expect(page.locator("tbody tr")).toHaveCount(2);
      await expect(downloadButton).toBeVisible();
      await expect(
        page.getByRole("button", { name: "Next page", exact: true }),
      ).toBeDisabled();
      await records.deleteMany({
        _id: { $in: Object.values(fixtures.insertedIds) },
      });
      await page
        .getByRole("button", { name: "Previous page", exact: true })
        .click();
      await expect(page.locator("tbody tr")).toHaveCount(2);
      await expect(downloadButton).toBeVisible();
      const record = await records.findOne({ email: body.email });
      await records.updateOne(
        { _id: record!._id },
        { $set: { deletedAt: new Date() } },
      );
      await page
        .getByRole("button", { name: "Refresh submissions", exact: true })
        .click();
      await expect(downloadButton).toHaveCount(0);
      await records.updateOne(
        { _id: record!._id },
        { $set: { deletedAt: null } },
      );
      await page
        .getByRole("button", { name: "Refresh submissions", exact: true })
        .click();
      await expect(downloadButton).toBeVisible();
      for (const width of [320, 768, 1024, 1440]) {
        await page.setViewportSize({ width, height: 1000 });
        assert.ok(
          await page.evaluate(
            () => document.documentElement.scrollWidth <= innerWidth,
          ),
        );
        if (width === 320) {
          await downloadButton.focus();
          await expect(downloadButton).toBeFocused();
          const keyboardDownload = page.waitForEvent("download");
          await page.keyboard.press("Enter");
          assert.deepEqual(
            await readFile((await (await keyboardDownload).path())!),
            bytes,
          );
          assert.ok(
            await downloadButton.evaluate((node) => {
              const button = node.getBoundingClientRect();
              const region = node
                .closest(".inbox-table")!
                .getBoundingClientRect();
              return button.left >= region.left && button.right <= region.right;
            }),
            "mobile attachment download remains reachable inside the scroll region",
          );
        }
        if (width === 320 || width === 1440)
          await page.screenshot({
            path: `.verification/attachments/inbox-${width}.png`,
            fullPage: true,
          });
      }
      await users.updateOne(
        { email: "operator@example.test" },
        { $set: { role: "user" } },
      );
      await page
        .getByRole("button", { name: "Refresh submissions", exact: true })
        .click();
      await expect(page.locator("main").getByRole("alert")).toContainText(
        "does not have operator access",
      );
      await expect(downloadButton).toHaveCount(0);
      await users.updateOne(
        { email: "operator@example.test" },
        { $set: { role: "operator" } },
      );
      await page
        .getByRole("button", { name: "Retry loading", exact: true })
        .click();
      await expect(downloadButton).toBeVisible();
      await page.getByRole("button", { name: "Sign out", exact: true }).click();
      await expect(page.locator("main").getByRole("alert")).toContainText(
        "Signed out",
      );
      await expect(downloadButton).toHaveCount(0);
      await page.reload();
      await expect(page.locator("main").getByRole("alert")).toContainText(
        "Sign in",
      );
      assert.deepEqual(errors, []);
    } catch (error) {
      console.error(logs);
      throw error;
    } finally {
      await browser?.close();
      for (const child of children.reverse()) await stop(child);
      await client.close();
      await mongo.stop();
    }
  },
);
