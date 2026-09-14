import test from "node:test";
import assert from "node:assert/strict";
import { completionEvents, proposalStream } from "../src/lib/server/ai-stream";
import { readProposalStream } from "../src/lib/ai-stream";
import { HttpError } from "../src/lib/server/http";

function response(text: string, chunkSize = 7) {
  const bytes = new TextEncoder().encode(text);
  let offset = 0;
  return new Response(
    new ReadableStream({
      pull(controller) {
        if (offset >= bytes.length) controller.close();
        else {
          controller.enqueue(bytes.slice(offset, offset + chunkSize));
          offset += chunkSize;
        }
      },
    }),
    { headers: { "Content-Type": "text/event-stream" } },
  );
}
const frame = (value: unknown) => "data: " + JSON.stringify(value) + "\r\n\r\n";

test("stream parser preserves fragmented UTF-8, multiline data, comments and final usage", async () => {
  const source =
    ': keepalive\r\n\r\ndata: {"choices":\r\ndata: [{"delta":{"content":"Olá 🌍"}}]}\r\n\r\n' +
    frame({ choices: [{ delta: {}, finish_reason: "stop" }] }) +
    frame({
      choices: [],
      usage: { prompt_tokens: 11, completion_tokens: 7, total_tokens: 18 },
    }) +
    "data: [DONE]\r\n\r\n";
  const deltas: string[] = [];
  const proposal = await readProposalStream(
    proposalStream(response(source, 1), new AbortController(), (value) => {
      assert.equal(value.choices?.[0].message?.content, "Olá 🌍");
      assert.equal(value.usage?.total_tokens, 18);
      return Response.json({ summary: "Validated", usage: value.usage });
    }),
    (event) => {
      if (event.type === "delta") deltas.push(event.text);
    },
  );
  assert.deepEqual(deltas, ["Olá 🌍"]);
  assert.equal(proposal.summary, "Validated");
});

test("partial, malformed, rejected and oversized streams never expose an accepted proposal", async () => {
  const delta = frame({ choices: [{ delta: { content: "partial" } }] });
  for (const source of [
    delta,
    delta + frame({ error: { message: "provider secret" } }),
    delta + "data: invalid\n\n",
    delta +
      frame({ choices: [{ finish_reason: "length" }] }) +
      "data: [DONE]\n\n",
  ]) {
    let validated = false;
    const result = proposalStream(
      response(source),
      new AbortController(),
      () => {
        validated = true;
        return Response.json({});
      },
    );
    await assert.rejects(
      readProposalStream(result, () => {}),
      /disconnect|stopped|malformed|incomplete/,
    );
    assert.equal(validated, false);
  }
  const result = proposalStream(
    response(
      delta +
        frame({ choices: [{ finish_reason: "stop" }] }) +
        "data: [DONE]\n\n",
    ),
    new AbortController(),
    () => {
      throw new HttpError(502, "Invalid project references");
    },
  );
  await assert.rejects(
    readProposalStream(result, () => {}),
    /Invalid project references/,
  );
  for (const input of [
    response("data: " + "x".repeat(1_000_001) + "\n\n", 2_000_000),
    response("data: " + "x".repeat(1_000_001), 2_000_000),
  ]) {
    await assert.rejects(async () => {
      for await (const event of completionEvents(input)) void event;
    }, /frame is too large/);
  }
});

test(
  "cancelling an output stream interrupts an upstream pending read without validation",
  { timeout: 3000 },
  async () => {
    let cancelled = false,
      validated = false;
    const upstream = new Response(
      new ReadableStream({
        cancel() {
          cancelled = true;
        },
      }),
      { headers: { "Content-Type": "text/event-stream" } },
    );
    const abort = new AbortController();
    const result = proposalStream(upstream, abort, () => {
      validated = true;
      return Response.json({});
    });
    const reader = result.body!.getReader();
    await reader.read(); // Initial status; the next pull waits on the provider.
    const pending = reader.read();
    await reader.cancel();
    await pending;
    assert.equal(abort.signal.aborted, true);
    assert.equal(cancelled, true);
    assert.equal(validated, false);
  },
);

test("client rejects disconnected, duplicate or late-error proposals", async () => {
  for (const data of [
    [{ type: "delta", text: "unfinished" }],
    [
      { type: "proposal", value: { summary: "first" } },
      { type: "proposal", value: { summary: "second" } },
    ],
    [
      { type: "proposal", value: { summary: "first" } },
      { type: "error", error: "Stream rejected" },
    ],
  ])
    await assert.rejects(
      readProposalStream(
        new Response(data.map((event) => JSON.stringify(event)).join("\n")),
        () => {},
      ),
    );
});
