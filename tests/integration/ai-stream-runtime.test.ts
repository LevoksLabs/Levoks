import test from "node:test";
import assert from "node:assert/strict";
import { createServer } from "node:http";
import { once } from "node:events";
import { POST } from "../../src/app/api/ai/route";
import { emptyProject } from "../../src/lib/project/workspace";
import { readProposalStream } from "../../src/lib/ai-stream";

test(
  "AI route validates proposals over real fragmented HTTP streams and handles provider disconnects",
  { timeout: 15000 },
  async (t) => {
    const project = emptyProject("Before");
    let scenario = "success";
    const server = createServer(async (req, res) => {
      let body = "";
      for await (const chunk of req) body += chunk;
      const input = JSON.parse(body);
      assert.equal(input.stream, true);
      assert.equal(input.stream_options.include_usage, true);
      res.writeHead(200, { "Content-Type": "text/event-stream" });
      res.write(": processing\n\n");
      const content = JSON.stringify({
        summary: "Rename safely 🌍",
        operations: [
          {
            op: "test",
            path: "/name",
            value: scenario === "invalid" ? "stale" : "Before",
          },
          { op: "replace", path: "/name", value: "After" },
        ],
      });
      const payload = new TextEncoder().encode(
        "data: " +
          JSON.stringify({ choices: [{ delta: { content } }] }) +
          "\n\n",
      );
      // One byte per write crosses multibyte Unicode and SSE boundaries.
      for (const byte of payload) res.write(Buffer.from([byte]));
      if (scenario === "disconnect") {
        res.end();
        return;
      }
      res.write('data: {"choices":[{"delta":{},"finish_reason":"stop"}]}\n\n');
      res.write(
        'data: {"choices":[],"usage":{"prompt_tokens":20,"completion_tokens":30,"total_tokens":50}}\n\n',
      );
      res.end("data: [DONE]\n\n");
    });
    server.listen(0, "127.0.0.1");
    await once(server, "listening");
    t.after(() => {
      server.closeAllConnections();
      server.close();
    });
    const address = server.address();
    assert.ok(address && typeof address !== "string");
    const realFetch = globalThis.fetch;
    // Only provider transport is redirected to this real HTTP server; route, SSE,
    // parsing, IR validation and consumer run unchanged. No paid inference occurs.
    t.mock.method(
      globalThis,
      "fetch",
      (_url: string | URL | Request, init?: RequestInit) =>
        realFetch(`http://127.0.0.1:${address.port}`, init),
    );
    for (scenario of ["success", "invalid", "disconnect"]) {
      const result = await POST(
        new Request("http://localhost/api/ai", {
          method: "POST",
          headers: {
            Origin: "http://localhost",
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            project,
            provider: "openrouter",
            apiKey: "local-test-only",
            model: "test/model",
            prompt: "Rename",
            mode: "patch",
            stream: true,
          }),
        }),
      );
      assert.equal(result.status, 200);
      assert.match(result.headers.get("content-type")!, /ndjson/);
      if (scenario === "success") {
        const progress: string[] = [];
        const proposal = await readProposalStream(result, (event) => {
          if (event.type === "delta") progress.push(event.text);
        });
        assert.equal((proposal.project as { name: string }).name, "After");
        assert.deepEqual(proposal.usage, {
          inputTokens: 20,
          outputTokens: 30,
          totalTokens: 50,
        });
        assert.match(progress.join(""), /🌍/);
      } else
        await assert.rejects(
          readProposalStream(result, () => {}),
          scenario === "invalid" ? /precondition/ : /disconnected/,
        );
      assert.equal(project.name, "Before");
    }
  },
);
