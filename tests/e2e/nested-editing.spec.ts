import { test, expect, type Page, type Locator } from "@playwright/test";
import { readFile, mkdir } from "node:fs/promises";
import JSZip from "jszip";
import { openEditor } from "../helpers/open-editor";
import {
  emptyProject,
  restoreProject,
  captureProject,
} from "../../src/lib/project/workspace";
import { compileProject } from "../../src/lib/project/compiler";
import { parseProject } from "../../src/lib/project/schema";
import { useEditorStore } from "../../src/store/editorStore";
import { elementTemplate } from "../../src/lib/elements/registry";
import { templates } from "../../src/templates";

async function drag(
  page: Page,
  source: Locator,
  target: Locator,
  inside = true,
) {
  const grip = await source.locator(".layer-grip").boundingBox(),
    bounds = await target.boundingBox();
  await page.mouse.move(grip!.x + grip!.width / 2, grip!.y + grip!.height / 2);
  await page.mouse.down();
  await page.mouse.move(
    bounds!.x + 140,
    bounds!.y + (inside ? bounds!.height / 2 : 2),
    { steps: 12 },
  );
  await page.mouse.up();
}

test("native global layers keep one owning tree and component structure overrides persist through save/preview/export", async ({
  page,
}) => {
  test.setTimeout(120000);
  const project = emptyProject("Nested editing");
  restoreProject(project);
  const store = useEditorStore.getState();
  const a = store.addGlobalElement({
    ...elementTemplate("formField"),
    label: "Global A",
    layout: { x: 40, y: 40, w: 300 },
    styles: { height: "auto" },
    children: [
      {
        ...templates.text,
        label: "Global note",
        props: { content: "Shared footer message" },
      },
    ],
  });
  const b = store.addGlobalElement({
    ...elementTemplate("formField"),
    label: "Global B",
    layout: { x: 40, y: 240, w: 300 },
    styles: { height: "auto" },
  });
  const note = useEditorStore.getState().elementsById[a].children[0];
  const card = store.addElement({
    ...templates.container,
    label: "Linked card",
    layout: { x: 400, y: 40, w: 300 },
    styles: { height: "auto", display: "flex", flexDirection: "column" },
  });
  const child = store.addElement(
    {
      ...templates.text,
      label: "Linked note",
      props: { content: "Reusable card text" },
      layout: { position: "static" },
    },
    card,
  );
  store.saveComponent(card, "Reusable card");
  const group = store.addElement({
    ...elementTemplate("formField"),
    label: "Page group",
    layout: { x: 400, y: 240, w: 300 },
    styles: { height: "auto" },
  });
  store.addPage("About");
  store.switchPage(project.editor.activePageId);
  const original = captureProject(project.id, project.name);
  await openEditor(page);
  await page
    .getByRole("button", { name: "Untitled project", exact: true })
    .click();
  const workspace = page.getByRole("dialog", {
    name: "Levoks project workspace",
  });
  await workspace.locator('input[type="file"]').setInputFiles({
    name: "nested.json",
    mimeType: "application/json",
    buffer: Buffer.from(JSON.stringify(original)),
  });
  await expect(
    workspace.getByLabel("Project name", { exact: true }),
  ).toHaveValue("Nested editing (import)");
  await workspace
    .getByRole("button", { name: "Close workspace", exact: true })
    .click();
  await page.getByRole("button", { name: "Layers", exact: true }).click();
  const row = (name: string) =>
    page.getByRole("treeitem", { name, exact: true });
  await drag(page, row("Global note"), row("Global B"));
  await expect(row("Global note")).toHaveAttribute("data-parent-id", b);
  await page.getByRole("button", { name: "Undo", exact: true }).click();
  await expect(row("Global note")).toHaveAttribute("data-parent-id", a);
  await page.getByRole("button", { name: "Redo", exact: true }).click();
  await expect(row("Global note")).toHaveAttribute("data-parent-id", b);
  await drag(page, row("Global note"), row("Global B"), false);
  await expect(row("Global note")).toHaveAttribute("data-parent-id", "");
  await expect(row("Global note")).toHaveAttribute("aria-level", "1");
  await expect(
    page
      .getByRole("tree", { name: "Page layers" })
      .getByRole("treeitem", { name: "Global note", exact: true }),
  ).toHaveCount(0);
  await drag(page, row("Global note"), row("Global B"));
  await expect(row("Global note")).toHaveAttribute("data-parent-id", b);
  await page
    .getByRole("button", { name: "Lock Global B", exact: true })
    .click();
  await drag(page, row("Global note"), row("Global A"));
  await expect(page.locator(".layers-panel").getByRole("alert")).toContainText(
    "Unlock",
  );
  await expect(row("Global note")).toHaveAttribute("data-parent-id", b);
  await page
    .getByRole("button", { name: "Unlock Global B", exact: true })
    .click();
  await drag(page, row("Linked note"), row("Page group"));
  await expect(row("Linked note")).toHaveAttribute("data-parent-id", group);
  await page.getByRole("button", {name:"Undo",exact:true}).click();
  await expect(row("Linked note")).toHaveAttribute("data-parent-id", card);
  await drag(page, row("Page group"), row("Linked card"));
  await expect(row("Page group")).toHaveAttribute("data-parent-id", card);
  await row("Linked card").click();
  await page.getByRole("button", {name:"Restore shared structure",exact:true}).click();
  await expect(row("Page group")).toHaveCount(0);
  await page.getByRole("button", {name:"Undo",exact:true}).click();
  await expect(row("Page group")).toHaveAttribute("data-parent-id", card);
  await page.getByRole("button", {name:"Undo",exact:true}).click();
  await expect(row("Page group")).toHaveAttribute("data-parent-id", "");
  await drag(page, row("Linked note"), row("Page group"));
  await expect(row("Linked note")).toHaveAttribute("data-parent-id", group);
  await expect(page.locator(".layers-panel").getByRole("alert")).toHaveCount(0);
  await page.getByRole("button", { name: "Save project", exact: true }).click();
  await page.reload();
  await page.getByRole("button", { name: "Layers", exact: true }).click();
  await expect(row("Global note")).toHaveAttribute("data-parent-id", b);
  await expect(row("Linked note")).toHaveAttribute("data-parent-id", group);
  await mkdir(".verification/nested-editing", { recursive: true });
  await page.screenshot({
    path: ".verification/nested-editing/layers-desktop.png",
  });
  await page.getByRole("button", { name: "Preview", exact: true }).click();
  const frame = page.frameLocator('iframe[title="Generated frontend preview"]');
  await expect(frame.locator(`#${b} #${note}`)).toHaveText(
    "Shared footer message",
  );
  await expect(frame.locator(`#${group} #${child}`)).toHaveText(
    "Reusable card text",
  );
  await expect(frame.locator(`#${note}`)).toHaveCount(1);
  await page
    .getByRole("button", { name: "Back To Editor", exact: true })
    .click();
  await page.getByLabel("Deploy options", { exact: true }).click();
  const download = page.waitForEvent("download");
  await page
    .getByRole("button", { name: "Download application ZIP", exact: true })
    .click();
  await (await download).saveAs(".verification/nested-global-export.zip");
  const zip = await JSZip.loadAsync(
    await readFile(".verification/nested-global-export.zip"),
  );
  const saved = parseProject(
    JSON.parse(await zip.file("levoks.project.json")!.async("string")),
  );
  expect(saved.editor.globalRootIds).toEqual([a, b]);
  expect(saved.editor.rootIds).toEqual(original.editor.rootIds);
  expect(saved.editor.elementsById[note].parentId).toBe(b);
  expect(saved.editor.elementsById[child].parentId).toBe(group);
  expect(saved.editor.elementsById[child].component).toBeUndefined();
  expect(saved.editor.elementsById[card].component!.overrides).toContain("structure");
  const compiled = compileProject(saved);
  expect(compiled.diagnostics.filter((d) => d.severity === "error")).toEqual(
    [],
  );
  for (const [file, source] of Object.entries(compiled.files))
    expect(await zip.file(file)!.async("string"), file).toBe(source);
});
