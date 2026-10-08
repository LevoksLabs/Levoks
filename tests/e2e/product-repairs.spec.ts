import { test, expect } from "@playwright/test";
import { openEditor } from "../helpers/open-editor";
import { mkdir, writeFile, readFile } from "node:fs/promises";
import JSZip from "jszip";
import {
  emptyProject,
  restoreProject,
  captureProject,
} from "../../src/lib/project/workspace";
import { useEditorStore } from "../../src/store/editorStore";
import { templates } from "../../src/templates";
import { elementTemplate } from "../../src/lib/elements/registry";

test("new Form fields remain separate in canvas and mobile preview, with added fields before Submit", async ({
  page,
}) => {
  await openEditor(page);
  await page
    .getByRole("textbox", { name: "Search elements", exact: true })
    .fill("Form");
  await page.getByRole("button", { name: "Add Form", exact: true }).dblclick();
  const form = page.locator(".canvas-page form");
  const ordered = async (locator: typeof form) =>
    locator.evaluate((element) => {
      const fields = [...element.querySelectorAll("input, button")].map(
        (node) => node.getBoundingClientRect(),
      );
      return fields.every(
        (rect, i) => i === 0 || rect.top >= fields[i - 1].bottom,
      );
    });
  await expect(form).toHaveCount(1);
  expect(await ordered(form)).toBe(true);
  await page.getByRole("button", { name: "Content", exact: true }).click();
  await page.getByRole("button", { name: "+ Add Field", exact: true }).click();
  await expect(form.locator("input")).toHaveCount(3);
  expect(await ordered(form)).toBe(true);
  await page.getByRole("button", { name: "Preview", exact: true }).click();
  const frame = page.frameLocator('iframe[title="Generated frontend preview"]');
  await expect(frame.locator("form input")).toHaveCount(3);
  expect(await ordered(frame.locator("form"))).toBe(true);
  await page
    .locator("select")
    .filter({ has: page.locator('option[value="mobile"]') })
    .selectOption("mobile");
  expect(await ordered(frame.locator("form"))).toBe(true);
  await page.screenshot({ path: ".verification/repairs/form-mobile.png" });
});

test("mobile fallback grows long paragraphs and constrains untouched section descendants", async ({
  page,
}) => {
  const project = emptyProject();
  restoreProject(project);
  const store = useEditorStore.getState();
  const paragraph = store.addElement(
    {
      ...templates.paragraph,
      props: {
        content:
          "Thoughtful websites for independent businesses. Design, build, and grow with a studio that understands your goals.",
      },
      styles: { ...templates.paragraph.styles, fontSize: "32px" },
      layout: { w: 1000, h: 180 },
    },
    undefined,
    20,
    150,
  );
  const button = store.addElement(templates.button, undefined, 20, 350);
  const contact = store.addElement(
    elementTemplate("contactSection"),
    undefined,
    20,
    500,
  );
  await mkdir(".verification/repairs", { recursive: true });
  const file = ".verification/repairs/mobile.levoks.json";
  await writeFile(
    file,
    JSON.stringify(captureProject(project.id, project.name)),
  );
  await page.goto("/");
  await page.locator('input[type="file"]').setInputFiles(file);
  await page
    .getByRole("link", { name: `Open ${project.name} (import)`, exact: true })
    .click();
  await expect(
    page.getByRole("button", { name: "Preview", exact: true }),
  ).toBeEnabled();
  await page.getByRole("button", { name: "Preview", exact: true }).click();
  await page
    .locator("select")
    .filter({ has: page.locator('option[value="mobile"]') })
    .selectOption("mobile");
  const frame = page.frameLocator('iframe[title="Generated frontend preview"]');
  const p = frame.locator(`#${paragraph}`),
    b = frame.locator(`#${button}`);
  await expect(p).toBeVisible();
  const bounds = await p.evaluate((el) => ({
    client: el.clientHeight,
    scroll: el.scrollHeight,
    bottom: el.getBoundingClientRect().bottom,
  }));
  expect(bounds.client).toBeGreaterThanOrEqual(bounds.scroll);
  expect(
    await b.evaluate((el) => el.getBoundingClientRect().top),
  ).toBeGreaterThanOrEqual(bounds.bottom);
  const widths = await frame
    .locator(`#${contact}`)
    .evaluate((el) => ({
      parent: el.clientWidth,
      children: [...el.children].map(
        (child) => child.getBoundingClientRect().width,
      ),
    }));
  expect(widths.children.every((width) => width <= widths.parent)).toBe(true);
  await page.screenshot({ path: ".verification/repairs/mobile-text.png" });
});

test("page search settings persist through reload and reach the downloaded application", async ({
  page,
}) => {
  await openEditor(page);
  await page.getByRole("button", { name: "Pages", exact: true }).click();
  await page.getByText("Search & sharing", { exact: true }).click();
  await page
    .getByRole("textbox", { name: "Search title for Home", exact: true })
    .fill("Northstar — independent design");
  await page
    .getByRole("textbox", { name: "Search description for Home", exact: true })
    .fill("Thoughtful websites for independent businesses.");
  await page
    .getByRole("checkbox", {
      name: "Hide Home from search engines",
      exact: true,
    })
    .check();
  await page.getByRole("button", { name: "Save project", exact: true }).click();
  await page.reload();
  await expect(
    page.getByRole("button", { name: "Save project", exact: true }),
  ).toBeEnabled();
  await page.getByRole("button", { name: "Pages", exact: true }).click();
  await page.getByText("Search & sharing", { exact: true }).click();
  await expect(
    page.getByRole("textbox", { name: "Search title for Home", exact: true }),
  ).toHaveValue("Northstar — independent design");
  await expect(
    page.getByRole("checkbox", {
      name: "Hide Home from search engines",
      exact: true,
    }),
  ).toBeChecked();
  await page.screenshot({ path: ".verification/repairs/search-settings.png" });
  await page.getByLabel("Deploy options", { exact: true }).click();
  const pending = page.waitForEvent("download");
  await page
    .getByRole("button", { name: "Download application ZIP", exact: true })
    .click();
  const zipPath = ".verification/repairs/seo.zip";
  await (await pending).saveAs(zipPath);
  const zip = await JSZip.loadAsync(await readFile(zipPath));
  const layout = await zip.file("frontend/app/layout.jsx")!.async("string");
  expect(layout).toContain("Northstar — independent design");
  expect(layout).toContain('"index":false');
  expect(layout).toContain('"openGraph"');
});
