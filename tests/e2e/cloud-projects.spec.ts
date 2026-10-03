import { openEditor } from "../helpers/open-editor";
import { test, expect } from "@playwright/test";
import type { ProjectDocument } from "../../src/lib/project/schema";

test("cloud saves retain each tab's revision and isolate account changes", async ({
  context,
  page,
}) => {
  let account = "github:alice";
  const records = new Map<
    string,
    {
      ownerId: string;
      projectId: string;
      name: string;
      updatedAt: string;
      revision: number;
      document: ProjectDocument;
    }
  >();
  const writes: { ownerId: string; revision: number }[] = [];
  // Controlled server responses isolate the browser regression. Real session,
  // route and MongoDB CAS behavior are covered by cloud-projects.test.ts.
  await context.route("**/api/auth/session", (route) =>
    route.fulfill({
      json: {
        user: { id: account, name: account },
        expires: "2099-01-01T00:00:00.000Z",
      },
    }),
  );
  await context.route("**/api/projects*", async (route) => {
    const request = route.request();
    if (request.method() === "PUT") {
      const body = request.postDataJSON();
      writes.push({ ownerId: body.ownerId, revision: body.revision });
      const key = `${account}/${body.project.id}`;
      const old = records.get(key);
      if (body.ownerId !== account || (old?.revision || 0) !== body.revision) {
        await route.fulfill({
          status: 409,
          json: {
            error:
              "Cloud project changed. Download a local backup, then reopen the cloud version.",
          },
        });
        return;
      }
      records.set(key, {
        ownerId: account,
        projectId: body.project.id,
        name: body.project.name,
        updatedAt: body.project.updatedAt,
        document: body.project,
        revision: body.revision + 1,
      });
      await route.fulfill({ json: { revision: body.revision + 1 } });
      return;
    }
    const id = new URL(request.url()).searchParams.get("id");
    await route.fulfill({
      json: id
        ? records.get(`${account}/${id}`)
        : [...records.values()].filter((record) => record.ownerId === account),
    });
  });
  await openEditor(page);
  await page
    .getByRole("button", { name: "Untitled project", exact: true })
    .click();
  const first = page.getByRole("dialog", { name: "Levoks project workspace" });
  await first
    .getByRole("button", { name: "Save to account", exact: true })
    .click();
  await expect(
    first.getByText("Saved to your account.", { exact: true }),
  ).toBeVisible();

  const other = await context.newPage();
  await openEditor(other);
  await other
    .getByRole("button", { name: "Untitled project", exact: true })
    .click();
  const second = other.getByRole("dialog", {
    name: "Levoks project workspace",
  });
  await second
    .getByRole("button", { name: "Load cloud projects", exact: true })
    .click();
  const cloud = second
    .locator("section")
    .filter({
      has: other.getByRole("heading", { name: "Cloud projects", exact: true }),
    });
  await cloud.getByRole("button", { name: /Untitled project/ }).click();
  await expect
    .poll(() =>
      other.evaluate(() => Object.values(sessionStorage).includes("1")),
    )
    .toBe(true);

  await first.getByLabel("Project name", { exact: true }).fill("Cloud winner");
  await first
    .getByRole("button", { name: "Save to account", exact: true })
    .click();
  await expect.poll(() => [...records.values()][0].revision).toBe(2);
  await second
    .getByLabel("Project name", { exact: true })
    .fill("Stale edits to preserve");
  await second
    .getByRole("button", { name: "Save to account", exact: true })
    .click();
  await expect(second.getByRole("alert")).toContainText(
    "Cloud project changed",
  );
  expect(writes.map((write) => write.revision)).toEqual([0, 1, 1]);
  expect([...records.values()][0].name).toBe("Cloud winner");
  await expect(second.getByLabel("Project name", { exact: true })).toHaveValue(
    "Stale edits to preserve",
  );
  await other.screenshot({ path: ".verification/cloud-save-conflict.png" });
  await other.close();

  // Reloading a tab retains its own baseline; switching accounts starts at zero.
  account = "google:bob";
  await page.reload();
  await page
    .getByRole("button", {
      name: /^(Untitled project|Stale edits to preserve)$/,
    })
    .click();
  await first
    .getByRole("button", { name: "Save to account", exact: true })
    .click();
  await expect(
    first.getByText("Saved to your account.", { exact: true }),
  ).toBeVisible();
  expect(writes.at(-1)).toEqual({ ownerId: account, revision: 0 });
  expect(
    [...records.values()].filter(
      (record) => record.ownerId === "github:alice",
    )[0].name,
  ).toBe("Cloud winner");

  // The cookie identity may change before the open UI's session refreshes.
  account = "github:alice";
  await first
    .getByRole("button", { name: "Save to account", exact: true })
    .click();
  await expect(first.getByRole("alert")).toContainText("Cloud project changed");
  expect(
    [...records.values()].filter((record) => record.ownerId === account)[0]
      .revision,
  ).toBe(2);
});
