import { openEditor } from "../helpers/open-editor";
import { test, expect } from "@playwright/test";

test("header and account controls support keyboard navigation and compact layouts", async ({ page }) => {
  await page.route("**/api/auth/session", route => route.fulfill({ json: {
    user: {
      id: "test:account-ui",
      name: "Alexandria Verylongaccountnamefortheworkspace",
      email: "alexandria.verylongaddress@example.test",
    },
    provider: "github",
    expires: "2099-01-01T00:00:00.000Z",
  } }));
  await page.emulateMedia({ reducedMotion: "reduce" });
  await openEditor(page);
  await expect(page.getByRole("button", { name: "Save project", exact: true })).toBeEnabled();
  const trigger = page.getByRole("button", { name: "User menu", exact: true });
  const menu = page.getByRole("menu", { name: "Account actions" });
  const profileItem = page.getByRole("menuitem", { name: "Profile Settings" });
  const profile = page.getByRole("dialog", { name: "Profile", exact: true });
  const close = profile.getByRole("button", { name: "Close profile" });

  for (const width of [1600, 1366, 1024]) {
    await page.setViewportSize({ width, height: width === 1600 ? 1000 : 768 });
    await trigger.focus();
    await page.keyboard.press("ArrowUp");
    await expect(page.getByRole("menuitem", { name: "Sign Out" })).toBeFocused();
    await page.keyboard.press("ArrowDown");
    await expect(profileItem).toBeFocused();
    await page.keyboard.press("End");
    await expect(page.getByRole("menuitem", { name: "Sign Out" })).toBeFocused();
    await page.keyboard.press("Home");
    await expect(profileItem).toBeFocused();
    await page.screenshot({ path: `.verification/minor-ui-menu-${width}.png` });
    await page.keyboard.press("Escape");
    await expect(menu).toBeHidden();
    await expect(trigger).toBeFocused();

    await page.keyboard.press("ArrowDown");
    await page.keyboard.press("Enter");
    await expect(profile).toBeVisible();
    await expect(close).toBeFocused();
    await page.keyboard.press("Tab");
    await expect(profile.getByRole("button", { name: "Open projects" })).toBeFocused();
    await page.getByRole("button", { name: "Save project", exact: true }).evaluate(element => element.focus());
    await expect(profile.getByRole("button", { name: "Open projects" })).toBeFocused();
    await page.keyboard.press("Shift+Tab");
    await expect(close).toBeFocused();
    await page.keyboard.press("Shift+B");
    await expect(page.locator(".header-mode-badge")).toHaveCount(0);
    expect(await profile.evaluate(element => element.scrollWidth <= element.clientWidth)).toBe(true);
    expect(await profile.locator(".profile-user-card").evaluate(element => element.scrollWidth <= element.clientWidth)).toBe(true);
    await page.screenshot({ path: `.verification/minor-ui-profile-${width}.png` });
    await page.keyboard.press("Escape");
    await expect(profile).toBeHidden();
    await expect(trigger).toBeFocused();
  }

  await trigger.click();
  await profileItem.click();
  await close.click();
  await expect(trigger).toBeFocused();
  await trigger.click();
  await page.keyboard.press("Tab");
  await expect(menu).toBeHidden();

  await page.getByRole("button", { name: "Projects home" }).click();
  await expect(page.getByRole("heading", { name: "All projects", exact: true })).toBeVisible();
  await page.getByRole("link", { name: "Open Untitled project", exact: true }).click();
  await trigger.click();
  await profileItem.click();
  await profile.getByRole("button", { name: "Open projects" }).click();
  await expect(profile).toBeHidden();
  await expect(page.getByRole("heading", { name: "All projects", exact: true })).toBeVisible();
});
