import test from "node:test";
import assert from "node:assert/strict";
import { readFile, writeFile, mkdtemp, cp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { createServer } from "node:http";
import { spawn, type ChildProcess } from "node:child_process";
import path from "node:path";
import { MongoMemoryServer } from "mongodb-memory-server";
import { MongoClient } from "mongodb";
import { generatedPreview } from "../../src/lib/project/preview";

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
    child.once("exit", () => resolve());
    child.kill();
  });
}

test(
  "downloaded canvas application persists typed data, follows routes, matches preview rendering and recovers from real errors",
  { timeout: 120000 },
  async () => {
    const root = path.resolve(".verification/canvas-app");
    const fixture = JSON.parse(
      await readFile(".verification/canvas-fixture.json", "utf8"),
    );
    process.env.PLAYWRIGHT_BROWSERS_PATH ||= path.resolve(
      ".verification/browsers",
    );
    const { chromium, expect } = await import("@playwright/test");
    const children: ChildProcess[] = [];
    let logs = "";
    const launch = (
      args: string[],
      env: Record<string, string>,
      cwd: string,
    ) => {
      const child = spawn(process.execPath, args, {
        cwd,
        env: { ...process.env, ...env },
        stdio: ["ignore", "pipe", "pipe"],
        windowsHide: true,
      });
      child.stdout!.on("data", (value) => {
        logs = (logs + value).slice(-20000);
      });
      child.stderr!.on("data", (value) => {
        logs = (logs + value).slice(-20000);
      });
      children.push(child);
      return child;
    };
    const database = await MongoMemoryServer.create({
      binary: { downloadDir: path.resolve(".verification/mongodb-bin") },
      instance: { ip: "127.0.0.1" },
    });
    const client = new MongoClient(database.getUri("canvas_runtime"));
    let browser: import("@playwright/test").Browser | undefined;
    let standalone = "";
    try {
      browser = await chromium.launch();
      await client.connect();
      const frontendPort = await freePort(),
        backendPort = await freePort();
      const origin = `http://127.0.0.1:${frontendPort}`,
        apiOrigin = `http://127.0.0.1:${backendPort}`;
      const backend = launch(
        ["server.js"],
        {
          PORT: String(backendPort),
          NODE_ENV: "production",
          MONGO_URI: database.getUri("canvas_runtime"),
          CORS_ORIGINS: origin,
        },
        path.join(root, "backend/entries"),
      );
      const frontend = launch(
        [
          path.join(root, "frontend/node_modules/next/dist/bin/next"),
          "start",
          "--hostname",
          "127.0.0.1",
          "--port",
          String(frontendPort),
        ],
        {
          NODE_ENV: "production",
          API_ORIGIN_4101: apiOrigin,
          APP_ORIGIN: origin,
          NEXT_TELEMETRY_DISABLED: "1",
        },
        path.join(root, "frontend"),
      );
      for (const url of [apiOrigin + "/health", origin])
        await expect
          .poll(
            async () => {
              try {
                const response = await fetch(url);
                await response.body?.cancel();
                return response.status;
              } catch {
                return 0;
              }
            },
            {
              timeout: 30000,
              message: `Generated application startup: ${url}`,
            },
          )
          .toBe(200);
      const page = await browser.newPage({
        viewport: { width: 1100, height: 1000 },
      });
      const errors: string[] = [];
      page.on("pageerror", (error) => errors.push(error.message));
      await page.goto(origin);
      // Compare browser-computed geometry/styles, not generated source strings.
      const measure = () =>
        page.locator(`.el-${fixture.form}`).evaluate((el) => {
          const style = getComputedStyle(el);
          return {
            left: style.left,
            top: style.top,
            width: style.width,
            height: style.height,
            display: style.display,
            color: style.color,
            background: style.backgroundColor,
          };
        });
      const exportedStyle = await measure();
      const preview = await browser.newPage({
        viewport: { width: 1100, height: 1000 },
      });
      await preview.setContent(
        '<iframe sandbox="allow-scripts allow-forms" style="border:0;width:1100px;height:1000px"></iframe>',
      );
      await preview.locator("iframe").evaluate(
        (el, html) => {
          (el as HTMLIFrameElement).srcdoc = html;
        },
        generatedPreview(fixture.project, fixture.project.editor.activePageId),
      );
      const frame = preview.frameLocator("iframe");
      await expect(frame.locator(`.el-${fixture.form}`)).toBeVisible();
      const previewStyle = await frame
        .locator(`.el-${fixture.form}`)
        .evaluate((el) => {
          const style = getComputedStyle(el);
          return {
            left: style.left,
            top: style.top,
            width: style.width,
            height: style.height,
            display: style.display,
            color: style.color,
            background: style.backgroundColor,
          };
        });
      assert.deepEqual(exportedStyle, previewStyle);
      await expect(
        frame.getByText("Scroll animation", { exact: true }),
      ).toHaveCSS("opacity", "1");
      await expect(
        page.getByText("Scroll animation", { exact: true }),
      ).toHaveCSS("opacity", "1");
      await preview.close();
      await page
        .getByRole("button", { name: "Browse entries", exact: true })
        .press("Enter");
      await expect(page).toHaveURL(origin + "/entries");
      await page
        .getByRole("button", { name: "Back to form", exact: true })
        .click();
      await page.getByRole("button", { name: "facebook", exact: true }).click();
      await expect(page).toHaveURL(origin + "/entries");
      await page
        .getByRole("button", { name: "Back to form", exact: true })
        .click();
      const fill = async (title: string, quantity: string, active: boolean) => {
        await page.getByPlaceholder("Entry title").fill(title);
        await page.getByPlaceholder("Quantity").fill(quantity);
        await page.getByRole("checkbox").setChecked(active);
      };
      await fill("First entry", "2", true);
      const savedResponse = page.waitForResponse(
        (response) =>
          response.url() === origin + "/__levoks/api/4101/entries" &&
          response.request().method() === "POST",
      );
      await page
        .getByRole("button", { name: "Save entry", exact: true })
        .click();
      const savedResult = await savedResponse;
      assert.equal(savedResult.ok(), true, savedResult.ok() ? "" : await savedResult.text());
      await expect(page).toHaveURL(origin + "/entries");
      const collection = client.db().collection("entries");
      const saved = await collection.findOne({ title: "First entry" });
      assert.ok(saved, "Canvas form must persist a real MongoDB document");
      assert.equal(saved.quantity, 2);
      assert.equal(saved.active, true);
      await page.reload();
      await expect(
        page.getByRole("heading", { name: "Entry saved", exact: true }),
      ).toBeVisible();
      await page.getByPlaceholder("Entry ID").fill(saved._id.toString());
      const foundResponse = page.waitForResponse((response) =>
        response.url().includes("/__levoks/api/4101/entries/"),
      );
      await page
        .getByRole("button", { name: "Find entry", exact: true })
        .click();
      const found = await foundResponse;
      assert.equal(found.status(), 200);
      assert.match(await found.text(), /First entry/);
      await expect(page.getByRole("status")).toHaveText("Done");
      await page.getByPlaceholder("Entry ID").fill("not-an-id");
      await page
        .getByRole("button", { name: "Find entry", exact: true })
        .click();
      await expect(page.getByRole("status")).toContainText(
        "Invalid resource ID",
      );
      await page
        .getByRole("button", { name: "Back to form", exact: true })
        .click();
      await fill("First entry", "3", false);
      const conflict = page.waitForResponse((response) =>
        response.url().endsWith("/4101/entries"),
      );
      await page
        .getByRole("button", { name: "Save entry", exact: true })
        .click();
      assert.equal((await conflict).status(), 409);
      await expect(page.getByRole("status")).not.toHaveText("Working…");
      await expect(page).toHaveURL(origin + "/");
      await expect(page.getByPlaceholder("Entry title")).toHaveValue(
        "First entry",
      );
      await fill("Second entry", "4", false);
      await page
        .getByRole("button", { name: "Save entry", exact: true })
        .click();
      await expect(page).toHaveURL(origin + "/entries");
      assert.equal(
        (await collection.findOne({ title: "Second entry" }))?.active,
        false,
      );
      assert.equal(await collection.countDocuments(), 2);
      await page
        .getByRole("button", { name: "Back to form", exact: true })
        .click();
      // Run the production artifact outside this repository with no Levoks dependencies.
      await stop(frontend);
      standalone = await mkdtemp(path.join(tmpdir(), "levoks-canvas-"));
      await cp(path.join(root, "frontend/.next/standalone"), standalone, {
        recursive: true,
      });
      await cp(
        path.join(root, "frontend/.next/static"),
        path.join(standalone, ".next/static"),
        { recursive: true },
      );
      launch(
        ["server.js"],
        {
          PORT: String(frontendPort),
          HOSTNAME: "127.0.0.1",
          NODE_ENV: "production",
          API_ORIGIN_4101: apiOrigin,
          APP_ORIGIN: origin,
        },
        standalone,
      );
      await expect
        .poll(
          async () => {
            try {
              const response = await fetch(origin);
              await response.body?.cancel();
              return response.status;
            } catch {
              return 0;
            }
          },
          { timeout: 30000 },
        )
        .toBe(200);
      await page.goto(origin);
      assert.deepEqual(await measure(), exportedStyle);
      await fill("Portable entry", "6", true);
      await page
        .getByRole("button", { name: "Save entry", exact: true })
        .click();
      await expect(page).toHaveURL(origin + "/entries");
      assert.equal(
        (await collection.findOne({ title: "Portable entry" }))?.quantity,
        6,
      );
      await page
        .getByRole("button", { name: "Back to form", exact: true })
        .click();
      await stop(backend);
      await fill("Unavailable entry", "5", true);
      await page
        .getByRole("button", { name: "Save entry", exact: true })
        .click();
      await expect(page.getByRole("status")).toContainText(
        "Application service is unavailable",
      );
      await expect(page.locator("form")).not.toHaveAttribute("aria-busy");
      assert.equal(await collection.countDocuments(), 3);
      assert.deepEqual(errors, []);
      await page.screenshot({
        path: ".verification/canvas-export-runtime.png",
      });
    } finally {
      await writeFile(".verification/canvas-runtime-processes.log", logs);
      await browser?.close();
      for (const child of children.reverse()) await stop(child);
      await client.close();
      await database.stop();
      if (standalone) {
        const resolved = path.resolve(standalone);
        if (
          path.dirname(resolved) !== path.resolve(tmpdir()) ||
          !path.basename(resolved).startsWith("levoks-canvas-")
        )
          throw new Error("Unsafe temporary cleanup path");
        await rm(resolved, { recursive: true, force: true });
      }
    }
  },
);
