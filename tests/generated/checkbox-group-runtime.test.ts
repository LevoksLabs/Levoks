import test from "node:test";
import assert from "node:assert/strict";
import { spawn, execFile, type ChildProcess } from "node:child_process";
import { createServer } from "node:net";
import { mkdir } from "node:fs/promises";
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
  "downloaded checkbox groups store arrays with required recovery, boolean consent, disabled filtering, reset and responsive geometry",
  { timeout: 120000 },
  async () => {
    process.env.PLAYWRIGHT_BROWSERS_PATH ||= path.resolve(
      ".verification/browsers",
    );
    const { chromium, expect } = await import("@playwright/test");
    const root = path.resolve(".verification/checkbox-app");
    const origin = `http://127.0.0.1:${await freePort()}`,
      apiOrigin = `http://127.0.0.1:${await freePort()}`;
    const mongo = await MongoMemoryServer.create({
      binary: { downloadDir: path.resolve(".verification/mongodb-bin") },
    });
    const client = new MongoClient(mongo.getUri());
    const children: ChildProcess[] = [];
    let log = "";
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
          log = (log + String(chunk)).slice(-20000);
        });
      children.push(child);
      return child;
    };
    const backendRoot = path.join(root, "backend/checkbox-enquiries");
    const startBackend = () =>
      launch(path.join(backendRoot, "server.js"), backendRoot, {
        NODE_ENV: "production",
        PORT: new URL(apiOrigin).port,
        MONGO_URI: mongo.getUri("checkbox_records"),
        CORS_ORIGINS: origin,
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
      const records = client.db("checkbox_records").collection("submissions");
      let backend = startBackend();
      launch(
        path.join(root, "frontend/node_modules/next/dist/bin/next"),
        path.join(root, "frontend"),
        {
          NODE_ENV: "production",
          APP_ORIGIN: origin,
          API_ORIGIN_3001: apiOrigin,
          NEXT_TELEMETRY_DISABLED: "1",
        },
        ["start", "--hostname", "127.0.0.1", "--port", new URL(origin).port],
      );
      await ready(apiOrigin + "/health");
      await ready(origin);
      browser = await chromium.launch();
      const page = await browser.newPage({
        viewport: { width: 1440, height: 1100 },
      });
      const errors: string[] = [];
      page.on("pageerror", (error) => errors.push(error.message));
      await page.goto(origin);
      const group = page.getByRole("group", {
        name: "What would you like to build?",
        exact: true,
      });
      const web = group.getByRole("checkbox", {
        name: "Website design",
        exact: true,
      });
      const app = group.getByRole("checkbox", {
        name: "Application design",
        exact: true,
      });
      const unavailable = group.getByRole("checkbox", {
        name: "Unavailable option",
        exact: true,
      });
      const automation = group.getByRole("checkbox", {name: "Workflow automation", exact: true});
      const reply = page.getByRole("group", {
        name: "Optional followups",
        exact: true,
      });
      const email = reply.getByRole("checkbox", {
        name: "Email reply",
        exact: true,
      });
      const phone = reply.getByRole("checkbox", {
        name: "Call me to discuss the project and next steps",
        exact: true,
      });
      const consent = page.getByRole("checkbox", {
        name: "Accept project terms",
        exact: true,
      });
      const submit = page.getByRole("button", { name: "Submit", exact: true });
      await expect(group).toHaveAccessibleDescription("Select exactly 2 options.");
      await expect(reply).toHaveAccessibleDescription("Select at most 1 option.");
      await expect(web).toBeChecked();
      await expect(app).not.toBeChecked();
      await expect(unavailable).toBeDisabled();
      await expect(email).not.toBeChecked();
      await page
        .getByPlaceholder("Your name", { exact: true })
        .fill("Checkbox visitor");
      await page
        .getByPlaceholder("Your email", { exact: true })
        .fill("visitor@example.test");
      await consent.check();
      let posts = 0;
      page.on("request", (request) => {
        if (
          request.method() === "POST" &&
          request.url().endsWith("/api/submissions")
        )
          posts++;
      });
      await web.uncheck();
      await submit.click();
      await expect(page.getByRole("status")).toContainText(
        "Choose at least 2 options",
      );
      assert.equal(posts, 0);
      await expect(web).toBeFocused();
      await web.press("Space");
      await submit.click();
      await expect(page.getByRole("status")).toContainText("Choose at least 2 options");
      assert.equal(posts, 0);
      await app.check();
      await automation.check();
      await submit.click();
      await expect(page.getByRole("status")).toContainText("Choose at most 2 options");
      await expect(web).toBeFocused();
      assert.equal(posts, 0);
      await automation.uncheck();
      await email.check();
      await phone.check();
      await submit.click();
      await expect(page.getByRole("status")).toContainText("Choose at most 1 option");
      await expect(email).toBeFocused();
      assert.equal(posts, 0);
      await phone.uncheck();
      // The parent disable check must ignore even a forged checked default.
      await unavailable.evaluate((node) => {
        (node as HTMLInputElement).checked = true;
      });
      const response = page.waitForResponse(
        (response) =>
          response.request().method() === "POST" &&
          response.url().endsWith("/api/submissions"),
      );
      await submit.click();
      const saved = await response;
      assert.equal(saved.status(), 201);
      const body = saved.request().postDataJSON();
      assert.deepEqual(body.interests, ["web", "app"]);
      assert.deepEqual(body.followups, ["email"]);
      assert.equal(body.consent, true);
      assert.deepEqual(await saved.json(), { message: "Submission received." });
      await expect.poll(() => records.countDocuments()).toBe(1);
      const stored = await records.findOne({ email: body.email });
      assert.deepEqual(stored!.interests, body.interests);
      assert.deepEqual(stored!.followups, body.followups);
      assert.equal(stored!.consent, true);
      await expect(page.getByRole("status")).toHaveText("Done");
      await expect(web).toBeChecked();
      await expect(app).not.toBeChecked();
      await expect(email).not.toBeChecked();
      await expect(consent).not.toBeChecked();
      const invalidBodies = [
        ...[
          [],
          ["web"],
          ["web", "app", "automation"],
          ["Website design"],
          ["unavailable"],
          ["forged"],
          ["web", "web"],
          [true],
          "web",
          true,
          1,
          null,
          undefined,
        ].map((interests) => ({ ...body, interests })),
        { ...body, followups: ["forged"] },
        { ...body, followups: ["email", "phone"] },
        { ...body, consent: false },
        { ...body, consent: "true" },
      ];
      for (const invalid of invalidBodies) {
        const rejected = await fetch(apiOrigin + "/api/submissions", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(invalid),
        });
        assert.equal(rejected.status, 400, JSON.stringify(invalid));
      }
      assert.equal(await records.countDocuments(), 1);
      await page
        .getByPlaceholder("Your name", { exact: true })
        .fill("Retry visitor");
      await page
        .getByPlaceholder("Your email", { exact: true })
        .fill("retry@example.test");
      await web.check();
      await app.check();
      await phone.check();
      await consent.check();
      await stop(backend);
      await submit.click();
      await expect(page.getByRole("status")).not.toHaveText(/Working|Done/);
      await expect(app).toBeChecked();
      await expect(phone).toBeChecked();
      await expect(consent).toBeChecked();
      await reply.evaluate((node) => {
        (node as HTMLFieldSetElement).disabled = true;
      });
      backend = startBackend();
      await ready(apiOrigin + "/health");
      const retried = page.waitForResponse(
        (response) =>
          response.request().method() === "POST" &&
          response.url().endsWith("/api/submissions"),
      );
      await submit.click();
      const retryResponse = await retried;
      assert.equal(retryResponse.status(), 201);
      assert.equal(retryResponse.request().postDataJSON().followups, undefined);
      await expect.poll(() => records.countDocuments()).toBe(2);
      const retryRecord = await records.findOne({
        email: "retry@example.test",
      });
      assert.deepEqual(retryRecord!.interests, ["web", "app"]);
      assert.deepEqual(
        retryRecord!.followups,
        [],
        "The existing Mongoose array schema supplies its native empty default.",
      );
      await page.reload();
      await expect(web).toBeChecked();
      await expect(app).not.toBeChecked();
      await expect(phone).not.toBeChecked();
      await expect(phone).toBeEnabled();
      await page
        .getByPlaceholder("Your name", { exact: true })
        .fill("Optional empty");
      await page
        .getByPlaceholder("Your email", { exact: true })
        .fill("empty@example.test");
      await consent.check();
      await app.check();
      const optional = page.waitForResponse(
        (response) =>
          response.request().method() === "POST" &&
          response.url().endsWith("/api/submissions"),
      );
      await submit.click();
      const optionalResponse = await optional;
      assert.equal(optionalResponse.status(), 201);
      assert.equal(
        optionalResponse.request().postDataJSON().followups,
        undefined,
      );
      await expect.poll(() => records.countDocuments()).toBe(3);
      assert.deepEqual(
        (await records.findOne({ email: "empty@example.test" }))!.followups,
        [],
      );
      await mkdir(".verification/checkbox-group", { recursive: true });
      for (const width of [320, 768, 1024, 1440]) {
        await page.setViewportSize({ width, height: 1100 });
        assert.ok(
          await page.evaluate(
            () => document.documentElement.scrollWidth <= innerWidth,
          ),
          `page overflow at ${width}px`,
        );
        for (const container of [page.locator("form"), group, reply]) {
          assert.ok(
            await container.evaluate((node) => {
              const parent = node.getBoundingClientRect();
              const boxes = Array.from(node.children)
                .filter((child) => child.className.startsWith("el-"))
                .map((child) => child.getBoundingClientRect());
              return boxes.every(
                (box, i) =>
                  box.left >= parent.left - 1 &&
                  box.right <= parent.right + 1 &&
                  box.bottom <= parent.bottom + 1 &&
                  (i === 0 || box.top >= boxes[i - 1].bottom - 1),
              );
            }),
            `contained and non-overlapping form/group controls at ${width}px`,
          );
        }
        assert.ok(
          await phone.evaluate((node) => {
            const label = node.closest("label")!.getBoundingClientRect(),
              text = node.nextElementSibling!.getBoundingClientRect();
            return (
              text.right <= label.right + 1 && text.bottom <= label.bottom + 1
            );
          }),
          `wrapped checkbox label fits at ${width}px`,
        );
        if (width === 320 || width === 1440)
          await page.screenshot({
            path: `.verification/checkbox-group/production-${width}.png`,
            fullPage: true,
          });
      }
      assert.deepEqual(errors, []);
    } catch (error) {
      console.error(log);
      throw error;
    } finally {
      await browser?.close();
      for (const child of children.reverse()) await stop(child);
      await client.close();
      await mongo.stop();
    }
  },
);
