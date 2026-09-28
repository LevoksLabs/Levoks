import { test, expect } from "@playwright/test";
import { mkdir, writeFile, readFile } from "node:fs/promises";
import path from "node:path";
import JSZip from "jszip";
import { canvasAppFixture } from "../helpers/canvas-app-fixture";
import { compileProject } from "../../src/lib/project/compiler";

test("canvas preview follows real routes, blocks backend simulation, and downloads the complete compiled application", async ({
  page,
}) => {
  const fixture = canvasAppFixture();
  await page.goto("/");
  await expect(
    page.getByRole("button", { name: "Save project", exact: true }),
  ).toBeEnabled();
  await page
    .getByRole("button", { name: "Untitled project", exact: true })
    .click();
  const workspace = page.getByRole("dialog", {
    name: "Levoks project workspace",
  });
  await workspace.locator('input[type="file"]').setInputFiles({
    name: "canvas.json",
    mimeType: "application/json",
    buffer: Buffer.from(JSON.stringify(fixture.project)),
  });
  await expect(
    workspace.getByLabel("Project name", { exact: true }),
  ).toHaveValue("Canvas application (import)");
  await workspace.getByRole("button", { name: "Close workspace" }).click();
  await page.getByRole("button", { name: "Routes", exact: true }).click();
  await page
    .getByRole("button", { name: "Home: Reset draft output port", exact: true })
    .click();
  await page
    .getByRole("button", {
      name: "Home: Navigate here input port",
      exact: true,
    })
    .click();
  await expect(page.locator(".graph-connection-status")).toContainText(
    "10 connections",
  );
  // Replace the direct response redirect with another endpoint in this service.
  await page
    .getByRole("button", {
      name: "Entries: refresh response output port",
      exact: true,
    })
    .click();
  await page
    .getByRole("button", { name: "Entries: confirm input port", exact: true })
    .click();
  await expect(page.locator(".graph-connection-status")).toContainText(
    "10 connections",
  );
  await page.screenshot({ path: ".verification/routing-return-paths.png" });
  await page
    .getByRole("button", { name: "Elements (Shift+E)", exact: true })
    .click();
  const canvasInputSize = await page
    .locator(`.canvas-page [data-element-id="${fixture.title}"]`)
    .evaluate((el) => ({
      width: getComputedStyle(el).width,
      height: getComputedStyle(el).height,
    }));
  await page.getByRole("button", { name: "Preview", exact: true }).click();
  await expect(page.getByLabel("Preview mode")).toHaveValue("generated");
  const iframe = page.locator('iframe[title="Generated frontend preview"]');
  const frame = page.frameLocator('iframe[title="Generated frontend preview"]');
  await expect(iframe).toHaveAttribute("sandbox", "allow-scripts allow-forms");
  await expect(frame.getByText("Scroll animation", { exact: true })).toHaveCSS(
    "opacity",
    "1",
  );
  expect(
    await frame.getByPlaceholder("Entry title").evaluate((el) => ({
      width: getComputedStyle(el).width,
      height: getComputedStyle(el).height,
    })),
  ).toEqual(canvasInputSize);
  const inputBox = await frame.getByPlaceholder("Quantity").boundingBox();
  const saveBox = await frame
    .getByRole("button", { name: "Save entry", exact: true })
    .boundingBox();
  expect(saveBox!.y).toBeGreaterThanOrEqual(inputBox!.y + inputBox!.height);
  await frame.getByPlaceholder("Entry title").fill("Preview item");
  await frame.getByPlaceholder("Quantity").fill("2");
  await frame.getByRole("button", { name: "Save entry", exact: true }).click();
  await expect(frame.getByRole("status")).toContainText(
    "No data was sent or saved",
  );
  await expect(frame.getByPlaceholder("Entry title")).toHaveValue(
    "Preview item",
  );
  await frame
    .getByRole("button", { name: "Reload via backend", exact: true })
    .click();
  await expect(frame.getByRole("status")).toContainText(
    "No data was sent or saved",
  );
  await expect(frame.getByPlaceholder("Entry title")).toHaveValue(
    "Preview item",
  );
  await frame.getByRole("button", { name: "Reset draft", exact: true }).click();
  await expect(frame.getByPlaceholder("Entry title")).toHaveValue("");
  await expect(frame.getByRole("status")).toHaveText("");
  // Native form events are enabled, but CSP must still block real form transport.
  const blocked = await frame.locator("form").evaluate(
    (form) =>
      new Promise<string>((resolve) => {
        document.addEventListener(
          "securitypolicyviolation",
          (event) => resolve(event.violatedDirective),
          { once: true },
        );
        (form as HTMLFormElement).action = "https://example.invalid/collect";
        HTMLFormElement.prototype.submit.call(form);
      }),
  );
  expect(blocked).toBe("form-action");
  // A forged message from the editor window must not change the iframe page.
  await page.evaluate(
    (id) =>
      window.postMessage({ type: "levoks:preview:navigate", pageId: id }, "*"),
    fixture.details,
  );
  await expect(frame.getByPlaceholder("Entry title")).toBeVisible();
  await frame
    .getByRole("button", { name: "Browse entries", exact: true })
    .press("Enter");
  await expect(
    frame.getByRole("heading", { name: "Entry saved", exact: true }),
  ).toBeVisible();
  await frame
    .getByRole("button", { name: "Back to form", exact: true })
    .click();
  await frame.getByRole("button", { name: "facebook", exact: true }).click();
  await expect(
    frame.getByRole("heading", { name: "Entry saved", exact: true }),
  ).toBeVisible();
  expect(
    await frame.locator("body").evaluate(() => {
      try {
        void parent.document.body;
        return false;
      } catch {
        return true;
      }
    }),
  ).toBe(true);
  await page.screenshot({ path: ".verification/canvas-preview.png" });
  await page
    .getByRole("button", { name: "Back To Editor", exact: true })
    .click();
  await page.getByLabel("Deploy options", { exact: true }).click();
  const downloaded = page.waitForEvent("download");
  await page
    .getByRole("button", { name: "Download application ZIP", exact: true })
    .click();
  const destination = path.resolve(".verification/canvas-export.zip");
  await mkdir(path.dirname(destination), { recursive: true });
  await (await downloaded).saveAs(destination);
  const zip = await JSZip.loadAsync(await readFile(destination));
  const snapshot = JSON.parse(
    await zip.file("levoks.project.json")!.async("string"),
  );
  const output = compileProject(snapshot);
  expect(
    output.diagnostics.filter((item) => item.severity === "error"),
  ).toEqual([]);
  expect(
    Object.values(zip.files)
      .filter((file) => !file.dir)
      .map((file) => file.name)
      .sort(),
  ).toEqual(Object.keys(output.files).sort());
  for (const [file, content] of Object.entries(output.files))
    expect(await zip.file(file)!.async("string"), file).toBe(content);
  await writeFile(
    ".verification/canvas-fixture.json",
    JSON.stringify({ ...fixture, project: snapshot }),
  );
  // A reachable endpoint cycle must fail visibly, not preview a truncated flow.
  await page.getByRole("button", { name: "Routes", exact: true }).click();
  await page
    .getByRole("button", {
      name: "Entries: confirm response output port",
      exact: true,
    })
    .click();
  await page
    .getByRole("button", { name: "Entries: refresh input port", exact: true })
    .click();
  await page.getByRole("button", { name: "Preview", exact: true }).click();
  await expect(
    page.locator(".generated-preview").getByRole("alert"),
  ).toContainText("circular connection");
  await expect(
    page.locator('iframe[title="Generated frontend preview"]'),
  ).toHaveCount(0);
});
