import { test, expect } from "@playwright/test";
import { createServer } from "node:http";
import { spawn, type ChildProcess } from "node:child_process";
import { randomBytes } from "node:crypto";
import { MongoMemoryServer } from "mongodb-memory-server";
import path from "node:path";
const root = path.resolve(".verification/account-e2e");
const processes: ChildProcess[] = [];
let database: MongoMemoryServer,
  origin: string,
  mailServer: ReturnType<typeof createServer>;
const messages: { text: string; subject: string }[] = [];
let logs = "";
async function freePort() {
  const s = createServer();
  await new Promise<void>((r) => s.listen(0, "127.0.0.1", r));
  const port = (s.address() as { port: number }).port;
  await new Promise<void>((r) => s.close(() => r()));
  return port;
}
function launch(args: string[], env: Record<string, string>, cwd = root) {
  const child = spawn(process.execPath, args, {
    cwd,
    env: { ...process.env, ...env },
    stdio: ["ignore", "pipe", "pipe"],
    windowsHide: true,
  });
  processes.push(child);
  child.stdout!.on("data", (v) => {
    logs = (logs + v).slice(-15000);
  });
  child.stderr!.on("data", (v) => {
    logs = (logs + v).slice(-15000);
  });
  return child;
}
async function finish(child: ChildProcess) {
  if (child.exitCode !== null || child.signalCode !== null) return child.exitCode;
  return new Promise<number | null>((resolve, reject) => {
    child.once("error", reject);
    child.once("exit", resolve);
  });
}
test.beforeAll(async () => {
  test.setTimeout(120000);
  const next = path.join(root, "frontend/node_modules/next/dist/bin/next");
  const build = launch([next, "build"], {NODE_ENV: "production", NEXT_TELEMETRY_DISABLED: "1"}, path.join(root, "frontend"));
  expect(await finish(build), logs).toBe(0);
  database = await MongoMemoryServer.create({
    binary: { downloadDir: path.resolve(".verification/mongodb-bin") },
    instance: { ip: "127.0.0.1" },
  });
  mailServer = createServer(async (req, res) => {
    let data = "";
    for await (const chunk of req) data += chunk;
    messages.push(JSON.parse(data));
    res
      .writeHead(200, { "Content-Type": "application/json" })
      .end(JSON.stringify({ id: "local-test-email" }));
  });
  await new Promise<void>((r) => mailServer.listen(0, "127.0.0.1", r));
  const frontendPort = await freePort(),
    backendPort = await freePort();
  origin = `http://127.0.0.1:${frontendPort}`;
  const env = {
    PORT: String(backendPort),
    NODE_ENV: "test",
    MONGO_URI: database.getUri("account_e2e"),
    JWT_SECRET: randomBytes(32).toString("hex"),
    CORS_ORIGINS: origin,
    IDENTITY_EMAIL_KEYS: JSON.stringify({
      test: randomBytes(32).toString("base64"),
    }),
    IDENTITY_EMAIL_ACTIVE_KEY: "test",
    IDENTITY_EMAIL_FROM: "Test <test@example.test>",
    IDENTITY_PUBLIC_URL: `${origin}/__levoks/account/auth-service`,
    RESEND_API_KEY: "fixture-mail-key",
    IDENTITY_EMAIL_TEST_ENDPOINT: `http://127.0.0.1:${(mailServer.address() as { port: number }).port}/emails`,
  };
  launch([path.join(root, "backend/auth-service/server.js")], env);
  launch(
    [path.join(root, "backend/auth-service/workers/identity-email.js")],
    env,
  );
  const frontendEnv = {
    NODE_ENV: "production",
    NEXT_TELEMETRY_DISABLED: "1",
    API_ORIGIN_3001: `http://127.0.0.1:${backendPort}`,
  };
  launch(
    [next, "start", "--hostname", "127.0.0.1", "--port", String(frontendPort)],
    frontendEnv,
    path.join(root, "frontend"),
  );
  await expect
    .poll(
      async () => {
        try {
          return (await fetch(origin + "/__levoks/account/auth-service"))
            .status;
        } catch {
          return 0;
        }
      },
      { timeout: 30000 },
    )
    .toBe(200);
});
test.afterAll(async () => {
  for (const child of processes.slice().reverse())
    if (child.exitCode === null) {
      child.kill();
      await finish(child);
    }
  if (mailServer) await new Promise<void>((r) => mailServer.close(() => r()));
  if (database) await database.stop();
});
const emailLink = (message: { text: string }) =>
  message.text.match(/https?:\/\/[^\s]+/)![0];
test("exported account UI verifies email, renews expired cookies, resets passwords and revokes sessions through the generated gateway", async ({
  page,
  context,
}) => {
  const browserErrors: string[] = [];
  page.on("pageerror", (e) => browserErrors.push(e.message));
  await page.goto(origin + "/__levoks/account/auth-service");
  await page
    .getByRole("button", { name: "Create account", exact: true })
    .click();
  await page
    .getByLabel("Email address", { exact: true })
    .fill("browser@example.test");
  await page.getByLabel("Name", { exact: true }).fill("Browser User");
  await page
    .getByLabel("Password", { exact: true })
    .fill("original-password-123");
  await page
    .getByRole("button", { name: "Register account", exact: true })
    .click();
  await expect(page.getByRole("status")).toContainText("Account created");
  await page
    .getByLabel("Password", { exact: true })
    .fill("original-password-123");
  await page
    .getByRole("button", { name: "Sign in to account", exact: true })
    .click();
  await expect(
    page.getByRole("region", { name: "Your account" }).getByRole("alert"),
  ).toContainText("Verify your email");
  await expect
    .poll(
      () => messages.filter((m) => m.subject === "Verify your email").length,
    )
    .toBe(1);
  await page.goto(
    emailLink(messages.find((m) => m.subject === "Verify your email")!),
  );
  await page.getByRole("button", { name: "Verify email", exact: true }).click();
  await expect(page.getByRole("status")).toContainText("Email verified");
  expect(new URL(page.url()).hash).toBe("");
  await page
    .getByLabel("Email address", { exact: true })
    .fill("browser@example.test");
  await page
    .getByLabel("Password", { exact: true })
    .fill("original-password-123");
  await page
    .getByRole("button", { name: "Sign in to account", exact: true })
    .click();
  await expect(
    page.getByRole("heading", { name: "Welcome, Browser User" }),
  ).toBeVisible();
  const before = (await context.cookies()).find(
    (c) => c.name === "levoks_refresh_3001",
  );
  expect(before?.httpOnly).toBe(true);
  await expect
    .poll(
      async () =>
        (await context.cookies()).some((c) => c.name === "levoks_session_3001"),
      { timeout: 10000 },
    )
    .toBe(false);
  await page
    .getByRole("button", { name: "Refresh sessions", exact: true })
    .click();
  await expect
    .poll(
      async () =>
        (await context.cookies()).find((c) => c.name === "levoks_refresh_3001")
          ?.value,
    )
    .not.toBe(before?.value);
  await expect(
    page.getByRole("button", { name: "Revoke session", exact: true }),
  ).toBeVisible();
  await page.setViewportSize({ width: 375, height: 812 });
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= window.innerWidth,
    ),
  ).toBe(true);
  await page.screenshot({
    path: path.resolve(".verification/generated-e2e-account-mobile.png"),
    fullPage: true,
  });
  await page
    .getByRole("button", { name: "Sign out all devices", exact: true })
    .click();
  await expect(page.getByRole("status")).toContainText(
    "All sessions signed out",
  );
  await page
    .getByRole("button", { name: "Forgot password", exact: true })
    .click();
  await page
    .getByLabel("Email address", { exact: true })
    .fill("browser@example.test");
  await page
    .getByRole("button", { name: "Send recovery instructions", exact: true })
    .click();
  await expect(page.getByRole("status")).toContainText("queued");
  await expect
    .poll(
      () => messages.filter((m) => m.subject === "Reset your password").length,
    )
    .toBe(1);
  await page.goto(
    emailLink(messages.find((m) => m.subject === "Reset your password")!),
  );
  await page
    .getByLabel("New password", { exact: true })
    .fill("new-password-456");
  await page
    .getByRole("button", { name: "Reset password", exact: true })
    .click();
  await expect(page.getByRole("status")).toContainText("Password reset");
  await page
    .getByLabel("Email address", { exact: true })
    .fill("browser@example.test");
  await page.getByLabel("Password", { exact: true }).fill("new-password-456");
  await page
    .getByRole("button", { name: "Sign in to account", exact: true })
    .click();
  await expect(
    page.getByRole("heading", { name: "Welcome, Browser User" }),
  ).toBeVisible();
  const blocked = await page.request.post(
    origin + "/__levoks/api/3001/api/auth/logout",
    { headers: { Origin: "https://attacker.test" } },
  );
  expect(blocked.status()).toBe(403);
  const unknown = await page.request.get(origin + "/__levoks/api/9999/private");
  expect(unknown.status()).toBe(404);
  const arbitrary = await page.request.get(
    origin + "/__levoks/api/3001/arbitrary-admin-path",
  );
  expect(arbitrary.status()).toBe(404);
  expect(browserErrors).toEqual([]);
});
