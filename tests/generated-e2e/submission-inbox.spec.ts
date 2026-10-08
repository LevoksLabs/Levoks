import { test, expect } from "@playwright/test";
import { createServer } from "node:http";
import { spawn, type ChildProcess } from "node:child_process";
import { randomBytes } from "node:crypto";
import { readFile } from "node:fs/promises";
import { MongoMemoryServer } from "mongodb-memory-server";
import { MongoClient, ObjectId } from "mongodb";
import path from "node:path";

const root = path.resolve(".verification/inbox-app"),
  children: ChildProcess[] = [];
const password = "Local operator password 123!",
  setupCode = randomBytes(32).toString("hex"),
  jwtSecret = randomBytes(32).toString("hex");
let database: MongoMemoryServer,
  client: MongoClient,
  origin: string,
  resourceOrigin: string,
  identityOrigin: string,
  identity: ChildProcess,
  inboxPath: string;
let logs = "";
async function freePort() {
  const server = createServer();
  await new Promise<void>((r) => server.listen(0, "127.0.0.1", r));
  const port = (server.address() as { port: number }).port;
  await new Promise<void>((r) => server.close(() => r()));
  return port;
}
function launch(
  file: string,
  env: Record<string, string>,
  cwd = root,
  args: string[] = [],
) {
  const child = spawn(process.execPath, [file, ...args], {
    cwd,
    env: { ...process.env, ...env },
    stdio: ["ignore", "pipe", "pipe"],
    windowsHide: true,
  });
  children.push(child);
  for (const stream of [child.stdout!, child.stderr!])
    stream.on("data", (chunk) => {
      logs = (logs + chunk).slice(-50000);
    });
  return child;
}
async function stop(child: ChildProcess) {
  if (child.exitCode !== null || child.signalCode !== null) return;
  const done = new Promise<void>((r) => child.once("exit", () => r()));
  child.kill();
  await done;
}
async function ready(url: string) {
  await expect
    .poll(
      async () => {
        try {
          const res = await fetch(url);
          await res.body?.cancel();
          return res.status;
        } catch {
          return 0;
        }
      },
      { timeout: 30000 },
    )
    .toBe(200);
}
const identityEnv = (url: string, dbName: string, token = setupCode) => ({
  PORT: new URL(url).port,
  NODE_ENV: "test",
  MONGO_URI: database.getUri(dbName),
  CORS_ORIGINS: origin,
  JWT_SECRET: jwtSecret,
  OPERATOR_SETUP_TOKEN: token,
});
const identityFile = () =>
  path.join(root, "backend/website-leads-operators/server.js");
const post = (url: string, body: unknown, requestOrigin = origin) =>
  fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json", Origin: requestOrigin },
    body: JSON.stringify(body),
  });
test.beforeAll(async () => {
  database = await MongoMemoryServer.create({
    binary: { downloadDir: path.resolve(".verification/mongodb-bin") },
    instance: { ip: "127.0.0.1" },
  });
  client = await MongoClient.connect(database.getUri());
  origin = `http://127.0.0.1:${await freePort()}`;
  resourceOrigin = `http://127.0.0.1:${await freePort()}`;
  identityOrigin = `http://127.0.0.1:${await freePort()}`;
  identity = launch(
    identityFile(),
    identityEnv(identityOrigin, "inbox_accounts"),
  );
  await ready(identityOrigin + "/health");
  launch(path.join(root, "backend/website-leads/server.js"), {
    PORT: new URL(resourceOrigin).port,
    NODE_ENV: "test",
    MONGO_URI: database.getUri("inbox_records"),
    CORS_ORIGINS: origin,
    JWT_SECRET: jwtSecret,
    AUTH_IDENTITY_ORIGIN: identityOrigin,
  });
  await ready(resourceOrigin + "/health");
  launch(
    path.join(root, "frontend/node_modules/next/dist/bin/next"),
    {
      NODE_ENV: "production",
      NEXT_TELEMETRY_DISABLED: "1",
      APP_ORIGIN: origin,
      API_ORIGIN_3001: resourceOrigin,
      API_ORIGIN_3002: identityOrigin,
    },
    path.join(root, "frontend"),
    ["start", "--hostname", "127.0.0.1", "--port", new URL(origin).port],
  );
  await ready(origin);
  const project = JSON.parse(
    await readFile(path.join(root, "levoks.project.json"), "utf8"),
  );
  const endpoint = project.backend.services[0].blocks.find(
    (b: { config: { view?: string } }) => b.config.view === "submissionInbox",
  );
  inboxPath = `/__levoks/inbox/website-leads/${endpoint.id}`;
});
test.afterEach(async ({}, info) => {
  if (info.status !== info.expectedStatus)
    await info.attach("local-runtime-logs", {
      body: logs,
      contentType: "text/plain",
    });
});
test.afterAll(async () => {
  for (const child of children.slice().reverse()) await stop(child);
  if (client) await client.close();
  if (database) await database.stop();
});

test("setup fails closed and database uniqueness permits one first operator across concurrent processes and restart", async () => {
  const a = `http://127.0.0.1:${await freePort()}`,
    b = `http://127.0.0.1:${await freePort()}`;
  let server = launch(identityFile(), identityEnv(a, "inbox_race", ""));
  await ready(a + "/health");
  const data = {
    email: "race@example.test",
    name: "Race operator",
    password,
    setupCode,
  };
  expect((await post(a + "/api/auth/operator-setup", data)).status).toBe(503);
  await stop(server);
  server = launch(identityFile(), identityEnv(a, "inbox_race"));
  await ready(a + "/health");
  const replica = launch(identityFile(), identityEnv(b, "inbox_race"));
  await ready(b + "/health");
  expect(
    (
      await post(a + "/api/auth/operator-setup", {
        ...data,
        setupCode: "wrong",
      })
    ).status,
  ).toBe(403);
  expect(
    (
      await post(
        a + "/api/auth/operator-setup",
        data,
        "https://untrusted.example",
      )
    ).status,
  ).toBe(403);
  expect((await post(a + "/api/auth/operator-setup", data, "")).status).toBe(
    403,
  );
  expect(
    (await post(a + "/api/auth/operator-setup", { ...data, password: "short" }))
      .status,
  ).toBe(400);
  const results = await Promise.all(
    Array.from({ length: 8 }, (_, i) =>
      post((i % 2 ? a : b) + "/api/auth/operator-setup", {
        ...data,
        email: `race${i}@example.test`,
      }),
    ),
  );
  expect(results.filter((r) => r.status === 201)).toHaveLength(1);
  expect(results.filter((r) => r.status === 409)).toHaveLength(7);
  const account = await client
    .db("inbox_race")
    .collection("users")
    .findOne({ operatorBootstrap: "initial" });
  expect(account?.role).toBe("operator");
  expect(account?.password).not.toBe(password);
  for (const result of results)
    expect(JSON.stringify(await result.json())).not.toMatch(
      /operatorBootstrap|setupCode|password|token/,
    );
  expect(
    await client.db("inbox_race").collection("users").countDocuments(),
  ).toBe(1);
  await stop(server);
  server = launch(identityFile(), identityEnv(a, "inbox_race"));
  await ready(a + "/health");
  expect((await post(a + "/api/auth/operator-setup", data)).status).toBe(409);
  await stop(server);
  await stop(replica);
  expect(logs).not.toContain(setupCode);
  expect(logs).not.toContain(password);
});

test("downloaded operator UI protects durable submissions, paginates, clears errors, survives restart and revokes access", async ({
  page,
}) => {
  const errors: string[] = [];
  page.on("pageerror", (e) => errors.push(e.message));
  const inboxApi = `${origin}/__levoks/api/3001/api/submissions/inbox`,
    accountPath = "/__levoks/account/website-leads-operators";
  const records = client.db("inbox_records").collection("submissions"),
    users = client.db("inbox_accounts").collection("users");
  // Public visitors can still save without creating accounts.
  await page.goto(origin);
  await page
    .getByPlaceholder("Your name", { exact: true })
    .fill("Public visitor");
  await page
    .getByPlaceholder("Your email", { exact: true })
    .fill("visitor@example.test");
  const saved = page.waitForResponse((r) =>
    r.url().endsWith("/api/submissions"),
  );
  await page.getByRole("button", { name: "Submit", exact: true }).click();
  expect((await saved).status()).toBe(201);
  expect(await records.countDocuments()).toBe(1);
  const anonymous = await fetch(inboxApi);
  expect(anonymous.status).toBe(401);
  expect(await anonymous.text()).not.toContain("visitor@example.test");
  expect(anonymous.headers.get("cache-control")).toContain("no-store");
  await page.goto(origin + inboxPath);
  await expect(page.locator("main").getByRole("alert")).toContainText(
    "Sign in",
  );
  await page
    .getByRole("link", { name: "Sign in or set up operator", exact: true })
    .click();
  await page
    .getByRole("button", { name: "Set up first operator", exact: true })
    .click();
  await page
    .getByLabel("Email address", { exact: true })
    .fill("operator@example.test");
  await page.getByLabel("Name", { exact: true }).fill("Local operator");
  await page.getByLabel("Password", { exact: true }).fill(password);
  await page.getByLabel("Setup code", { exact: true }).fill("wrong");
  await page
    .getByRole("button", { name: "Create first operator", exact: true })
    .click();
  await expect(page.locator("main").getByRole("alert")).toContainText(
    "Invalid setup code",
  );
  await expect(page.getByLabel("Password", { exact: true })).toHaveValue(
    password,
  );
  await page.getByLabel("Setup code", { exact: true }).fill(setupCode);
  await page
    .getByRole("button", { name: "Create first operator", exact: true })
    .click();
  await expect(page.getByRole("status")).toContainText(
    "Operator account created",
  );
  await expect(page.getByLabel("Password", { exact: true })).toHaveValue("");
  await page.getByLabel("Password", { exact: true }).fill(password);
  await page
    .getByRole("button", { name: "Sign in to account", exact: true })
    .click();
  await expect(
    page.getByRole("heading", { name: "Welcome, Local operator" }),
  ).toBeVisible();
  const cookies = await page.context().cookies();
  expect(
    cookies
      .filter((c) => c.name.startsWith("levoks_"))
      .every((c) => c.httpOnly),
  ).toBe(true);
  const cookie = cookies.map((c) => `${c.name}=${c.value}`).join("; ");
  expect(cookie).toContain("levoks_session_3002=");
  const direct = await fetch(resourceOrigin + "/api/submissions/inbox", {
    headers: { Cookie: cookie },
  });
  expect(direct.status).toBe(200);
  expect(direct.headers.get("cache-control")).toContain("no-store");
  await page
    .getByRole("link", { name: "Website leads submissions", exact: true })
    .click();
  await expect(
    page.getByRole("cell", { name: "visitor@example.test", exact: true }),
  ).toBeVisible();
  await page.screenshot({ path: ".verification/inbox/runtime-desktop.png" });
  // Seed a second page with database fixtures, retaining real public-form coverage above.
  await records.insertMany(
    Array.from({ length: 50 }, (_, i) => ({
      _id: new ObjectId(),
      name:
        i === 49 ? '<img src=x onerror="window.inboxXss=1">' : `Fixture ${i}`,
      email: `fixture${i}@example.test`,
      createdAt: new Date(),
      updatedAt: new Date(),
      deletedAt: null,
    })),
  );
  await page
    .getByRole("button", { name: "Refresh submissions", exact: true })
    .click();
  await expect(page.getByRole("row")).toHaveCount(51);
  expect(
    await page.evaluate(
      () => (window as unknown as { inboxXss?: number }).inboxXss,
    ),
  ).toBeUndefined();
  await page.getByRole("button", { name: "Next page", exact: true }).click();
  await expect(
    page.getByRole("cell", { name: "visitor@example.test", exact: true }),
  ).toBeVisible();
  await expect(
    page.getByRole("button", { name: "Next page", exact: true }),
  ).toBeDisabled();
  await records.updateOne(
    { email: "visitor@example.test" },
    { $set: { deletedAt: new Date() } },
  );
  await page
    .getByRole("button", { name: "Refresh submissions", exact: true })
    .click();
  await expect(page.getByRole("status")).toContainText(
    "No submissions on this page",
  );
  await expect(page.getByRole("row")).toHaveCount(0);
  await records.updateOne(
    { email: "visitor@example.test" },
    { $set: { deletedAt: null } },
  );
  await page
    .getByRole("button", { name: "Previous page", exact: true })
    .click();
  await expect(page.getByRole("row")).toHaveCount(51);
  await page.setViewportSize({ width: 390, height: 844 });
  await page.screenshot({ path: ".verification/inbox/runtime-mobile.png" });
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth,
    ),
  ).toBe(true);
  await page.route("**/api/submissions/inbox?*", (r) =>
    r.fulfill({
      status: 503,
      contentType: "application/json",
      body: '{"error":"Storage unavailable"}',
    }),
  );
  await page
    .getByRole("button", { name: "Refresh submissions", exact: true })
    .click();
  await expect(page.locator("main").getByRole("alert")).toContainText(
    "could not be loaded",
  );
  await expect(page.getByRole("row")).toHaveCount(0);
  await page.unroute("**/api/submissions/inbox?*");
  await page
    .getByRole("button", { name: "Retry loading", exact: true })
    .click();
  await expect(page.getByRole("row")).toHaveCount(51);
  for (const value of ["0", "1.5", "10001"])
    expect(
      (
        await fetch(inboxApi + "?page=" + value, {
          headers: { Cookie: cookie },
        })
      ).status,
    ).toBe(400);
  await users.updateOne(
    { email: "operator@example.test" },
    { $set: { role: "user" } },
  );
  await page
    .getByRole("button", { name: "Refresh submissions", exact: true })
    .click();
  await expect(page.locator("main").getByRole("alert")).toContainText(
    "does not have operator access",
  );
  await expect(page.getByRole("row")).toHaveCount(0);
  await users.updateOne(
    { email: "operator@example.test" },
    { $set: { role: "operator" } },
  );
  await page
    .getByRole("button", { name: "Retry loading", exact: true })
    .click();
  await expect(page.getByRole("row")).toHaveCount(51);
  await stop(identity);
  await page
    .getByRole("button", { name: "Refresh submissions", exact: true })
    .click();
  await expect(page.locator("main").getByRole("alert")).toContainText(
    "could not be loaded",
  );
  await expect(page.getByRole("row")).toHaveCount(0);
  identity = launch(
    identityFile(),
    identityEnv(identityOrigin, "inbox_accounts"),
  );
  await ready(identityOrigin + "/health");
  await page.reload();
  await expect(page.getByRole("row")).toHaveCount(51);
  expect(
    (
      await post(identityOrigin + "/api/auth/operator-setup", {
        email: "other@example.test",
        name: "Other",
        password,
        setupCode,
      })
    ).status,
  ).toBe(409);
  await page.getByRole("button", { name: "Sign out", exact: true }).click();
  await expect(page.locator("main").getByRole("alert")).toContainText(
    "Signed out",
  );
  await expect(page.getByRole("row")).toHaveCount(0);
  expect((await fetch(inboxApi, { headers: { Cookie: cookie } })).status).toBe(
    401,
  );
  const ordinary = await page.request.post(
    `${origin}/__levoks/api/3002/api/auth/register`,
    {
      headers: { Origin: origin },
      data: {
        email: "ordinary@example.test",
        name: "Ordinary",
        password,
        role: "operator",
        operatorBootstrap: "initial",
      },
    },
  );
  expect(ordinary.status()).toBe(201);
  const regular = await users.findOne({ email: "ordinary@example.test" });
  expect(regular?.role).toBe("user");
  expect(regular?.operatorBootstrap).toBeUndefined();
  await page.goto(origin + accountPath);
  await page
    .getByLabel("Email address", { exact: true })
    .fill("ordinary@example.test");
  await page.getByLabel("Password", { exact: true }).fill(password);
  await page
    .getByRole("button", { name: "Sign in to account", exact: true })
    .click();
  await expect(
    page.getByRole("heading", { name: "Welcome, Ordinary" }),
  ).toBeVisible();
  await page.goto(origin + inboxPath);
  await expect(page.locator("main").getByRole("alert")).toContainText(
    "does not have operator access",
  );
  const secondPublic = await post(
    `${origin}/__levoks/api/3001/api/submissions`,
    { name: "Still public", email: "still-public@example.test" },
  );
  expect(secondPublic.status).toBe(201);
  expect(await records.countDocuments()).toBe(52);
  expect(errors).toEqual([]);
  expect(logs).not.toContain(setupCode);
  expect(logs).not.toContain(password);
  const signIn = await post(identityOrigin + "/api/auth/login", {
    email: "operator@example.test",
    password,
  });
  expect(signIn.status).toBe(200);
  const disabledCookie = signIn.headers
    .getSetCookie()
    .map((c) => c.split(";")[0])
    .join("; ");
  await users.updateOne(
    { email: "operator@example.test" },
    { $set: { disabledAt: new Date() } },
  );
  expect(
    (await fetch(inboxApi, { headers: { Cookie: disabledCookie } })).status,
  ).toBe(401);
  expect(
    (
      await post(identityOrigin + "/api/auth/operator-setup", {
        email: "disabled-replacement@example.test",
        name: "Replacement",
        password,
        setupCode,
      })
    ).status,
  ).toBe(409);
  expect(
    (
      await fetch(inboxApi, {
        headers: { Authorization: "Bearer invalid-session" },
      })
    ).status,
  ).toBe(401);
});
