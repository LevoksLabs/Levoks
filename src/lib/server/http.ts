import { NextResponse } from "next/server";
import { z } from "zod";
import { MAX_PROJECT_BYTES } from "@/lib/project/schema";
import { createHash } from "node:crypto";
const requests = new Map<string, { count: number; expires: number }>();
export class HttpError extends Error {
  constructor(
    public status: number,
    message: string,
  ) {
    super(message);
  }
}
export async function readJSON(
  request: Request,
  maxBytes = MAX_PROJECT_BYTES,
): Promise<unknown> {
  const origin = request.headers.get("origin");
  if (!origin || origin !== new URL(request.url).origin)
    throw new HttpError(403, "A same-origin request is required.");
  if (!request.headers.get("content-type")?.includes("application/json"))
    throw new HttpError(415, "Expected application/json.");
  if (Number(request.headers.get("content-length")) > maxBytes)
    throw new HttpError(413, "Request is too large.");
  const reader = request.body?.getReader();
  if (!reader) throw new HttpError(400, "Request body is required.");
  const chunks: Uint8Array[] = [];
  let size = 0;
  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      size += value.length;
      if (size > maxBytes) {
        await reader.cancel();
        throw new HttpError(413, "Request is too large.");
      }
      chunks.push(value);
    }
  } finally {
    reader.releaseLock();
  }
  try {
    return JSON.parse(Buffer.concat(chunks).toString("utf8"));
  } catch {
    throw new HttpError(400, "Invalid JSON.");
  }
}
export function apiError(error: unknown) {
  if (error instanceof HttpError)
    return NextResponse.json(
      { error: error.message },
      { status: error.status },
    );
  if (error instanceof z.ZodError)
    return NextResponse.json(
      {
        error: error.issues
          .slice(0, 3)
          .map((i) => `${i.path.join(".")}: ${i.message}`)
          .join("; "),
      },
      { status: 400 },
    );
  return NextResponse.json(
    {
      error:
        "The operation could not be completed. Check the configuration and try again.",
    },
    { status: 500 },
  );
}
export async function providerJSON(
  url: string,
  token: string,
  init: RequestInit = {},
) {
  const key = createHash("sha256").update(token).digest("hex");
  const now = Date.now();
  for (const [id, entry] of requests)
    if (entry.expires < now) requests.delete(id);
  const quota = requests.get(key) || { count: 0, expires: now + 60_000 };
  if (quota.count >= 120 || (!requests.has(key) && requests.size >= 2000))
    throw new HttpError(
      429,
      "Too many integration requests. Try again in a minute.",
    );
  quota.count++;
  requests.set(key, quota);
  const response = await fetch(url, {
    ...init,
    redirect: "error",
    cache: "no-store",
    signal: init.signal || AbortSignal.timeout(60_000),
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${token}`,
      ...init.headers,
    },
  });
  if (!response.ok)
    throw new HttpError(
      response.status === 403 &&
        response.headers.get("x-ratelimit-remaining") === "0"
        ? 429
        : [401, 403, 404, 409, 422, 429].includes(response.status)
          ? response.status
          : 502,
      `Provider request failed (${response.status}). Check your credentials, permissions, and quota.`,
    );
  const reader = response.body?.getReader();
  if (!reader) throw new HttpError(502, "Provider returned an empty response.");
  const chunks: Uint8Array[] = [];
  let size = 0;
  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      size += value.length;
      if (size > 12_000_000) {
        await reader.cancel();
        throw new HttpError(502, "Provider response is too large.");
      }
      chunks.push(value);
    }
  } finally {
    reader.releaseLock();
  }
  const raw = Buffer.concat(chunks).toString("utf8");
  try {
    return JSON.parse(raw);
  } catch {
    throw new HttpError(502, "Provider returned an invalid response.");
  }
}
