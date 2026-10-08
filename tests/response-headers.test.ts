import test from "node:test";
import assert from "node:assert/strict";
import { runInNewContext } from "node:vm";
import {
  responseHeaderProblems,
  type ResponseHeader,
} from "../src/lib/backend/response-headers";
import { PROGRAM_RUNTIME } from "../src/lib/codegen/program-runtime";
import { compileProject } from "../src/lib/project/compiler";
import { parseProject } from "../src/lib/project/schema";
import { mappedLoginFixture } from "./helpers/mapped-login-fixture";

test("response headers persist, reject reserved or unsafe metadata, and preserve login and endpoint contract checks", () => {
  const { project, endpointId } = mappedLoginFixture(true);
  assert.deepEqual(
    compileProject(parseProject(project)).diagnostics.filter(
      (d) => d.severity === "error",
    ),
    [],
  );
  const response = project.backend.services[0].blocks.find(
    (block) => block.type === "response",
  )!;
  if (response.type !== "response") throw new Error("Response");
  for (const name of [
    "Set-Cookie",
    "Cache-Control",
    "Content-Security-Policy",
    "Content-Type",
    "Location",
    "Vary",
    "X-Request-Id",
    "Clear-Site-Data",
    "X-Levoks-Session",
    "Access-Control-Allow-Origin",
    "X-App-Token",
  ])
    assert.ok(responseHeaderProblems([{ name, value: "unsafe" }]).length, name);
  assert.ok(
    responseHeaderProblems([
      { name: "X-App-Result", value: "ok" },
      { name: "x-app-result", value: "ok" },
    ]).some((message) => message.includes("repeated")),
  );
  for (const value of [
    null,
    "line\r\ninjection",
    "a".repeat(4097),
    "$request.body.password",
    "$result.",
  ])
    assert.ok(
      responseHeaderProblems([{ name: "X-App-Result", value }]).length,
      String(value).slice(0, 50),
    );
  assert.ok(
    responseHeaderProblems(
      Array.from({ length: 3 }, (_, i) => ({
        name: `X-App-${i}`,
        value: "a".repeat(3000),
      })),
    ).some((message) => message.includes("8 KB")),
  );
  response.config.headers = [
    { name: "X-App-Result", value: "$request.body.email" },
  ];
  assert.ok(
    compileProject(project).diagnostics.some((d) =>
      /earlier public outputs/.test(d.message),
    ),
  );
  response.config.headers = [{ name: "X-App-Result", value: "$result.email" }];
  response.config.status = 205;
  assert.ok(
    compileProject(project).diagnostics.some(
      (d) => d.nodeId === endpointId && /has no body/.test(d.message),
    ),
  );
});

test("generated response header values fail before identity side effects and bodyless statuses discard their value", async () => {
  const runtime: {
    createWorkflow?: (
      ...args: unknown[]
    ) => (
      id: string,
      request: unknown,
      response?: unknown,
    ) => Promise<{
      status: number;
      body: unknown;
      headers?: Record<string, string>;
    }>;
  } = {};
  runInNewContext(PROGRAM_RUNTIME, { exports: runtime });
  const headers: ResponseHeader[] = [
    { name: "X-App-Count", value: 7 },
    { name: "X-App-Enabled", value: false },
    { name: "X-App-Result", value: "$result.email" },
  ];
  const blocks = [
    {
      id: "entry",
      type: "rest_endpoint",
      config: { responseBody: [] },
      connections: ["lookup", "verify", "session", "respond"],
    },
    {
      id: "lookup",
      type: "credential_lookup",
      config: { email: "user@example.test", output: "account" },
      connections: [],
    },
    {
      id: "verify",
      type: "password_verify",
      config: { lookupId: "lookup", password: "valid" },
      connections: [],
    },
    {
      id: "session",
      type: "session_issue",
      config: { verificationId: "verify", output: "result" },
      connections: [],
    },
    {
      id: "respond",
      type: "response",
      config: { status: 200, value: "$result", headers },
      connections: [],
    },
  ];
  let issued = 0;
  const identity = {
    findAccount: async () => ({ email: "user@example.test" }),
    publicAccount: (account: unknown) => account,
    verifyPassword: async () => {},
    issueSession: async () => {
      issued++;
    },
  };
  const run = () =>
    runtime.createWorkflow!(
      { blocks },
      {},
      {},
      undefined,
      identity,
    )("entry", {}, {});
  assert.deepEqual(JSON.parse(JSON.stringify((await run()).headers)), {
    "x-app-count": "7",
    "x-app-enabled": "false",
    "x-app-result": "user@example.test",
  });
  assert.equal(issued, 1);
  for (const value of [
    "$result.missing",
    "$result",
    "bad\r\nheader",
    "a".repeat(4097),
    null,
  ]) {
    headers[2].value = value;
    await assert.rejects(run(), /Response header|response header/);
    assert.equal(issued, 1);
  }
  headers.splice(
    0,
    3,
    ...Array.from({ length: 3 }, (_, index) => ({
      name: `X-App-${index}`,
      value: "a".repeat(3000),
    })),
  );
  await assert.rejects(run(), /response header/);
  assert.equal(issued, 1);
  headers.splice(0, headers.length, { name: "X-App-Result", value: "ok" });
  for (const status of [204, 205, 304]) {
    blocks[4].config.status = status;
    const output = await run();
    assert.equal(output.body, null);
    assert.equal(output.status, status);
    assert.equal(output.headers!["x-app-result"], "ok");
  }
  assert.equal(issued, 3);
});
