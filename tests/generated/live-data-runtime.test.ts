import test from "node:test";
import assert from "node:assert/strict";
import { readFile, mkdir } from "node:fs/promises";
import { spawn, execFile, type ChildProcess } from "node:child_process";
import { createServer } from "node:net";
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
  "actual downloaded production application reads live table/collection/repeater records and survives malformed responses, outages and restarts",
  { timeout: 120000 },
  async () => {
    process.env.PLAYWRIGHT_BROWSERS_PATH ||= path.resolve(
      ".verification/browsers",
    );
    const { chromium, expect } = await import("@playwright/test");
    const root = path.resolve(".verification/live-data-app"),
      frontendPort = await freePort(),
      apiPort = await freePort();
    const origin = `http://127.0.0.1:${frontendPort}`;
    const mongo = await MongoMemoryServer.create({
      binary: { downloadDir: path.resolve(".verification/mongodb-bin") },
    });
    const client = new MongoClient(mongo.getUri("records"));
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
    const startBackend = () =>
      launch(
        path.join(root, "backend/entries/server.js"),
        [],
        path.join(root, "backend/entries"),
        {
          NODE_ENV: "production",
          PORT: String(apiPort),
          MONGO_URI: mongo.getUri("records"),
          CORS_ORIGINS: origin,
        },
      );
    let browser: Awaited<ReturnType<typeof chromium.launch>> | undefined;
    try {
      await client.connect();
      let backend = startBackend();
      launch(
        path.join(root, "frontend/node_modules/next/dist/bin/next"),
        ["start", "--hostname", "127.0.0.1", "--port", String(frontendPort)],
        path.join(root, "frontend"),
        {
          APP_ORIGIN: origin,
          API_ORIGIN_4101: `http://127.0.0.1:${apiPort}`,
          NEXT_TELEMETRY_DISABLED: "1",
        },
      );
      await expect
        .poll(
          async () =>
            fetch(origin)
              .then((r) => r.status)
              .catch(() => 0),
          { timeout: 30000 },
        )
        .toBe(200);
      await expect
        .poll(
          async () =>
            fetch(`http://127.0.0.1:${apiPort}/health`)
              .then((r) => r.status)
              .catch(() => 0),
          { timeout: 30000 },
        )
        .toBe(200);
      const project = JSON.parse(
        await readFile(path.join(root, "levoks.project.json"), "utf8"),
      );
      const tableId = Object.values(project.editor.elementsById).find(
        (node: unknown) =>
          (node as { definitionId: string }).definitionId === "table",
      ) as { id: string };
      browser = await chromium.launch();
      const page = await browser.newPage({
        viewport: { width: 1400, height: 1100 },
      });
      await page.goto(origin);
      const table = page.locator(`.el-${tableId.id}`),
        collection = page.locator(".el-live_collection"),
        repeater = page.locator(".el-live_repeater");
      await expect(
        table.getByText("No entries yet.", { exact: true }),
      ).toBeVisible();
      for (const [title, quantity] of [
        ["Production record", 0],
        ["<script>unsafe()</script>", 1],
        ["Last page", 2],
      ] as const) {
        await page.getByPlaceholder("Entry title", { exact: true }).fill(title);
        await page
          .getByPlaceholder("Quantity", { exact: true })
          .fill(String(quantity));
        const response = page.waitForResponse(
          (r) =>
            r.request().method() === "POST" && r.url().endsWith("/entries"),
        );
        await page
          .getByRole("button", { name: "Save entry", exact: true })
          .click();
        assert.equal((await response).status(), 200);
        await expect(table.locator("tbody tr")).toHaveCount(
          Math.min(quantity + 1, 2),
        );
      }
      await expect(table.locator("tbody tr").first().locator("td")).toHaveText([
        "Production record",
        "false",
        "0",
      ]);
      await expect(collection.locator("article")).toHaveCount(2);
      await expect(repeater.locator("article")).toHaveCount(2);
      await expect(
        collection.getByText("<script>unsafe()</script>", { exact: true }),
      ).toBeVisible();
      assert.equal(await page.evaluate(() => "unsafe" in window), false);
      const cards = await collection.locator("article").evaluateAll((nodes) =>
        nodes.map((n) => ({
          x: n.getBoundingClientRect().x,
          y: n.getBoundingClientRect().y,
          width: n.getBoundingClientRect().width,
        })),
      );
      assert.equal(cards[0].y, cards[1].y);
      assert.ok(cards[1].x > cards[0].x);
      assert.ok(
        await table.evaluate(
          (node) =>
            node.getBoundingClientRect().right <=
            document.querySelector(".page")!.getBoundingClientRect().right,
        ),
      );
      assert.ok(
        await page.evaluate(() => {
          const ids = Array.from(
            document.querySelectorAll("[id]"),
            (node) => node.id,
          );
          return new Set(ids).size === ids.length;
        }),
        "record instances must have distinct DOM ids",
      );
      await mkdir(".verification/live-data", { recursive: true });
      await page.screenshot({
        path: ".verification/live-data/production-desktop.png",
        fullPage: true,
      });
      await table
        .getByRole("button", { name: "Next page", exact: true })
        .click();
      await expect(table.getByText("Last page", { exact: true })).toBeVisible();
      for (const body of [
        { rows: [] },
        [{ _id: "duplicate" }, { _id: "duplicate" }],
        Array.from({ length: 3 }, (_, i) => ({ _id: String(i) })),
      ]) {
        await page.route("**/__levoks/api/4101/entries?*", (route) =>
          route.fulfill({
            status: 200,
            contentType: "application/json",
            body: JSON.stringify(body),
          }),
        );
        await table
          .getByRole("button", { name: "Refresh records", exact: true })
          .click();
        await expect(table.getByRole("alert")).toHaveText(
          "Records could not be loaded. Please retry.",
        );
        await expect(table.locator("tbody tr")).toHaveCount(0);
        await page.unroute("**/__levoks/api/4101/entries?*");
        await table
          .getByRole("button", { name: "Retry loading records", exact: true })
          .click();
        await expect(
          table.getByText("Last page", { exact: true }),
        ).toBeVisible();
      }
      await stop(backend);
      await table
        .getByRole("button", { name: "Refresh records", exact: true })
        .click();
      await expect(table.getByRole("alert")).toHaveText(
        "Records could not be loaded. Please retry.",
      );
      backend = startBackend();
      await expect
        .poll(async () =>
          fetch(`http://127.0.0.1:${apiPort}/health`)
            .then((r) => r.status)
            .catch(() => 0),
        )
        .toBe(200);
      await table
        .getByRole("button", { name: "Retry loading records", exact: true })
        .click();
      await expect(table.getByText("Last page", { exact: true })).toBeVisible();
      assert.equal(
        await client.db("records").collection("entries").countDocuments(),
        3,
      );
      await page.setViewportSize({ width: 390, height: 900 });
      await expect(table.getByText("Last page", { exact: true })).toBeVisible();
      assert.ok(
        await page.evaluate(
          () => document.documentElement.scrollWidth <= innerWidth,
        ),
      );
      const mobileCards = await collection
        .locator("article")
        .evaluateAll((nodes) => nodes.map((n) => n.getBoundingClientRect().y));
      assert.ok(mobileCards[1] > mobileCards[0]);
      const mobileRoots = await page
        .locator('.page > [class^="el-"]')
        .evaluateAll((nodes) =>
          nodes.map((node) => ({
            top: node.getBoundingClientRect().top,
            bottom: node.getBoundingClientRect().bottom,
          })),
        );
      for (let i = 1; i < mobileRoots.length; i++)
        assert.ok(
          mobileRoots[i].top >= mobileRoots[i - 1].bottom,
          "mobile roots must contain their records without overlapping adjacent content",
        );
      await page.screenshot({
        path: ".verification/live-data/production-mobile.png",
        fullPage: true,
      });
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
