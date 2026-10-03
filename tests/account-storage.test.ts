import test from "node:test";
import assert from "node:assert/strict";
import "fake-indexeddb/auto";
import { bindWorkspaceAccount, accountStorageKey } from "../src/lib/project/account-scope";
import { saveProject, listProjects, listCheckpoints } from "../src/lib/project/storage";
import { saveGroup, readLibrary, updateProjectMeta } from "../src/lib/project/library";
import { saveConversation, conversations } from "../src/lib/project/conversations";
import { emptyProject } from "../src/lib/project/workspace";

test("account storage isolates documents, checkpoints, groups, metadata and conversations from legacy guest data", async () => {
  const project = emptyProject("Guest private project");
  // Seed the legacy guest stores before any account is bound.
  for (const [name, stores] of [
    ["levoks-workspace", ["projects", "checkpoints", "groups", "projectMeta"]],
    ["levoks-conversations", ["messages"]],
  ] as const) {
    const db = await new Promise<IDBDatabase>((resolve, reject) => {
      const request = indexedDB.open(name, name === "levoks-workspace" ? 2 : 1);
      request.onupgradeneeded = () => {
        for (const store of stores) {
          const collection = request.result.createObjectStore(store, { keyPath: "id" });
          if (store === "checkpoints" || store === "messages") collection.createIndex("projectId", "projectId");
        }
      };
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error);
    });
    await new Promise<void>((resolve, reject) => {
      const tx = db.transaction([...stores], "readwrite");
      for (const store of stores) tx.objectStore(store).put({ id: project.id, projectId: project.id });
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error);
    });
    db.close();
  }
  assert.equal(bindWorkspaceAccount("google:alice"), true);
  assert.deepEqual(await listProjects(), []);
  assert.deepEqual(await listCheckpoints(project.id), []);
  assert.deepEqual(await readLibrary(), { groups: [], metadata: [] });
  assert.deepEqual(await conversations(project.id), []);
  await saveProject(project, 0, "Alice checkpoint");
  await saveGroup("Alice group");
  await updateProjectMeta(project.id, { starred: true });
  await saveConversation({ id: "message", projectId: project.id, createdAt: project.updatedAt, prompt: "Alice prompt", summary: "Saved", outcome: "applied", tokens: null });
  // A session change cannot redirect in-flight writes to another account.
  assert.equal(bindWorkspaceAccount("google:bob"), false);
  assert.equal(bindWorkspaceAccount(null), false);
  assert.match(accountStorageKey("levoks-active-project"), /google%3Aalice$/);
  assert.equal((await listProjects()).length, 1);
  assert.equal((await listCheckpoints(project.id)).length, 1);
  assert.equal((await readLibrary()).groups[0].name, "Alice group");
  assert.equal((await readLibrary()).metadata[0].starred, true);
  assert.equal((await conversations(project.id))[0].prompt, "Alice prompt");
});
