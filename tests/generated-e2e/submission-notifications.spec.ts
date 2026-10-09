import { test, expect } from "@playwright/test";
import { createServer, type Server } from "node:http";
import { spawn, type ChildProcess } from "node:child_process";
import { randomBytes } from "node:crypto";
import { readFile } from "node:fs/promises";
import { MongoMemoryServer } from "mongodb-memory-server";
import { MongoClient, type Collection, type Document } from "mongodb";
import path from "node:path";

const root = path.resolve(".verification/notifications-app"),
  children: ChildProcess[] = [],
  workers: ChildProcess[] = [];
const jwtSecret = randomBytes(32).toString("hex"),
  setupCode = randomBytes(32).toString("hex"),
  password = "Local operator password 123!";
let database: MongoMemoryServer,
  client: MongoClient,
  records: Collection<Document>,
  transport: Server;
let origin: string,
  resourceOrigin: string,
  identityOrigin: string,
  transportUrl: string,
  inboxPath: string;
let logs = "",
  providerStatus = 200,
  providerName = "",
  hold = false;
const requests: { key: string; body: Record<string, unknown> }[] = [],
  accepted = new Map<string, string>();
async function port() {
  const server = createServer();
  await new Promise<void>((r) => server.listen(0, "127.0.0.1", r));
  const p = (server.address() as { port: number }).port;
  await new Promise<void>((r) => server.close(() => r()));
  return p;
}
function launch(
  file: string,
  env: Record<string, string>,
  cwd = root,
  args: string[] = [],
  capture?: (text: string) => void,
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
      const text = String(chunk);
      logs = (logs + text).slice(-50000);
      capture?.(text);
    });
  return child;
}
async function stop(child: ChildProcess, abrupt = false) {
  if (child.exitCode !== null || child.signalCode !== null) return;
  const done = new Promise<void>((r) => child.once("exit", () => r()));
  child.kill(abrupt ? "SIGKILL" : "SIGTERM");
  await done;
}
async function ready(url: string) {
  await expect
    .poll(
      async () => {
        try {
          const r = await fetch(url);
          await r.body?.cancel();
          return r.status;
        } catch {
          return 0;
        }
      },
      { timeout: 30000 },
    )
    .toBe(200);
}
const post = (url: string, body: unknown) =>
  fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json", Origin: origin },
    body: JSON.stringify(body),
  });
function worker(overrides: Record<string, string> = {}) {
  const child = launch(
    path.join(root, "backend/website-leads/workers/submission-email.js"),
    {
      NODE_ENV: "test",
      MONGO_URI: database.getUri("notification_records"),
      SUBMISSION_EMAIL_FROM: "alerts@example.test",
      SUBMISSION_EMAIL_TO: "operator@example.test",
      SUBMISSION_PUBLIC_ORIGIN: origin,
      RESEND_API_KEY: "local-test-provider-key",
      SUBMISSION_EMAIL_TEST_ENDPOINT: transportUrl,
      ...overrides,
    },
    path.join(root, "backend/website-leads"),
  );
  workers.push(child);
  return child;
}
async function submit(name: string) {
  const response = await post(resourceOrigin + "/api/submissions", {
    name,
    email: "private-visitor@example.test",
  });
  expect(response.status).toBe(201);
  expect(JSON.stringify(await response.json())).not.toMatch(
    /_levoksSubmissionMail|private-visitor/,
  );
  const row = await records.findOne({ name });
  expect(row?._levoksSubmissionMail.status).toBe("queued");
  return row!;
}
async function status(id: Document["_id"], value: string) {
  await expect
    .poll(
      async () =>
        (await records.findOne({ _id: id }))?._levoksSubmissionMail.status,
    )
    .toBe(value);
}
test.beforeAll(async () => {
  database = await MongoMemoryServer.create({
    binary: { downloadDir: path.resolve(".verification/mongodb-bin") },
    instance: { ip: "127.0.0.1" },
  });
  client = await MongoClient.connect(database.getUri());
  records = client.db("notification_records").collection("submissions");
  origin = `http://127.0.0.1:${await port()}`;
  resourceOrigin = `http://127.0.0.1:${await port()}`;
  identityOrigin = `http://127.0.0.1:${await port()}`;
  transport = createServer(async (req, res) => {
    let body = "";
    for await (const chunk of req) body += chunk;
    const key = String(req.headers["idempotency-key"]);
    const payload = JSON.parse(body);
    requests.push({ key, body: payload });
    if (providerStatus === 200 || hold) {
      const previous = accepted.get(key);
      if (previous && previous !== body) {
        res.writeHead(409, { "Content-Type": "application/json" });
        res.end(JSON.stringify({ name: "invalid_idempotent_request" }));
        return;
      }
      accepted.set(key, body);
    }
    if (hold) return;
    res.writeHead(providerStatus, {
      "Content-Type": "application/json",
      "Retry-After": "60",
    });
    res.end(
      JSON.stringify(
        providerStatus === 200
          ? { id: "local-" + key }
          : { name: providerName },
      ),
    );
  });
  await new Promise<void>((r) => transport.listen(0, "127.0.0.1", r));
  transportUrl = `http://127.0.0.1:${(transport.address() as { port: number }).port}/emails`;
  launch(path.join(root, "backend/website-leads-operators/server.js"), {
    PORT: new URL(identityOrigin).port,
    NODE_ENV: "test",
    MONGO_URI: database.getUri("notification_accounts"),
    CORS_ORIGINS: origin,
    JWT_SECRET: jwtSecret,
    OPERATOR_SETUP_TOKEN: setupCode,
  });
  await ready(identityOrigin + "/health");
  launch(path.join(root, "backend/website-leads/server.js"), {
    PORT: new URL(resourceOrigin).port,
    NODE_ENV: "test",
    MONGO_URI: database.getUri("notification_records"),
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
  for (const child of workers.splice(0)) await stop(child, true);
  hold = false;
  providerStatus = 200;
  providerName = "";
  if (info.status !== info.expectedStatus)
    await info.attach("local-runtime-logs", {
      body: logs,
      contentType: "text/plain",
    });
});
test.afterAll(async () => {
  for (const child of children.slice().reverse()) await stop(child, true);
  if (transport) {
    transport.closeAllConnections();
    await new Promise<void>((r) => transport.close(() => r()));
  }
  await client?.close();
  await database?.stop();
});

test("downloaded form saves with no worker, concurrent workers send once, and email leads to an authenticated inbox without job disclosure", async ({
  page,
}) => {
  expect(
    (await post(resourceOrigin + "/api/submissions", { name: "Invalid" }))
      .status,
  ).toBe(400);
  expect(await records.countDocuments()).toBe(0);
  await page.goto(origin);
  await page
    .getByPlaceholder("Your name", { exact: true })
    .fill("Private website visitor");
  await page
    .getByPlaceholder("Your email", { exact: true })
    .fill("visitor-secret@example.test");
  const saved = page.waitForResponse((r) =>
    r.url().endsWith("/api/submissions"),
  );
  await page.getByRole("button", { name: "Submit", exact: true }).click();
  expect((await saved).status()).toBe(201);
  const row = await records.findOne({ name: "Private website visitor" });
  expect(row?._levoksSubmissionMail.status).toBe("queued");
  expect(requests).toHaveLength(0);
  const bad = worker({ RESEND_API_KEY: "" });
  await expect.poll(() => bad.exitCode).toBe(1);
  expect(requests).toHaveLength(0);
  expect(
    (await records.findOne({ _id: row!._id }))?._levoksSubmissionMail.attempts,
  ).toBe(0);
  worker();
  worker();
  const more = await Promise.all(
    ["Concurrent A", "Concurrent B", "Concurrent C"].map(submit),
  );
  for (const record of [row!, ...more]) await status(record._id, "sent");
  expect(requests).toHaveLength(4);
  expect(accepted.size).toBe(4);
  const mail = requests.find(
    (r) => r.key === row!._levoksSubmissionMail.id,
  )!.body;
  expect(mail.subject).toBe("New website enquiry");
  expect(mail.text).toContain(origin + inboxPath);
  expect(JSON.stringify(mail)).not.toMatch(
    /Private website visitor|visitor-secret|private-visitor/,
  );
  expect((await fetch(resourceOrigin + "/api/submissions/inbox")).status).toBe(
    401,
  );
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
  await page.getByLabel("Setup code", { exact: true }).fill(setupCode);
  await page
    .getByRole("button", { name: "Create first operator", exact: true })
    .click();
  await expect(page.getByRole("status")).toContainText(
    "Operator account created",
  );
  await page.getByLabel("Password", { exact: true }).fill(password);
  await page
    .getByRole("button", { name: "Sign in to account", exact: true })
    .click();
  await expect(
    page.getByRole("heading", { name: "Welcome, Local operator" }),
  ).toBeVisible();
  await page.goto(origin + inboxPath);
  await expect(
    page.getByText("Private website visitor", { exact: true }),
  ).toBeVisible();
  expect(await page.locator("main").innerText()).not.toContain(
    "_levoksSubmissionMail",
  );
  const inbox = await page.request.get(
    origin + "/__levoks/api/3001/api/submissions/inbox",
  );
  expect(inbox.status()).toBe(200);
  expect(await inbox.text()).not.toMatch(
    /_levoksSubmissionMail|fingerprint|leaseUntil|dueAt/,
  );
  await page.screenshot({
    path: ".verification/notifications/runtime-inbox.png",
  });
  let report = "";
  const summary = launch(
    path.join(root, "backend/website-leads/scripts/notification-status.js"),
    { MONGO_URI: database.getUri("notification_records"), RESEND_API_KEY: "" },
    path.join(root, "backend/website-leads"),
    [],
    (text) => (report += text),
  );
  await expect.poll(() => summary.exitCode).toBe(0);
  expect(report).toContain('"sent":4');
  expect(report).not.toMatch(/visitor-secret|Private website|operator@example/);
  expect(logs).not.toMatch(
    /local-test-provider-key|visitor-secret|Private website visitor/,
  );
  expect(logs).not.toContain(setupCode);
});
test("durable retries preserve idempotency after outage and crash after provider acceptance", async () => {
  const row = await submit("Outage");
  providerStatus = 503;
  let child = worker();
  await expect
    .poll(
      async () =>
        (await records.findOne({ _id: row._id }))?._levoksSubmissionMail
          .attempts,
    )
    .toBe(1);
  await stop(child, true);
  const failed = await records.findOne({ _id: row._id });
  expect(failed?._levoksSubmissionMail.status).toBe("queued");
  expect(failed?._levoksSubmissionMail.dueAt.getTime()).toBeGreaterThan(
    Date.now() + 30000,
  );
  expect(failed?._levoksSubmissionMail.lease).toBeUndefined();
  providerStatus = 200;
  await records.updateOne(
    { _id: row._id },
    { $set: { "_levoksSubmissionMail.dueAt": new Date(0) } },
  );
  child = worker();
  await status(row._id, "sent");
  await stop(child, true);
  expect(
    requests.filter((r) => r.key === row._levoksSubmissionMail.id),
  ).toHaveLength(2);
  expect(
    (await records.findOne({ _id: row._id }))?._levoksSubmissionMail.attempts,
  ).toBe(2);
  const crash = await submit("Crash after acceptance");
  hold = true;
  child = worker();
  await expect
    .poll(
      () =>
        requests.filter((r) => r.key === crash._levoksSubmissionMail.id).length,
    )
    .toBe(1);
  await stop(child, true);
  const leased = await records.findOne({ _id: crash._id });
  expect(leased?._levoksSubmissionMail.status).toBe("queued");
  expect(leased?._levoksSubmissionMail.fingerprint).toMatch(/^[a-f0-9]{64}$/);
  expect(leased?._levoksSubmissionMail.leaseUntil).toBeInstanceOf(Date);
  hold = false;
  await records.updateOne(
    { _id: crash._id },
    { $set: { "_levoksSubmissionMail.leaseUntil": new Date(0) } },
  );
  worker();
  await status(crash._id, "sent");
  const replay = requests.filter(
    (r) => r.key === crash._levoksSubmissionMail.id,
  );
  expect(replay).toHaveLength(2);
  expect(replay[0].body).toEqual(replay[1].body);
  expect(
    [...accepted.keys()].filter((k) => k === crash._levoksSubmissionMail.id),
  ).toHaveLength(1);
});
test("provider rejection, retry bounds, expiry and changed configuration fail safely while the public API stays available", async () => {
  // Fixtures advance persisted due dates/leases; production delays remain unchanged.
  const config = await submit("Changed settings");
  providerStatus = 429;
  let child = worker();
  await expect
    .poll(
      async () =>
        (await records.findOne({ _id: config._id }))?._levoksSubmissionMail
          .attempts,
    )
    .toBe(1);
  await stop(child, true);
  await records.updateOne(
    { _id: config._id },
    { $set: { "_levoksSubmissionMail.dueAt": new Date(0) } },
  );
  child = worker({ SUBMISSION_EMAIL_TO: "replacement@example.test" });
  await status(config._id, "failed");
  await stop(child, true);
  expect(
    requests.filter((r) => r.key === config._levoksSubmissionMail.id),
  ).toHaveLength(1);
  expect(
    (await records.findOne({ _id: config._id }))?._levoksSubmissionMail.reason,
  ).toBe("configuration_changed");
  const rejected = await submit("Permanent rejection");
  providerStatus = 409;
  providerName = "invalid_idempotent_request";
  child = worker();
  await status(rejected._id, "failed");
  await stop(child, true);
  expect(
    (await records.findOne({ _id: rejected._id }))?._levoksSubmissionMail
      .attempts,
  ).toBe(1);
  const exhausted = await submit("Retry limit");
  await records.updateOne(
    { _id: exhausted._id },
    { $set: { "_levoksSubmissionMail.attempts": 4 } },
  );
  providerStatus = 503;
  child = worker();
  await status(exhausted._id, "failed");
  await stop(child, true);
  expect(
    (await records.findOne({ _id: exhausted._id }))?._levoksSubmissionMail
      .attempts,
  ).toBe(5);
  const expired = await submit("Expired queue");
  await records.updateOne(
    { _id: expired._id },
    { $set: { "_levoksSubmissionMail.expiresAt": new Date(0) } },
  );
  const prior = requests.length;
  child = worker();
  await status(expired._id, "expired");
  await stop(child, true);
  expect(requests).toHaveLength(prior);
  expect(await records.findOne({ _id: expired._id })).toBeTruthy();
  child = worker({ NODE_ENV: "production", SUBMISSION_PUBLIC_ORIGIN: origin });
  await expect.poll(() => child.exitCode).toBe(1);
  expect(requests).toHaveLength(prior);
  const deleted = await submit("Deleted before delivery");
  await records.updateOne(
    { _id: deleted._id },
    { $set: { deletedAt: new Date() } },
  );
  child = worker();
  await status(deleted._id, "cancelled");
  await stop(child, true);
  expect(requests).toHaveLength(prior);
  expect(await records.findOne({ _id: deleted._id })).toBeTruthy();
  for (const [code, name] of [
    [429, "rate_limit_exceeded"],
    [409, "concurrent_idempotent_requests"],
  ] as const) {
    const retried = await submit("Temporary " + code);
    providerStatus = code;
    providerName = name;
    child = worker();
    await expect
      .poll(
        async () =>
          (await records.findOne({ _id: retried._id }))?._levoksSubmissionMail
            .attempts,
      )
      .toBe(1);
    await stop(child, true);
    expect(
      (await records.findOne({ _id: retried._id }))?._levoksSubmissionMail
        .status,
    ).toBe("queued");
    await records.updateOne(
      { _id: retried._id },
      { $set: { "_levoksSubmissionMail.dueAt": new Date(0) } },
    );
    providerStatus = 200;
    child = worker();
    await status(retried._id, "sent");
    await stop(child, true);
    expect(
      requests.filter((r) => r.key === retried._levoksSubmissionMail.id),
    ).toHaveLength(2);
  }
  expect(logs).not.toMatch(
    /replacement@example|local-test-provider-key|private-visitor@example/,
  );
});
