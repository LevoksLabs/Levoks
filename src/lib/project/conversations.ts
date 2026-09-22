export interface ConversationEntry { id: string; projectId: string; createdAt: string; prompt: string; summary: string; outcome: "review" | "applied" | "discarded"; tokens: number | null }
let pending: Promise<IDBDatabase> | undefined;
function database() {
  if (!pending) pending = new Promise((resolve, reject) => {
    const request = indexedDB.open("levoks-conversations", 1);
    request.onupgradeneeded = () => { request.result.createObjectStore("messages", { keyPath: "id" }).createIndex("projectId", "projectId"); };
    request.onerror = () => { pending = undefined; reject(request.error); };
    request.onblocked = () => { pending = undefined; reject(new Error("Close older Levoks tabs to open conversation storage.")); };
    request.onsuccess = () => { request.result.onversionchange = () => { request.result.close(); pending = undefined; }; resolve(request.result); };
  });
  return pending;
}
export async function conversations(projectId: string): Promise<ConversationEntry[]> {
  const db = await database();
  return new Promise((resolve, reject) => { const request = db.transaction("messages").objectStore("messages").index("projectId").getAll(projectId); request.onsuccess = () => resolve((request.result as ConversationEntry[]).sort((a, b) => a.createdAt.localeCompare(b.createdAt))); request.onerror = () => reject(request.error); });
}
export async function saveConversation(entry: ConversationEntry) {
  const db = await database();
  return new Promise<void>((resolve, reject) => {
    const tx = db.transaction("messages", "readwrite"), store = tx.objectStore("messages");
    store.put({ ...entry, prompt: entry.prompt.slice(0, 12000), summary: entry.summary.slice(0, 4000) });
    const request = store.index("projectId").getAll(entry.projectId);
    request.onsuccess = () => { const entries = (request.result as ConversationEntry[]).sort((a, b) => b.createdAt.localeCompare(a.createdAt)); entries.slice(50).forEach(item => store.delete(item.id)); };
    tx.oncomplete = () => resolve(); tx.onabort = tx.onerror = () => reject(tx.error || new Error("Conversation could not be saved on this device."));
  });
}
export async function clearConversations(projectId: string) {
  const db = await database();
  return new Promise<void>((resolve, reject) => { const tx = db.transaction("messages", "readwrite"), store = tx.objectStore("messages"), request = store.index("projectId").getAllKeys(projectId); request.onsuccess = () => request.result.forEach(id => store.delete(id)); tx.oncomplete = () => resolve(); tx.onabort = tx.onerror = () => reject(tx.error); });
}
