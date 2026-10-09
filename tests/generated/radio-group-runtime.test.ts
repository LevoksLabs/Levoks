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
  "downloaded radio groups store values rather than labels and retain mappings, native keyboard behavior, recovery and responsive geometry",
  { timeout: 120000 },
  async () => {
    process.env.PLAYWRIGHT_BROWSERS_PATH ||= path.resolve(
      ".verification/browsers",
    );
    const { chromium, expect } = await import("@playwright/test");
    const root = path.resolve(".verification/radio-app");
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
    const backendRoot = path.join(root, "backend/radio-enquiries");
    const startBackend = () =>
      launch(path.join(backendRoot, "server.js"), backendRoot, {
        NODE_ENV: "production",
        PORT: new URL(apiOrigin).port,
        MONGO_URI: mongo.getUri("radio_records"),
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
      const records = client.db("radio_records").collection("submissions");
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
        name: "How will you attend?",
        exact: true,
      });
      const online = group.getByRole("radio", {
        name: "Online attendance",
        exact: true,
      });
      const inPerson = group.getByRole("radio", {
        name: "In person at the venue",
        exact: true,
      });
      const unavailable = group.getByRole("radio", {
        name: "Unavailable option",
        exact: true,
      });
      const reply = page.getByRole("group", {
        name: "Preferred reply",
        exact: true,
      });
      const email = reply.getByRole("radio", {
        name: "Email reply",
        exact: true,
      });
      const phone = reply.getByRole("radio", {
        name: "Call me to discuss the project and next steps",
        exact: true,
      });
      const submit = page.getByRole("button", { name: "Submit", exact: true });
      await expect(online).toBeChecked();
      await expect(unavailable).toBeDisabled();
      await expect(email).not.toBeChecked();
      await expect(phone).not.toBeChecked();
      await page
        .getByPlaceholder("Your name", { exact: true })
        .fill("Radio visitor");
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
      await group.getByRole("radio").evaluateAll((nodes) =>
        nodes.forEach((node) => {
          (node as HTMLInputElement).checked = false;
        }),
      );
      await submit.click();
      assert.equal(posts, 0, "missing required radio selection never posts");
      assert.equal(
        await online.evaluate(
          (node) => (node as HTMLInputElement).validity.valueMissing,
        ),
        true,
      );
      await online.check();
      await online.press("ArrowRight");
      await expect(inPerson).toBeChecked();
      await expect(online).not.toBeChecked();
      await email.check();
      const response = page.waitForResponse(
        (response) =>
          response.request().method() === "POST" &&
          response.url().endsWith("/api/submissions"),
      );
      await submit.click();
      const saved = await response;
      assert.equal(saved.status(), 201);
      const body = saved.request().postDataJSON();
      assert.equal(body.attendance, "in_person");
      assert.equal(body.reply_method, "email");
      assert.deepEqual(await saved.json(), { message: "Submission received." });
      await expect.poll(() => records.countDocuments()).toBe(1);
      const stored = await records.findOne({ email: body.email });
      assert.equal(stored!.attendance, "in_person");
      assert.equal(stored!.reply_method, "email");
      await expect(page.getByRole("status")).toHaveText("Done");
      await expect(online).toBeChecked();
      await expect(email).not.toBeChecked();
      await expect(phone).not.toBeChecked();
      for (const value of [
        "Online attendance",
        "unavailable",
        "forged",
        ["online"],
        1,
        null,
        "",
      ]) {
        const rejected = await fetch(apiOrigin + "/api/submissions", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ ...body, attendance: value }),
        });
        assert.equal(rejected.status, 400, JSON.stringify(value));
      }
      assert.equal(await records.countDocuments(), 1);
      await page
        .getByPlaceholder("Your name", { exact: true })
        .fill("Retry visitor");
      await page
        .getByPlaceholder("Your email", { exact: true })
        .fill("retry@example.test");
      await inPerson.check();
      await phone.check();
      await stop(backend);
      await submit.click();
      await expect(page.getByRole("status")).not.toHaveText(/Working|Done/);
      await expect(inPerson).toBeChecked();
      await expect(phone).toBeChecked();
      await expect(
        page.getByPlaceholder("Your name", { exact: true }),
      ).toHaveValue("Retry visitor");
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
      assert.equal(
        retryResponse.request().postDataJSON().reply_method,
        undefined,
      );
      await expect.poll(() => records.countDocuments()).toBe(2);
      const retryRecord = await records.findOne({
        email: "retry@example.test",
      });
      assert.equal(retryRecord!.attendance, "in_person");
      assert.equal(retryRecord!.reply_method, undefined);
      await page.reload();
      await expect(online).toBeChecked();
      await expect(phone).not.toBeChecked();
      await expect(phone).toBeEnabled();
      await mkdir(".verification/radio-group", { recursive: true });
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
          `wrapped radio label fits at ${width}px`,
        );
        if (width === 320 || width === 1440)
          await page.screenshot({
            path: `.verification/radio-group/production-${width}.png`,
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
