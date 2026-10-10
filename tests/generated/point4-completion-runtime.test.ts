import test from "node:test";
import assert from "node:assert/strict";
import { spawn, execFile } from "node:child_process";
import { readFile, mkdir } from "node:fs/promises";
import path from "node:path";
process.env.PLAYWRIGHT_BROWSERS_PATH ||= path.resolve(".verification/browsers");

test(
  "actual downloaded authoring app retains custom layouts, semantic content and native widget lifecycle in production",
  { timeout: 120000 },
  async () => {
    const { chromium, expect } = await import("@playwright/test");
    const root = path.resolve(".verification/point4-completion-app");
    const project = JSON.parse(
      await readFile(path.join(root, "levoks.project.json"), "utf8"),
    );
    const elements = Object.values(project.editor.elementsById) as {
      id: string;
      label: string;
      definitionId?: string;
      props: Record<string, unknown>;
    }[];
    const id = (label: string) =>
      elements.find((node) => node.label === label)!.id;
    const origin = "http://127.0.0.1:3229";
    const server = spawn(
      process.execPath,
      [
        path.join(root, "frontend/node_modules/next/dist/bin/next"),
        "start",
        "--hostname",
        "127.0.0.1",
        "--port",
        "3229",
      ],
      {
        cwd: path.join(root, "frontend"),
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
          if ((await fetch(origin)).ok) break;
        } catch {
          /* Wait for this owned production server. */
        }
        if (server.exitCode !== null || Date.now() > deadline)
          throw new Error(log);
        await new Promise((resolve) => setTimeout(resolve, 200));
      }
      browser = await chromium.launch();
      const page = await browser.newPage({
        viewport: { width: 1280, height: 1000 },
      });
      await page.route("https://www.openstreetmap.org/**", (route) =>
        route.abort(),
      );
      const errors: string[] = [];
      page.on("pageerror", (error) => errors.push(error.message));
      await page.goto(origin);
      await expect(page.locator(`#${id("Article")} strong`)).toHaveText(
        "Format",
      );
      await expect(
        page.getByRole("heading", { name: "A semantic heading" }),
      ).toBeVisible();
      await expect(
        page.locator(`#${id("Milestones")} > li`).nth(1),
      ).toContainText("Published");
      await expect(
        page.locator(`#${id("Milestones")} > li`).nth(1),
      ).toContainText("First complete release");
      for (const [width, left] of [
        [1280, 60],
        [1000, 60],
        [880, 24],
        [768, 24],
        [390, 24],
      ]) {
        await page.setViewportSize({ width, height: 1000 });
        assert.equal(
          await page
            .locator(`#${id("Responsive heading")}`)
            .evaluate((node) => getComputedStyle(node).left),
          `${left}px`,
        );
      }
      await page.setViewportSize({ width: 1280, height: 1000 });
      const hint = page.getByRole("button", {
        name: "Hint trigger",
        exact: true,
      });
      await hint.focus();
      await expect(page.getByRole("tooltip")).toBeVisible();
      await page.keyboard.press("Escape");
      await expect(page.getByRole("tooltip")).toBeHidden();
      await hint.hover();
      await expect(page.getByRole("tooltip")).toBeVisible();
      await page.mouse.move(2, 2);
      await expect(page.getByRole("tooltip")).toBeHidden();
      const trigger = page.getByRole("button", {
        name: "Details trigger",
        exact: true,
      });
      await trigger.click();
      await expect(trigger).toHaveAttribute("aria-expanded", "true");
      await expect(
        page.getByRole("dialog", { name: "Details trigger" }),
      ).toContainText("Popover details");
      await page.keyboard.press("Escape");
      await expect(trigger).toHaveAttribute("aria-expanded", "false");
      const open = page.getByRole("button", {
        name: "Open settings",
        exact: true,
      });
      await open.click();
      const drawer = page.getByRole("dialog", { name: "Settings drawer" });
      await expect(drawer).toBeVisible();
      const rect = (await drawer.boundingBox())!;
      assert.ok(Math.abs(rect.x + rect.width - 1280) < 1);
      await page.keyboard.press("Escape");
      await expect(open).toBeFocused();
      await page.getByRole("button", { name: "Dismiss notification" }).click();
      await expect(
        page.getByText("Saved notification", { exact: true }),
      ).toBeHidden();
      await expect(page.locator(`#${id("Location")}`)).toHaveAttribute(
        "src",
        /openstreetmap.org\/export\/embed.html\?bbox=/,
      );
      const navigation = page.getByRole("navigation", {
        name: "Site navigation",
      });
      await expect(
        navigation.getByRole("link", { name: "Article", exact: true }),
      ).toHaveAttribute("href", `#${id("Article")}`);
      await navigation
        .getByRole("link", { name: "Article", exact: true })
        .click();
      await expect(page).toHaveURL(`${origin}/#${id("Article")}`);
      await expect(
        page.getByRole("link", { name: "facebook", exact: true }),
      ).toHaveAttribute("href", "https://example.com/profile");
      assert.equal(
        await page
          .locator(`#${id("Spacing")}`)
          .evaluate((node) => getComputedStyle(node).height),
        "85px",
      );
      assert.equal(
        await page
          .locator(`#${id("Photos")}`)
          .evaluate((node) => getComputedStyle(node).gap),
        "0px",
      );
      assert.equal(
        await page
          .locator(`#${id("Photos")}`)
          .evaluate(
            (node) =>
              getComputedStyle(node).gridTemplateColumns.split(" ").length,
          ),
        2,
      );
      await expect(
        page.getByText("Repeated card", { exact: true }),
      ).toHaveCount(2);
      assert.equal(
        await page
          .locator(`#${id("Repeated cards")}`)
          .evaluate((node) => getComputedStyle(node).gap),
        "18px",
      );
      assert.match(
        await page
          .locator(`#${id("Curve")}`)
          .evaluate((node) => getComputedStyle(node).transform),
        /^matrix3d\(/,
      );
      assert.deepEqual(errors, []);
      await mkdir(".verification/point4-completion", { recursive: true });
      await page.screenshot({
        path: ".verification/point4-completion/production.png",
      });
    } finally {
      await browser?.close();
      if (server.exitCode === null && server.signalCode === null)
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
  },
);
