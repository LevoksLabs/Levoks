import { HttpError } from "./http";
export type ChatCompletion = {
  choices?: { message?: { content?: string }; finish_reason?: string | null }[];
  usage?: Record<string, unknown>;
};

/** Bounded SSE framing: handles split UTF-8, CRLF, comments and multiline data. */
export async function* completionEvents(
  response: Response,
  signal?: AbortSignal,
) {
  if (!response.headers.get("content-type")?.includes("text/event-stream"))
    throw new HttpError(
      502,
      "The provider did not return a supported stream. Disable streaming for this model.",
    );
  const reader = response.body?.getReader();
  if (!reader) throw new HttpError(502, "Provider returned an empty stream.");
  const decoder = new TextDecoder("utf-8", { fatal: true });
  let buffer = "",
    bytes = 0,
    done = false;
  const stop = () => {
    void reader.cancel().catch(() => {});
  };
  signal?.addEventListener("abort", stop, { once: true });
  try {
    while (!done) {
      signal?.throwIfAborted();
      const chunk = await reader.read();
      if (chunk.done) {
        buffer += decoder.decode();
        done = true;
      } else {
        bytes += chunk.value.length;
        if (bytes > 12_000_000)
          throw new HttpError(502, "Provider stream exceeds the size limit.");
        buffer += decoder.decode(chunk.value, { stream: true });
      }
      let match;
      while ((match = /\r?\n\r?\n/.exec(buffer))) {
        const frame = buffer.slice(0, match.index);
        buffer = buffer.slice(match.index + match[0].length);
        if (frame.length > 1_000_000)
          throw new HttpError(502, "Provider stream frame is too large.");
        const data = frame
          .split(/\r?\n/)
          .filter((line) => line.startsWith("data:"))
          .map((line) => line.slice(5).replace(/^ /, ""))
          .join("\n");
        if (!data) continue;
        if (data === "[DONE]") return;
        let event;
        try {
          event = JSON.parse(data);
        } catch {
          throw new HttpError(502, "Provider sent malformed stream data.");
        }
        if (!event || typeof event !== "object" || event.error)
          throw new HttpError(
            502,
            "The provider stopped generation with an error. No proposal was accepted.",
          );
        yield event as {
          choices?: {
            delta?: { content?: unknown };
            finish_reason?: string | null;
          }[];
          usage?: Record<string, unknown>;
        };
      }
      if (buffer.length > 1_000_000)
        throw new HttpError(502, "Provider stream frame is too large.");
    }
    throw new HttpError(
      502,
      "Provider disconnected before completing the stream.",
    );
  } finally {
    signal?.removeEventListener("abort", stop);
    try {
      await reader.cancel();
    } finally {
      reader.releaseLock();
    }
  }
}

export function proposalStream(
  response: Response,
  cancel: AbortController,
  validate: (value: ChatCompletion) => Response,
) {
  const encode = new TextEncoder();
  async function* generate() {
    let text = "",
      reason: string | null | undefined,
      usage: Record<string, unknown> | undefined;
    try {
      yield { type: "status", message: "Generating proposal…" };
      for await (const event of completionEvents(response, cancel.signal)) {
        const choice = event.choices?.[0],
          delta = choice?.delta?.content;
        if (event.usage) usage = event.usage;
        if (choice?.finish_reason) reason = choice.finish_reason;
        if (typeof delta === "string" && delta) {
          text += delta;
          if (text.length > 5_000_000)
            throw new HttpError(
              502,
              "Generated proposal exceeds the size limit.",
            );
          yield { type: "delta", text: delta };
        }
      }
      if (reason !== "stop" || !text)
        throw new HttpError(
          502,
          "The model returned an incomplete response. Reduce the change or increase the output limit.",
        );
      if (cancel.signal.aborted) return;
      yield { type: "status", message: "Validating proposal…" };
      const result = validate({
        choices: [{ message: { content: text }, finish_reason: reason }],
        usage,
      });
      yield { type: "proposal", value: await result.json() };
    } catch (error) {
      if (!cancel.signal.aborted)
        yield {
          type: "error",
          error:
            error instanceof HttpError
              ? error.message
              : "Generation failed. No changes were applied.",
        };
    } finally {
      cancel.abort();
      if (response.body && !response.body.locked) await response.body.cancel();
    }
  }
  const iterator = generate();
  return new Response(
    new ReadableStream({
      async pull(controller) {
        const item = await iterator.next();
        if (item.done) controller.close();
        else
          controller.enqueue(encode.encode(JSON.stringify(item.value) + "\n"));
      },
      async cancel() {
        cancel.abort();
        await iterator.return();
        if (response.body && !response.body.locked)
          await response.body.cancel();
      },
    }),
    {
      headers: {
        "Content-Type": "application/x-ndjson; charset=utf-8",
        "Cache-Control": "no-store, no-transform",
        "X-Accel-Buffering": "no",
        "X-Content-Type-Options": "nosniff",
      },
    },
  );
}
