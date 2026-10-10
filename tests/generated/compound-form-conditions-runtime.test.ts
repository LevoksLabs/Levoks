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
  "downloaded compound and nested conditions reject inactive values and retain input across recovery",
  { timeout: 120000 },
  async () => {
    process.env.PLAYWRIGHT_BROWSERS_PATH ||= path.resolve(
      ".verification/browsers",
    );
    const { chromium, expect } = await import("@playwright/test");
    const root = path.resolve(".verification/compound-app");
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
    const backendRoot = path.join(root, "backend/compound-enquiries");
    const startBackend = () =>
      launch(path.join(backendRoot, "server.js"), backendRoot, {
        NODE_ENV: "production",
        PORT: new URL(apiOrigin).port,
        MONGO_URI: mongo.getUri("compound_records"),
        CORS_ORIGINS: origin,
      });
    const ready = (url: string) =>
      expect
        .poll(
          () =>
            fetch(url)
              .then((r) => r.status)
              .catch(() => 0),
          { timeout: 30000 },
        )
        .toBe(200);
    let browser: Awaited<ReturnType<typeof chromium.launch>> | undefined;
    try {
      await client.connect();
      const records = client.db("compound_records").collection("submissions");
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
      const toggle = page.getByRole("checkbox", {
          name: "Business",
          exact: true,
        }),
        audience = page.getByLabel("Audience", { exact: true }),
        plan = page.getByLabel("Plan", { exact: true });
      const outer = page.locator('fieldset[aria-label="Outer details"]'),
        inner = page.locator('fieldset[aria-label="Inner details"]');
      const note = page.getByLabel("Outer note", { exact: true }),
        detail = page.getByLabel("Inner note", { exact: true }),
        submit = page.getByRole("button", { name: "Submit", exact: true });
      let posts = 0;
      page.on("request", (req) => {
        if (req.method() === "POST" && req.url().endsWith("/api/submissions"))
          posts++;
      });
      const fill = async (name: string) => {
        await page.getByPlaceholder("Your name", { exact: true }).fill(name);
        await page
          .getByPlaceholder("Your email", { exact: true })
          .fill(name + "@example.test");
      };
      const save = async () => {
        const wait = page.waitForResponse(
          (r) =>
            r.request().method() === "POST" &&
            r.url().endsWith("/api/submissions"),
        );
        await submit.click();
        const response = await wait;
        assert.equal(response.status(), 201);
        await expect(page.getByRole("status")).toHaveText("Done");
        return response.request().postDataJSON();
      };
      await expect(outer).toBeHidden();
      await expect(inner).toBeHidden();
      await fill("hidden");
      const hidden = await save();
      assert.equal(hidden.note, undefined);
      assert.equal(hidden.plan, undefined);
      assert.equal(hidden.detail, undefined);
      await fill("outer");
      await audience.selectOption("Option two");
      await expect(outer).toBeVisible();
      await expect(inner).toBeHidden();
      await submit.click();
      await expect(note).toBeFocused();
      assert.equal(posts, 1);
      await note.fill("Outer only");
      const outerBody = await save();
      assert.equal(outerBody.note, "Outer only");
      assert.equal(outerBody.detail, undefined);
      await fill("nested");
      await toggle.check();
      await note.fill("Nested outer");
      await plan.selectOption("Option two");
      await expect(inner).toBeVisible();
      await submit.click();
      await expect(detail).toBeFocused();
      assert.equal(posts, 2);
      await detail.fill("Retained inner");
      await toggle.uncheck();
      await expect(inner).toBeHidden();
      await expect(detail).toBeDisabled();
      await audience.selectOption("Option two");
      await expect(inner).toBeVisible();
      await expect(detail).toHaveValue("Retained inner");
      await page.getByLabel("Reference",{exact:true}).fill("ab-1234");
      await submit.click(); await expect(page.getByLabel("Reference",{exact:true})).toBeFocused(); assert.equal(posts,2);
      await page.getByLabel("Reference",{exact:true}).fill("AB-1234");
      const nested = await save();
      assert.equal(nested.reference,"AB-1234");
      assert.equal(nested.business, false);
      assert.equal(nested.plan, "Option two");
      assert.equal(nested.detail, "Retained inner");
      assert.equal(await records.countDocuments(), 3);
      const stored = await records.findOne({ email: nested.email });
      assert.equal(stored!.detail, "Retained inner");
      assert.equal(stored!.reference,"AB-1234");
      const invalid = [
        { ...hidden, note: "forged" },
        { ...hidden, detail: "forged" },
        { ...hidden, plan: "Option two" },
        { ...outerBody, note: undefined },
        { ...outerBody, detail: "forged" },
        { ...outerBody, audience: "forged" },
        { ...nested, detail: undefined },
        { ...nested, detail: "" },
        { ...nested, note: undefined },
        { ...nested, plan: "Option one" },
        { ...nested, business: "false" },
        { ...nested, audience: "Option one" },
        { ...nested, reference: "ab-1234" },
        { ...nested, reference: "AB-1234\n" },
        { ...nested, reference: "AB-12345" },
      ];
      for (const body of invalid) {
        const r = await fetch(apiOrigin + "/api/submissions", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(body),
        });
        assert.equal(r.status, 400, JSON.stringify(body));
      }
      assert.equal(await records.countDocuments(), 3);
      await fill("retry");
      await toggle.check();
      await note.fill("Retry outer");
      await plan.selectOption("Option two");
      await detail.fill("Retry inner");
      await stop(backend);
      await submit.click();
      await expect(page.getByRole("status")).not.toHaveText(/Working|Done/);
      await expect(detail).toHaveValue("Retry inner");
      backend = startBackend();
      await ready(apiOrigin + "/health");
      await save();
      assert.equal(await records.countDocuments(), 4);
      await expect(outer).toBeHidden();
      await expect(inner).toBeHidden();
      await toggle.check();
      await plan.selectOption("Option two");
      await detail.fill("Reset me");
      await page
        .locator("form")
        .evaluate((node) => (node as HTMLFormElement).reset());
      await expect(outer).toBeHidden();
      await expect(inner).toBeHidden();
      await toggle.check();
      await plan.selectOption("Option two");
      await expect(detail).toHaveValue("");
      await page.reload();
      await expect(outer).toBeHidden();
      await expect(inner).toBeHidden();
      await mkdir(".verification/compound-conditions", { recursive: true });
      for (const width of [320, 768, 1024, 1440]) {
        await page.setViewportSize({ width, height: 1100 });
        await toggle.check();
        await plan.selectOption("Option two");
        await expect(inner).toBeVisible();
        assert.ok(
          await page.evaluate(
            () => document.documentElement.scrollWidth <= innerWidth,
          ),
        );
        assert.ok(
          await page.locator("form").evaluate((form) =>
            Array.from(form.querySelectorAll("input,select,fieldset"))
              .filter(
                (node) => !(node as HTMLInputElement).matches(":disabled"),
              )
              .every((node) => {
                const box = node.getBoundingClientRect(),
                  parent = form.getBoundingClientRect();
                return (
                  box.left >= parent.left - 1 && box.right <= parent.right + 1
                );
              }),
          ),
        );
        if (width === 320 || width === 1440)
          await page.screenshot({
            path: `.verification/compound-conditions/production-${width}.png`,
            fullPage: true,
          });
        await toggle.uncheck();
        await expect(inner).toBeHidden();
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
