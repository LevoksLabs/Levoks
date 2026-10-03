import { workspaceDatabase } from "./storage";

export type ProjectGroup = { id: string; name: string };
export type ProjectMeta = {
  id: string;
  groupId?: string;
  starred?: boolean;
  trashedAt?: string;
};

export const projectPath = (id: string) =>
  `/workplace/${encodeURIComponent(id)}`;

export async function readLibrary(): Promise<{
  groups: ProjectGroup[];
  metadata: ProjectMeta[];
}> {
  const db = await workspaceDatabase();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(["groups", "projectMeta"]);
    const groups = tx.objectStore("groups").getAll();
    const metadata = tx.objectStore("projectMeta").getAll();
    tx.oncomplete = () =>
      resolve({ groups: groups.result, metadata: metadata.result });
    tx.onabort = tx.onerror = () =>
      reject(tx.error || new Error("Could not load project groups."));
  });
}

export async function saveGroup(
  name: string,
  id = crypto.randomUUID(),
): Promise<string> {
  name = name.trim();
  if (!name || name.length > 80)
    throw new Error("Use a group name between 1 and 80 characters.");
  const db = await workspaceDatabase();
  return new Promise((resolve, reject) => {
    const tx = db.transaction("groups", "readwrite");
    tx.objectStore("groups").put({ id, name });
    tx.oncomplete = () => resolve(id);
    tx.onabort = tx.onerror = () =>
      reject(tx.error || new Error("Could not save the group."));
  });
}

/** Remove the group and ungroup its projects atomically; never delete their documents. */
export async function removeGroup(id: string): Promise<void> {
  const db = await workspaceDatabase();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(["groups", "projectMeta"], "readwrite");
    tx.objectStore("groups").delete(id);
    const store = tx.objectStore("projectMeta");
    const records = store.openCursor();
    records.onsuccess = () => {
      const cursor = records.result;
      if (!cursor) return;
      const meta = cursor.value as ProjectMeta;
      if (meta.groupId === id) {
        delete meta.groupId;
        cursor.update(meta);
      }
      cursor.continue();
    };
    tx.oncomplete = () => resolve();
    tx.onabort = tx.onerror = () =>
      reject(tx.error || new Error("Could not remove the group."));
  });
}

/** Read/merge inside a write transaction so actions in different tabs do not lose metadata. */
export async function updateProjectMeta(
  id: string,
  patch: Omit<Partial<ProjectMeta>, "id">,
): Promise<void> {
  const db = await workspaceDatabase();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(
      ["projects", "projectMeta", "groups"],
      "readwrite",
    );
    let failure: Error | undefined;
    const fail = (message: string) => {
      failure = new Error(message);
      tx.abort();
    };
    const project = tx.objectStore("projects").get(id);
    project.onsuccess = () => {
      if (!project.result) fail("This project is no longer on this device.");
    };
    if (patch.groupId) {
      const group = tx.objectStore("groups").get(patch.groupId);
      group.onsuccess = () => {
        if (!group.result)
          fail("This group was removed. Choose another group.");
      };
    }
    const store = tx.objectStore("projectMeta");
    const request = store.get(id);
    request.onsuccess = () => store.put({ ...request.result, ...patch, id });
    tx.oncomplete = () => resolve();
    tx.onabort = tx.onerror = () =>
      reject(failure || tx.error || new Error("Could not update the project."));
  });
}
