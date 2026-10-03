import test from "node:test";
import assert from "node:assert/strict";
import "fake-indexeddb/auto";
import { emptyProject } from "../src/lib/project/workspace";
import {
  getProject,
  listCheckpoints,
  saveProject,
} from "../src/lib/project/storage";
import {
  readLibrary,
  removeGroup,
  saveGroup,
  updateProjectMeta,
} from "../src/lib/project/library";

test("groups, stars and trash preserve project documents and checkpoint history", async () => {
  const project = emptyProject("Preserved project");
  // Seed the shipped version-one schema before the library upgrades it.
  const legacy = emptyProject("Existing project before Home");
  await new Promise<void>((resolve, reject) => {
    const request = indexedDB.open("levoks-workspace", 1);
    request.onupgradeneeded = () => {
      request.result.createObjectStore("projects", { keyPath: "id" });
      request.result
        .createObjectStore("checkpoints", { keyPath: "id" })
        .createIndex("projectId", "projectId");
    };
    request.onerror = () => reject(request.error);
    request.onsuccess = () => {
      const tx = request.result.transaction("projects", "readwrite");
      tx.objectStore("projects").put({
        id: legacy.id,
        name: legacy.name,
        updatedAt: legacy.updatedAt,
        revision: 4,
        document: legacy,
      });
      tx.oncomplete = () => {
        request.result.close();
        resolve();
      };
    };
  });
  assert.equal((await getProject(legacy.id))?.revision, 4);
  const revision = await saveProject(project, 0, "Original");
  const groupId = await saveGroup("Client work");
  await Promise.all([
    updateProjectMeta(project.id, { groupId }),
    updateProjectMeta(project.id, { starred: true }),
  ]);
  assert.deepEqual(
    (await readLibrary()).metadata.find((item) => item.id === project.id),
    { id: project.id, groupId, starred: true },
  );
  await removeGroup(groupId);
  assert.equal(
    (await readLibrary()).metadata.find((item) => item.id === project.id)
      ?.groupId,
    undefined,
  );
  assert.equal((await getProject(project.id))?.revision, revision);
  await updateProjectMeta(project.id, { trashedAt: new Date().toISOString() });
  await assert.rejects(
    saveProject({ ...project, name: "Stale editor" }, revision),
    /Trash/,
  );
  assert.equal((await getProject(project.id))?.name, "Preserved project");
  assert.equal((await listCheckpoints(project.id)).length, 1);
  await updateProjectMeta(project.id, { trashedAt: undefined });
  assert.equal(
    await saveProject({ ...project, name: "Restored project" }, revision),
    2,
  );
  await assert.rejects(updateProjectMeta(project.id, { groupId }), /removed/);
  await assert.rejects(
    updateProjectMeta("missing", { starred: true }),
    /no longer/,
  );
});
