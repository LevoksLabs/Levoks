import test from "node:test";
import assert from "node:assert/strict";
import { spawn, execFileSync } from "node:child_process";
import { randomBytes, randomUUID } from "node:crypto";
import { mkdir, writeFile } from "node:fs/promises";
import { createServer } from "node:net";
import { setTimeout as delay } from "node:timers/promises";
import path from "node:path";
import { MongoMemoryServer } from "mongodb-memory-server";
import { MongoClient } from "mongodb";
import { encode } from "next-auth/jwt";
import { chromium, expect } from "@playwright/test";
import {
  emptyProject,
  restoreProject,
  captureProject,
} from "../../src/lib/project/workspace";
import { useEditorStore } from "../../src/store/editorStore";
import { templates } from "../../src/templates";
import { parseProject } from "../../src/lib/project/schema";
import { CloudProjects } from "../../src/lib/server/cloud-projects";

test(
  "alpha project sharing enforces roles, single-use invitations, revisions, revocation and real browser recovery",
  { timeout: 360000 },
  async (t) => {
    const database = await MongoMemoryServer.create({
      binary: {
        version: "8.2.6",
        downloadDir: path.resolve(".verification/mongodb-bin"),
      },
      instance: { ip: "127.0.0.1" },
    });
    t.after(() => database.stop());
    const client = await MongoClient.connect(database.getUri("collaboration"));
    t.after(() => client.close());
    const store = new CloudProjects(client.db());
    const owner = "google:alpha-owner",
      editor = "google:alpha-editor",
      viewer = "github:alpha-viewer",
      outsider = "google:outsider";
    const seed = emptyProject("Shared alpha project");
    restoreProject(seed);
    const titleId = useEditorStore.getState().addElement(templates.text);
    useEditorStore.getState().updateElement(titleId, {
      props: { content: "Alpha collaboration preview" },
      layout: {
        ...useEditorStore.getState().elementsById[titleId].layout,
        x: 16,
        y: 16,
        w: 300,
        h: 40,
      },
    });
    const aboutPage = useEditorStore.getState().addPage("About");
    const aboutTitle = useEditorStore.getState().addElement(templates.text);
    useEditorStore.getState().updateElement(aboutTitle, {
      props: { content: "Shared second page" },
      layout: {
        ...useEditorStore.getState().elementsById[aboutTitle].layout,
        x: 16,
        y: 16,
        w: 300,
        h: 40,
      },
    });
    useEditorStore.getState().switchPage(seed.editor.activePageId);
    const project = captureProject(seed.id, seed.name);
    await store.save(owner, owner, project, 0);
    assert.equal((await store.get(owner, owner, project.id)).role, "owner");
    await assert.rejects(store.get(outsider, owner, project.id), /not found/);
    await assert.rejects(
      store.invite(outsider, owner, project.id, 0, "editor"),
      /Only the owner/,
    );
    const first = await store.invite(owner, owner, project.id, 0, "editor");
    const accepted = await new CloudProjects(client.db()).accept(
      editor,
      "Alpha Editor",
      owner,
      project.id,
      first.token,
    );
    assert.equal(accepted.role, "editor");
    assert.equal(
      (await store.invitation(editor, owner, project.id, first.token))
        .alreadyMember,
      true,
    );
    assert.equal(
      (
        await store.accept(
          editor,
          "Alpha Editor",
          owner,
          project.id,
          first.token,
        )
      ).role,
      "editor",
    );
    await assert.rejects(
      store.accept(outsider, "Outsider", owner, project.id, first.token),
      /expired/,
    );
    const second = await store.invite(
      owner,
      owner,
      project.id,
      accepted.accessVersion,
      "viewer",
    );
    await store.accept(viewer, "Alpha Viewer", owner, project.id, second.token);
    const access = await store.access(owner, owner, project.id);
    assert.equal(access.members.length, 2);
    assert.equal(JSON.stringify(access).includes(first.token), false);
    assert.equal(
      JSON.stringify(
        await client
          .db()
          .collection("levoks_projects")
          .findOne({ ownerId: owner }),
      ).includes(first.token),
      false,
    );
    assert.deepEqual(
      (await store.list(editor)).map((p) => p.role),
      ["editor"],
    );
    await assert.rejects(
      store.save(viewer, owner, { ...project, name: "Denied" }, 1),
      /Viewers/,
    );
    await assert.rejects(
      store.manage(editor, owner, project.id, access.accessVersion, {
        action: "remove",
        memberId: viewer,
      }),
      /Only the owner/,
    );
    await assert.rejects(
      store.manage(owner, owner, project.id, access.accessVersion, {
        action: "remove",
        memberId: owner,
      }),
      /owner role/,
    );
    const saves = await Promise.allSettled([
      store.save(editor, owner, { ...project, name: "Editor win" }, 1),
      store.save(owner, owner, { ...project, name: "Owner win" }, 1),
    ]);
    assert.equal(saves.filter((r) => r.status === "fulfilled").length, 1);
    assert.equal((await store.get(owner, owner, project.id)).revision, 2);
    const raceInvite = await store.invite(
      owner,
      owner,
      project.id,
      access.accessVersion,
      "viewer",
    );
    const race = await Promise.allSettled([
      store.accept("google:one", "One", owner, project.id, raceInvite.token),
      store.accept("google:two", "Two", owner, project.id, raceInvite.token),
    ]);
    assert.equal(race.filter((r) => r.status === "fulfilled").length, 1);
    const current = await store.access(owner, owner, project.id);
    await assert.rejects(
      store.invite(owner, owner, project.id, 0, "editor"),
      /access changed/,
    );
    const expiring = await store.invite(
      owner,
      owner,
      project.id,
      current.accessVersion,
      "editor",
    );
    await client
      .db()
      .collection("levoks_projects")
      .updateOne(
        { ownerId: owner },
        { $set: { "invitations.0.expiresAt": "2000-01-01T00:00:00.000Z" } },
      );
    await assert.rejects(
      store.accept(outsider, "Outsider", owner, project.id, expiring.token),
      /expired/,
    );
    const revoke = await store.invite(
      owner,
      owner,
      project.id,
      expiring.accessVersion,
      "editor",
    );
    await store.manage(owner, owner, project.id, revoke.accessVersion, {
      action: "revoke",
      invitationId: revoke.invitationId,
    });
    await assert.rejects(
      store.accept(outsider, "Outsider", owner, project.id, revoke.token),
      /expired/,
    );
    // Identical imported IDs in different accounts remain distinct projects.
    await store.save(
      outsider,
      outsider,
      { ...project, name: "Independent" },
      0,
    );
    assert.equal(
      (await store.get(outsider, outsider, project.id)).name,
      "Independent",
    );
    assert.equal((await store.list(editor))[0].ownerId, owner);

    const reservation = createServer();
    await new Promise<void>((resolve) =>
      reservation.listen(0, "127.0.0.1", resolve),
    );
    const port = (reservation.address() as { port: number }).port;
    await new Promise<void>((resolve) => reservation.close(() => resolve()));
    const origin = `http://127.0.0.1:${port}`,
      secret = randomBytes(32).toString("hex"),
      acceptanceId = randomUUID().replaceAll("-", "");
    const directory = path.resolve(
      `.verification/deployment-api-${acceptanceId}`,
    );
    await mkdir(directory, { recursive: true });
    await writeFile(
      path.join(directory, "tsconfig.json"),
      JSON.stringify({
        extends: "../../tsconfig.json",
        include: [
          path.resolve("next-env.d.ts"),
          path.resolve("src/**/*.ts"),
          path.resolve("src/**/*.tsx"),
        ],
      }),
    );
    const server = spawn(
      process.execPath,
      [
        "node_modules/next/dist/bin/next",
        "dev",
        "--hostname",
        "127.0.0.1",
        "--port",
        String(port),
      ],
      {
        windowsHide: true,
        stdio: ["ignore", "pipe", "pipe"],
        env: {
          ...process.env,
          NODE_ENV: "development",
          LEVOKS_DEPLOYMENT_API_TEST: acceptanceId,
          NEXT_TELEMETRY_DISABLED: "1",
          NEXTAUTH_URL: origin,
          NEXTAUTH_SECRET: secret,
          MONGODB_URI: database.getUri("collaboration"),
          GITHUB_ID: "",
          GITHUB_SECRET: "",
          GOOGLE_ID: "",
          GOOGLE_SECRET: "",
        },
      },
    );
    let logs = "";
    for (const stream of [server.stdout, server.stderr])
      stream.on("data", (chunk) => {
        logs = (logs + chunk).slice(-16000);
      });
    t.after(async () => {
      await writeFile(".verification/collaboration-server.log", logs);
      if (server.exitCode === null && server.signalCode === null) {
        if (process.platform === "win32")
          execFileSync("taskkill", ["/PID", String(server.pid), "/T", "/F"], {
            windowsHide: true,
            stdio: "ignore",
          });
        else server.kill("SIGTERM");
      }
    });
    let ready = false;
    for (let attempt = 0; attempt < 120; attempt++) {
      assert.equal(server.exitCode, null, logs);
      try {
        const response = await fetch(`${origin}/api/projects`, {
          signal: AbortSignal.timeout(2000),
        });
        await response.body?.cancel();
        if (response.status === 401) {
          ready = true;
          break;
        }
      } catch {
        /* cold compile */
      }
      await delay(500);
    }
    assert.ok(ready, logs);
    const cookies = new Map<string, string>();
    for (const actor of [owner, editor, viewer, outsider])
      cookies.set(
        actor,
        await encode({
          token: { id: actor, sub: actor, name: actor },
          secret,
          maxAge: 3600,
        }),
      );
    async function request(
      actor: string,
      route: string,
      body?: unknown,
      method = body ? "POST" : "GET",
      originHeader = origin,
    ) {
      const response = await fetch(`${origin}${route}`, {
        method,
        headers: {
          Cookie: `next-auth.session-token=${cookies.get(actor) || ""}`,
          Origin: originHeader,
          "Content-Type": "application/json",
        },
        ...(body ? { body: JSON.stringify(body) } : {}),
      });
      return {
        status: response.status,
        body: await response.json(),
        cache: response.headers.get("cache-control"),
      };
    }
    const accessRoute = `/api/projects/access?${new URLSearchParams({ ownerId: owner, projectId: project.id })}`;
    assert.equal((await request("guest", accessRoute)).status, 401);
    assert.equal((await request(outsider, accessRoute)).status, 404);
    const ownerAccess = await request(owner, accessRoute);
    assert.equal(ownerAccess.cache, "private, no-store");
    const invitationBody = {
      action: "invite",
      actorId: owner,
      ownerId: owner,
      projectId: project.id,
      accessVersion: ownerAccess.body.accessVersion,
      role: "viewer",
    };
    assert.equal(
      (
        await request(editor, accessRoute, {
          ...invitationBody,
          actorId: editor,
        })
      ).status,
      403,
    );
    assert.equal(
      (
        await request(owner, accessRoute, {
          ...invitationBody,
          actorId: editor,
        })
      ).status,
      409,
    );
    assert.equal(
      (
        await request(
          owner,
          accessRoute,
          invitationBody,
          "POST",
          "https://foreign.example",
        )
      ).status,
      403,
    );
    const remote = await store.get(owner, owner, project.id);
    parseProject(JSON.parse(JSON.stringify(remote.document)));
    assert.equal(
      (
        await request(
          viewer,
          "/api/projects",
          {
            ownerId: viewer,
            projectOwnerId: owner,
            revision: remote.revision,
            project: remote.document,
          },
          "PUT",
        )
      ).status,
      403,
    );

    process.env.PLAYWRIGHT_BROWSERS_PATH ||= path.resolve(
      ".verification/browsers",
    );
    const browser = await chromium.launch({
      executablePath: path.resolve(
        ".verification/browsers/chromium_headless_shell-1243/chrome-headless-shell-win64/chrome-headless-shell.exe",
      ),
    });
    t.after(() => browser.close());
    async function browserPage(actor: string) {
      const context = await browser.newContext({
        viewport: { width: 1600, height: 1000 },
        acceptDownloads: true,
      });
      context.setDefaultNavigationTimeout(90000);
      await context.route("https://fonts.googleapis.com/**", (route) =>
        route.abort(),
      );
      await context.route("https://fonts.gstatic.com/**", (route) =>
        route.abort(),
      );
      if (cookies.has(actor))
        await context.addCookies([
          {
            name: "next-auth.session-token",
            value: cookies.get(actor)!,
            url: origin,
          },
        ]);
      return context.newPage();
    }
    const ownerPage = await browserPage(owner),
      editorPage = await browserPage(editor),
      viewerPage = await browserPage(viewer);
    const sharedURL = `${origin}/shared/${encodeURIComponent(owner)}/${project.id}`;
    await ownerPage.goto(sharedURL);
    await expect(
      ownerPage.getByRole("button", {
        name: "Save shared project",
        exact: true,
      }),
    ).toBeVisible({ timeout: 90000 });
    await ownerPage
      .getByRole("button", { name: "Project sharing", exact: true })
      .click();
    const panel = ownerPage.getByRole("region", {
      name: "Project sharing",
      exact: true,
    });
    await expect(
      panel.getByRole("button", { name: "Remove Alpha Editor", exact: true }),
    ).toBeVisible();
    await panel
      .getByRole("button", { name: "Create invitation link", exact: true })
      .click();
    await expect(
      panel.getByLabel("Invitation link", { exact: true }),
    ).toBeVisible();
    const invitationURL = await panel
      .getByLabel("Invitation link", { exact: true })
      .inputValue();
    assert.equal(new URL(invitationURL).search, "");
    const inviteePage = await browserPage("guest");
    await inviteePage.goto(invitationURL);
    await expect(
      inviteePage.getByRole("heading", {
        name: "Sign in to collaborate",
        exact: true,
      }),
    ).toBeVisible();
    const signInURL = new URL(
      (await inviteePage
        .getByRole("link", { name: "Sign in", exact: true })
        .getAttribute("href"))!,
      origin,
    );
    assert.equal(
      signInURL.search.includes(new URL(invitationURL).hash.slice(1)),
      false,
    );
    await expect
      .poll(() =>
        inviteePage.evaluate(
          (value) => Object.values(sessionStorage).includes(value),
          new URL(invitationURL).hash.slice(1),
        ),
      )
      .toBe(true);
    await inviteePage.context().addCookies([
      {
        name: "next-auth.session-token",
        value: cookies.get(outsider)!,
        url: origin,
      },
    ]);
    await inviteePage.goto(
      `${origin}${signInURL.searchParams.get("callbackUrl")}`,
    );
    await expect(
      inviteePage.getByRole("heading", { name: `Join ${remote.name}` }),
    ).toBeVisible({ timeout: 90000 });
    await inviteePage
      .getByRole("button", { name: "Accept invitation", exact: true })
      .click();
    await expect(
      inviteePage.getByText("Read-only project view", { exact: true }),
    ).toBeVisible();
    await expect(
      inviteePage.getByRole("button", {
        name: "Save shared project",
        exact: true,
      }),
    ).toHaveCount(0);
    await ownerPage.screenshot({
      path: ".verification/collaboration-owner-desktop.png",
    });
    await ownerPage.setViewportSize({ width: 1024, height: 768 });
    await ownerPage.screenshot({
      path: ".verification/collaboration-owner-compact.png",
    });
    assert.ok(
      await ownerPage.evaluate(
        () => document.documentElement.scrollWidth <= innerWidth,
      ),
    );
    await editorPage.goto(sharedURL);
    await expect(
      editorPage.getByRole("button", {
        name: "Save shared project",
        exact: true,
      }),
    ).toBeVisible();
    await editorPage
      .getByRole("button", { name: remote.name, exact: true })
      .click();
    const dialog = editorPage.getByRole("dialog", {
      name: "Levoks project workspace",
    });
    await dialog
      .getByLabel("Project name", { exact: true })
      .fill("Editor browser edit");
    await dialog
      .getByRole("button", { name: "Close workspace", exact: true })
      .click();
    await editorPage
      .getByRole("button", { name: "Save shared project", exact: true })
      .click();
    await expect(
      editorPage.getByText("Shared project saved.", { exact: true }),
    ).toBeVisible();
    assert.equal(
      (await store.get(owner, owner, project.id)).name,
      "Editor browser edit",
    );
    // The owner's open version is stale; failure preserves its local edits.
    await ownerPage
      .getByRole("button", { name: "Close sharing", exact: true })
      .click();
    await ownerPage
      .getByRole("button", { name: remote.name, exact: true })
      .click();
    const ownerDialog = ownerPage.getByRole("dialog", {
      name: "Levoks project workspace",
    });
    await ownerDialog
      .getByLabel("Project name", { exact: true })
      .fill("Owner draft to recover");
    await ownerDialog
      .getByRole("button", { name: "Close workspace", exact: true })
      .click();
    await ownerPage
      .getByRole("button", { name: "Save shared project", exact: true })
      .click();
    await expect(
      ownerPage.locator(".shared-workspace > [role=alert]"),
    ).toContainText("Cloud project changed");
    await ownerPage.reload();
    await expect(
      ownerPage.getByText(/Recovered your device draft/),
    ).toBeVisible();
    await expect(ownerPage.locator(".collaboration-state")).toContainText(
      "Owner draft to recover",
    );
    const download = ownerPage.waitForEvent("download");
    await ownerPage
      .getByRole("button", { name: "Back up draft & open latest", exact: true })
      .click();
    const savedDownload = await download;
    assert.match(savedDownload.suggestedFilename(), /Owner-draft-to-recover/);
    await expect(ownerPage.locator(".collaboration-state")).toContainText(
      "Editor browser edit",
    );
    await viewerPage.goto(sharedURL);
    await expect(
      viewerPage.getByText("Read-only project view", { exact: true }),
    ).toBeVisible();
    await expect(
      viewerPage.getByText("Alpha collaboration preview", { exact: true }),
    ).toBeVisible();
    await viewerPage
      .getByRole("button", { name: "About", exact: true })
      .click();
    await expect(
      viewerPage.getByText("Shared second page", { exact: true }),
    ).toBeVisible();
    assert.equal(
      (await store.get(owner, owner, project.id)).document.editor.activePageId,
      seed.editor.activePageId,
    );
    assert.ok(aboutPage);
    await viewerPage.getByRole("button", { name: "Home", exact: true }).click();
    await expect(
      viewerPage.getByRole("button", { name: "Undo", exact: true }),
    ).toHaveCount(0);
    await viewerPage.keyboard.press("Control+s");
    assert.equal(
      (await store.get(owner, owner, project.id)).name,
      "Editor browser edit",
    );
    await viewerPage.setViewportSize({ width: 390, height: 844 });
    await viewerPage.screenshot({
      path: ".verification/collaboration-viewer-mobile.png",
    });
    assert.ok(
      await viewerPage.evaluate(
        () => document.documentElement.scrollWidth <= innerWidth,
      ),
    );
    await viewerPage.setViewportSize({ width: 1600, height: 1000 });
    await viewerPage
      .getByRole("link", { name: "Projects", exact: true })
      .click();
    await viewerPage
      .getByRole("button", { name: "Cloud projects", exact: true })
      .click();
    const sharedCard = viewerPage
      .locator("article")
      .filter({
        has: viewerPage.getByRole("heading", {
          name: "Editor browser edit",
          exact: true,
        }),
      });
    await expect(
      sharedCard.getByText("Shared · Viewer", { exact: true }),
    ).toBeVisible();
    await sharedCard
      .getByRole("button", { name: "Open shared project", exact: true })
      .click();
    await expect(
      viewerPage.getByText("Read-only project view", { exact: true }),
    ).toBeVisible();
    await ownerPage
      .getByRole("button", { name: "Project sharing", exact: true })
      .click();
    const updatedPanel = ownerPage.getByRole("region", {
      name: "Project sharing",
    });
    await updatedPanel
      .getByLabel("Role for Alpha Editor")
      .selectOption("viewer");
    await expect(updatedPanel.getByRole("status")).toContainText(
      "Project access updated",
    );
    assert.equal((await store.get(editor, owner, project.id)).role, "viewer");
    assert.equal(
      (
        await request(
          editor,
          "/api/projects",
          {
            ownerId: editor,
            projectOwnerId: owner,
            revision: 3,
            project: remote.document,
          },
          "PUT",
        )
      ).status,
      403,
    );
    await editorPage.evaluate(() => window.dispatchEvent(new Event("focus")));
    await expect(
      editorPage.getByText("Read-only project view", { exact: true }),
    ).toBeVisible();
    await updatedPanel
      .getByRole("button", { name: "Remove Alpha Viewer", exact: true })
      .click();
    await expect(
      updatedPanel.getByRole("button", {
        name: "Remove Alpha Viewer",
        exact: true,
      }),
    ).toHaveCount(0);
    await viewerPage.evaluate(() => window.dispatchEvent(new Event("focus")));
    await expect(
      viewerPage.getByText(/Access was removed. Editing is disabled/),
    ).toBeVisible();
    assert.equal(
      (
        await request(
          viewer,
          `/api/projects?${new URLSearchParams({ ownerId: owner, id: project.id })}`,
        )
      ).status,
      404,
    );
    assert.equal((await store.list(viewer)).length, 0);
    const finalAccess = await store.access(owner, owner, project.id);
    await assert.rejects(
      store.removeProject(
        editor,
        owner,
        project.id,
        finalAccess.accessVersion,
        "Editor browser edit",
        finalAccess.revision,
      ),
      /Only the owner/,
    );
    await assert.rejects(
      store.removeProject(
        owner,
        owner,
        project.id,
        finalAccess.accessVersion,
        "Wrong name",
        finalAccess.revision,
      ),
      /confirm deletion/,
    );
    await assert.rejects(
      store.removeProject(
        owner,
        owner,
        project.id,
        finalAccess.accessVersion,
        "Editor browser edit",
        finalAccess.revision - 1,
      ),
      /changed/,
    );
    await updatedPanel
      .getByText("Delete cloud project", { exact: true })
      .click();
    await updatedPanel
      .getByLabel("Type Editor browser edit to confirm", { exact: true })
      .fill("Editor browser edit");
    await updatedPanel
      .getByRole("button", { name: "Delete shared cloud project", exact: true })
      .click();
    await expect(updatedPanel.getByRole("status")).toContainText(
      "Cloud project deleted",
    );
    await assert.rejects(store.get(editor, owner, project.id), /not found/);
    assert.equal(
      (await store.get(outsider, outsider, project.id)).name,
      "Independent",
    );
  },
);
