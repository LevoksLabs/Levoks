import test from "node:test";
import assert from "node:assert/strict";
import { readFile, mkdir } from "node:fs/promises";
import { createServer } from "node:net";
import { spawn, execFile } from "node:child_process";
import path from "node:path";
import type { ProjectDocument } from "../../src/lib/project/schema";

test(
  "downloaded production pages keep global and detached component children in their saved containers",
  { timeout: 60000 },
  async () => {
    process.env.PLAYWRIGHT_BROWSERS_PATH ||= path.resolve(
      ".verification/browsers",
    );
    const { chromium, expect } = await import("@playwright/test");
    const root = path.resolve(".verification/nested-global-app");
    const project: ProjectDocument = JSON.parse(
      await readFile(path.join(root, "levoks.project.json"), "utf8"),
    );
    const nodes = Object.values(project.editor.elementsById);
    const id = (label: string) =>
      nodes.find((node) => node.label === label)!.id;
    const listener = createServer();
    await new Promise<void>((resolve) =>
      listener.listen(0, "127.0.0.1", resolve),
    );
    const port = (listener.address() as { port: number }).port;
    await new Promise<void>((resolve) => listener.close(() => resolve()));
    const origin = `http://127.0.0.1:${port}`;
    const server = spawn(
      process.execPath,
      [
        path.join(root, "frontend/node_modules/next/dist/bin/next"),
        "start",
        "--hostname",
        "127.0.0.1",
        "--port",
        String(port),
      ],
      {
        cwd: path.join(root, "frontend"),
        windowsHide: true,
        env: { ...process.env, NEXT_TELEMETRY_DISABLED: "1" },
        stdio: ["ignore", "pipe", "pipe"],
      },
    );
    let log = "";
    for (const stream of [server.stdout!, server.stderr!])
      stream.on("data", (chunk) => {
        log = (log + String(chunk)).slice(-10000);
      });
    let browser: Awaited<ReturnType<typeof chromium.launch>> | undefined;
    try {
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
        viewport: { width: 1440, height: 1000 },
      });
      const errors: string[] = [];
      page.on("pageerror", (error) => errors.push(error.message));
      for (const route of project.editor.pages) {
        await page.goto(origin + route.route);
        await expect(
          page.locator(`#${id("Global B")} #${id("Global note")}`),
        ).toHaveText("Shared footer message");
        await expect(page.locator(`#${id("Global note")}`)).toHaveCount(1);
        if (route.route === "/") {
          await expect(
            page.locator(`#${id("Page group")} #${id("Linked note")}`),
          ).toHaveText("Reusable card text");
          await expect(
            page.locator(`#${id("Linked card")} #${id("Linked note")}`),
          ).toHaveCount(0);
        } else
          await expect(page.locator(`#${id("Linked note")}`)).toHaveCount(0);
        await page.reload();
        await expect(
          page.locator(`#${id("Global B")} #${id("Global note")}`),
        ).toHaveCount(1);
      }
      assert.deepEqual(errors, []);
      await page.goto(origin);
      await mkdir(".verification/nested-editing", { recursive: true });
      await page.screenshot({
        path: ".verification/nested-editing/production-desktop.png",
      });
    } catch (error) {
      throw new Error(`Nested export verification failed: ${log}`, {
        cause: error,
      });
    } finally {
      await browser?.close();
      if (server.exitCode === null && server.signalCode === null) {
        await new Promise<void>((resolve) => {
          if (process.platform === "win32")
            execFile(
              "taskkill",
              ["/PID", String(server.pid), "/T", "/F"],
              { windowsHide: true },
              () => resolve(),
            );
          else {
            server.once("exit", () => resolve());
            server.kill();
          }
        });
      }
    }
  },
);
