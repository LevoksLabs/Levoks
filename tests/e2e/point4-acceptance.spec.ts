import { test, expect, type Page } from "@playwright/test";
import { mkdir, readFile } from "node:fs/promises";
import JSZip from "jszip";
import { openEditor } from "../helpers/open-editor";
import { SITE_STARTERS } from "../../src/lib/site-starters";
import { compileProject } from "../../src/lib/project/compiler";
import {
  emptyProject,
  restoreProject,
  captureProject,
} from "../../src/lib/project/workspace";
import { useEditorStore } from "../../src/store/editorStore";
import { elementTemplate } from "../../src/lib/elements/registry";
import { templates } from "../../src/templates";

async function download(page: Page, name: string) {
  await page.getByLabel("Deploy options", { exact: true }).click();
  const pending = page.waitForEvent("download");
  await page
    .getByRole("button", { name: "Download application ZIP", exact: true })
    .click();
  const file = `.verification/${name}-export.zip`;
  await (await pending).saveAs(file);
  const zip = await JSZip.loadAsync(await readFile(file));
  const project = JSON.parse(
    await zip.file("levoks.project.json")!.async("string"),
  );
  const compiled = compileProject(project);
  expect(compiled.diagnostics.filter((d) => d.severity === "error")).toEqual(
    [],
  );
  for (const [path, source] of Object.entries(compiled.files))
    expect(await zip.file(path)!.async("string"), path).toBe(source);
  return project;
}
for (const starter of SITE_STARTERS)
  test(`${starter.id} starter has an accurate local preview and persists a complete application`, async ({
    page,
  }) => {
    test.setTimeout(120000);
    await openEditor(page);
    await page.getByRole("button", { name: "Templates", exact: true }).click();
    await page
      .getByRole("button", { name: `Preview ${starter.name}`, exact: true })
      .click();
    const dialog = page.getByRole("dialog", {
      name: `${starter.name} preview`,
      exact: true,
    });
    const frame = dialog.frameLocator(
      `iframe[title="Preview: ${starter.name}"]`,
    );
    for (const width of [320, 768, 1024, 1280]) {
      await dialog
        .getByLabel("Starter preview width")
        .selectOption(String(width));
      await expect(
        frame.getByRole("heading", { name: starter.headline, exact: true }),
      ).toBeVisible();
      expect(
        await frame
          .locator("body")
          .evaluate(() => document.documentElement.scrollWidth <= innerWidth),
      ).toBe(true);
      await expect(
        frame.getByLabel("Your name", { exact: true }),
      ).toBeVisible();
      await expect(
        frame.getByLabel("Email address", { exact: true }),
      ).toBeVisible();
      expect(
        await frame.locator(".page").evaluate((artboard) => {
          const parent = artboard.getBoundingClientRect();
          return Array.from(artboard.children)
            .filter((child) => child.className.startsWith("el-"))
            .every(
              (child) =>
                child.getBoundingClientRect().bottom <= parent.bottom + 1,
            );
        }),
        `the entire starter page is reachable at ${width}px`,
      ).toBe(true);
      expect(
        await frame.locator("form").evaluate((form) => {
          const parent = form.getBoundingClientRect();
          const rows = Array.from(form.children).map((child) =>
            child.getBoundingClientRect(),
          );
          return rows.every(
            (row, index) =>
              row.left >= parent.left &&
              row.right <= parent.right &&
              row.bottom <= parent.bottom &&
              (!index || row.top >= rows[index - 1].bottom),
          );
        }),
        `starter form rows fit without overlap at ${width}px`,
      ).toBe(true);
    }
    await page.keyboard.press("Escape");
    await expect(dialog).toHaveCount(0);
    await expect(
      page.getByRole("button", {
        name: `Preview ${starter.name}`,
        exact: true,
      }),
    ).toBeFocused();
    page.once("dialog", (d) => d.accept());
    await page
      .getByRole("button", { name: `Use ${starter.name}`, exact: true })
      .click();
    await page.getByRole("button", { name: "Content", exact: true }).click();
    await expect(
      page.getByText("Private inbox:", { exact: false }),
    ).toBeVisible();
    await page.getByRole("button", { name: "Undo", exact: true }).click();
    await expect(page.locator(".canvas-page [data-element-id]")).toHaveCount(0);
    await page.getByRole("button", { name: "Redo", exact: true }).click();
    await page
      .getByRole("button", { name: "Save project", exact: true })
      .click();
    await expect(page.locator(".workspace-status-text")).toHaveText(
      "Saved on this device",
    );
    await page.reload();
    await page.getByRole("button", { name: "Preview", exact: true }).click();
    const preview = page.frameLocator(
      'iframe[title="Generated frontend preview"]',
    );
    await expect(
      preview.getByRole("heading", { name: starter.headline, exact: true }),
    ).toBeVisible();
    await preview
      .getByRole("link", { name: starter.button, exact: true })
      .click();
    await expect(
      preview.getByRole("button", { name: starter.button, exact: true }),
    ).toBeInViewport();
    await mkdir(".verification/point4-starters", { recursive: true });
    await page.screenshot({
      path: `.verification/point4-starters/${starter.id}.png`,
    });
    await page
      .getByRole("button", { name: "Back To Editor", exact: true })
      .click();
    const saved = await download(page, `starter-${starter.id}`);
    expect(saved.backend.services).toHaveLength(2);
  });

test("nested transformed drag and resize preserve screen motion, anchors and saved geometry at zoom", async ({
  page,
}) => {
  test.setTimeout(120000);
  const project = emptyProject("Geometry acceptance");
  project.editor.canvasSettings = {
    width: 1280,
    height: 900,
    backgroundColor: "#fff",
  };
  restoreProject(project);
  const store = useEditorStore.getState();
  const parent = store.addElement({
    ...templates.container,
    label: "Rotated parent",
    styles: { height: "400px", padding: "16px", backgroundColor: "#eee" },
    layout: { x: 120, y: 100, w: 600, h: 400, rotation: 30 },
  });
  const child = store.addElement(
    {
      ...templates.container,
      label: "Nested target",
      styles: {
        position: "absolute",
        padding: "0",
        height: "80px",
        backgroundColor: "#8255ee",
      },
      layout: {
        position: "absolute",
        x: 100,
        y: 80,
        w: 120,
        h: 80,
        rotation: 20,
      },
    },
    parent,
  );
  store.updateElementPosition(child, 100, 80);
  const document = captureProject(project.id, project.name);
  await openEditor(page);
  await page
    .getByRole("button", { name: "Untitled project", exact: true })
    .click();
  const workspace = page.getByRole("dialog", {
    name: "Levoks project workspace",
  });
  await workspace.locator("input[type=file]").setInputFiles({
    name: "geometry.json",
    mimeType: "application/json",
    buffer: Buffer.from(JSON.stringify(document)),
  });
  await expect(
    page.getByRole("button", {
      name: "Geometry acceptance (import)",
      exact: true,
    }),
  ).toBeVisible();
  await workspace
    .getByRole("button", { name: "Close workspace", exact: true })
    .click();
  const snap = page.getByRole("button", {
    name: "Snap to guides",
    exact: true,
  });
  if ((await snap.getAttribute("aria-pressed")) === "true") await snap.click();
  const node = page.locator(`.canvas-page [data-element-id="${child}"]`);
  await node.click();
  await page.getByLabel("Canvas zoom", { exact: true }).selectOption("75");
  await page.evaluate(
    () =>
      new Promise((resolve) =>
        requestAnimationFrame(() => requestAnimationFrame(resolve)),
      ),
  );
  const box = await node.boundingBox();
  await page.mouse.move(box!.x + box!.width / 2, box!.y + box!.height / 2);
  await page.mouse.down();
  await page.mouse.move(
    box!.x + box!.width / 2 + 45,
    box!.y + box!.height / 2 + 15,
    { steps: 12 },
  );
  await page.mouse.up();
  const moved = await node.boundingBox();
  expect(moved!.x - box!.x).toBeCloseTo(45, 0);
  expect(moved!.y - box!.y).toBeCloseTo(15, 0);
  await page.getByRole("button", { name: "Undo", exact: true }).click();
  const undo = await node.boundingBox();
  expect(undo!.x).toBeCloseTo(box!.x, 0);
  expect(undo!.y).toBeCloseTo(box!.y, 0);
  await page.getByRole("button", { name: "Redo", exact: true }).click();
  await node.click();
  const se = node.locator('[data-resize-handle="se"]'),
    nw = node.locator('[data-resize-handle="nw"]');
  const anchor = await nw.boundingBox(),
    grip = await se.boundingBox();
  await page.mouse.move(grip!.x + grip!.width / 2, grip!.y + grip!.height / 2);
  await page.mouse.down();
  await page.mouse.move(
    grip!.x + grip!.width / 2 + 30,
    grip!.y + grip!.height / 2 + 30,
    { steps: 12 },
  );
  await page.mouse.up();
  const afterAnchor = await nw.boundingBox();
  expect(afterAnchor!.x).toBeCloseTo(anchor!.x, 0);
  expect(afterAnchor!.y).toBeCloseTo(anchor!.y, 0);
  await page.getByRole("button", { name: "Save project", exact: true }).click();
  await expect(page.locator(".workspace-status-text")).toHaveText(
    "Saved on this device",
  );
  await page.reload();
  const saved = await download(page, "geometry");
  expect(saved.editor.elementsById[child].parentId).toBe(parent);
  expect(saved.editor.elementsById[child].layout.w).toBeGreaterThan(120);
});

test("standalone labels author a stable field association and preserve focus through helper changes and export", async ({
  page,
}) => {
  const project = emptyProject("Label associations");
  restoreProject(project);
  const store = useEditorStore.getState();
  const field = store.addElement(
    {
      ...elementTemplate("textInput")!,
      label: "Reference input",
      props: { ...elementTemplate("textInput")!.props, ariaLabel: "" },
    },
    undefined,
    40,
    100,
  );
  store.addElement(
    {
      ...elementTemplate("label")!,
      label: "Caption",
      props: {
        ...elementTemplate("label")!.props,
        content: "Reference caption",
      },
    },
    undefined,
    40,
    40,
  );
  await openEditor(page);
  await page
    .getByRole("button", { name: "Untitled project", exact: true })
    .click();
  const workspace = page.getByRole("dialog", {
    name: "Levoks project workspace",
  });
  await workspace.locator("input[type=file]").setInputFiles({
    name: "labels.json",
    mimeType: "application/json",
    buffer: Buffer.from(
      JSON.stringify(captureProject(project.id, project.name)),
    ),
  });
  await expect(
    workspace.getByLabel("Project name", { exact: true }),
  ).toHaveValue("Label associations (import)");
  await workspace
    .getByRole("button", { name: "Close workspace", exact: true })
    .click();
  await page.getByRole("button", { name: "Layers", exact: true }).click();
  await page
    .getByRole("treeitem", { name: "Caption", exact: true })
    .locator(".layer-name")
    .click();
  await page.getByRole("button", { name: "Content", exact: true }).click();
  await page
    .getByLabel("Associated field", { exact: true })
    .selectOption(field);
  await page
    .getByRole("treeitem", { name: "Reference input", exact: true })
    .locator(".layer-name")
    .click();
  await page
    .getByLabel("Helper Text", { exact: true })
    .fill("Use your reference code.");
  await page.getByRole("button", { name: "Save project", exact: true }).click();
  await expect(page.locator(".workspace-status-text")).toHaveText(
    "Saved on this device",
  );
  await page.reload();
  await page.getByRole("button", { name: "Preview", exact: true }).click();
  const frame = page.frameLocator('iframe[title="Generated frontend preview"]');
  await frame.getByText("Reference caption", { exact: true }).click();
  await expect(
    frame.getByLabel("Reference caption", { exact: true }),
  ).toBeFocused();
  await page
    .getByRole("button", { name: "Back To Editor", exact: true })
    .click();
  await download(page, "labels");
});
