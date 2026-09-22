import { test, expect, type Page } from "@playwright/test";
import {
  emptyProject,
  captureProject,
  restoreProject,
} from "../../src/lib/project/workspace";
import { useEditorStore } from "../../src/store/editorStore";
import { templates } from "../../src/templates";
import { programFixture } from "../helpers/program-fixture";
import { parseProject } from "../../src/lib/project/schema";

async function ready(page: Page) {
  await page.goto("/");
  await expect(
    page.getByRole("button", { name: "Save project", exact: true }),
  ).toBeEnabled();
}
function fixture() {
  const base = emptyProject("Northstar studio");
  base.editor.canvasSettings = {
    width: 1280,
    height: 900,
    backgroundColor: "#ffffff",
  };
  restoreProject(base);
  const store = useEditorStore.getState();
  store.addElement(
    {
      ...templates.text,
      label: "Brand",
      props: { content: "NORTHSTAR" },
      styles: {
        fontSize: "18px",
        fontWeight: 600,
        color: "#323038",
        letterSpacing: "2px",
      },
      layout: { w: 360, h: 40 },
    },
    undefined,
    96,
    68,
  );
  const heading = store.addElement(
    {
      ...templates.title,
      label: "Hero heading",
      props: { content: "A place for your\nnext big idea.", level: 1 },
      styles: {
        fontSize: "64px",
        fontWeight: 600,
        color: "#25232d",
        lineHeight: "1.1",
      },
      layout: { w: 660, h: 180 },
    },
    undefined,
    96,
    212,
  );
  const subtitle = store.addElement(
    {
      ...templates.text,
      label: "Intro copy",
      props: {
        content:
          "Thoughtful spaces. Independent minds.\nBuild something that matters.",
      },
      styles: { fontSize: "22px", color: "#777480", lineHeight: "1.65" },
      layout: { w: 580, h: 100 },
    },
    undefined,
    96,
    430,
  );
  const button = store.addElement(
    {
      ...templates.button,
      label: "Primary action",
      props: { label: "Explore the studio" },
      styles: {
        backgroundColor: "#e6dcff",
        color: "#342754",
        borderRadius: "8px",
        fontSize: "16px",
      },
      layout: { w: 220, h: 56 },
    },
    undefined,
    96,
    582,
  );
  const document = captureProject(base.id, base.name);
  return {
    document: parseProject({
      ...document,
      backend: { ...document.backend, services: [programFixture()] },
    }),
    heading,
    subtitle,
    button,
  };
}
async function importProject(page: Page) {
  const data = fixture();
  await page
    .getByRole("button", { name: "Untitled project", exact: true })
    .click();
  const dialog = page.getByRole("dialog", { name: "Levoks project workspace" });
  await dialog.locator("input[type=file]").setInputFiles({
    name: "studio.json",
    mimeType: "application/json",
    buffer: Buffer.from(JSON.stringify(data.document)),
  });
  await expect(dialog.getByLabel("Project name", { exact: true })).toHaveValue(
    "Northstar studio (import)",
  );
  await dialog.getByRole("button", { name: "Close workspace" }).click();
  return data;
}
const shot = (page: Page, name: string) =>
  page.screenshot({
    path: `.verification/ui-after-${name}.png`,
    animations: "disabled",
  });

test("editor navigation, group movement, undo and inspector fields respect the interaction context", async ({
  page,
}) => {
  await ready(page);
  const data = await importProject(page);
  const heading = page.locator(`[data-element-id="${data.heading}"]`),
    subtitle = page.locator(`[data-element-id="${data.subtitle}"]`);
  const headingRect = await heading.boundingBox(),
    subtitleRect = await subtitle.boundingBox();
  await page.mouse.move(headingRect!.x - 8, headingRect!.y - 8);
  await page.mouse.down();
  await page.mouse.move(
    headingRect!.x + headingRect!.width + 8,
    subtitleRect!.y + subtitleRect!.height + 8,
    { steps: 8 },
  );
  const marquee = await page.locator(".selection-box").boundingBox();
  expect(marquee!.x).toBeCloseTo(headingRect!.x - 8, 0);
  expect(marquee!.y).toBeCloseTo(headingRect!.y - 8, 0);
  await page.mouse.up();
  await expect(
    page.getByText("2 elements selected", { exact: true }),
  ).toBeVisible();
  await page.keyboard.press("Escape");
  await heading.click();
  await subtitle.click({ modifiers: ["Shift"] });
  await expect(
    page.getByText("2 elements selected", { exact: true }),
  ).toBeVisible();
  const beforeA = await heading.boundingBox(),
    beforeB = await subtitle.boundingBox();
  await page.keyboard.press("Shift+ArrowRight");
  const afterA = await heading.boundingBox(),
    afterB = await subtitle.boundingBox();
  expect(afterA!.x).toBeGreaterThan(beforeA!.x);
  expect(afterB!.x - beforeB!.x).toBeCloseTo(afterA!.x - beforeA!.x, 1);
  await page.keyboard.press("Control+z");
  expect((await heading.boundingBox())!.x).toBeCloseTo(beforeA!.x, 1);
  expect((await subtitle.boundingBox())!.x).toBeCloseTo(beforeB!.x, 1);
  await shot(page, "multi-selection");
  await heading.click();
  await page.keyboard.press("Escape");
  await heading.click();
  await page.keyboard.press("Enter");
  const edit = page.getByRole("textbox", { name: "Element text", exact: true });
  await expect(edit).toBeFocused();
  await edit.fill("Do not commit this");
  await page.keyboard.press("Escape");
  await expect(heading).not.toContainText("Do not commit this");
  const field = page.locator(".inspector").getByLabel("X", { exact: true });
  await field.focus();
  const position = await heading.boundingBox();
  await page.keyboard.press("ArrowRight");
  expect((await heading.boundingBox())!.x).toBeCloseTo(position!.x, 1);
  await heading.click();
  await page.keyboard.press("Shift+2");
  const selectionZoom = await page.getByLabel("Canvas zoom").inputValue();
  expect(Number(selectionZoom)).toBeGreaterThan(50);
  await page.keyboard.press("Shift+1");
  await expect
    .poll(async () => {
      const toolbar = await page.locator(".floating-toolbar").boundingBox();
      const element = await heading.boundingBox();
      return toolbar!.y + toolbar!.height <= element!.y;
    })
    .toBe(true);
  await shot(page, "selected-inspector");
  const workspace = page.getByLabel("UI canvas", { exact: true });
  const rect = await workspace.boundingBox();
  const transform = page.locator(".canvas-transform-layer");
  const initial = await transform.getAttribute("style");
  await page.mouse.move(rect!.x + 20, rect!.y + 80);
  await page.keyboard.down("Space");
  await page.mouse.down();
  await page.mouse.move(rect!.x + 95, rect!.y + 130, { steps: 8 });
  await page.mouse.up();
  await page.keyboard.up("Space");
  expect(await transform.getAttribute("style")).not.toBe(initial);
  await page
    .getByRole("button", { name: "Lock canvas navigation", exact: true })
    .click();
  const locked = await transform.getAttribute("style");
  await page.mouse.move(rect!.x + 20, rect!.y + 80);
  await page.mouse.wheel(0, 160);
  await page.keyboard.press("+");
  expect(await transform.getAttribute("style")).toBe(locked);
  await page
    .getByRole("button", { name: "Lock canvas navigation", exact: true })
    .click();
  await page.keyboard.press("?");
  await expect(
    page.getByRole("dialog", { name: "Keyboard shortcuts" }),
  ).toBeVisible();
  await shot(page, "shortcuts");
  await page.keyboard.press("Escape");
});

test("desktop surfaces and laptop layouts retain usable controls and save backend positions", async ({
  page,
}) => {
  await ready(page);
  await shot(page, "empty-desktop");
  for (const width of [1366, 1024]) {
    await page.setViewportSize({ width, height: 768 });
    await page.getByRole("button", { name: "Fit canvas", exact: true }).click();
    const deploy = await page
      .getByRole("banner")
      .getByRole("button", { name: "Deploy", exact: true })
      .boundingBox();
    expect(deploy!.x + deploy!.width).toBeLessThanOrEqual(width);
    const shortcuts = await page
      .getByRole("button", { name: "Shortcuts ?", exact: true })
      .boundingBox();
    expect(shortcuts!.y + shortcuts!.height).toBeLessThanOrEqual(768);
    await shot(page, `empty-${width}`);
  }
  await page.setViewportSize({ width: 1600, height: 1000 });
  await importProject(page);
  await page.getByRole("button", { name: "Fit canvas", exact: true }).click();
  await shot(page, "populated");
  await page
    .getByRole("button", { name: "Toggle inspector", exact: true })
    .click();
  await expect(page.locator(".editor-body > .inspector")).toBeHidden();
  await page
    .getByRole("button", { name: "Toggle inspector", exact: true })
    .click();
  await page.getByTitle("Backend Builder", { exact: true }).click();
  const service = page.locator(".service-container").first();
  const header = service.locator(".service-name");
  const start = await header.boundingBox();
  await page.mouse.move(start!.x + 15, start!.y + 8);
  await page.mouse.down();
  await page.mouse.move(start!.x + 95, start!.y + 48, { steps: 8 });
  await page.mouse.up();
  const moved = await service.getAttribute("style");
  expect(moved).toContain("left: 80px");
  await page.getByRole("button", { name: "Save project", exact: true }).click();
  await page.reload();
  await expect(
    page.getByRole("button", { name: "Save project", exact: true }),
  ).toBeEnabled();
  await page.getByTitle("Backend Builder", { exact: true }).click();
  await expect(page.locator(".service-container").first()).toHaveAttribute(
    "style",
    moved!,
  );
  await page.getByRole("button", { name: "Fit backend canvas" }).click();
  await shot(page, "backend");
  await page.getByTitle("Routes", { exact: true }).click();
  await page.getByRole("button", { name: "Add All", exact: true }).click();
  await page.keyboard.press("Shift+1");
  await shot(page, "routing");
  const search = page.getByPlaceholder("Search services...");
  if (await search.count()) {
    await search.fill("Service with spaces");
    await expect(search).toHaveValue("Service with spaces");
  }
  await page
    .getByRole("banner")
    .getByRole("button", { name: "Code", exact: true })
    .click();
  const dialog = page.getByRole("dialog", { name: "Levoks project workspace" });
  await dialog
    .getByLabel("Filter source files", { exact: true })
    .fill("frontend/app/page.jsx");
  await dialog
    .getByRole("button", { name: "frontend/app/page.jsx", exact: true })
    .click();
  await shot(page, "code");
  await dialog
    .getByRole("button", { name: "AI assistant", exact: true })
    .click();
  await shot(page, "ai");
  await dialog
    .getByRole("button", { name: "Connections", exact: true })
    .click();
  await expect(dialog.getByRole("alert")).toContainText("Sign in");
  await shot(page, "connections-permission");
  await dialog.getByRole("button", { name: "Close workspace" }).click();
  await page
    .getByRole("banner")
    .getByRole("button", { name: "Deploy", exact: true })
    .click();
  await shot(page, "deploy");
  await dialog.getByRole("button", { name: "Close workspace" }).click();
  await page
    .getByRole("banner")
    .getByRole("button", { name: "Preview", exact: true })
    .click();
  await expect(page.getByText("Design preview", { exact: true })).toBeVisible();
  await shot(page, "preview");
  await page.keyboard.press("Escape");
});

test("context menus, group clipboard, page controls and the floating assistant work with the keyboard", async ({
  page,
}) => {
  await ready(page);
  const data = await importProject(page);
  const heading = page.locator(`[data-element-id="${data.heading}"]`);
  const subtitle = page.locator(`[data-element-id="${data.subtitle}"]`);
  await heading.click();
  await subtitle.click({ modifiers: ["Shift"] });
  const elements = page.locator(".canvas-page [data-element-id]");
  await page.keyboard.press("Control+c");
  await page.keyboard.press("Control+v");
  await expect(elements).toHaveCount(6);
  await expect(
    page.getByText("2 elements selected", { exact: true }),
  ).toBeVisible();
  await page.keyboard.press("Control+z");
  await expect(elements).toHaveCount(4);
  await heading.click({ button: "right" });
  const menu = page.getByRole("menu", { name: "Actions for Hero heading" });
  await expect(menu.getByRole("menuitem", { name: /^Cut/ })).toBeFocused();
  await page.keyboard.press("ArrowDown");
  await expect(menu.getByRole("menuitem", { name: /^Copy/ })).toBeFocused();
  await shot(page, "context-menu");
  await page.keyboard.press("Escape");
  await expect(menu).toBeHidden();
  await page
    .getByRole("banner")
    .getByRole("button", { name: "AI", exact: true })
    .click();
  const assistant = page.getByRole("dialog", {
    name: "Levoks project workspace",
  });
  await expect(assistant).toHaveAttribute("aria-modal", "false");
  await heading.click();
  const before = await heading.boundingBox();
  await page.keyboard.press("ArrowRight");
  await expect
    .poll(async () => (await heading.boundingBox())!.x)
    .toBeGreaterThan(before!.x);
  await assistant
    .locator("summary")
    .filter({ hasText: "Provider & model" })
    .click();
  await shot(page, "ai-canvas");
  const bar = assistant.locator(".workspace-dialog-header");
  const bounds = await bar.boundingBox();
  await page.mouse.move(bounds!.x + 40, bounds!.y + 18);
  await page.mouse.down();
  await page.mouse.move(bounds!.x - 100, bounds!.y + 48, { steps: 8 });
  await page.mouse.up();
  expect((await assistant.boundingBox())!.x).toBeLessThan(bounds!.x);
  await assistant.getByRole("button", { name: "Close workspace" }).click();
  await page.getByRole("button", { name: "Pages", exact: true }).click();
  await page.getByRole("button", { name: "Add new page", exact: true }).focus();
  await page.keyboard.press("Enter");
  await expect(
    page.getByRole("button", { name: "Open page Page 2", exact: true }),
  ).toHaveAttribute("aria-pressed", "true");
  await page
    .getByRole("button", { name: "Rename page Page 2", exact: true })
    .click();
  await page.getByLabel("Page name", { exact: true }).fill("About");
  await page.keyboard.press("Enter");
  await expect(
    page.getByRole("button", { name: "Open page About", exact: true }),
  ).toBeVisible();
  await shot(page, "pages");
});

test("screen presets persist and off-screen visibility stays an editor-only control", async ({
  page,
}) => {
  await ready(page);
  await expect(
    page.locator(".inspector").getByLabel("Width", { exact: true }),
  ).toHaveValue("1920");
  await page.getByLabel("Screen size", { exact: true }).click();
  await page
    .getByRole("button", { name: "Tablet portrait 768 x 1024", exact: true })
    .click();
  await expect(
    page.locator(".inspector").getByLabel("Width", { exact: true }),
  ).toHaveValue("768");
  await expect(
    page.locator(".inspector").getByLabel("Height", { exact: true }),
  ).toHaveValue("1024");
  await page
    .getByRole("button", { name: "Hide off-screen elements", exact: true })
    .click();
  await expect(page.locator(".canvas-page")).toHaveCSS("overflow", "hidden");
  await page.getByRole("button", { name: "Save project", exact: true }).click();
  await page.reload();
  await expect(
    page.getByRole("button", { name: "Save project", exact: true }),
  ).toBeEnabled();
  await expect(
    page.locator(".inspector").getByLabel("Width", { exact: true }),
  ).toHaveValue("768");
  await expect(page.locator(".canvas-page")).toHaveCSS("overflow", "visible");
  await expect
    .poll(async () => {
      const artboard = await page.locator(".canvas-page").boundingBox();
      const viewport = await page
        .getByLabel("UI canvas", { exact: true })
        .boundingBox();
      return Math.abs(
        artboard!.x + artboard!.width / 2 - viewport!.x - viewport!.width / 2,
      );
    })
    .toBeLessThan(10);
  await page.getByLabel("Screen size", { exact: true }).click();
  await shot(page, "screen-presets");
  await page.keyboard.press("Escape");
  await expect(
    page.getByRole("group", { name: "Screen dimensions", exact: true }),
  ).toBeHidden();
});
