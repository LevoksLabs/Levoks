export type GenerationProgress =
  { type: "status"; message: string } | { type: "delta"; text: string };
export async function readProposalStream(
  response: Response,
  progress: (event: GenerationProgress) => void,
) {
  const reader = response.body?.getReader();
  if (!reader) throw new Error("Generation returned no response.");
  const decoder = new TextDecoder("utf-8", { fatal: true });
  let buffer = "",
    bytes = 0,
    proposal: Record<string, unknown> | undefined;
  const consume = (line: string) => {
    if (!line.trim()) return;
    const event = JSON.parse(line);
    if (event.type === "error")
      throw new Error(
        typeof event.error === "string" ? event.error : "Generation failed.",
      );
    if (event.type === "delta" && typeof event.text === "string")
      progress({ type: "delta", text: event.text });
    else if (event.type === "status" && typeof event.message === "string")
      progress({ type: "status", message: event.message });
    else if (
      event.type === "proposal" &&
      event.value &&
      typeof event.value === "object" &&
      !proposal
    )
      proposal = event.value;
    else throw new Error("Unexpected generation stream event.");
  };
  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) {
        buffer += decoder.decode();
        if (buffer.trim()) consume(buffer);
        break;
      }
      bytes += value.length;
      if (bytes > 24_000_000)
        throw new Error("Generation response exceeds its size limit.");
      buffer += decoder.decode(value, { stream: true });
      let end;
      while ((end = buffer.indexOf("\n")) >= 0) {
        consume(buffer.slice(0, end));
        buffer = buffer.slice(end + 1);
      }
    }
    if (!proposal)
      throw new Error(
        "Generation ended before a validated proposal was received. No changes were applied.",
      );
    return proposal;
  } finally {
    try {
      await reader.cancel();
    } finally {
      reader.releaseLock();
    }
  }
}
