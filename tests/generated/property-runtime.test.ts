import test from "node:test";
import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import path from "node:path";
import { readFileSync, writeFileSync } from "node:fs";
process.env.PLAYWRIGHT_BROWSERS_PATH ||= path.resolve(".verification/browsers");

test(
  "production ZIP application preserves inspector styles, radio behavior and sandboxed embeds",
  { timeout: 90000 },
  async () => {
    const { chromium, expect } = await import("@playwright/test");
    const cwd = path.resolve(".verification/property-app/frontend");
    const server = spawn(
      process.execPath,
      [
        path.join(cwd, "node_modules/next/dist/bin/next"),
        "start",
        "--hostname",
        "127.0.0.1",
        "--port",
        "3229",
      ],
      {
        cwd,
        windowsHide: true,
        env: { ...process.env, NEXT_TELEMETRY_DISABLED: "1" },
        stdio: ["ignore", "pipe", "pipe"],
      },
    );
    let log = "";
    server.stdout.on("data", (chunk) => (log += chunk));
    server.stderr.on("data", (chunk) => (log += chunk));
    let browser;
    try {
      const deadline = Date.now() + 30000;
      while (true) {
        try {
          if ((await fetch("http://127.0.0.1:3229")).ok) break;
        } catch {}
        if (server.exitCode !== null || Date.now() > deadline)
          throw new Error(log);
        await new Promise((resolve) => setTimeout(resolve, 200));
      }
      browser = await chromium.launch();
      const page = await browser.newPage({
        viewport: { width: 1600, height: 1000 },
      });
      const errors: string[] = [];
      page.on("pageerror", (error) => errors.push(error.message));
      await page.goto("http://127.0.0.1:3229");
      const tabs = page.locator("[data-levoks-tabs]");
      await expect(tabs).toHaveCSS("background-color", "rgb(219, 1, 1)");
      await expect(tabs).toHaveCSS("border-top-left-radius", "24px");
      await expect(tabs).toHaveCSS("padding-left", "20px");
      await expect(tabs).toHaveCSS("font-size", "20px");
      await expect(tabs.getByRole("tab").nth(1)).toHaveCSS(
        "color",
        "rgb(255, 255, 0)",
      );
      await tabs.getByRole("tab").nth(1).press("ArrowRight");
      await expect(tabs.getByText("Contact content")).toBeVisible();
      await page.screenshot({
        path: ".verification/functional/production-desktop.png",
      });
      for (const width of [1024, 390]) {
        await page.setViewportSize({ width, height: 844 });
        await expect(tabs).toHaveCSS("background-color", "rgb(219, 1, 1)");
        await expect(tabs).toHaveCSS(
          "width",
          width === 1024 ? "500px" : "350px",
        );
        await tabs.getByRole("tab").last().press("Home");
        await expect(tabs.getByText("Overview content")).toBeVisible();
      }
      await page.goto("http://127.0.0.1:3229/radio");
      const male = page.getByRole("radio", { name: "Male", exact: true }),
        premium = page.getByRole("radio", { name: "Premium", exact: true });
      await expect(male).toBeChecked();
      await page.getByText("Premium", { exact: true }).click();
      await expect(premium).toBeChecked();
      await expect(male).not.toBeChecked();
      await premium.press("ArrowLeft");
      await expect(male).toBeChecked();
      await expect(male).toBeFocused();
      await expect(
        page.getByRole("radio", { name: "Disabled option" }),
      ).toBeDisabled();
      assert.equal(
        await premium.evaluate(
          (el: HTMLInputElement) => el.required && el.checkValidity(),
        ),
        true,
      );
      await page.goto("http://127.0.0.1:3229/embed");
      const embed = page.frameLocator("iframe");
      await expect(
        embed.getByRole("heading", { name: "Embedded hello" }),
      ).toBeVisible();
      await expect(embed.locator("body")).toHaveAttribute(
        "data-executed",
        "yes",
      );
      await expect(embed.locator("body")).toHaveAttribute(
        "data-isolated",
        "yes",
      );
      await expect(page.locator("body")).not.toHaveAttribute(
        "data-escaped",
        "yes",
      );
      await expect(page.locator("iframe")).toHaveAttribute(
        "sandbox",
        "allow-scripts",
      );
      await page.goto("http://127.0.0.1:3229/controls");
      await expect(page.getByRole("link", { name: "Continue", exact: true })).toHaveAttribute("href", "#field");
      await expect(page.getByRole("link", { name: "Continue", exact: true })).toHaveCSS("width", "240px");
      await expect(page.getByLabel("Email address", { exact: true })).toHaveValue("hello@example.com");
      assert.equal(await page.getByLabel("Email address", { exact: true }).evaluate((el: HTMLInputElement) => el.checkValidity()), true);
      await page.getByLabel("Email address", { exact: true }).fill("invalid");
      assert.equal(await page.getByLabel("Email address", { exact: true }).evaluate((el: HTMLInputElement) => el.checkValidity()), false);
      await expect(page.getByRole("combobox", { name: "Select", exact: true })).toHaveValue("Option two");
      await page.goto("http://127.0.0.1:3229/catalog", { waitUntil: "domcontentloaded" });
      const census = JSON.parse(readFileSync(".verification/element-audit/census.json", "utf8"));
      const runtime = [];
      for (const row of census) {
        const element = page.locator(`.el-fixture4_${row.id}`);
        await expect(element).toHaveCount(1);
        const rendered = await element.evaluate(el => ({
          tag: el.tagName, background: getComputedStyle(el).backgroundColor,
          text: el.textContent, html: el.innerHTML,
        }));
        assert.equal(rendered.background, row.preview.background, `${row.definition} fill differs between preview and production`);
        runtime.push({ definition: row.definition, ...rendered });
      }
      writeFileSync(".verification/element-audit/production.json", JSON.stringify(runtime, null, 2));
      assert.deepEqual(errors, []);
    } finally {
      await browser?.close();
      server.kill();
    }
  },
);
