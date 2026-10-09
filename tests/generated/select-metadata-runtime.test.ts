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
  "downloaded select choices store values, exclude disabled options and recover with native defaults and responsive bounds",
  { timeout: 120000 },
  async () => {
    process.env.PLAYWRIGHT_BROWSERS_PATH ||= path.resolve(
      ".verification/browsers",
    );
    const { chromium, expect } = await import("@playwright/test");
    const root = path.resolve(".verification/select-metadata-app");
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
    const backendRoot = path.join(root, "backend/select-enquiries");
    const startBackend = () =>
      launch(path.join(backendRoot, "server.js"), backendRoot, {
        NODE_ENV: "production",
        PORT: new URL(apiOrigin).port,
        MONGO_URI: mongo.getUri("select_records"),
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
      const records = client.db("select_records").collection("submissions");
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
      const session = page.getByLabel("Appointment session", { exact: true }),
        topics = page.getByLabel("Project topics", { exact: true }),
        followup = page.getByLabel("Preferred follow-up", { exact: true }),
        submit = page.getByRole("button", { name: "Submit", exact: true });
      await expect(session).toHaveValue("morning");
      await expect(topics).toHaveValues(["design", "data"]);
      await expect(followup).toHaveValue("");
      await expect(
        session.getByRole("option", {
          name: "No appointments available",
          exact: true,
        }),
      ).toBeDisabled();
      await expect(
        topics.getByRole("option", {
          name: "Currently unavailable",
          exact: true,
        }),
      ).toBeDisabled();
      await page
        .getByPlaceholder("Your name", { exact: true })
        .fill("Choice visitor");
      await page
        .getByPlaceholder("Your email", { exact: true })
        .fill("visitor@example.test");
      let posts = 0;
      page.on("request", (request) => {
        if (
          request.method() === "POST" &&
          request.url().endsWith("/api/submissions")
        )
          posts++;
      });
      await session.evaluate(node => { (node as HTMLSelectElement).value = ""; });
      await submit.click();
      assert.equal(posts, 0);
      await session.selectOption("morning");
      await topics.selectOption([]);
      await submit.click();
      assert.equal(
        posts,
        0,
        "required multiple select must not post an empty selection",
      );
      await topics.selectOption(["automation", "data"]);
      await session.focus();
      await session.press("ArrowUp");
      await expect(session).toHaveValue("morning");
      await session.press("ArrowDown");
      await expect(session).toHaveValue("pm");
      await followup.selectOption("call");
      const response = page.waitForResponse(
        (response) =>
          response.request().method() === "POST" &&
          response.url().endsWith("/api/submissions"),
      );
      await submit.click();
      const saved = await response;
      assert.equal(saved.status(), 201);
      const body = saved.request().postDataJSON();
      assert.equal(body.session, "pm");
      assert.deepEqual(body.topics, ["automation", "data"]);
      assert.equal(body.followup, "call");
      assert.deepEqual(await saved.json(), { message: "Submission received." });
      await expect.poll(() => records.countDocuments()).toBe(1);
      const stored = await records.findOne({ email: body.email });
      assert.equal(stored!.session, "pm");
      assert.deepEqual(stored!.topics, ["automation", "data"]);
      assert.equal(stored!.followup, "call");
      await expect(page.getByRole("status")).toHaveText("Done");
      await expect(session).toHaveValue("morning");
      await expect(topics).toHaveValues(["design", "data"]);
      await expect(followup).toHaveValue("");
      for (const patch of [
        { session: "Morning visit" },
        { session: "closed" },
        { session: "forged" },
        { session: ["morning"] },
        { session: 1 },
        { session: null },
        { session: "" },
        { topics: ["Product design"] },
        { topics: ["closed"] },
        { topics: ["design", "design"] },
        { topics: ["design", 1] },
        { topics: "design" },
        { topics: [] },
        { followup: "closed" },
        { followup: "Call to discuss the project and next steps" },
      ]) {
        const rejected = await fetch(apiOrigin + "/api/submissions", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ ...body, ...patch }),
        });
        assert.equal(rejected.status, 400, JSON.stringify(patch));
      }
      assert.equal(await records.countDocuments(), 1);
      await page
        .getByPlaceholder("Your name", { exact: true })
        .fill("Retry visitor");
      await page
        .getByPlaceholder("Your email", { exact: true })
        .fill("retry@example.test");
      await session.evaluate((node) => {
        (node as HTMLSelectElement).value = "closed";
      });
      const beforeInvalid = posts;
      await submit.click();
      await expect(page.getByRole("status")).toContainText(
        "Choose an enabled option",
      );
      assert.equal(
        posts,
        beforeInvalid,
        "a required disabled selection fails visibly before posting",
      );
      await session.selectOption("pm");
      await topics.selectOption(["automation", "data"]);
      await followup.selectOption("call");
      await stop(backend);
      await submit.click();
      await expect(page.getByRole("status")).not.toHaveText(/Working|Done/);
      await expect(session).toHaveValue("pm");
      await expect(topics).toHaveValues(["automation", "data"]);
      await expect(followup).toHaveValue("call");
      await expect(
        page.getByPlaceholder("Your name", { exact: true }),
      ).toHaveValue("Retry visitor");
      // Native successful-control semantics omit disabled selections, even if a script selected them.
      await followup.evaluate((node) => {
        (node as HTMLSelectElement).value = "closed";
      });
      await topics.evaluate((node) => {
        for (const option of (node as HTMLSelectElement).options)
          option.selected = ["automation", "closed"].includes(option.value);
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
      assert.equal(retryResponse.request().postDataJSON().followup, undefined);
      assert.deepEqual(retryResponse.request().postDataJSON().topics, [
        "automation",
      ]);
      await expect.poll(() => records.countDocuments()).toBe(2);
      const retryRecord = await records.findOne({
        email: "retry@example.test",
      });
      assert.equal(retryRecord!.session, "pm");
      assert.deepEqual(retryRecord!.topics, ["automation"]);
      assert.equal(retryRecord!.followup, undefined);
      await page.reload();
      await expect(session).toHaveValue("morning");
      await expect(topics).toHaveValues(["design", "data"]);
      await expect(followup).toHaveValue("");
      await mkdir(".verification/select-metadata", { recursive: true });
      for (const width of [320, 768, 1024, 1440]) {
        await page.setViewportSize({ width, height: 1100 });
        assert.ok(
          await page.evaluate(
            () => document.documentElement.scrollWidth <= innerWidth,
          ),
          `page overflow at ${width}px`,
        );
        for (const container of [
          page.locator("form"),
          session,
          topics,
          followup,
        ]) {
          assert.ok(
            await container.evaluate((node) => {
              const parent = node.getBoundingClientRect();
              return Array.from(node.children)
                .filter((child) => child.className.startsWith("el-"))
                .map((child) => child.getBoundingClientRect())
                .every(
                  (box, i, boxes) =>
                    box.left >= parent.left - 1 &&
                    box.right <= parent.right + 1 &&
                    box.bottom <= parent.bottom + 1 &&
                    (i === 0 || box.top >= boxes[i - 1].bottom - 1),
                );
            }),
            `contained, non-overlapping controls at ${width}px`,
          );
        }
        if (width === 320 || width === 1440)
          await page.screenshot({
            path: `.verification/select-metadata/production-${width}.png`,
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
