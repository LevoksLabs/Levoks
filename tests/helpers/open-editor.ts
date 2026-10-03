import { expect, type Page } from "@playwright/test";

/** Enter through the real Home flow; a second tab reopens the existing project. */
export async function openEditor(page: Page) {
  await page.goto("/");
  await expect(
    page.getByRole("button", { name: "New project", exact: true }),
  ).toBeEnabled();
  const active = await page.evaluate(async () => {
    const session = await fetch("/api/auth/session").then((response) => response.json());
    const owner = session?.user?.id;
    return localStorage.getItem(owner
      ? `levoks-active-project:account:${encodeURIComponent(owner)}`
      : "levoks-active-project");
  });
  if (active) await page.goto(`/workplace/${encodeURIComponent(active)}`);
  else {
    await page
      .getByRole("button", { name: "New project", exact: true })
      .click();
    await page
      .getByRole("dialog")
      .getByRole("button", { name: "Create project", exact: true })
      .click();
  }
  await expect(
    page.getByRole("button", { name: "Save project", exact: true }),
  ).toBeEnabled();
}
