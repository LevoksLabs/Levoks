import { test, expect } from "@playwright/test";
import { mkdir, writeFile, readFile } from "node:fs/promises";
import JSZip from "jszip";
import { ELEMENT_DEFINITIONS } from "../../src/lib/elements/registry";

// A browser census, deliberately not a declaration of functional completeness.
test("catalog browser census: insertion, inspector, reload and exported state", async ({
  page,
}) => {
  test.setTimeout(300000);
  await page.goto("/");
  await expect(
    page.getByRole("button", { name: "Save project", exact: true }),
  ).toBeEnabled();
  const rows: Record<string, unknown>[] = [];
  const search = page.getByRole("textbox", {
    name: "Search elements",
    exact: true,
  });
  for (const definition of ELEMENT_DEFINITIONS) {
    await search.fill(definition.name);
    await page
      .getByRole("button", { name: `Add ${definition.name}`, exact: true })
      .filter({ has: page.locator(":scope") })
      .and(
        page.getByTitle(
          `${definition.description} Drag or double-click to add.`,
          { exact: true },
        ),
      )
      .dblclick();
    const selected = page.locator(".canvas-page .element-selected").last();
    await expect(selected).toBeAttached();
    const id = await selected.getAttribute("data-element-id");
    const before = await selected.evaluate((el) => ({
      text: el.textContent,
      html: el.innerHTML,
      width: el.getBoundingClientRect().width,
      height: el.getBoundingClientRect().height,
    }));
    await page.getByRole("button", { name: "Content", exact: true }).click();
    const fields = await page
      .locator(".insp-body input, .insp-body textarea, .insp-body select")
      .evaluateAll((els) =>
        els.map((el) => ({
          label:
            el.getAttribute("aria-label") ||
            document.getElementById(el.getAttribute("aria-labelledby") || "")
              ?.textContent,
          value: (el as HTMLInputElement).value,
        })),
      );
    await page.getByRole("button", { name: "Design", exact: true }).click();
    const fill = page
      .locator(".insp-field")
      .filter({ has: page.locator("label", { hasText: /^Background$/ }) })
      .locator("input[type=text]");
    await fill.fill("#db0101");
    const after = await selected.evaluate((el) =>
      [el, ...Array.from(el.children)].map((n) => ({
        tag: n.tagName,
        background: getComputedStyle(n).backgroundColor,
        color: getComputedStyle(n).color,
      })),
    );
    rows.push({
      definition: definition.id,
      name: definition.name,
      id,
      before,
      fields,
      after,
    });
    await mkdir(".verification/element-audit", { recursive: true });
    await writeFile(
      ".verification/element-audit/census.json",
      JSON.stringify(rows, null, 2),
    );
  }
  await page.getByRole("button", { name: "Save project", exact: true }).click();
  await page.reload();
  await expect(page.locator(".canvas-page [data-element-id]")).toHaveCount(
    rows.length +
      ELEMENT_DEFINITIONS.reduce(
        (n, d) => n + (d.template.children?.length || 0),
        0,
      ),
  );
  await page.getByLabel("Deploy options", { exact: true }).click();
  const downloaded = page.waitForEvent("download");
  await page
    .getByRole("button", { name: "Download application ZIP", exact: true })
    .click();
  await mkdir(".verification/element-audit", { recursive: true });
  await (
    await downloaded
  ).saveAs(".verification/element-audit/application.zip");
  const zip = await JSZip.loadAsync(
    await readFile(".verification/element-audit/application.zip"),
  );
  const ir = JSON.parse(await zip.file("levoks.ir.json")!.async("string"));
  for (const row of rows) {
    const node = ir.project.editor.elementsById[String(row.id)];
    row.persistedFill = node.styles.backgroundColor || node.styles.background;
    row.generated = (
      await zip.file("frontend/app/page.jsx")!.async("string")
    ).includes(String(row.id));
  }
  await writeFile(
    ".verification/element-audit/census.json",
    JSON.stringify(rows, null, 2),
  );
});
