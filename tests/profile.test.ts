import test from "node:test";
import assert from "node:assert/strict";
import { authOptions } from "../src/lib/server/auth";

test("profile updates allow bounded names and cannot change identity or provider", async () => {
  const jwt = authOptions.callbacks!.jwt!;
  type Input = Parameters<typeof jwt>[0];
  const original = { id: "github:123", provider: "github", name: "Original" };
  const updated = await jwt({
    token: { ...original },
    trigger: "update",
    session: { name: " Studio ", id: "other-user", provider: "google" },
  } as Input);
  assert.equal(updated.name, "Studio");
  assert.equal(updated.id, original.id);
  assert.equal(updated.provider, original.provider);
  for (const name of [" ", "x".repeat(81), { nested: "bad" }]) {
    const unchanged = await jwt({
      token: { ...original },
      trigger: "update",
      session: { name },
    } as Input);
    assert.equal(unchanged.name, "Original");
  }
});
