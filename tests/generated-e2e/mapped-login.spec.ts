import { test, expect } from "@playwright/test";
import { createServer } from "node:http";
import { spawn, type ChildProcess } from "node:child_process";
import { randomBytes } from "node:crypto";
import { MongoMemoryServer } from "mongodb-memory-server";
import path from "node:path";
const root = path.resolve(".verification/mapped-login-e2e");
const processes: ChildProcess[] = [];
let database: MongoMemoryServer, origin: string, backendOrigin: string;
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
  if (child.exitCode !== null || child.signalCode !== null)
    return child.exitCode;
  return new Promise<number | null>((resolve, reject) => {
    child.once("error", reject);
    child.once("exit", resolve);
  });
}
test.beforeAll(async () => {
  test.setTimeout(120000);
  const next = path.join(root, "frontend/node_modules/next/dist/bin/next");
  const build = launch(
    [next, "build"],
    { NODE_ENV: "production", NEXT_TELEMETRY_DISABLED: "1" },
    path.join(root, "frontend"),
  );
  expect(await finish(build), logs).toBe(0);
  database = await MongoMemoryServer.create({
    binary: { downloadDir: path.resolve(".verification/mongodb-bin") },
    instance: { ip: "127.0.0.1" },
  });
  const frontendPort = await freePort(),
    backendPort = await freePort();
  origin = `http://127.0.0.1:${frontendPort}`;
  backendOrigin = `http://127.0.0.1:${backendPort}`;
  const env = {
    PORT: String(backendPort),
    NODE_ENV: "test",
    MONGO_URI: database.getUri("account_e2e"),
    JWT_SECRET: randomBytes(32).toString("hex"),
    CORS_ORIGINS: origin,
  };
  launch([path.join(root, "backend/auth-service/server.js")], env);
  await expect
    .poll(
      async () => {
        try {
          const response = await fetch(
            `http://127.0.0.1:${backendPort}/health`,
          );
          await response.body?.cancel();
          return response.status;
        } catch {
          return 0;
        }
      },
      {
        timeout: 30000,
        message:
          "Generated backend must become ready before the browser workflow starts",
      },
    )
    .toBe(200);
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
          return (await fetch(origin + "/")).status;
        } catch {
          return 0;
        }
      },
      { timeout: 30000 },
    )
    .toBe(200);
  const created = await fetch(
    `http://127.0.0.1:${backendPort}/api/auth/register`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        email: "mapped@example.test",
        password: "password-123456",
        name: "Mapped User",
      }),
    },
  );
  expect(created.status, await created.text()).toBe(201);
});
test.afterEach(async ({}, info) => {
  if (info.status !== info.expectedStatus)
    await info.attach("generated-process-logs", {
      body: logs,
      contentType: "text/plain",
    });
});
test.afterAll(async () => {
  for (const child of processes.slice().reverse())
    if (child.exitCode === null) {
      child.kill();
      await finish(child);
    }
  if (database) await database.stop();
});

test("ZIP-exported canvas form maps identities, rejects invalid input and credentials, and navigates only after login", async ({
  page,
  context,
}) => {
  const errors: string[] = [],
    payloads: unknown[] = [];
  page.on("pageerror", (error) => errors.push(error.message));
  page.on("request", (request) => {
    if (request.url().includes("/api/auth/login"))
      payloads.push(request.postDataJSON());
  });
  await page.goto(origin);
  const preflight = await fetch(backendOrigin + "/api/auth/login", {method:"OPTIONS",headers:{Origin:origin,"Access-Control-Request-Method":"POST","Access-Control-Request-Headers":"content-type,x-app-version"}});
  expect(preflight.status).toBe(204);
  expect(preflight.headers.get("access-control-allow-origin")).toBe(origin);
  expect(preflight.headers.get("access-control-allow-credentials")).toBeNull();
  expect(preflight.headers.get("access-control-max-age")).toBe("300");
  expect((await fetch(backendOrigin + "/api/auth/login",{method:"OPTIONS",headers:{Origin:origin,"Access-Control-Request-Method":"DELETE"}})).status).toBe(403);
  const crossOrigin = await page.evaluate(async url => {
    const response = await fetch(url+"/api/auth/profile",{headers:{"X-App-Version":"7"}});
    let credentialsDenied=false;
    try {await fetch(url+"/api/auth/profile",{credentials:"include"});} catch {credentialsDenied=true;}
    return {status:response.status,privateHeader:response.headers.get("x-levoks-session"),credentialsDenied};
  },backendOrigin);
  expect(crossOrigin).toEqual({status:401,privateHeader:null,credentialsDenied:true});
  expect((await fetch(backendOrigin+"/api/auth/profile",{headers:{Origin:origin}})).headers.get("x-levoks-session")).toBe("invalid");
  const invalidHeaders: Record<string, string>[] = [{ origin }, { origin, "X-App-Version": "invalid" }];
  for (const headers of invalidHeaders) {
    const invalid = await page.request.post(origin + "/__levoks/api/3001/api/auth/login", { headers, data: {email: "mapped@example.test", password: "password-123456"} });
    expect(invalid.status()).toBe(400);
    expect((await context.cookies()).some(cookie => /levoks_session/.test(cookie.name))).toBe(false);
  }
  const mappedRequest = page.waitForRequest(request => request.url().includes("/api/auth/login"));
  await page.getByRole("button", { name: "Sign in", exact: true }).click();
  expect(payloads).toHaveLength(0);
  await page
    .getByPlaceholder("Email", { exact: true })
    .fill("mapped@example.test");
  await page
    .getByPlaceholder("Password", { exact: true })
    .fill("wrong-password");
  const rejected = page.waitForResponse((response) =>
    response.url().includes("/api/auth/login"),
  );
  await page.getByRole("button", { name: "Sign in", exact: true }).click();
  expect((await rejected).status()).toBe(401);
  expect((await mappedRequest).headers()["x-app-version"]).toBe("7");
  await expect(page.getByRole("status")).toContainText(
    "Invalid credentials",
  );
  expect(page.url()).toBe(origin + "/");
  expect(payloads).toEqual([
    { email: "mapped@example.test", password: "wrong-password" },
  ]);
  expect(
    (await context.cookies()).some((cookie) =>
      /levoks_session/.test(cookie.name),
    ),
  ).toBe(false);
  await page
    .getByPlaceholder("Password", { exact: true })
    .fill("password-123456");
  const successful = page.waitForResponse(response => response.url().includes("/api/auth/login") && response.status() === 200);
  await page.getByPlaceholder("Password", { exact: true }).press("Enter");
  await expect(page).toHaveURL(origin + "/dashboard");
  expect((await successful).headers()["x-app-result"]).toBe("mapped@example.test");
  expect((await successful).headers()["x-app-version"]).toBe("7");
  expect(payloads).toHaveLength(2);
  expect(payloads[1]).toEqual({
    email: "mapped@example.test",
    password: "password-123456",
  });
  expect(
    (await context.cookies()).some(
      (cookie) => cookie.httpOnly && /levoks_session/.test(cookie.name),
    ),
  ).toBe(true);
  expect(errors).toEqual([]);
  const metadata = await page.evaluate(async url => {
    const response = await fetch(url+"/api/auth/login", {method:"POST", credentials:"omit", headers:{"Content-Type":"application/json","X-App-Version":"7"}, body:JSON.stringify({email:"mapped@example.test",password:"password-123456"})});
    return {status:response.status,result:response.headers.get("x-app-result"),version:response.headers.get("x-app-version"),cookie:response.headers.get("set-cookie")};
  },backendOrigin);
  expect(metadata).toEqual({status:200,result:"mapped@example.test",version:null,cookie:null});
  await page.goto(origin);
  await page.route("**/__levoks/api/3001/api/auth/login", (route) =>
    route.fulfill({
      status: 503,
      contentType: "application/json",
      body: JSON.stringify({ error: "Service temporarily unavailable" }),
    }),
  );
  await page
    .getByPlaceholder("Email", { exact: true })
    .fill("mapped@example.test");
  await page
    .getByPlaceholder("Password", { exact: true })
    .fill("password-123456");
  await page.getByRole("button", { name: "Sign in", exact: true }).click();
  await expect(page.getByRole("status")).toContainText(
    "Service temporarily unavailable",
  );
  expect(page.url()).toBe(origin + "/");
});
