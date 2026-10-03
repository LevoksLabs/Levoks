import { test, expect, type Page } from "@playwright/test";
import { emptyProject } from "../../src/lib/project/workspace";

async function createProject(page: Page, name: string) {
  await page.getByRole("button", { name: "New project", exact: true }).click();
  await page.getByRole("dialog").getByLabel("Project name").fill(name);
  await page
    .getByRole("dialog")
    .getByRole("button", { name: "Create project", exact: true })
    .click();
  await expect(page).toHaveURL(/\/workplace\/[^/]+$/);
  await expect(
    page.getByRole("button", { name: "Save project", exact: true }),
  ).toBeEnabled();
  return page.url();
}

test("Home manages saved projects and groups without editor chrome, including narrow screens", async ({
  page,
}) => {
  const errors: string[] = [];
  page.on("pageerror", (error) => errors.push(error.message));
  await page.goto("/");
  await expect(
    page.getByRole("heading", { name: "Your next project starts here" }),
  ).toBeVisible();
  await expect(page.locator(".editor-root")).toHaveCount(0);
  await expect(
    page.getByRole("link", { name: "Sign in", exact: true }),
  ).toBeVisible();
  await page.screenshot({ path: ".verification/home-empty-desktop.png" });
  const first = await createProject(page, "Studio website");
  await page.getByRole("button", { name: "Projects home" }).click();
  await expect(
    page.getByRole("heading", { name: "All projects", exact: true }),
  ).toBeVisible();
  await page.getByRole("button", { name: "Create group", exact: true }).click();
  await page.getByRole("dialog").getByLabel("Group name").fill("Client work");
  await page
    .getByRole("dialog")
    .getByRole("button", { name: "Create group" })
    .click();
  await expect(
    page.getByRole("heading", { name: "Client work", exact: true }),
  ).toBeVisible();
  const second = await createProject(page, "Portfolio");
  expect(second).not.toBe(first);
  await page.getByRole("button", { name: "Projects home" }).click();
  const card = page.getByRole("article", {
    name: "Studio website",
    exact: true,
  });
  await card.getByLabel("Actions for Studio website").click();
  await card.getByRole("button", { name: "Move to group" }).click();
  await page
    .getByRole("dialog")
    .getByLabel("Group", { exact: true })
    .selectOption({ label: "Client work" });
  await page
    .getByRole("dialog")
    .getByRole("button", { name: "Save changes" })
    .click();
  await card
    .getByRole("button", { name: "Star Studio website", exact: true })
    .click();
  await expect(
    card.getByRole("button", { name: "Unstar Studio website", exact: true }),
  ).toHaveAttribute("aria-pressed", "true");
  await page.getByRole("button", { name: "Starred", exact: true }).click();
  await expect(page.getByRole("article")).toHaveCount(1);
  await page.getByRole("button", { name: "All projects" }).click();
  await page.getByLabel("Search projects").fill("Portfolio");
  await expect(page.getByRole("article")).toHaveCount(1);
  await page.getByLabel("Clear search").click();
  await page.getByLabel("Sort projects").selectOption("name");
  await expect(page.getByRole("article").first()).toHaveAttribute(
    "aria-label",
    "Portfolio",
  );
  await page.screenshot({ path: ".verification/home-populated-desktop.png" });
  await page.getByRole("button", { name: "List view" }).click();
  await page.screenshot({ path: ".verification/home-list-desktop.png" });
  await card.getByLabel("Actions for Studio website").click();
  await card.getByRole("button", { name: "Rename", exact: true }).click();
  await page
    .getByRole("dialog")
    .getByLabel("Project name")
    .fill("Studio launch");
  await page
    .getByRole("dialog")
    .getByRole("button", { name: "Save changes" })
    .click();
  await page.reload();
  const renamed = page.getByRole("article", {
    name: "Studio launch",
    exact: true,
  });
  await expect(renamed).toBeVisible();
  await renamed.getByLabel("Actions for Studio launch").click();
  await renamed.getByRole("button", { name: "Duplicate", exact: true }).click();
  await expect(
    page.getByRole("article", { name: "Studio launch (copy)", exact: true }),
  ).toBeVisible();
  await renamed.getByLabel("Actions for Studio launch").click();
  await renamed.getByRole("button", { name: "Move to Trash" }).click();
  await expect(renamed).toHaveCount(0);
  await page.getByRole("button", { name: "Trash", exact: true }).click();
  await renamed
    .getByRole("button", { name: "Restore project", exact: true })
    .click();
  await expect(
    page.getByRole("heading", { name: "Nothing in Trash" }),
  ).toBeVisible();
  await page.getByRole("button", { name: /Client work/ }).click();
  await expect(page.getByRole("article")).toHaveCount(3);
  await page.getByRole("button", { name: "Remove group" }).click();
  await page
    .getByRole("dialog")
    .getByRole("button", { name: "Remove group" })
    .click();
  await expect(page.getByRole("article")).toHaveCount(3);
  await page.setViewportSize({ width: 390, height: 844 });
  await expect(
    page.getByRole("button", { name: "Open navigation" }),
  ).toBeVisible();
  expect(
    await page
      .locator("main")
      .evaluate((el) => el.scrollWidth <= el.clientWidth),
  ).toBe(true);
  await page.screenshot({
    path: ".verification/home-mobile.png",
    fullPage: true,
  });
  await page.getByRole("button", { name: "Open navigation" }).click();
  await page.getByRole("link", { name: "Profile & account" }).click();
  await expect(
    page.getByRole("heading", { name: "Your profile" }),
  ).toBeVisible();
  await page.screenshot({ path: ".verification/home-profile-mobile.png" });
  expect(errors).toEqual([]);
});

test("workplace deep links load the requested project, preserve editor saves, and reject missing IDs", async ({
  page,
}) => {
  await page.goto("/");
  const first = await createProject(page, "First project");
  await page.getByRole("button", { name: "Projects home" }).click();
  const second = await createProject(page, "Second project");
  await page.goto(first);
  await page
    .getByRole("button", { name: "First project", exact: true })
    .click();
  const dialog = page.getByRole("dialog", { name: "Levoks project workspace" });
  await dialog
    .getByLabel("Project name", { exact: true })
    .fill("First project edited");
  await page.keyboard.press("Escape");
  await page.getByRole("button", { name: "Projects home" }).click();
  await expect(
    page.getByRole("article", { name: "First project edited", exact: true }),
  ).toBeVisible();
  await page.goto(second);
  await expect(
    page.getByRole("button", { name: "Second project", exact: true }),
  ).toBeVisible();
  await page.reload();
  await expect(
    page.getByRole("button", { name: "Second project", exact: true }),
  ).toBeVisible();
  await page.goto("/workplace/missing-project");
  await expect(
    page.getByRole("heading", { name: "Unable to open project" }),
  ).toBeVisible();
  await expect(page.locator(".editor-root")).toHaveCount(0);
  await page.screenshot({ path: ".verification/home-missing-project.png" });
  await page.getByRole("link", { name: "Back to Home" }).click();
  await expect(page.getByRole("article")).toHaveCount(2);
});

test("Home imports backups, rejects invalid files, and exports the original project data", async ({
  page,
}) => {
  await page.goto("/");
  await expect(
    page.getByRole("button", { name: "New project", exact: true }),
  ).toBeEnabled();
  const file = page.getByLabel("Import project backup");
  await file.setInputFiles({
    name: "bad.json",
    mimeType: "application/json",
    buffer: Buffer.from("{}"),
  });
  await expect(page.getByRole("main").getByRole("alert")).toContainText(
    "not a valid Levoks project backup",
  );
  const project = emptyProject("Imported website");
  await file.setInputFiles({
    name: "website.levoks.json",
    mimeType: "application/json",
    buffer: Buffer.from(JSON.stringify(project)),
  });
  const card = page.getByRole("article", {
    name: "Imported website (import)",
    exact: true,
  });
  await expect(card).toBeVisible();
  await card.getByLabel("Actions for Imported website (import)").click();
  const download = page.waitForEvent("download");
  await card.getByRole("button", { name: "Export backup" }).click();
  expect((await download).suggestedFilename()).toMatch(/\.levoks\.json$/);
});

test("cloud projects open through Home and profile updates cannot change identity", async ({
  page,
}) => {
  let name = "Alex Morgan";
  const project = emptyProject("Cloud website");
  await page.route("**/api/auth/session", async (route) => {
    if (route.request().method() === "POST")
      name = route.request().postDataJSON().data.name;
    await route.fulfill({
      json: {
        user: { id: "github:home", name, email: "alex@example.test" },
        provider: "github",
        expires: "2099-01-01T00:00:00.000Z",
      },
    });
  });
  await page.route("**/api/auth/csrf", (route) =>
    route.fulfill({ json: { csrfToken: "fixture" } }),
  );
  await page.route("**/api/projects*", (route) =>
    route.fulfill({
      json: new URL(route.request().url()).searchParams.has("id")
        ? { ownerId: "github:home", document: project, revision: 2 }
        : [
            {
              projectId: project.id,
              name: project.name,
              updatedAt: project.updatedAt,
              revision: 2,
            },
          ],
    }),
  );
  await page.goto("/?view=cloud");
  await page.getByRole("button", { name: "Download & open" }).click();
  await expect(page).toHaveURL(new RegExp(`/workplace/${project.id}$`));
  await expect(
    page.getByRole("button", { name: "Cloud website", exact: true }),
  ).toBeVisible();
  await page.getByRole("button", { name: "Projects home" }).click();
  await page.getByRole("link", { name: "Profile & account" }).click();
  await page.getByLabel("Display name").fill("Alex Studio");
  await page.getByRole("button", { name: "Save profile" }).click();
  await expect(page.getByRole("status")).toContainText("Profile saved");
  await page.screenshot({ path: ".verification/home-profile-desktop.png" });
});
