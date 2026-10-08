import test from "node:test";
import assert from "node:assert/strict";
import { createRequire } from "node:module";
import { mkdir, writeFile } from "node:fs/promises";
import { once } from "node:events";
import path from "node:path";
import { emptyProject } from "../../src/lib/project/workspace";
import { parseProject } from "../../src/lib/project/schema";
import { compileProject } from "../../src/lib/project/compiler";
import { gatewaySource, apiClientSource } from "../../src/lib/codegen/gateway";
import { block, programFixture } from "../helpers/program-fixture";

test("generated Express and gateway preserve response metadata and bodyless statuses, and reject bad resolved values", async () => {
  const project = emptyProject(),
    service = programFixture();
  service.blocks = [];
  for (const status of [200, 201, 204, 205, 304, 418])
    service.blocks.push(
      block(
        `endpoint_${status}`,
        "rest_endpoint",
        { route: `/response-${status}`, authRequired: false },
        [`respond_${status}`],
      ),
      block(`respond_${status}`, "response", {
        status,
        value: "body",
        headers: [
          { name: "X-App-Result", value: status },
          { name: "X-App-Enabled", value: false },
        ],
      }),
    );
  service.blocks.push(
    block(
      "dynamic",
      "rest_endpoint",
      {
        route: "/dynamic",
        queryParameters: [{ name: "value", type: "string", required: false }],
        authRequired: false,
      },
      ["dynamic_response"],
    ),
    block("dynamic_response", "response", {
      status: 200,
      value: "ok",
      headers: [{ name: "X-App-Result", value: "$request.query.value" }],
    }),
  );
  const output = compileProject(
    parseProject({
      ...project,
      backend: { ...project.backend, services: [service] },
    }),
  );
  assert.deepEqual(
    output.diagnostics.filter((d) => d.severity === "error"),
    [],
  );
  const root = path.resolve(".verification/runtime-test/response-headers");
  for (const [file, source] of Object.entries(output.files))
    if (file.startsWith("backend/workflow-service/")) {
      const destination = path.join(
        root,
        file.slice("backend/workflow-service/".length),
      );
      await mkdir(path.dirname(destination), { recursive: true });
      await writeFile(destination, source);
    }
  const require = createRequire(path.join(root, "entry.cjs")),
    express = require("express");
  const app = express(),
    observer = require("./observability");
  app.use(observer.context);
  app.use(express.json());
  app.use(require("./routes"));
  app.use(observer.error);
  const server = app.listen(0, "127.0.0.1");
  await once(server, "listening");
  const origin = `http://127.0.0.1:${(server.address() as { port: number }).port}`;
  const priorOrigin = process.env.API_ORIGIN_3001;
  process.env.API_ORIGIN_3001 = origin;
  try {
    const gateway = await import(
      "data:text/javascript;base64," +
        Buffer.from(gatewaySource([service])).toString("base64")
    );
    for (const status of [200, 201, 204, 205, 304, 418]) {
      const route = `response-${status}`;
      const direct = await fetch(`${origin}/${route}`);
      const proxied = (await gateway.GET(
        new Request(`https://frontend.test/__levoks/api/3001/${route}`),
        { params: Promise.resolve({ service: "3001", path: [route] }) },
      )) as Response;
      for (const response of [direct, proxied]) {
        assert.equal(response.status, status);
        assert.equal(response.headers.get("x-app-result"), String(status));
        assert.equal(response.headers.get("x-app-enabled"), "false");
        assert.equal(
          await response.text(),
          [204, 205, 304].includes(status) ? "" : '"body"',
        );
      }
      const head = (await gateway.HEAD(
        new Request(`https://frontend.test/__levoks/api/3001/${route}`, {
          method: "HEAD",
        }),
        { params: Promise.resolve({ service: "3001", path: [route] }) },
      )) as Response;
      assert.equal(head.status, status);
      assert.equal(await head.text(), "");
      assert.equal(head.headers.get("x-app-result"), String(status));
    }
    for (const value of [undefined, "bad\r\nheader", "a".repeat(4097)]) {
      const response = await fetch(
        origin +
          "/dynamic" +
          (value === undefined ? "" : "?value=" + encodeURIComponent(value)),
      );
      assert.equal(response.status, 500);
      assert.equal(response.headers.get("x-app-result"), null);
      assert.equal(
        (await response.json()).error.message,
        "The request could not be completed.",
      );
    }
    const request = await fetch(origin + "/dynamic?value=safe-value");
    assert.equal(request.status, 200);
    assert.equal(request.headers.get("x-app-result"), "safe-value");
    const client = await import(
      "data:text/javascript;base64," +
        Buffer.from(apiClientSource([service])).toString("base64")
    );
    const nativeFetch = globalThis.fetch;
    globalThis.fetch = async () => new Response(null, { status: 205 });
    try {
      assert.equal(await client.apiFetch("/response-205", {}, 3001), null);
    } finally {
      globalThis.fetch = nativeFetch;
    }
  } finally {
    if (priorOrigin === undefined) delete process.env.API_ORIGIN_3001;
    else process.env.API_ORIGIN_3001 = priorOrigin;
    server.close();
    await once(server, "close");
  }
});
