import { test, expect } from "@playwright/test";
import { openEditor } from "../helpers/open-editor";

test("Google accounts and guests retain separate local projects across sign-ins", async ({ page, context }) => {
  let account: string | null = "google:alice";
  await context.route("**/api/auth/session", (route) => route.fulfill({
    json: account ? {
      user: { id: account, name: account },
      expires: "2099-01-01T00:00:00.000Z",
    } : {},
  }));
  await openEditor(page);
  const aliceProject = page.url();
  await page.getByRole("button", { name: "Untitled project", exact: true }).click();
  const dialog = page.getByRole("dialog", { name: "Levoks project workspace" });
  await dialog.getByLabel("Project name", { exact: true }).fill("Alice private files");
  await expect.poll(() => page.evaluate(async () => {
    const db = await new Promise<IDBDatabase>((resolve) => {
      const request = indexedDB.open("levoks-workspace:account:google%3Aalice");
      request.onsuccess = () => resolve(request.result);
    });
    return new Promise<string>((resolve) => {
      const request = db.transaction("projects").objectStore("projects").getAll();
      request.onsuccess = () => { db.close(); resolve(request.result[0]?.name); };
    });
  })).toBe("Alice private files");

  // Session refresh in an already-open tab must clear the old editor too.
  account = "google:bob";
  await page.evaluate(() => document.dispatchEvent(new Event("visibilitychange")));
  await expect(page).toHaveURL(/\/$/);
  await expect(page.getByRole("article")).toHaveCount(0);
  await page.goto(aliceProject);
  await expect(page.getByRole("button", { name: "Save project", exact: true })).toHaveCount(0);
  await openEditor(page);
  const bobProject = page.url();
  expect(bobProject).not.toBe(aliceProject);

  account = null;
  await page.goto("/");
  await expect(page.getByRole("button", { name: "New project", exact: true })).toBeEnabled();
  await expect(page.getByRole("article")).toHaveCount(0);

  account = "google:alice";
  await page.goto("/");
  await expect(page.getByRole("article", { name: "Alice private files", exact: true })).toBeVisible();
  await openEditor(page);
  expect(page.url()).toBe(aliceProject);
  account = "google:bob";
  await openEditor(page);
  expect(page.url()).toBe(bobProject);
});
