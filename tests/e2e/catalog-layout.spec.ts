import { test, expect } from "@playwright/test";
import { mkdir, writeFile } from "node:fs/promises";
import { ELEMENT_DEFINITIONS } from "../../src/lib/elements/registry";
import { buildTemplateElements } from "../../src/store/editorStore";
import { templates } from "../../src/templates";
import { generateFrontendProject } from "../../src/lib/codegen/frontend";

test("every catalog element renders accessible controls and contains its configured layout at four widths", async ({
  page,
}) => {
  test.setTimeout(180000);
  await page.route("**/*", (route) =>
    route.request().url().startsWith("http") ? route.abort() : route.continue(),
  );
  const evidence: unknown[] = [];
  const failures: unknown[] = [];
  for (const definition of ELEMENT_DEFINITIONS) {
    const template = structuredClone(definition.template);
    template.layout = { ...template.layout, position: "static", x: 0, y: 0 };
    template.styles = {
      ...template.styles,
      position: "static",
      width: "100%",
      maxWidth: "100%",
      minWidth: "0",
      overflowWrap: "anywhere",
    };
    if (
      definition.children &&
      !template.children?.length &&
      !["checkboxGroup", "radioGroup", "form"].includes(definition.id)
    )
      template.children = [
        {
          ...templates.text,
          props: { content: "Editable nested content" },
          layout: { position: "static" },
          styles: { width: "100%", height: "auto" },
        },
      ];
    const { byId } = buildTemplateElements(
      [
        {
          ...templates.container,
          label: "Catalog layout",
          layout: { x: 0, y: 0, w: 1280, h: 900 },
          styles: {
            width: "100%",
            height: "auto",
            padding: "12px",
            backgroundColor: "#fff",
            display: "flex",
            flexDirection: "column",
            gap: "12px",
          },
          responsive: {
            mobile: { styles: { padding: "12px" } },
            tablet: { styles: { padding: "12px" } },
          },
          children: [template],
        },
      ],
      null,
    );
    const output = generateFrontendProject(Object.values(byId), [], {
      width: 1280,
      height: 900,
      backgroundColor: "#fff",
    });
    const errors: string[] = [];
    const listener = (e: Error) => errors.push(e.message);
    page.on("pageerror", listener);
    for (const width of [320, 768, 1024, 1440]) {
      await page.setViewportSize({ width, height: 1000 });
      await page.goto("about:blank");
      await page.setContent(output.previewHtml);
      const findings = await page.evaluate(() => {
        const root = document.querySelector(".page")!;
        const overflow = Array.from(
          root.querySelectorAll<HTMLElement>('[class^="el-"]'),
        )
          .filter(
            (n) =>
              getComputedStyle(n).display !== "none" && !n.closest("[hidden]"),
          )
          .filter((n) => {
            const r = n.getBoundingClientRect();
            return r.width && (r.left < -1 || r.right > innerWidth + 1);
          })
          .map((n) => n.className);
        const unnamed = Array.from(
          root.querySelectorAll<HTMLElement>(
            "button,input:not([type=hidden]),select,textarea,a[href],iframe",
          ),
        )
          .filter((n) => !n.closest("[hidden],dialog:not([open])"))
          .filter((n) => {
            const input = n as HTMLInputElement;
            return (
              !n.getAttribute("aria-label") &&
              !n.getAttribute("aria-labelledby") &&
              !input.labels?.length &&
              !n.textContent?.trim() &&
              !input.placeholder &&
              !n.getAttribute("title") &&
              !["submit", "reset", "button"].includes(input.type)
            );
          })
          .map((n) => n.outerHTML.slice(0, 200));
        return { overflow, unnamed };
      });
      if (findings.overflow.length || findings.unnamed.length) failures.push({id:definition.id,width,...findings});
      const tab = page.getByRole("tab").first();
      if (await tab.count()) {
        await tab.focus();
        await page.keyboard.press("ArrowRight");
        await expect(page.getByRole("tab").nth(1)).toBeFocused();
        await expect(page.getByRole("tab").nth(1)).toHaveAttribute(
          "aria-selected",
          "true",
        );
      }
      const summary = page.locator("summary").first();
      if (await summary.count()) {
        const wasOpen = await summary.locator("..").getAttribute("open") !== null;
        await summary.focus();
        await page.keyboard.press("Enter");
        expect(await summary.locator("..").getAttribute("open") !== null).toBe(!wasOpen);
      }
      const trigger = page.locator("[data-dialog-open]").first();
      if (await trigger.count()) {
        await trigger.focus();
        await page.keyboard.press("Enter");
        await expect(page.locator("dialog")).toBeVisible();
        await page.keyboard.press("Escape");
        await expect(page.locator("dialog")).not.toBeVisible();
        await expect(trigger).toBeFocused();
      }
      evidence.push({
        id: definition.id,
        status: definition.status,
        width,
        ...findings,
        errors: [...errors],
      });
    }
    expect(errors, definition.id).toEqual([]);
    page.off("pageerror", listener);
  }
  await mkdir(".verification/catalog-layout", { recursive: true });
  await writeFile(
    ".verification/catalog-layout/results.json",
    JSON.stringify(evidence, null, 2),
  );
  expect(failures).toEqual([]);
});
