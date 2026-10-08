import { openEditor } from "../helpers/open-editor";
import { test, expect, type Page } from "@playwright/test";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import JSZip from "jszip";

async function open(page: Page) {
  await openEditor(page);
  await expect(
    page.getByRole("button", { name: "Save project", exact: true }),
  ).toBeEnabled();
}
async function add(page: Page, name: string) {
  await page
    .getByRole("textbox", { name: "Search elements", exact: true })
    .fill(name);
  await page
    .getByRole("button", { name: `Add ${name}`, exact: true })
    .dblclick();
  return page
    .locator(".canvas-page .element-selected")
    .getAttribute("data-element-id");
}
async function exact(page: Page, label: string, value: string) {
  const input = page
    .locator(".inspector")
    .getByRole("spinbutton", { name: label, exact: true });
  await input.fill(value);
  await input.press("Enter");
}
async function download(page: Page, directory: string) {
  await page.getByLabel("Deploy options", { exact: true }).click();
  const waiting = page.waitForEvent("download");
  await page
    .getByRole("button", { name: "Download application ZIP", exact: true })
    .click();
  await mkdir(directory, { recursive: true });
  const zipPath = path.join(directory, "application.zip");
  await (await waiting).saveAs(zipPath);
  const zip = await JSZip.loadAsync(await readFile(zipPath));
  for (const [name, file] of Object.entries(zip.files))
    if (!file.dir) {
      const destination = path.resolve(directory, name);
      if (!destination.startsWith(path.resolve(directory) + path.sep))
        throw new Error("Invalid ZIP path");
      await mkdir(path.dirname(destination), { recursive: true });
      await writeFile(destination, await file.async("nodebuffer"));
    }
  return JSON.parse(await zip.file("levoks.ir.json")!.async("string"));
}

test("Tabs inspector changes reach canvas, history, saved IR, preview and export", async ({
  page,
}) => {
  await open(page);
  const id = await add(page, "Tabs");
  const tab = page.locator(`[data-element-id="${id}"]`);
  await page
    .getByRole("textbox", { name: "Background", exact: true })
    .fill("#db0101");
  await page
    .getByRole("textbox", { name: "Text color", exact: true })
    .fill("#ffffff");
  await exact(page, "X", "40");
  await exact(page, "Y", "40");
  await exact(page, "W", "600");
  await exact(page, "H", "300");
  await exact(page, "Font size", "20");
  await page.getByRole("button", { name: "Border", exact: true }).click();
  await page
    .locator(".inspector")
    .getByLabel("Style", { exact: true })
    .selectOption("solid");
  await exact(page, "Width", "3");
  await exact(page, "Radius", "24");
  await page
    .getByRole("textbox", { name: "Color", exact: true })
    .fill("#112233");
  await exact(page, "Padding", "12");
  await page
    .getByRole("button", { name: "Link padding values", exact: true })
    .click();
  await exact(page, "Padding left", "20");
  await expect(tab).toHaveCSS("background-color", "rgb(219, 1, 1)");
  await expect(tab).toHaveCSS("border-top-width", "3px");
  await expect(tab).toHaveCSS("border-top-left-radius", "24px");
  await expect(tab).toHaveCSS("padding-left", "20px");
  await expect(tab.getByRole("tabpanel").first()).toHaveCSS(
    "background-color",
    "rgba(0, 0, 0, 0)",
  );
  await page.getByLabel("Screen size", { exact: true }).click();
  await page.getByRole("button", { name: "Tablet portrait" }).click();
  await page.getByRole("button", { name: "Responsive", exact: true }).click();
  await exact(page, "W", "500");
  await page.getByRole("button", { name: "Save responsive changes" }).click();
  await page.getByLabel("Screen size", { exact: true }).click();
  await page.getByRole("button", { name: "Phone small" }).click();
  await page.getByRole("button", { name: "Responsive", exact: true }).click();
  await exact(page, "X", "12");
  await exact(page, "W", "350");
  await page.getByRole("button", { name: "Save responsive changes" }).click();
  await page.getByLabel("Screen size", { exact: true }).click();
  await page.getByRole("button", { name: "Desktop compact" }).click();
  await expect(tab).toHaveCSS("width", "600px");
  await mkdir(".verification/functional", { recursive: true });
  await page.screenshot({
    path: ".verification/functional/inspector-desktop.png",
  });
  await page.setViewportSize({ width: 1024, height: 768 });
  await page.screenshot({
    path: ".verification/functional/inspector-laptop.png",
  });
  await page.setViewportSize({ width: 1600, height: 1000 });
  await page.getByRole("button", { name: "Content", exact: true }).click();
  await page
    .getByRole("textbox", { name: "Tab content" })
    .fill("Overview content\nDetails content\nContact content");
  await page
    .getByRole("textbox", { name: "Active tab color", exact: true })
    .fill("#ffff00");
  await page
    .getByRole("textbox", { name: "Inactive tab color", exact: true })
    .fill("#ffffff");
  await exact(page, "Tab spacing", "10");
  await expect(tab.getByRole("tab").first()).toHaveCSS(
    "color",
    "rgb(255, 255, 0)",
  );
  await tab.getByRole("tab").first().press("ArrowRight");
  await expect(tab.getByText("Details content")).toBeVisible();
  await expect(tab.getByRole("tab").nth(1)).toBeFocused();
  await page.getByRole("button", { name: "Save project", exact: true }).click();
  await page.reload();
  await expect(tab).toHaveCSS("background-color", "rgb(219, 1, 1)");
  await expect(tab.getByText("Details content")).toBeVisible();
  const ir = await download(page, ".verification/functional-app");
  const node = ir.project.editor.elementsById[id!];
  expect(node.styles.backgroundColor).toBe("#db0101");
  expect(node.styles.paddingLeft).toBe("20px");
  await writeFile(
    ".verification/functional-app/tabs-id.json",
    JSON.stringify({ tabs: id }),
  );
  await page.getByRole("button", { name: "Preview", exact: true }).click();
  const frame = page.frameLocator('iframe[title="Generated frontend preview"]');
  await expect(frame.locator(`[data-levoks-tabs]`)).toHaveCSS(
    "background-color",
    "rgb(219, 1, 1)",
  );
  await frame.getByRole("tab").nth(1).press("End");
  await expect(frame.getByText("Contact content")).toBeVisible();
  await mkdir(".verification/functional", { recursive: true });
  await page.screenshot({ path: ".verification/functional/tabs-preview.png" });
});

test("parameter values drag outside the field, cancel, undo, enter exact values and preserve units", async ({
  page,
}) => {
  await open(page);
  const id = await add(page, "Tabs");
  const x = page.getByRole("spinbutton", { name: "X", exact: true });
  await exact(page, "X", "80");
  const box = (await x.boundingBox())!;
  await page.mouse.move(box.x + 25, box.y + 12);
  await page.mouse.down();
  await page.mouse.move(box.x - 135, box.y + 12, { steps: 12 });
  await page.mouse.up();
  await expect(x).toHaveValue("0");
  await page.getByRole("button", { name: "Undo", exact: true }).click();
  await expect(x).toHaveValue("80");
  await page.mouse.move(box.x + 25, box.y + 12);
  await page.mouse.down();
  await page.mouse.move(box.x - 35, box.y + 12, { steps: 5 });
  await page.keyboard.press("Escape");
  await page.mouse.up();
  await expect(x).toHaveValue("80");
  await x.fill("125");
  await x.press("Escape");
  await expect(x).toHaveValue("80");
  await exact(page, "X", "125");
  await expect(x).toHaveValue("125");
  await page.getByLabel("W unit", { exact: true }).selectOption("%");
  await exact(page, "W", "50");
  await expect(page.locator(`[data-element-id="${id}"]`)).toHaveCSS(
    "width",
    "960px",
  );
  await page.getByLabel("Font size unit", { exact: true }).selectOption("rem");
  await exact(page, "Font size", "1.25");
  await expect(page.locator(`[data-element-id="${id}"]`)).toHaveCSS(
    "font-size",
    "20px",
  );
  await page.getByRole("button", { name: "Save project", exact: true }).click();
  await page.reload();
  await expect(page.locator(`[data-element-id="${id}"]`)).toHaveCSS(
    "width",
    "960px",
  );
});

test("labeled radio controls preserve configured state and execute native group behavior", async ({
  page,
}) => {
  await open(page);
  for (const [label, y] of [
    ["Male", "40"],
    ["Premium", "100"],
    ["Disabled option", "160"],
    ["Required choice", "220"],
  ]) {
    await add(page, "Radio Button");
    await page.getByRole("button", { name: "Design", exact: true }).click();
    await exact(page, "X", "40");
    await exact(page, "Y", y);
    await page.getByRole("button", { name: "Content", exact: true }).click();
    await page.getByRole("textbox", { name: "Label", exact: true }).fill(label);
    await page
      .getByRole("textbox", { name: "Name", exact: true })
      .fill(label === "Required choice" ? "required-only" : "membership");
    await page
      .getByRole("textbox", { name: "Value", exact: true })
      .fill(label.toLowerCase());
    await page.getByRole("checkbox", { name: "Required", exact: true }).check();
    if (label === "Male")
      await page
        .getByRole("checkbox", { name: "Checked", exact: true })
        .check();
    if (label.startsWith("Disabled"))
      await page
        .getByRole("checkbox", { name: "Disabled", exact: true })
        .check();
    await expect(page.locator(".canvas-page .element-selected")).toContainText(
      label,
    );
  }
  await page.getByRole("button", { name: "Save project", exact: true }).click();
  await page.reload();
  await expect(
    page.locator(".canvas-page").getByText("Premium", { exact: true }),
  ).toBeVisible();
  await download(page, ".verification/radio-app");
  await page.getByRole("button", { name: "Preview", exact: true }).click();
  const frame = page.frameLocator('iframe[title="Generated frontend preview"]');
  await expect(
    frame.getByRole("radio", { name: "Male", exact: true }),
  ).toBeChecked();
  await frame.getByText("Premium", { exact: true }).click();
  await expect(
    frame.getByRole("radio", { name: "Premium", exact: true }),
  ).toBeChecked();
  await expect(
    frame.getByRole("radio", { name: "Male", exact: true }),
  ).not.toBeChecked();
  await frame
    .getByRole("radio", { name: "Premium", exact: true })
    .press("ArrowLeft");
  await expect(
    frame.getByRole("radio", { name: "Male", exact: true }),
  ).toBeChecked();
  await expect(
    frame.getByRole("radio", { name: "Disabled option", exact: true }),
  ).toBeDisabled();
  await expect(
    frame.getByRole("radio", { name: "Premium", exact: true }),
  ).toHaveAttribute("required", "");
  expect(
    await frame
      .getByRole("radio", { name: "Required choice" })
      .evaluate((el: HTMLInputElement) => el.checkValidity()),
  ).toBe(false);
  await frame.getByRole("radio", { name: "Required choice" }).press("Space");
  expect(
    await frame
      .getByRole("radio", { name: "Required choice" })
      .evaluate((el: HTMLInputElement) => el.checkValidity()),
  ).toBe(true);
});

test("Button and Input properties render and execute through the shared semantic tree", async ({
  page,
}) => {
  await open(page);
  const button = await add(page, "Button");
  await exact(page, "X", "40");
  await exact(page, "Y", "40");
  await page.getByRole("button", { name: "Sizing", exact: true }).click();
  await exact(page, "Min W", "240");
  await expect(page.locator(`[data-element-id="${button}"]`)).toHaveCSS("width", "240px");
  await expect(page.locator(`[data-element-id="${button}"] > button`)).toHaveCSS("width", "240px");
  await page.getByRole("button", { name: "Content", exact: true }).click();
  const inspector = page.locator(".inspector");
  await inspector.getByLabel("Label", { exact: true }).fill("Continue");
  await inspector.getByLabel("Icon", { exact: true }).selectOption("arrow");
  await inspector
    .getByLabel("Icon Position", { exact: true })
    .selectOption("right");
  await inspector.getByLabel("Loading", { exact: true }).check();
  await expect(
    page.locator(`[data-element-id="${button}"] > button`),
  ).toBeDisabled();
  await expect(page.locator(`[data-element-id="${button}"]`)).toContainText(
    "Loading…",
  );
  await inspector.getByLabel("Loading", { exact: true }).uncheck();
  await inspector.getByLabel("Link URL", { exact: true }).fill("#field");
  await expect(
    page.locator(`[data-element-id="${button}"] > a`),
  ).toHaveAttribute("href", "#field");
  const input = await add(page, "Input");
  await page.getByRole("button", { name: "Design", exact: true }).click();
  await exact(page, "X", "40");
  await exact(page, "Y", "120");
  await exact(page, "H", "100");
  await page.getByRole("button", { name: "Content", exact: true }).click();
  await inspector.getByLabel("Label", { exact: true }).fill("Email address");
  await inspector.getByLabel("Name", { exact: true }).fill("email");
  await inspector.getByLabel("Type", { exact: true }).selectOption("email");
  await inspector
    .getByLabel("Value", { exact: true })
    .fill("hello@example.com");
  await inspector
    .getByLabel("Helper Text", { exact: true })
    .fill("Use your work email");
  await expect(page.locator(`[data-element-id="${input}"]`)).toContainText(
    "Use your work email",
  );
  const select = await add(page, "Select");
  await page.getByRole("button", { name: "Design", exact: true }).click();
  await exact(page, "X", "40");
  await exact(page, "Y", "260");
  await page.getByRole("button", { name: "Content", exact: true }).click();
  await inspector.getByLabel("Value", { exact: true }).fill("Option two");
  await expect(
    page.locator(`[data-element-id="${select}"] select`),
  ).toHaveValue("Option two");
  await download(page, ".verification/controls-app");
  await page.getByRole("button", { name: "Preview", exact: true }).click();
  const frame = page.frameLocator('iframe[title="Generated frontend preview"]');
  await expect(
    frame.getByRole("link", { name: "Continue", exact: true }),
  ).toHaveAttribute("href", "#field");
  await expect(frame.getByRole("link", { name: "Continue", exact: true })).toHaveCSS("width", "240px");
  await expect(frame.getByLabel("Email address", { exact: true })).toHaveValue(
    "hello@example.com",
  );
  expect(
    await frame
      .getByLabel("Email address", { exact: true })
      .evaluate((el: HTMLInputElement) => el.checkValidity()),
  ).toBe(true);
  await frame.getByLabel("Email address", { exact: true }).fill("invalid");
  expect(
    await frame
      .getByLabel("Email address", { exact: true })
      .evaluate((el: HTMLInputElement) => el.checkValidity()),
  ).toBe(false);
  await expect(
    frame.getByRole("combobox", { name: "Select", exact: true }),
  ).toHaveValue("Option two");
});

test("embed accepts HTML, validates URL and executes opt-in code only inside the sandbox", async ({
  page,
}) => {
  await open(page);
  await add(page, "Embed");
  await page.getByRole("button", { name: "Content", exact: true }).click();
  const source =
    '<h1>Embedded hello</h1><script>document.body.dataset.executed="yes"; try { parent.document.body.dataset.escaped="yes" } catch { document.body.dataset.isolated="yes" }</script>';
  await page
    .getByRole("textbox", { name: "Embed source", exact: true })
    .fill(source);
  const embed = page.frameLocator(".canvas-page iframe");
  await expect(
    embed.getByRole("heading", { name: "Embedded hello" }),
  ).toBeVisible();
  await expect(embed.locator("body")).not.toHaveAttribute(
    "data-executed",
    "yes",
  );
  await page.getByRole("checkbox", { name: "Allow embed scripts" }).check();
  await expect(embed.locator("body")).toHaveAttribute("data-executed", "yes");
  await expect(embed.locator("body")).toHaveAttribute("data-isolated", "yes");
  await expect(page.locator("body")).not.toHaveAttribute("data-escaped", "yes");
  await page.screenshot({ path: ".verification/functional/embed-editor.png" });
  await page.getByLabel("Embed type", { exact: true }).selectOption("url");
  await page
    .getByLabel("Embed URL", { exact: true })
    .fill("javascript:alert(1)");
  await expect(page.locator(".inspector").getByRole("alert")).toContainText(
    "complete https://",
  );
  await page.getByLabel("Embed type", { exact: true }).selectOption("html");
  await page.getByRole("button", { name: "Save project", exact: true }).click();
  await page.reload();
  await expect(
    embed.getByRole("heading", { name: "Embedded hello" }),
  ).toBeVisible();
  const ir = await download(page, ".verification/embed-app");
  expect(
    Object.values(ir.project.editor.elementsById).some(
      (n: unknown) =>
        (n as { props: { source?: string } }).props.source === source,
    ),
  ).toBe(true);
  await page.getByRole("button", { name: "Preview", exact: true }).click();
  const nested = page
    .frameLocator('iframe[title="Generated frontend preview"]')
    .frameLocator("iframe");
  await expect(
    nested.getByRole("heading", { name: "Embedded hello" }),
  ).toBeVisible();
  await expect(nested.locator("body")).toHaveAttribute("data-isolated", "yes");
});
