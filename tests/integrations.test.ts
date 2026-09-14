import test from "node:test";
import assert from "node:assert/strict";
import { commitProject } from "../src/lib/server/github";
import { readJSON } from "../src/lib/server/http";
import { POST as generate } from "../src/app/api/ai/route";
import { POST as deploy } from "../src/app/api/deploy/route";
import { emptyProject } from "../src/lib/project/workspace";

const request = (body: unknown) =>
  new Request("http://localhost:3000/api/test", {
    method: "POST",
    headers: {
      Origin: "http://localhost:3000",
      "Content-Type": "application/json",
    },
    body: JSON.stringify(body),
  });
test("API rejects cross-origin and oversized requests", async () => {
  await assert.rejects(
    readJSON(
      new Request("http://localhost/api/test", {
        method: "POST",
        headers: {
          Origin: "https://evil.test",
          "Content-Type": "application/json",
        },
        body: "{}",
      }),
    ),
    /same-origin/,
  );
  await assert.rejects(
    readJSON(request({ data: "too large" }), 5),
    /too large/,
  );
  assert.deepEqual(await readJSON(request({ ok: true })), { ok: true });
});

test("GitHub never writes if the branch head changed", async (t) => {
  let calls = 0;
  t.mock.method(globalThis, "fetch", async () => {
    calls++;
    return Response.json({ object: { sha: "b".repeat(40) } });
  });
  await assert.rejects(
    commitProject(
      { token: "test-token", owner: "owner", repo: "repo", branch: "main" },
      "project_1",
      { "README.md": "hello" },
      "a".repeat(40),
      "Save",
    ),
    /branch changed/,
  );
  assert.equal(calls, 1);
});

test("GitHub commits only managed files and uses a non-forced ref update", async (t) => {
  const calls: { url: string; init?: RequestInit }[] = [];
  const replies = [
    { object: { sha: "a".repeat(40) } },
    { tree: { sha: "tree0" } },
    {
      tree: [
        { path: "levoks/project_1/old.js", type: "blob" },
        { path: "unrelated.txt", type: "blob" },
      ],
    },
    { sha: "tree1" },
    {
      sha: "b".repeat(40),
      html_url: "https://github.com/owner/repo/commit/test",
    },
    {},
  ];
  t.mock.method(
    globalThis,
    "fetch",
    async (url: string | URL | Request, init?: RequestInit) => {
      calls.push({ url: String(url), init });
      return Response.json(replies.shift());
    },
  );
  await commitProject(
    {
      token: "test-token",
      owner: "owner",
      repo: "repo",
      branch: "feature/design",
    },
    "project_1",
    { "README.md": "hello" },
    "a".repeat(40),
    "Save",
  );
  const tree = JSON.parse(String(calls[3].init?.body)).tree;
  assert.ok(
    tree.every((entry: { path: string }) =>
      entry.path.startsWith("levoks/project_1/"),
    ),
  );
  assert.ok(
    tree.some(
      (entry: { path: string; sha?: string | null }) =>
        entry.path.endsWith("old.js") && entry.sha === null,
    ),
  );
  assert.equal(JSON.parse(String(calls[5].init?.body)).force, false);
});

test("AI proposals are schema-validated and do not mutate the project", async (t) => {
  const p = emptyProject();
  t.mock.method(globalThis, "fetch", async () =>
    Response.json({
      choices: [
        {
          message: {
            content: JSON.stringify({
              summary: "Invalid",
              project: { ...p, schemaVersion: 99 },
            }),
          },
        },
      ],
    }),
  );
  const response = await generate(
    request({
      project: p,
      mode: "design",
      provider: "huggingface",
      apiKey: "test-key-12345",
      model: "test/model",
      prompt: "Build a page",
    }),
  );
  assert.equal(response.status, 502);
  assert.match((await response.json()).error, /failed validation/);
  assert.equal(p.schemaVersion, 1);
});
test("AI input budgets reject oversized context before a paid provider request", async (t) => {
  const provider = t.mock.method(globalThis, "fetch", async () => {
    throw new Error("Provider must not be called");
  });
  const response = await generate(
    request({
      project: emptyProject(),
      mode: "patch",
      provider: "huggingface",
      apiKey: "test-key-12345",
      model: "test/model",
      prompt: "Edit",
      maxInputBytes: 1000,
      maxOutputTokens: 256,
    }),
  );
  assert.equal(response.status, 413);
  assert.equal(provider.mock.callCount(), 0);
});
test("AI incremental proposals return validated field changes and reject stale preconditions", async (t) => {
  const project = emptyProject("Before");
  let expected = "Before";
  t.mock.method(globalThis, "fetch", async () =>
    Response.json({
      choices: [
        {
          message: {
            content: JSON.stringify({
              summary: "Rename project",
              operations: [
                { op: "test", path: "/name", value: expected },
                { op: "replace", path: "/name", value: "After" },
              ],
            }),
          },
        },
      ],
    }),
  );
  const payload = {
    project,
    mode: "patch",
    provider: "huggingface",
    apiKey: "test-key-12345",
    model: "test/model",
    prompt: "Rename this project",
  };
  let response = await generate(request(payload));
  assert.equal(response.status, 200);
  const proposal = await response.json();
  assert.equal(proposal.project.name, "After");
  assert.equal(proposal.changes[0].path, "/name");
  assert.equal(project.name, "Before");
  expected = "Outdated";
  response = await generate(request(payload));
  assert.equal(response.status, 502);
  assert.match((await response.json()).error, /precondition/);
});

test("Vercel receives only frontend source and reports queued state", async (t) => {
  let payload: { files: { file: string }[] } | undefined;
  t.mock.method(
    globalThis,
    "fetch",
    async (_url: string | URL | Request, init?: RequestInit) => {
      payload = JSON.parse(String(init?.body));
      return Response.json({
        id: "deployment_1",
        url: "test.vercel.app",
        readyState: "QUEUED",
      });
    },
  );
  const response = await deploy(
    request({
      token: "test-token-123",
      action: "deploy",
      name: "test",
      files: {
        "frontend/package.json": "{}",
        "frontend/app/page.jsx": "export default function Page(){return null}",
        "backend/server.js": "private backend",
      },
    }),
  );
  assert.equal(response.status, 200);
  assert.equal((await response.json()).state, "QUEUED");
  assert.ok(payload?.files.every((file) => !file.file.includes("backend")));
});

test("AI visual proposals cannot attach executable source overrides", async (t) => {
  const p = emptyProject();
  t.mock.method(globalThis, "fetch", async () =>
    Response.json({
      choices: [
        {
          message: {
            content: JSON.stringify({
              summary: "Visual change",
              project: {
                ...p,
                source: {
                  basedOn: "anything",
                  files: { "frontend/package.json": "{}" },
                },
              },
            }),
          },
        },
      ],
    }),
  );
  const response = await generate(
    request({
      project: p,
      mode: "design",
      provider: "huggingface",
      apiKey: "test-key-12345",
      model: "test/model",
      prompt: "Build a page",
    }),
  );
  assert.equal(response.status, 200);
  assert.equal((await response.json()).project.source, undefined);
});
