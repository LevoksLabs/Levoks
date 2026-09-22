import test from "node:test";
import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { readFile } from "node:fs/promises";
import { createRequire } from "node:module";
import path from "node:path";
process.env.PLAYWRIGHT_BROWSERS_PATH ||= path.resolve(".verification/browsers");

test(
  "exported production frontend executes widgets, responsive styles and motion",
  { timeout: 60000 },
  async () => {
    const { chromium, expect } = await import("@playwright/test");
    const require = createRequire(import.meta.url);
    const fixture = JSON.parse(
      await readFile(".verification/design-fixture.json", "utf8"),
    );
    const address = "http://127.0.0.1:3218";
    const server = spawn(
      process.execPath,
      [
        require.resolve("next/dist/bin/next"),
        "start",
        "--hostname",
        "127.0.0.1",
        "--port",
        "3218",
      ],
      {
        cwd: path.resolve(".verification/design-app/frontend"),
        windowsHide: true,
        env: { ...process.env, NEXT_TELEMETRY_DISABLED: "1" },
        stdio: ["ignore", "pipe", "pipe"],
      },
    );
    let log = "";
    server.stdout.on("data", (chunk) => {
      log += chunk;
    });
    server.stderr.on("data", (chunk) => {
      log += chunk;
    });
    let browser;
    try {
      const deadline = Date.now() + 30000;
      while (true) {
        try {
          if ((await fetch(address)).ok) break;
        } catch {
          /* Wait for the owned production server. */
        }
        if (server.exitCode !== null || Date.now() > deadline)
          throw new Error(`Exported server did not start: ${log}`);
        await new Promise((resolve) => setTimeout(resolve, 200));
      }
      browser = await chromium.launch();
      const page = await browser.newPage({
        viewport: { width: 1280, height: 1000 },
      });
      const errors: string[] = [];
      page.on("pageerror", (error) => errors.push(error.message));
      await page.goto(address);
      await expect(
        page.getByText("Overview content", { exact: true }),
      ).toBeVisible();
      await page
        .getByRole("tab", { name: "Overview", exact: true })
        .press("ArrowRight");
      await expect(
        page.getByText("Details content", { exact: true }),
      ).toBeVisible();
      await expect(
        page.getByRole("button", { name: "Repeated action", exact: true }),
      ).toHaveCount(3);
      await expect(
        page
          .getByRole("button", { name: "Repeated action", exact: true })
          .first(),
      ).toHaveCSS("background-color", "rgb(85, 51, 136)");
      await expect(page.locator(`.el-${fixture.gallery}`)).toHaveCSS(
        "display",
        "grid",
      );
      await expect(
        page.locator(`.el-${fixture.primitive} path`),
      ).toHaveAttribute("d", "M50 2 L98 98 L2 98Z");
      await expect(page.locator(`.el-${fixture.vector}`)).toHaveCSS(
        "transform",
        "matrix(1, 0, 0, 1, 40, 0)",
      );
      await page.setViewportSize({ width: 390, height: 844 });
      await expect(page.locator(`.el-${fixture.tabs}`)).toHaveCSS(
        "left",
        "12px",
      );
      await expect(page.locator(`.el-${fixture.tabs}`)).toHaveCSS(
        "width",
        "350px",
      );
      await page.emulateMedia({ reducedMotion: "reduce" });
      const duration = await page
        .locator(`.el-${fixture.vector}`)
        .evaluate((el) => parseFloat(getComputedStyle(el).animationDuration));
      assert.ok(duration <= 0.001);
      assert.deepEqual(errors, []);
      await page.screenshot({
        path: ".verification/design-export-runtime.png",
      });
    } finally {
      await browser?.close();
      server.kill();
    }
  },
);
