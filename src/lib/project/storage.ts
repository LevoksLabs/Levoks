import { parseProject, redactProject, type ProjectDocument } from "./schema";
import { accountStorageKey } from "./account-scope";
import type { DurableHistory } from "@/store/projectHistory";

export interface SavedProject {
  id: string;
  name: string;
  updatedAt: string;
  revision: number;
  document: ProjectDocument;
  history?: DurableHistory;
}
export interface Checkpoint {
  id: string;
  projectId: string;
  createdAt: string;
  label: string;
  document: ProjectDocument;
}
let connection: Promise<IDBDatabase> | undefined;
export function workspaceDatabase() {
  if (!connection)
    connection = new Promise((resolve, reject) => {
      const request = indexedDB.open(accountStorageKey("levoks-workspace"), 2);
      request.onupgradeneeded = () => {
        const db = request.result;
        if (!db.objectStoreNames.contains("projects"))
          db.createObjectStore("projects", { keyPath: "id" });
        if (!db.objectStoreNames.contains("checkpoints")) {
          const history = db.createObjectStore("checkpoints", {
            keyPath: "id",
          });
          history.createIndex("projectId", "projectId");
        }
        if (!db.objectStoreNames.contains("groups"))
          db.createObjectStore("groups", { keyPath: "id" });
        if (!db.objectStoreNames.contains("projectMeta"))
          db.createObjectStore("projectMeta", { keyPath: "id" });
      };
      request.onerror = () => {
        connection = undefined;
        reject(request.error);
      };
      request.onblocked = () => {
        connection = undefined;
        reject(new Error("Close older Levoks tabs to upgrade storage."));
      };
      request.onsuccess = () => {
        request.result.onversionchange = () => {
          request.result.close();
          connection = undefined;
        };
        resolve(request.result);
      };
    });
  return connection;
}
function result<T>(request: IDBRequest<T>): Promise<T> {
  return new Promise((resolve, reject) => {
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}
export async function listProjects(): Promise<SavedProject[]> {
  const db = await workspaceDatabase();
  return (
    await result<SavedProject[]>(
      db.transaction("projects").objectStore("projects").getAll(),
    )
  ).sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
}
export async function getProject(
  id: string,
): Promise<SavedProject | undefined> {
  const db = await workspaceDatabase();
  return result(db.transaction("projects").objectStore("projects").get(id));
}
export async function listCheckpoints(
  projectId: string,
): Promise<Checkpoint[]> {
  const db = await workspaceDatabase();
  return (
    await result<Checkpoint[]>(
      db
        .transaction("checkpoints")
        .objectStore("checkpoints")
        .index("projectId")
        .getAll(projectId),
    )
  ).sort((a, b) => b.createdAt.localeCompare(a.createdAt));
}
/** Compare and save inside one transaction: another tab cannot silently overwrite this project. */
export async function saveProject(
  document: ProjectDocument,
  expectedRevision: number,
  label?: string,
  history?: DurableHistory,
): Promise<number> {
  const safe = redactProject(parseProject(document));
  const db = await workspaceDatabase();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(
      ["projects", "checkpoints", "projectMeta"],
      "readwrite",
    );
    let failure: Error | undefined;
    const metadata = tx.objectStore("projectMeta").get(safe.id);
    metadata.onsuccess = () => {
      if (metadata.result?.trashedAt) {
        failure = new Error(
          "This project is in Trash. Restore it from Home before editing.",
        );
        tx.abort();
      }
    };
    const store = tx.objectStore("projects");
    const request = store.get(safe.id);
    request.onsuccess = () => {
      const existing: SavedProject | undefined = request.result;
      if ((existing?.revision || 0) !== expectedRevision) {
        failure = new Error(
          "This project changed in another tab. Download a backup, then reopen the saved project.",
        );
        tx.abort();
        return;
      }
      store.put({
        id: safe.id,
        name: safe.name,
        updatedAt: safe.updatedAt,
        revision: expectedRevision + 1,
        document: safe,
        history,
      } satisfies SavedProject);
      if (label) {
        const history = tx.objectStore("checkpoints");
        history.put({
          id: crypto.randomUUID(),
          projectId: safe.id,
          createdAt: safe.updatedAt,
          label,
          document: safe,
        } satisfies Checkpoint);
        const old = history.index("projectId").getAll(safe.id);
        old.onsuccess = () => {
          const records = (old.result as Checkpoint[]).sort((a, b) =>
            b.createdAt.localeCompare(a.createdAt),
          );
          for (const record of records.slice(20)) history.delete(record.id);
        };
      }
    };
    tx.oncomplete = () => resolve(expectedRevision + 1);
    tx.onabort = tx.onerror = () =>
      reject(
        failure ||
          tx.error ||
          new Error("Could not save. Check browser storage availability."),
      );
  });
}
