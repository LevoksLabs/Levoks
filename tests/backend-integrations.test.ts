import test from "node:test";
import assert from "node:assert/strict";
import { runInNewContext } from "node:vm";
import { createServer } from "node:http";
import { PROGRAM_RUNTIME } from "../src/lib/codegen/program-runtime";
import { block } from "./helpers/program-fixture";
import type { BackendBlock } from "../src/types/backend";
import {
  emptyProject,
  restoreProject,
  captureProject,
} from "../src/lib/project/workspace";
import { useBackendStore } from "../src/store/backendStore";
import { compileProject } from "../src/lib/project/compiler";

function runtime(blocks: BackendBlock[], env = {}, models = {}) {
  const exports = {} as {
    createWorkflow: (
      program: unknown,
      models: unknown,
      database: unknown,
    ) => (
      id: string,
      req: unknown,
    ) => Promise<{ status: number; body: unknown }>;
  };
  runInNewContext(PROGRAM_RUNTIME, {
    exports,
    structuredClone,
    Date,
    Set,
    Buffer,
    URL,
    fetch,
    AbortSignal,
    process: { env },
  });
  return exports.createWorkflow({ blocks }, models, {});
}
test("HTTP workflow uses configured origin, typed query, secret env and bounded retries; upstream failures stay failures", async () => {
  let calls = 0,
    authorization = "",
    requestUrl = "";
  const server = createServer((req, res) => {
    calls++;
    authorization = req.headers.authorization || "";
    requestUrl = req.url || "";
    if (calls === 1) res.writeHead(503).end();
    else
      res
        .setHeader("Content-Type", "application/json")
        .end(JSON.stringify({ message: "hello", password: "private" }));
  });
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
  try {
    const blocks = [
      block("endpoint", "rest_endpoint", {}, ["http", "response"]),
      block("http", "http_request", {
        path: "/search",
        query: { term: "$request.query.term" },
        bearerTokenEnv: "PROVIDER_KEY",
        retries: 1,
      }),
      block("response", "response"),
    ];
    const execute = runtime(blocks, {
      UPSTREAM_ORIGIN: `http://127.0.0.1:${(server.address() as { port: number }).port}`,
      PROVIDER_KEY: "test-secret",
    });
    const response = await execute("endpoint", { query: { term: "a & b" } });
    assert.deepEqual(JSON.parse(JSON.stringify(response.body)), {
      message: "hello",
    });
    assert.equal(calls, 2);
    assert.equal(authorization, "Bearer test-secret");
    assert.equal(requestUrl, "/search?term=a+%26+b");
    const invalid = runtime(blocks, {
      UPSTREAM_ORIGIN: "https://example.test/path",
    });
    await assert.rejects(invalid("endpoint", {}), /valid upstream origin/);
  } finally {
    server.closeAllConnections();
    await new Promise<void>((resolve) => server.close(() => resolve()));
  }
});
test("cache scopes values by principal, supports invalidation and removes sensitive fields", async () => {
  const blocks = [
    block("write", "rest_endpoint", {}, ["set", "response"]),
    block("read", "rest_endpoint", {}, ["get", "response"]),
    block("remove", "rest_endpoint", {}, ["delete", "response"]),
    block("set", "cache", {
      operation: "set",
      key: "shared",
      value: "$request.body",
      output: "result",
    }),
    block("get", "cache", {
      operation: "get",
      key: "shared",
      output: "result",
    }),
    block("delete", "cache", {
      operation: "delete",
      key: "shared",
      output: "result",
    }),
    block("response", "response"),
  ];
  const execute = runtime(blocks),
    user = { sub: "user-a", tenantId: "tenant-a" };
  await execute("write", { user, body: { name: "Alice", password: "hidden" } });
  assert.deepEqual(
    JSON.parse(JSON.stringify((await execute("read", { user })).body)),
    { name: "Alice" },
  );
  assert.equal(
    (await execute("read", { user: { ...user, sub: "user-b" } })).body,
    null,
  );
  assert.equal(
    (await execute("read", { user: { ...user, tenantId: "tenant-b" } })).body,
    null,
  );
  await execute("remove", { user });
  assert.equal((await execute("read", { user })).body, null);
});
test("new templates remain normal editable structures and generated parameters enforce explicit types", () => {
  const initial = emptyProject();
  restoreProject(initial);
  useBackendStore.getState().loadIntegrationTemplate("integration");
  useBackendStore.getState().loadIntegrationTemplate("catalog");
  const project = captureProject(initial.id, initial.name),
    output = compileProject(project);
  assert.deepEqual(
    output.diagnostics.filter((d) => d.severity === "error"),
    [],
  );
  assert.ok(
    project.backend.services[0].blocks.some((b) => b.type === "http_request"),
  );
  assert.ok(project.backend.services[1].blocks.some((b) => b.type === "query"));
  assert.match(
    output.files["backend/integration-service/.env.example"],
    /UPSTREAM_ORIGIN=/,
  );
  const exports = {} as {
    validateParameters: (
      config: unknown,
    ) => (req: Record<string, unknown>, res: unknown, next: () => void) => void;
  };
  runInNewContext(
    output.files["backend/catalog-service/middleware/validate.js"],
    { exports },
  );
  const validate = exports.validateParameters({
    query: [{ name: "page", type: "number", required: true }],
    path: [{ name: "id", type: "string", required: true }],
  });
  let passed = false,
    errorStatus = 0;
  const res = {
    status: (status: number) => {
      errorStatus = status;
      return { json() {} };
    },
  };
  const req = {
    query: { page: "2", discarded: "anything" },
    params: { id: "slug" },
  };
  validate(req, res, () => {
    passed = true;
  });
  assert.equal(passed, true);
  assert.equal(req.query.page, 2);
  assert.equal(req.params.id, "slug");
  validate({ query: { page: "abc" }, params: { id: "slug" } }, res, () =>
    assert.fail("invalid input passed"),
  );
  assert.equal(errorStatus, 400);
});

test("pagination applies bounded offsets to scoped queries and rejects invalid pages", async () => {
  let offset = -1,
    limit = 0;
  const cursor = {
    sort: () => cursor,
    skip: (value: number) => {
      offset = value;
      return cursor;
    },
    limit: (value: number) => {
      limit = value;
      return cursor;
    },
    lean: async () => [{ title: "Result" }],
  };
  const execute = runtime(
    [
      block("endpoint", "rest_endpoint", {}, ["query", "response"]),
      block("model", "db_model", {
        tableName: "Item",
        fields: [{ name: "title", type: "string", required: true }],
      }),
      block("query", "query", {
        modelId: "model",
        page: "$request.query.page",
        limit: 10,
      }),
      block("response", "response"),
    ],
    {},
    { model: { find: () => cursor } },
  );
  await execute("endpoint", { query: { page: 3 } });
  assert.equal(offset, 20);
  assert.equal(limit, 10);
  await assert.rejects(
    execute("endpoint", { query: { page: 0 } }),
    /Page must/,
  );
  await assert.rejects(
    execute("endpoint", { query: { page: 10001 } }),
    /Page must/,
  );
});
