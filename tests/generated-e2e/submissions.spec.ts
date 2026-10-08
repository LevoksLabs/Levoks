import { test, expect } from "@playwright/test";
import { createServer } from "node:http";
import { spawn, type ChildProcess } from "node:child_process";
import { MongoMemoryServer } from "mongodb-memory-server";
import { MongoClient } from "mongodb";
import path from "node:path";
const root = path.resolve(".verification/submissions-app");
const processes: ChildProcess[] = [];
let database: MongoMemoryServer,
  client: MongoClient,
  origin: string,
  backendOrigin: string,
  backend: ChildProcess;
let logs = "";
async function freePort() {
  const server = createServer();
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
  const port = (server.address() as { port: number }).port;
  await new Promise<void>((resolve) => server.close(() => resolve()));
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
  child.stdout!.on("data", (chunk) => {
    logs = (logs + chunk).slice(-15000);
  });
  child.stderr!.on("data", (chunk) => {
    logs = (logs + chunk).slice(-15000);
  });
  return child;
}
async function stop(child: ChildProcess) {
  if (child.exitCode !== null || child.signalCode !== null) return;
  const closed = new Promise<void>((resolve) =>
    child.once("exit", () => resolve()),
  );
  child.kill();
  await closed;
}
async function ready(url: string) {
  await expect
    .poll(
      async () => {
        try {
          const response = await fetch(url);
          await response.body?.cancel();
          return response.status;
        } catch {
          return 0;
        }
      },
      { timeout: 30000, message: "Generated runtime must become ready" },
    )
    .toBe(200);
}
const backendEnv = () => ({
  PORT: new URL(backendOrigin).port,
  NODE_ENV: "test",
  MONGO_URI: database.getUri("submissions_e2e"),
  CORS_ORIGINS: origin,
});
const launchBackend = () =>
  launch([path.join(root, "backend/website-leads/server.js")], backendEnv());
test.beforeAll(async () => {
  database = await MongoMemoryServer.create({
    binary: { downloadDir: path.resolve(".verification/mongodb-bin") },
    instance: { ip: "127.0.0.1" },
  });
  client = await MongoClient.connect(database.getUri("submissions_e2e"));
  origin = `http://127.0.0.1:${await freePort()}`;
  backendOrigin = `http://127.0.0.1:${await freePort()}`;
  backend = launchBackend();
  await ready(backendOrigin + "/health");
  launch(
    [
      path.join(root, "frontend/node_modules/next/dist/bin/next"),
      "start",
      "--hostname",
      "127.0.0.1",
      "--port",
      new URL(origin).port,
    ],
    {
      NODE_ENV: "production",
      NEXT_TELEMETRY_DISABLED: "1",
      API_ORIGIN_3001: backendOrigin,
    },
    path.join(root, "frontend"),
  );
  await ready(origin + "/");
});
test.afterEach(async ({}, info) => {
  if (info.status !== info.expectedStatus)
    await info.attach("generated-process-logs", {
      body: logs,
      contentType: "text/plain",
    });
});
test.afterAll(async () => {
  for (const child of processes.slice().reverse()) await stop(child);
  if (client) await client.close();
  if (database) await database.stop();
});

test("actual downloaded form saves durable private records, preserves failures, validates requests and limits abuse", async ({
  page,
}) => {
  const errors: string[] = [];
  page.on("pageerror", (error) => errors.push(error.message));
  const records = client.db("submissions_e2e").collection("submissions");
  await page.goto(origin);
  const name = page.getByPlaceholder("Your name", { exact: true }),
    email = page.getByPlaceholder("Your email", { exact: true }),
    submit = page.getByRole("button", { name: "Submit", exact: true });
  await submit.click();
  expect(await records.countDocuments()).toBe(0);
  await name.fill("Ada Visitor");
  await email.fill("ada@example.test");
  await page.route("**/__levoks/api/3001/api/submissions", (route) =>
    route.fulfill({
      status: 503,
      contentType: "application/json",
      body: JSON.stringify({ error: "Please try again" }),
    }),
  );
  await submit.click();
  await expect(page.getByRole("status")).toContainText("Please try again");
  await expect(name).toHaveValue("Ada Visitor");
  await expect(email).toHaveValue("ada@example.test");
  expect(await records.countDocuments()).toBe(0);
  await page.unroute("**/__levoks/api/3001/api/submissions");
  const saved = page.waitForResponse((response) =>
    response.url().endsWith("/api/submissions"),
  );
  await submit.click();
  const receipt = await saved;
  expect(receipt.status()).toBe(201);
  expect(await receipt.json()).toEqual({ message: "Submission received." });
  await expect(page.getByRole("status")).toContainText(
    "Thank you. Your enquiry has been saved.",
  );
  await expect(name).toHaveValue("");
  await expect(email).toHaveValue("");
  const record = await records.findOne({ email: "ada@example.test" });
  expect(record?.name).toBe("Ada Visitor");
  expect(record?.createdAt).toBeInstanceOf(Date);
  const url = origin + "/__levoks/api/3001/api/submissions";
  const post = async (body: unknown) =>
    fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json", Origin: origin },
      body: JSON.stringify(body),
    });
  for (const body of [
    { email: "ada@example.test" },
    { name: "Ada", email: "bad-email" },
    { name: 7, email: "ada@example.test" },
    { name: "x".repeat(2001), email: "ada@example.test" },
  ]) {
    const invalid = await post(body);
    expect(invalid.status, await invalid.text()).toBe(400);
  }
  expect(await records.countDocuments()).toBe(1);
  const extra = await post({
    name: "Grace Visitor",
    email: "grace@example.test",
    admin: true,
    createdAt: "2000-01-01",
    deletedAt: "2000-01-01",
  });
  expect(extra.status, await extra.text()).toBe(201);
  const grace = await records.findOne({ email: "grace@example.test" });
  expect(grace?.admin).toBeUndefined();
  expect(grace?.createdAt.getFullYear()).toBeGreaterThan(2000);
  expect(grace?.deletedAt).toBeFalsy();
  for (const method of ["GET", "PUT", "PATCH", "DELETE"]) {
    expect((await fetch(url, { method })).status).toBe(404);
    expect(
      (await fetch(backendOrigin + "/api/submissions", { method })).status,
    ).toBe(404);
  }
  // Invalid requests consume the same limiter, so do not hardcode the remaining allowance.
  let limited = false;
  for (let attempt = 0; attempt < 21; attempt++) {
    const response = await post({
      name: "Limit check",
      email: "limit@example.test",
    });
    if (response.status === 429) {
      limited = true;
      break;
    }
    expect(response.status, await response.text()).toBe(201);
  }
  expect(limited).toBe(true);
  const count = await records.countDocuments();
  await stop(backend);
  backend = launchBackend();
  await ready(backendOrigin + "/health");
  expect(await records.countDocuments()).toBe(count);
  const afterRestart = await post({
    name: "Restart check",
    email: "restart@example.test",
  });
  expect(afterRestart.status, await afterRestart.text()).toBe(201);
  await page.setViewportSize({ width: 390, height: 844 });
  await page.reload();
  await expect(submit).toBeVisible();
  expect(
    await page
      .locator("body")
      .evaluate((element) => element.scrollWidth <= window.innerWidth),
  ).toBe(true);
  await page.screenshot({
    path: ".verification/submissions/runtime-mobile.png",
  });
  expect(errors).toEqual([]);
});
