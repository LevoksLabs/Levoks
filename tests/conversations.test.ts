import "fake-indexeddb/auto";
import test from "node:test";
import assert from "node:assert/strict";
import { conversations, saveConversation, clearConversations, type ConversationEntry } from "../src/lib/project/conversations";
test("conversation history is project-scoped, bounded and supports outcome updates and deletion", async () => {
  const entry = (id: string, projectId = "alpha"): ConversationEntry => ({ id, projectId, createdAt: new Date(1000 + Number(id)).toISOString(), prompt: "Improve spacing", summary: "Review spacing changes", outcome: "review", tokens: 100 });
  await Promise.all(Array.from({ length: 52 }, (_, index) => saveConversation(entry(String(index)))));
  await saveConversation(entry("99", "beta"));
  assert.equal((await conversations("alpha")).length, 50);
  await saveConversation({ ...entry("51"), outcome: "applied" });
  assert.equal((await conversations("alpha")).find(item => item.id === "51")?.outcome, "applied");
  await clearConversations("alpha");
  assert.equal((await conversations("alpha")).length, 0);
  assert.equal((await conversations("beta")).length, 1);
});
