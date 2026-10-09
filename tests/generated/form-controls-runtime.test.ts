import test from "node:test";
import assert from "node:assert/strict";
import { readFile, mkdir } from "node:fs/promises";
import { spawn, execFile, type ChildProcess } from "node:child_process";
import { createServer } from "node:net";
import path from "node:path";
import { MongoMemoryServer } from "mongodb-memory-server";
import { MongoClient } from "mongodb";
import type { ProjectDocument } from "../../src/lib/project/schema";

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
  "downloaded production form stores nested radio and array values, validates required fields and recovers without losing input",
  { timeout: 120000 },
  async () => {
    process.env.PLAYWRIGHT_BROWSERS_PATH ||= path.resolve(
      ".verification/browsers",
    );
    const { chromium, expect } = await import("@playwright/test");
    const root = path.resolve(".verification/form-controls-app");
    const project: ProjectDocument = JSON.parse(
      await readFile(path.join(root, "levoks.project.json"), "utf8"),
    );
    const service = project.backend.services[0];
    const frontendPort = await freePort(),
      apiPort = await freePort();
    const origin = `http://127.0.0.1:${frontendPort}`,
      apiOrigin = `http://127.0.0.1:${apiPort}`;
    const mongo = await MongoMemoryServer.create({
      binary: { downloadDir: path.resolve(".verification/mongodb-bin") },
    });
    const client = new MongoClient(mongo.getUri("form_controls"));
    const children: ChildProcess[] = [];
    let log = "";
    const launch = (
      file: string,
      args: string[],
      cwd: string,
      env: Record<string, string>,
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
    const backendRoot = path.join(root, "backend/workshop-signups");
    const startBackend = () =>
      launch(path.join(backendRoot, "server.js"), [], backendRoot, {
        NODE_ENV: "production",
        PORT: String(apiPort),
        MONGO_URI: mongo.getUri("form_controls"),
        CORS_ORIGINS: origin,
      });
    let browser: Awaited<ReturnType<typeof chromium.launch>> | undefined;
    try {
      await client.connect();
      const records = client.db("form_controls").collection("submissions");
      let backend = startBackend();
      launch(
        path.join(root, "frontend/node_modules/next/dist/bin/next"),
        ["start", "--hostname", "127.0.0.1", "--port", String(frontendPort)],
        path.join(root, "frontend"),
        {
          APP_ORIGIN: origin,
          [`API_ORIGIN_${service.port}`]: apiOrigin,
          NEXT_TELEMETRY_DISABLED: "1",
        },
      );
      const healthy = () =>
        expect
          .poll(
            async () =>
              fetch(`${apiOrigin}/health`)
                .then((r) => r.status)
                .catch(() => 0),
            { timeout: 30000 },
          )
          .toBe(200);
      await healthy();
      await expect
        .poll(
          async () =>
            fetch(origin)
              .then((r) => r.status)
              .catch(() => 0),
          { timeout: 30000 },
        )
        .toBe(200);
      browser = await chromium.launch();
      const page = await browser.newPage({
        viewport: { width: 1440, height: 1200 },
      });
      const errors: string[] = [];
      page.on("pageerror", (error) => errors.push(error.message));
      await page.goto(origin);
      const topics = page.getByLabel("Topics", { exact: true }),
        session = page.getByLabel("Workshop session", { exact: true });
      const remote = page.getByLabel("Remote", { exact: true }),
        onsite = page.getByLabel("In person", { exact: true });
      const date = page.getByLabel("Visit date", { exact: true });
      const submit = page.getByRole("button", { name: "Submit", exact: true });
      await expect(topics).toHaveValues(["Design", "Automation"]);
      await expect(session).toHaveValue("Afternoon");
      await expect(date).toHaveValue("2026-10-15");
      let posts = 0;
      page.on("request", (request) => {
        if (
          request.method() === "POST" &&
          request.url().endsWith("/api/submissions")
        )
          posts++;
      });
      await submit.click();
      assert.equal(posts, 0, "native invalid forms must not send a request");
      await page
        .getByPlaceholder("Your name", { exact: true })
        .fill("Workshop visitor");
      await page
        .getByPlaceholder("Your email", { exact: true })
        .fill("visitor@example.test");
      await remote.check();
      await remote.press("ArrowRight");
      await expect(onsite).toBeChecked();
      await expect(remote).not.toBeChecked();
      await remote.evaluate((node) => {
        (node as HTMLInputElement).disabled = true;
      });
      await topics.selectOption([]);
      await submit.click();
      assert.equal(
        posts,
        0,
        "required multiple selection is enforced in the browser",
      );
      await topics.selectOption(["Automation", "Databases"]);
      await session.selectOption("Morning");
      const response = page.waitForResponse(
        (r) =>
          r.request().method() === "POST" &&
          r.url().endsWith("/api/submissions"),
      );
      await submit.click();
      const saved = await response;
      assert.equal(saved.status(), 201);
      const body = saved.request().postDataJSON();
      assert.equal(body.attendance, "in_person");
      assert.deepEqual(body.topics, ["Automation", "Databases"]);
      assert.equal(body.session, "Morning");
      assert.equal(body.visit_date, "2026-10-15");
      await expect(page.getByRole("status")).toHaveText("Done");
      await expect.poll(() => records.countDocuments()).toBe(1);
      const record = await records.findOne({ attendance: "in_person" });
      assert.ok(record);
      assert.deepEqual(record.topics, ["Automation", "Databases"]);
      assert.equal(record.session, "Morning");
      await expect(topics).toHaveValues(["Design", "Automation"]);
      await expect(session).toHaveValue("Afternoon");
      await expect(remote).not.toBeChecked();
      await expect(onsite).not.toBeChecked();
      await remote.evaluate((node) => {
        (node as HTMLInputElement).disabled = false;
      });
      await expect(
        page.getByPlaceholder("Your name", { exact: true }),
      ).toHaveValue("");

      for (const invalid of [
        { ...body, topics: [] },
        { ...body, topics: "Design" },
        { ...body, attendance: undefined },
      ]) {
        const rejected = await fetch(`${apiOrigin}/api/submissions`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(invalid),
        });
        assert.equal(rejected.status, 400);
      }
      assert.equal(await records.countDocuments(), 1);
      await page
        .getByPlaceholder("Your name", { exact: true })
        .fill("Retry visitor");
      await page
        .getByPlaceholder("Your email", { exact: true })
        .fill("retry@example.test");
      await remote.check();
      await topics.selectOption(["Databases"]);
      await stop(backend);
      await submit.click();
      await expect(page.getByRole("status")).not.toHaveText(/Working|Done/);
      await expect(topics).toHaveValues(["Databases"]);
      await expect(remote).toBeChecked();
      await expect(
        page.getByPlaceholder("Your name", { exact: true }),
      ).toHaveValue("Retry visitor");
      backend = startBackend();
      await healthy();
      // Native fieldset disabling must omit an optional mapped control too.
      await date.evaluate((node) => {
        const group = document.createElement("fieldset");
        group.disabled = true;
        node.parentNode!.insertBefore(group, node);
        group.append(node);
      });
      const retryResponse = page.waitForResponse(
        (r) =>
          r.request().method() === "POST" &&
          r.url().endsWith("/api/submissions"),
      );
      await submit.click();
      const retried = await retryResponse;
      assert.equal(retried.status(), 201);
      assert.equal(retried.request().postDataJSON().visit_date, undefined);
      await expect.poll(() => records.countDocuments()).toBe(2);
      const retriedRecord = await records.findOne({ attendance: "remote" });
      assert.deepEqual(retriedRecord!.topics, ["Databases"]);
      assert.equal(retriedRecord!.visit_date, undefined);
      await page.reload();
      await expect(topics).toHaveValues(["Design", "Automation"]);
      await expect(date).toHaveValue("2026-10-15");
      assert.equal(await records.countDocuments(), 2);

      await mkdir(".verification/form-controls", { recursive: true });
      for (const width of [320, 768, 1024, 1440]) {
        await page.setViewportSize({ width, height: 1200 });
        assert.ok(
          await page.evaluate(
            () => document.documentElement.scrollWidth <= innerWidth,
          ),
          `page overflow at ${width}px`,
        );
        const geometry = await page.locator("form").evaluate((form) => {
          const bounds = form.getBoundingClientRect();
          const ordered = Array.from(
            form.querySelectorAll(
              ':scope > [class^="el-"], fieldset > [class^="el-"]',
            ),
          ).map((node) => {
            const r = node.getBoundingClientRect();
            return {
              parent: node.parentElement!.id,
              top: r.top,
              bottom: r.bottom,
            };
          });
          return {
            ordered,
            right: bounds.right,
            bottom: bounds.bottom,
            fields: Array.from(
              form.querySelectorAll("input,select,button,fieldset"),
            ).map((node) => {
              const r = node.getBoundingClientRect();
              return {
                x: r.x,
                right: r.right,
                bottom: r.bottom,
                width: r.width,
                height: r.height,
              };
            }),
          };
        });
        for (const field of geometry.fields) {
          assert.ok(field.width > 0 && field.height > 0);
          assert.ok(
            field.x >= 0 && field.right <= width + 1,
            `control viewport bounds at ${width}px`,
          );
          assert.ok(
            field.right <= geometry.right + 1 &&
              field.bottom <= geometry.bottom + 1,
            `form must contain nested controls at ${width}px`,
          );
        }
        const previous = new Map<string, number>();
        for (const field of geometry.ordered) {
          assert.ok(
            field.top >= (previous.get(field.parent) ?? -Infinity),
            `siblings must not overlap at ${width}px`,
          );
          previous.set(field.parent, field.bottom);
        }
        if (width === 320 || width === 1440)
          await page.screenshot({
            path: `.verification/form-controls/production-${width === 320 ? "mobile" : "desktop"}.png`,
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
