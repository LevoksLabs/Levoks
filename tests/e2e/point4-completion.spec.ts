import { nativeWidgetSource } from "../../src/lib/codegen/runtime-sources";
import { test, expect, type Page } from "@playwright/test";
import { readFile, mkdir } from "node:fs/promises";
import JSZip from "jszip";
import { openEditor } from "../helpers/open-editor";
import {
  emptyProject,
  restoreProject,
  captureProject,
} from "../../src/lib/project/workspace";
import { useEditorStore } from "../../src/store/editorStore";
import { templates } from "../../src/templates";
import { elementTemplate } from "../../src/lib/elements/registry";
import { compileProject } from "../../src/lib/project/compiler";
import { generatedPreview } from "../../src/lib/project/preview";

function fixture() {
  const project = emptyProject("Complete authoring");
  project.editor.canvasSettings = {
    width: 1280,
    height: 1800,
    backgroundColor: "#fff",
  };
  restoreProject(project);
  const store = useEditorStore.getState();
  const text = store.addElement({
    ...templates.text,
    label: "Responsive heading",
    props: { content: "Editable heading" },
    styles: { fontSize: "28px", color: "#123456", height: "auto" },
    layout: { x: 60, y: 30, w: 450, h: 60 },
  });
  const rich = store.addElement({
    ...elementTemplate("richText"),
    label: "Article",
    props: { content: "Format this text" },
    styles: { width: "400px", height: "auto" },
    layout: { x: 60, y: 130, w: 400, h: 70 },
  });
  const timeline = store.addElement({
    ...elementTemplate("timeline"),
    label: "Milestones",
    layout: { x: 60, y: 220, w: 400, h: 100 },
    styles: { height: "auto" },
  });
  const tool = store.addElement({
    ...elementTemplate("tooltip"),
    label: "Hint",
    props: { summary: "Hint trigger", content: "Accessible hint" },
    layout: { x: 60, y: 420, w: 300, h: 60 },
  });
  const pop = store.addElement({
    ...elementTemplate("popover"),
    label: "Details popup",
    props: { summary: "Details trigger", content: "Popover details" },
    layout: { x: 60, y: 520, w: 300, h: 60 },
  });
  const drawer = store.addElement({
    ...elementTemplate("drawer"),
    label: "Side drawer",
    props: {
      triggerText: "Open settings",
      ariaLabel: "Settings drawer",
      content: "Drawer contents",
    },
    layout: { x: 60, y: 620, w: 300, h: 60 },
  });
  store.addElement({
    ...elementTemplate("toast"),
    label: "Notice",
    props: { content: "Saved notification", duration: 0 },
    layout: { x: 60, y: 720, w: 320, h: 60 },
  });
  store.addElement({
    ...elementTemplate("map"),
    label: "Location",
    layout: { x: 600, y: 700, w: 300, h: 240 },
  });
  const parent = store.addElement({
    ...templates.container,
    label: "Perspective parent",
    styles: {
      padding: "0",
      height: "400px",
      backgroundColor: "#eee",
      transformOrigin: "30% 70%",
    },
    layout: {
      x: 580,
      y: 140,
      w: 540,
      h: 400,
      rotation: 15,
      rotateX: 20,
      rotateY: -25,
      perspective: 800,
      scaleX: 1.1,
      scaleY: 0.9,
    },
  });
  const shape = store.addElement(
    {
      ...elementTemplate("vector"),
      label: "Curve",
      styles: {
        position: "absolute",
        padding: "0",
        height: "120px",
        transformOrigin: "25% 40%",
      },
      layout: {
        x: 100,
        y: 100,
        w: 160,
        h: 120,
        position: "absolute",
        rotation: 20,
        rotateY: 15,
        perspective: 700,
      },
      vector: {
        points: [
          { x: 10, y: 15, outX: 30, outY: 0 },
          { x: 80, y: 70, inX: 50, inY: 90 },
        ],
        closed: false,
        stroke: "#333333",
        strokeWidth: 3,
        fill: "none",
      },
    },
    parent,
  );
  store.updateElementPosition(shape, 100, 100);
  for (const [id, x, y] of [
    [text, 60, 30],
    [rich, 60, 130],
    [timeline, 60, 220],
    [tool, 60, 420],
    [pop, 60, 520],
    [drawer, 60, 620],
    [parent, 580, 140],
  ] as const)
    store.updateElementPosition(id, x, y);
  for (const node of Object.values(useEditorStore.getState().elementsById))
    if (node.definitionId === "toast" || node.definitionId === "map")
      store.updateElementPosition(
        node.id,
        node.definitionId === "toast" ? 60 : 600,
        node.definitionId === "toast" ? 720 : 700,
      );
  store.addElement(
    {
      ...templates.menu,
      label: "Site navigation",
      props: {
        items: "Article,Timeline",
        urls: `#${rich}\n#${timeline}`,
        menuStyle: "vertical",
      },
      styles: { gap: "7px", backgroundColor: "#fafafa" },
      layout: { w: 300, h: 70 },
    },
    undefined,
    60,
    1040,
  );
  store.addElement(
    {
      ...templates.socialbar,
      label: "Social profiles",
      props: {
        facebook: true,
        facebookUrl: "https://example.com/profile",
        iconSize: 32,
        iconStyle: "outline",
      },
      layout: { w: 300, h: 70 },
    },
    undefined,
    420,
    1040,
  );
  store.addElement(
    {
      ...templates.spacer,
      label: "Spacing",
      props: { spacerHeight: 85 },
      styles: {},
      layout: { w: 300, h: 40 },
    },
    undefined,
    60,
    1150,
  );
  store.addElement(
    {
      ...templates.gallery,
      label: "Photos",
      props: { columns: 2, gap: 0 },
      styles: {
        padding: "0",
        height: "auto",
        gridTemplateColumns: "repeat(2, minmax(0, 1fr))",
        gap: "0px",
      },
      layout: { w: 500, h: 160 },
      children: [
        {
          ...templates.text,
          props: { content: "First photo" },
          styles: { height: "auto" },
        },
        {
          ...templates.text,
          props: { content: "Second photo" },
          styles: { height: "auto" },
        },
      ],
    },
    undefined,
    60,
    1290,
  );
  store.addElement(
    {
      ...templates.repeater,
      label: "Repeated cards",
      props: { repeatCount: 2, direction: "row" },
      styles: { padding: "0", height: "auto", gap: "18px" },
      layout: { w: 500, h: 100 },
      children: [
        {
          ...templates.text,
          props: { content: "Repeated card" },
          styles: { height: "auto", width: "100%" },
        },
      ],
    },
    undefined,
    60,
    1540,
  );
  store.addElement(
    {
      ...templates.button,
      label: "Popup action",
      props: { label: "Popup action", type: "button" },
      styles: { position: "static", height: "auto" },
      layout: { position: "static", w: 120, h: 30 },
    },
    pop,
  );
  return {
    project: captureProject(project.id, project.name),
    text,
    rich,
    timeline,
    tool,
    pop,
    drawer,
    shape,
    parent,
  };
}
async function importFixture(page: Page, value: ReturnType<typeof fixture>) {
  await openEditor(page);
  await page
    .getByRole("button", { name: "Untitled project", exact: true })
    .click();
  const hub = page.getByRole("dialog", { name: "Levoks project workspace" });
  await hub.locator("input[type=file]").setInputFiles({
    name: "complete.json",
    mimeType: "application/json",
    buffer: Buffer.from(JSON.stringify(value.project)),
  });
  await expect(hub.getByLabel("Project name", { exact: true })).toHaveValue(
    "Complete authoring (import)",
  );
  await hub
    .getByRole("button", { name: "Close workspace", exact: true })
    .click();
}
async function download(page: Page) {
  await page.getByLabel("Deploy options", { exact: true }).click();
  const pending = page.waitForEvent("download");
  await page
    .getByRole("button", { name: "Download application ZIP", exact: true })
    .click();
  await (await pending).saveAs(".verification/point4-completion-export.zip");
  const zip = await JSZip.loadAsync(
    await readFile(".verification/point4-completion-export.zip"),
  );
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

test("custom breakpoint and formatted content authoring survives durable undo/redo, reload and exact ZIP export", async ({
  page,
}) => {
  test.setTimeout(180000);
  const f = fixture();
  await importFixture(page, f);
  const errors: string[] = [];
  page.on("pageerror", (error) => errors.push(error.message));
  await page
    .getByRole("button", { name: "Manage breakpoints", exact: true })
    .click();
  const dialog = page.getByRole("dialog", { name: "Responsive breakpoints" });
  await dialog.getByLabel("Breakpoint name", { exact: true }).fill("Compact");
  await dialog
    .getByLabel("Breakpoint maximum width", { exact: true })
    .fill("880");
  await dialog
    .getByRole("button", { name: "Add breakpoint", exact: true })
    .click();
  await expect(page.getByLabel("Custom responsive layout")).toHaveValue(
    "custom_880",
  );
  await dialog
    .getByRole("button", { name: "Close breakpoints", exact: true })
    .click();
  await page.getByRole("button", { name: "Layers", exact: true }).click();
  await page
    .getByRole("treeitem", { name: "Responsive heading", exact: true })
    .click();
  const x = page.getByRole("spinbutton", { name: "X", exact: true });
  await x.fill("24");
  await x.press("Enter");
  await page
    .getByRole("button", { name: "Desktop layout", exact: true })
    .click();
  await expect(x).toHaveValue("60");
  await page.getByLabel("Custom responsive layout").selectOption("custom_880");
  await expect(x).toHaveValue("24");
  await page.getByRole("treeitem", { name: "Article", exact: true }).click();
  await page.getByRole("button", { name: "Content", exact: true }).click();
  const body = page.getByLabel("Block 1 text", { exact: true });
  await body.fill("Format this text");
  await body.press("Home");
  for (let i = 0; i < 6; i++) await body.press("Shift+ArrowRight");
  await page.getByRole("button", { name: "bold", exact: true }).click();
  await page
    .getByRole("button", { name: "Add text block", exact: true })
    .click();
  await page.getByLabel("Block 2 type").selectOption("h2");
  await page.getByLabel("Block 2 text").fill("A semantic heading");
  await page.getByLabel("Block 2 text").press("Tab");
  await page.getByRole("treeitem", { name: "Milestones", exact: true }).click();
  await page
    .getByRole("button", { name: "Add timeline event", exact: true })
    .click();
  await page.getByLabel("Event 2 title").fill("Published");
  await page.getByLabel("Event 2 date").fill("October 2026");
  await page.getByLabel("Event 2 description").fill("First complete release");
  await page.getByLabel("Event 2 description").press("Tab");
  await page.getByRole("button", { name: "Save project", exact: true }).click();
  await expect(page.locator(".workspace-status-text")).toHaveText(
    "Saved on this device",
  );
  await page.reload();
  await expect(
    page.getByRole("button", { name: "Undo", exact: true }),
  ).toBeEnabled();
  await page.getByRole("button", { name: "Undo", exact: true }).click();
  await page.getByRole("button", { name: "Save project", exact: true }).click();
  await expect(page.locator(".workspace-status-text")).toHaveText(
    "Saved on this device",
  );
  await page.reload();
  await expect(
    page.getByRole("button", { name: "Redo", exact: true }),
  ).toBeEnabled();
  await page.getByRole("button", { name: "Redo", exact: true }).click();
  const saved = await download(page);
  expect(saved.editor.canvasSettings.breakpoints).toEqual([
    { name: "Compact", width: 880 },
  ]);
  expect(saved.editor.elementsById[f.text].responsive.custom_880.layout.x).toBe(
    24,
  );
  expect(
    JSON.parse(saved.editor.elementsById[f.rich].props.richDocument)[0].spans[0]
      .bold,
  ).toBe(true);
  expect(
    JSON.parse(saved.editor.elementsById[f.timeline].props.timelineEvents)[1]
      .description,
  ).toBe("First complete release");
  await mkdir(".verification/point4-completion", { recursive: true });
  await page.screenshot({ path: ".verification/point4-completion/editor.png" });
  expect(errors).toEqual([]);
});
test("native tooltip/popover/drawer/toast behavior and responsive output execute from the current compiler", async ({
  page,
}) => {
  const f = fixture();
  await page.route("https://www.openstreetmap.org/**", (route) =>
    route.abort(),
  );
  const errors: string[] = [];
  page.on("pageerror", (error) => errors.push(error.message));
  await page.setContent(
    generatedPreview(f.project, f.project.editor.activePageId),
  );
  const hint = page.getByRole("button", { name: "Hint trigger", exact: true });
  await hint.focus();
  await expect(page.getByRole("tooltip")).toHaveText("Accessible hint");
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
    page.getByRole("dialog", { name: "Details trigger", exact: true }),
  ).toContainText("Popover details");
  await page.getByRole("button", { name: "Popup action", exact: true }).focus();
  await page.keyboard.press("Escape");
  await expect(trigger).toHaveAttribute("aria-expanded", "false");
  await expect(trigger).toBeFocused();
  await page
    .getByRole("button", { name: "Open settings", exact: true })
    .click();
  const drawer = page.getByRole("dialog", { name: "Settings drawer" });
  await expect(drawer).toBeVisible();
  expect(
    (await drawer.boundingBox())!.x + (await drawer.boundingBox())!.width,
  ).toBeCloseTo(1600, 0);
  await page.keyboard.press("Escape");
  await expect(
    page.getByRole("button", { name: "Open settings", exact: true }),
  ).toBeFocused();
  await page
    .getByRole("button", { name: "Dismiss notification", exact: true })
    .click();
  await expect(
    page.getByText("Saved notification", { exact: true }),
  ).toBeHidden();
  await expect(
    page.locator(
      `iframe#${Object.values(f.project.editor.elementsById).find((n) => n.definitionId === "map")!.id}`,
    ),
  ).toHaveAttribute("src", /openstreetmap.org\/export\/embed.html\?bbox=/);
  expect(errors).toEqual([]);
});
test("perspective nested resizing and vector handles preserve projected geometry and keyboard history", async ({
  page,
}) => {
  test.setTimeout(180000);
  const f = fixture();
  await importFixture(page, f);
  await page.getByRole("button", { name: "Layers", exact: true }).click();
  await page.getByRole("treeitem", { name: "Curve", exact: true }).click();
  await page.getByLabel("Canvas zoom", { exact: true }).selectOption("75");
  const snap = page.getByRole("button", {
    name: "Snap to guides",
    exact: true,
  });
  if ((await snap.getAttribute("aria-pressed")) === "true") await snap.click();
  const node = page.locator(`.canvas-page [data-element-id="${f.shape}"]`),
    handle = node.getByRole("button", {
      name: "Point 1 anchor handle",
      exact: true,
    });
  await handle.focus();
  await handle.press("ArrowRight");
  await page.getByRole("button", { name: "Undo", exact: true }).click();
  await page.getByRole("button", { name: "Redo", exact: true }).click();
  const grip = await handle.boundingBox();
  await page.mouse.move(grip!.x + grip!.width / 2, grip!.y + grip!.height / 2);
  await page.mouse.down();
  await page.mouse.move(
    grip!.x + grip!.width / 2 + 12,
    grip!.y + grip!.height / 2 + 9,
    { steps: 8 },
  );
  await page.mouse.up();
  const nw = node.locator('[data-resize-handle="nw"]'),
    se = node.locator('[data-resize-handle="se"]');
  const anchor = await nw.boundingBox(),
    corner = await se.boundingBox();
  await page.mouse.move(
    corner!.x + corner!.width / 2,
    corner!.y + corner!.height / 2,
  );
  await page.mouse.down();
  await page.mouse.move(
    corner!.x + corner!.width / 2 + 30,
    corner!.y + corner!.height / 2 + 25,
    { steps: 8 },
  );
  await page.mouse.up();
  const after = await nw.boundingBox();
  expect(after!.x).toBeCloseTo(anchor!.x, 0);
  expect(after!.y).toBeCloseTo(anchor!.y, 0);
  await page.getByRole("button", { name: "Save project", exact: true }).click();
  await expect(page.locator(".workspace-status-text")).toHaveText(
    "Saved on this device",
  );
  await page.reload();
  await expect(node).toBeVisible();
});

test("transformed flow children resize without leaving document flow and undo restores their original positioning", async ({
  page,
}) => {
  const f = fixture(),
    store = useEditorStore.getState(),
    shape = store.getElement(f.shape)!;
  store.updateElement(f.shape, {
    layout: { ...shape.layout, position: "static", x: 0, y: 0 },
    styles: { position: "static" },
  });
  f.project = captureProject(f.project.id, f.project.name);
  await importFixture(page, f);
  await page.getByRole("button", { name: "Layers", exact: true }).click();
  await page.getByRole("treeitem", { name: "Curve", exact: true }).click();
  await page.getByRole("button", { name: "Fit canvas", exact: true }).click();
  const node = page.locator(`.canvas-page [data-element-id="${f.shape}"]`),
    nw = node.locator('[data-resize-handle="nw"]'),
    se = node.locator('[data-resize-handle="se"]');
  await expect
    .poll(() => node.evaluate((el) => (el as HTMLElement).style.left))
    .toBe("");
  const anchor = (await nw.boundingBox())!,
    corner = (await se.boundingBox())!;
  await page.mouse.move(
    corner.x + corner.width / 2,
    corner.y + corner.height / 2,
  );
  await page.mouse.down();
  await page.mouse.move(
    corner.x + corner.width / 2 + 24,
    corner.y + corner.height / 2 + 16,
    { steps: 8 },
  );
  await page.mouse.up();
  await expect
    .poll(() => node.evaluate((el) => (el as HTMLElement).style.left))
    .not.toBe("");
  const after = (await nw.boundingBox())!;
  expect(after.x).toBeCloseTo(anchor.x, 0);
  expect(after.y).toBeCloseTo(anchor.y, 0);
  await page.getByRole("button", { name: "Undo", exact: true }).click();
  await expect
    .poll(() => node.evaluate((el) => (el as HTMLElement).style.left))
    .toBe("");
  await page.getByRole("button", { name: "Redo", exact: true }).click();
  await expect
    .poll(() => node.evaluate((el) => (el as HTMLElement).style.left))
    .not.toBe("");
});

test("independently mounted nested widgets initialize once and timed notifications pause for focus", async ({
  page,
}) => {
  await page.setContent(
    '<div id="outer" data-floating-widget="popover" data-placement="bottom"><button data-floating-trigger>Outer</button><div id="outer-panel" popover="auto" data-floating-panel><div id="inner" data-floating-widget="popover" data-placement="bottom"><button data-floating-trigger>Inner</button><div id="inner-panel" popover="auto" data-floating-panel>Nested details</div></div></div></div><div id="notice" data-toast data-duration="150">Timed notice<button data-toast-dismiss>Dismiss</button></div>',
  );
  await page.addScriptTag({
    content:
      nativeWidgetSource +
      '; setupNativeWidgets(document.getElementById("outer"),false); setupNativeWidgets(document.getElementById("inner"),false); setupNativeWidgets(document.getElementById("notice"),false);',
  });
  const notice = page.locator("#notice");
  await notice.getByRole("button").focus();
  await page.waitForTimeout(250);
  await expect(notice).toBeVisible();
  await page.getByRole("button", { name: "Outer", exact: true }).click();
  await page.getByRole("button", { name: "Inner", exact: true }).click();
  await expect(page.locator("#inner-panel")).toBeVisible();
  await expect(notice).toBeHidden();
  await page.keyboard.press("Escape");
  await expect(page.locator("#inner-panel")).toBeHidden();
  await expect(page.locator("#outer-panel")).toBeVisible();
});

test("flow roots can be dragged with reversible relative offsets", async ({
  page,
}) => {
  const f = fixture(),
    store = useEditorStore.getState(),
    text = store.getElement(f.text)!;
  store.updateElement(f.text, {
    layout: { ...text.layout, position: "static", x: 0, y: 0 },
    styles: { position: "static" },
  });
  f.project = captureProject(f.project.id, f.project.name);
  await importFixture(page, f);
  await page.getByRole("button", { name: "Fit canvas", exact: true }).click();
  const node = page.locator(`.canvas-page [data-element-id="${f.text}"]`);
  const before = (await node.boundingBox())!;
  await page.mouse.move(
    before.x + before.width / 2,
    before.y + before.height / 2,
  );
  await page.mouse.down();
  await page.mouse.move(
    before.x + before.width / 2 + 32,
    before.y + before.height / 2 + 24,
    { steps: 8 },
  );
  await page.mouse.up();
  const after = (await node.boundingBox())!;
  expect(after.x - before.x).toBeCloseTo(32, 0);
  expect(after.y - before.y).toBeCloseTo(24, 0);
  await page.getByRole("button", { name: "Undo", exact: true }).click();
  const undone = (await node.boundingBox())!;
  expect(undone.x).toBeCloseTo(before.x, 0);
  expect(undone.y).toBeCloseTo(before.y, 0);
});
