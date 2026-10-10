import test from "node:test";
import assert from "node:assert/strict";
import { spawn, execFile, type ChildProcess } from "node:child_process";
import { createServer } from "node:net";
import { randomBytes } from "node:crypto";
import { mkdir, readFile } from "node:fs/promises";
import path from "node:path";
import { MongoMemoryServer } from "mongodb-memory-server";
import { MongoClient } from "mongodb";
import { SITE_STARTERS } from "../../src/lib/site-starters";

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

for (const starter of SITE_STARTERS)
  test(
    `downloaded ${starter.id} starter runs navigation, submissions, recovery and private access`,
    { timeout: 120000 },
    async () => {
      process.env.PLAYWRIGHT_BROWSERS_PATH ||= path.resolve(
        ".verification/browsers",
      );
      const { chromium, expect } = await import("@playwright/test");
      const root = path.resolve(
        `.verification/starter-${starter.id}-production`,
      );
      const project = JSON.parse(
        await readFile(path.join(root, "levoks.project.json"), "utf8"),
      );
      const resourceService = project.backend.services[0];
      const resourceName = resourceService.name
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, "-")
        .replace(/^-|-$/g, "");
      const identityName = `${resourceName}-operators`;
      const inbox = resourceService.blocks.find(
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
      const client = new MongoClient(mongo.getUri()),
        children: ChildProcess[] = [];
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
      const resourceRoot = path.join(root, "backend", resourceName),
        identityRoot = path.join(root, "backend", identityName);
      const startResource = () =>
        launch(path.join(resourceRoot, "server.js"), resourceRoot, {
          NODE_ENV: "production",
          PORT: new URL(apiOrigin).port,
          MONGO_URI: mongo.getUri("starter_records"),
          CORS_ORIGINS: origin,
          JWT_SECRET: jwt,
          AUTH_IDENTITY_ORIGIN: identityOrigin,
        });
      let browser: Awaited<ReturnType<typeof chromium.launch>> | undefined;
      try {
        await client.connect();
        const records = client.db("starter_records").collection("submissions");
        launch(path.join(identityRoot, "server.js"), identityRoot, {
          NODE_ENV: "production",
          PORT: new URL(identityOrigin).port,
          MONGO_URI: mongo.getUri("starter_accounts"),
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
        await ready(apiOrigin + "/health");
        await ready(identityOrigin + "/health");
        await ready(origin);
        browser = await chromium.launch();
        const page = await browser.newPage({
            viewport: { width: 1440, height: 1000 },
          }),
          errors: string[] = [];
        page.on("pageerror", (error) => errors.push(error.message));
        await page.goto(origin);
        await expect(
          page.getByRole("heading", { name: starter.headline, exact: true }),
        ).toBeVisible();
        await page.getByRole("link", { name: "Contact", exact: true }).click();
        await expect(
          page.getByRole("heading", { name: starter.contact, exact: true }),
        ).toBeInViewport();
        await expect
          .poll(() => page.evaluate(() => scrollY))
          .toBeGreaterThan(0);
        const name = page.getByLabel("Your name", { exact: true }),
          email = page.getByLabel("Email address", { exact: true }),
          submit = page.getByRole("button", {
            name: starter.button,
            exact: true,
          });
        let posts = 0;
        page.on("request", (req) => {
          if (req.method() === "POST" && req.url().endsWith("/api/submissions"))
            posts++;
        });
        await submit.click();
        await expect(name).toBeFocused();
        assert.equal(posts, 0);
        const fill = async (visitor: string) => {
          await name.fill(visitor);
          await email.fill(`${visitor}@example.test`);
          if (starter.id === "workshop")
            await page
              .getByLabel("Session", { exact: true })
              .selectOption("Morning");
          else
            await page
              .getByLabel("Message", { exact: true })
              .fill("An enquiry from the working starter.");
        };
        const save = async () => {
          const response = page.waitForResponse(
            (r) =>
              r.request().method() === "POST" &&
              r.url().endsWith("/api/submissions"),
          );
          await submit.click();
          const result = await response;
          assert.equal(result.status(), 201);
          await expect(page.getByRole("status")).toHaveText(
            "Thank you. Your submission has been saved.",
          );
          return result.request().postDataJSON();
        };
        await fill("first");
        const body = await save();
        const stored = await records.findOne({ email: body.email });
        assert.ok(stored);
        assert.equal(stored.name, "first");
        assert.equal(
          starter.id === "workshop" ? stored.session : stored.message,
          starter.id === "workshop"
            ? "Morning"
            : "An enquiry from the working starter.",
        );
        await expect(name).toHaveValue("");
        for (const invalid of [
          { ...body, name: "" },
          { ...body, email: "bad" },
          starter.id === "workshop"
            ? { ...body, session: "forged" }
            : { ...body, message: "" },
        ]) {
          const response = await fetch(apiOrigin + "/api/submissions", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify(invalid),
          });
          assert.equal(response.status, 400);
        }
        assert.equal(await records.countDocuments(), 1);
        await fill("retry");
        await stop(resource);
        await submit.click();
        await expect(page.getByRole("status")).not.toHaveText(
          /Working|Thank you/,
        );
        await expect(name).toHaveValue("retry");
        resource = startResource();
        await ready(apiOrigin + "/health");
        await save();
        assert.equal(await records.countDocuments(), 2);
        await fill("reset");
        await page
          .locator("form")
          .evaluate((node) => (node as HTMLFormElement).reset());
        await expect(name).toHaveValue("");
        if (starter.id === "workshop")
          await expect(page.getByLabel("Session", { exact: true })).toHaveValue(
            "",
          );
        await page.reload();
        await expect(name).toHaveValue("");
        await mkdir(".verification/site-starters", { recursive: true });
        for (const width of [320, 768, 1024, 1440]) {
          await page.setViewportSize({ width, height: 1000 });
          assert.ok(
            await page.locator(".page").evaluate((artboard) => {
              const parent = artboard.getBoundingClientRect();
              return Array.from(artboard.children)
                .filter((child) => child.className.startsWith("el-"))
                .every(
                  (child) =>
                    child.getBoundingClientRect().bottom <= parent.bottom + 1,
                );
            }),
            `${starter.id} full page containment at ${width}px`,
          );
          assert.ok(
            await page.evaluate(
              () => document.documentElement.scrollWidth <= innerWidth,
            ),
            `${starter.id} at ${width}px`,
          );
          assert.ok(
            await page.locator("form").evaluate((form) =>
              Array.from(
                form.querySelectorAll("input,select,textarea,button"),
              ).every((node) => {
                const box = node.getBoundingClientRect(),
                  parent = form.getBoundingClientRect();
                return (
                  box.left >= parent.left &&
                  box.right <= parent.right &&
                  box.bottom <= parent.bottom
                );
              }),
            ),
          );
          if (width === 320 || width === 1440)
            await page.screenshot({
              path: `.verification/site-starters/${starter.id}-${width}.png`,
              fullPage: true,
            });
        }
        const inboxPath = `/__levoks/inbox/${resourceName}/${inbox.id}`;
        await page.goto(origin + inboxPath);
        await expect(page.locator("main").getByRole("alert")).toContainText(
          "Sign in",
        );
        await page
          .getByRole("link", {
            name: "Sign in or set up operator",
            exact: true,
          })
          .click();
        await page
          .getByRole("button", { name: "Set up first operator", exact: true })
          .click();
        await page
          .getByLabel("Email address", { exact: true })
          .fill("operator@example.test");
        await page.getByLabel("Name", { exact: true }).fill("Starter operator");
        await page
          .getByLabel("Password", { exact: true })
          .fill("Local starter password 123!");
        await page.getByLabel("Setup code", { exact: true }).fill(setup);
        await page
          .getByRole("button", { name: "Create first operator", exact: true })
          .click();
        await expect(page.getByRole("status")).toContainText(
          "Operator account created",
        );
        await page
          .getByLabel("Password", { exact: true })
          .fill("Local starter password 123!");
        await page
          .getByRole("button", { name: "Sign in to account", exact: true })
          .click();
        await expect(
          page.getByRole("heading", {
            name: "Welcome, Starter operator",
            exact: true,
          }),
        ).toBeVisible();
        await page.goto(origin + inboxPath);
        await expect(page.locator("tbody tr")).toHaveCount(2);
        await expect(
          page.getByRole("cell", { name: "first", exact: true }),
        ).toBeVisible();
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
