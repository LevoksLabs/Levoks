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
  "downloaded conditional forms enforce active required fields and reject hidden values before storage",
  { timeout: 120000 },
  async () => {
    process.env.PLAYWRIGHT_BROWSERS_PATH ||= path.resolve(
      ".verification/browsers",
    );
    const { chromium, expect } = await import("@playwright/test");
    const root = path.resolve(".verification/conditional-app");
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
    const backendRoot = path.join(root, "backend/conditional-enquiries");
    const startBackend = () =>
      launch(path.join(backendRoot, "server.js"), backendRoot, {
        NODE_ENV: "production",
        PORT: new URL(apiOrigin).port,
        MONGO_URI: mongo.getUri("conditional_records"),
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
      const records = client
        .db("conditional_records")
        .collection("submissions");
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

      const controller = page.getByRole("checkbox", {
        name: "Business enquiry",
        exact: true,
      });
      const details = page.locator('fieldset[aria-label="Company details"]');
      const group = page.locator("[data-checkbox-group]");
      const company = details.getByLabel("Company name", { exact: true });
      const personalDetails = page.locator(
        'fieldset[aria-label="Personal details"]',
      );
      const personalNote = personalDetails.getByLabel("Personal note", {
        exact: true,
      });
      const website = group.getByRole("checkbox", {
        name: "Website",
        exact: true,
      });
      const submit = page.getByRole("button", { name: "Submit", exact: true });
      let posts = 0;
      page.on("request", (request) => {
        if (
          request.method() === "POST" &&
          request.url().endsWith("/api/submissions")
        )
          posts++;
      });
      const fill = async (name: string) => {
        await page.getByPlaceholder("Your name", { exact: true }).fill(name);
        await page
          .getByPlaceholder("Your email", { exact: true })
          .fill(name.toLowerCase().replaceAll(" ", "-") + "@example.test");
      };
      const save = async () => {
        const response = page.waitForResponse(
          (response) =>
            response.request().method() === "POST" &&
            response.url().endsWith("/api/submissions"),
        );
        await submit.click();
        const saved = await response;
        assert.equal(saved.status(), 201);
        await expect(page.getByRole("status")).toHaveText("Done");
        return saved.request().postDataJSON();
      };
      await expect(details).toBeHidden();
      await expect(company).toBeDisabled();
      await expect(group).toBeHidden();
      await expect(personalDetails).toBeVisible();
      await expect(personalNote).toHaveValue("Personal enquiry");
      await fill("Personal visitor");
      const personal = await save();
      assert.equal(personal.business, false);
      assert.equal(personal.personalNote, "Personal enquiry");
      assert.equal(personal.company, undefined);
      assert.equal(personal.services, undefined);
      await expect.poll(() => records.countDocuments()).toBe(1);
      const storedPersonal = await records.findOne({ email: personal.email });
      assert.equal(storedPersonal!.business, false);
      assert.equal(storedPersonal!.personalNote, "Personal enquiry");
      assert.equal(storedPersonal!.company, undefined);
      assert.deepEqual(storedPersonal!.services, []);
      await fill("Business visitor");
      await controller.check();
      await expect(details).toBeVisible();
      await expect(company).toBeEnabled();
      await expect(personalDetails).toBeHidden();
      await submit.click();
      await expect(company).toBeFocused();
      assert.equal(posts, 1);
      await company.fill("Example company");
      await submit.click();
      await expect(page.getByRole("status")).toContainText(
        "Choose at least one option",
      );
      await expect(website).toBeFocused();
      assert.equal(posts, 1);
      await website.check();
      await controller.uncheck();
      await expect(company).toBeDisabled();
      await controller.check();
      await expect(company).toHaveValue("Example company");
      await expect(website).toBeChecked();
      const business = await save();
      assert.equal(business.business, true);
      assert.equal(business.personalNote, undefined);
      assert.equal(business.company, "Example company");
      assert.deepEqual(business.services, ["website"]);
      await expect.poll(() => records.countDocuments()).toBe(2);
      const storedBusiness = await records.findOne({ email: business.email });
      assert.equal(storedBusiness!.company, "Example company");
      assert.equal(storedBusiness!.personalNote, undefined);
      assert.deepEqual(storedBusiness!.services, ["website"]);
      await expect(controller).not.toBeChecked();
      await expect(details).toBeHidden();
      await expect(group).toBeHidden();
      const invalidBodies = [
        { ...personal, personalNote: undefined },
        { ...business, personalNote: "forged" },
        { ...business, company: undefined },
        { ...business, company: "" },
        { ...business, services: undefined },
        { ...business, services: [] },
        { ...business, services: ["forged"] },
        { ...business, services: ["website", "website"] },
        { ...personal, company: "forged" },
        { ...personal, company: "" },
        { ...personal, services: [] },
        { ...personal, services: ["website"] },
        { ...personal, business: undefined },
        { ...personal, business: "false" },
        { ...personal, business: null },
        { ...business, business: false },
      ];
      for (const body of invalidBodies) {
        const response = await fetch(apiOrigin + "/api/submissions", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(body),
        });
        assert.equal(response.status, 400, JSON.stringify(body));
      }
      assert.equal(await records.countDocuments(), 2);
      // Failure leaves the active section and entries intact for a real retry.
      await fill("Retry visitor");
      await controller.check();
      await company.fill("Retry company");
      await website.check();
      await stop(backend);
      await submit.click();
      await expect(page.getByRole("status")).not.toHaveText(/Working|Done/);
      await expect(company).toHaveValue("Retry company");
      await expect(website).toBeChecked();
      await expect(controller).toBeChecked();
      backend = startBackend();
      await ready(apiOrigin + "/health");
      await save();
      await expect.poll(() => records.countDocuments()).toBe(3);
      await fill("Reset visitor");
      await controller.check();
      await company.fill("Reset company");
      await website.check();
      await page
        .locator("form")
        .evaluate((node) => (node as HTMLFormElement).reset());
      await expect(controller).not.toBeChecked();
      await expect(details).toBeHidden();
      await expect(group).toBeHidden();
      await expect(personalNote).toHaveValue("Personal enquiry");
      await controller.check();
      await expect(company).toHaveValue("");
      await expect(website).not.toBeChecked();
      // SSR and hydration agree about the default hidden state after a reload.
      await page.reload();
      await expect(details).toBeHidden();
      await expect(group).toBeHidden();
      await controller.check();
      await company.fill("Responsive company");
      await website.check();
      await mkdir(".verification/form-conditions", { recursive: true });
      for (const width of [320, 768, 1024, 1440]) {
        await page.setViewportSize({ width, height: 1100 });
        assert.ok(
          await page.evaluate(
            () => document.documentElement.scrollWidth <= innerWidth,
          ),
          `page overflow at ${width}px`,
        );
        for (const container of [page.locator("form"), details, group])
          assert.ok(
            await container.evaluate((node) => {
              const parent = node.getBoundingClientRect();
              const boxes = Array.from(node.children)
                .filter(
                  (child) =>
                    child.className.startsWith("el-") &&
                    child.getClientRects().length,
                )
                .map((child) => child.getBoundingClientRect());
              return boxes.every(
                (box, i) =>
                  box.left >= parent.left - 1 &&
                  box.right <= parent.right + 1 &&
                  box.bottom <= parent.bottom + 1 &&
                  (i === 0 || box.top >= boxes[i - 1].bottom - 1),
              );
            }),
            `contained form controls at ${width}px`,
          );
        if (width === 320 || width === 1440)
          await page.screenshot({
            path: `.verification/form-conditions/production-${width}.png`,
            fullPage: true,
          });
        await controller.uncheck();
        await expect(personalDetails).toBeVisible();
        await expect(details).toBeHidden();
        await expect(group).toBeHidden();
        await controller.check();
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
