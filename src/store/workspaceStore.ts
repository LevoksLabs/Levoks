import { projectHistory } from "./projectHistory";
import { accountStorageKey } from "@/lib/project/account-scope";
import { reconcileRouting } from "@/lib/project/links";
import { create } from "zustand";
import { useEditorStore } from "./editorStore";
import { useBackendStore } from "./backendStore";
import { useRoutingStore } from "./routingStore";
import {
  captureProject,
  emptyProject,
  restoreProject,
} from "@/lib/project/workspace";
import {
  designFingerprint,
  parseProject,
  type ProjectDocument,
} from "@/lib/project/schema";
import { getProject, listProjects, saveProject } from "@/lib/project/storage";
import { readLibrary } from "@/lib/project/library";

interface WorkspaceState {
  id: string;
  name: string;
  ready: boolean;
  revision: number;
  dirty: boolean;
  autosave: boolean;
  status: string;
  error: string;
  source?: ProjectDocument["source"];
  rename: (name: string) => void;
  toggleAutosave: () => void;
}
export const useWorkspaceStore = create<WorkspaceState>((set) => ({
  id: "",
  name: "Untitled project",
  ready: false,
  revision: 0,
  dirty: false,
  autosave: true,
  status: "Opening workspace…",
  error: "",
  rename: (name) => {
    set({ name, dirty: true });
    markDirty();
  },
  toggleAutosave: () => {
    set((s) => ({ autosave: !s.autosave }));
    if (useWorkspaceStore.getState().autosave) scheduleSave();
  },
}));
let timer: ReturnType<typeof setTimeout> | undefined;
let writing: Promise<void> | undefined;
let version = 0;
let switching = false;
let init: Promise<void> | undefined;
export function currentProject() {
  const state = useWorkspaceStore.getState();
  return { ...captureProject(state.id, state.name), source: state.source };
}
function scheduleSave() {
  clearTimeout(timer);
  if (useWorkspaceStore.getState().autosave)
    timer = setTimeout(() => {
      void flushWorkspace().catch(() => {});
    }, 800);
}
function markDirty() {
  if (switching || !useWorkspaceStore.getState().ready) return;
  version++;
  useWorkspaceStore.setState({ dirty: true, status: "Unsaved changes" });
  scheduleSave();
}
export async function flushWorkspace(label?: string): Promise<void> {
  clearTimeout(timer);
  if (writing) {
    await writing;
    return flushWorkspace(label);
  }
  const state = useWorkspaceStore.getState();
  if (!state.ready || (!state.dirty && !label)) return;
  const capturedVersion = version;
  writing = (async () => {
    useWorkspaceStore.setState({ status: "Saving…" });
    try {
      const revision = await saveProject(
        currentProject(),
        state.revision,
        label,
      );
      useWorkspaceStore.setState({
        revision,
        dirty: version !== capturedVersion,
        status:
          version === capturedVersion
            ? "Saved on this device"
            : "Unsaved changes",
        error: "",
      });
      localStorage.setItem(accountStorageKey("levoks-active-project"), state.id);
    } catch (error) {
      const message =
        error instanceof Error
          ? error.message
          : "Saving failed. Download a backup to protect your work.";
      useWorkspaceStore.setState({
        error: message,
        status: "Save failed",
        dirty: true,
      });
      throw error;
    }
  })();
  try {
    await writing;
  } finally {
    writing = undefined;
  }
  if (useWorkspaceStore.getState().dirty) await flushWorkspace();
}
export async function openWorkspace(document: ProjectDocument, revision = 0) {
  if (useWorkspaceStore.getState().ready) await flushWorkspace();
  clearTimeout(timer);
  const parsed = parseProject(document);
  switching = true;
  try {
    restoreProject(parsed);
    useWorkspaceStore.setState({
      id: parsed.id,
      name: parsed.name,
      source: parsed.source,
      ready: true,
      revision,
      dirty: revision === 0,
      error: "",
      status: revision ? "Saved on this device" : "Unsaved changes",
    });
    version++;
    localStorage.setItem(accountStorageKey("levoks-active-project"), parsed.id);
  } finally {
    switching = false;
  }
  if (!revision) await flushWorkspace("Project created");
}
export async function reopenSavedWorkspace(id: string) {
  await flushWorkspace();
  const library = await readLibrary();
  if (library.metadata.some((item) => item.id === id && item.trashedAt))
    throw new Error(
      "This project is in Trash. Restore it from Home to continue editing.",
    );
  const saved = await getProject(id);
  if (!saved)
    throw new Error("This project is no longer available on this device.");
  await openWorkspace(saved.document, saved.revision);
}
/** Use only after the user has downloaded a recovery backup. */
export async function recoverSavedWorkspace() {
  if (writing) await writing.catch(() => {});
  clearTimeout(timer);
  const saved = await getProject(useWorkspaceStore.getState().id);
  if (!saved)
    throw new Error(
      "No saved version is available. Keep your downloaded backup.",
    );
  useWorkspaceStore.setState({ dirty: false });
  await openWorkspace(saved.document, saved.revision);
}
export async function applyDesign(
  document: ProjectDocument,
  resetSource = false,
) {
  await flushWorkspace("Before AI / restore");
  const state = useWorkspaceStore.getState();
  const parsed = parseProject({
    ...document,
    id: state.id,
    source: resetSource ? undefined : document.source,
  });
  switching = true;
  try {
    restoreProject(parsed);
    useWorkspaceStore.setState({ source: parsed.source, name: parsed.name });
  } finally {
    switching = false;
  }
  markDirty();
  await flushWorkspace("Design updated");
}
export function updateSource(files?: Record<string, string>) {
  useWorkspaceStore.setState({
    source: files
      ? { basedOn: designFingerprint(currentProject()), files }
      : undefined,
  });
  markDirty();
}
export function initializeWorkspace(projectId?: string): Promise<void> {
  // Returning to a project with unsaved changes must preserve its recovery controls.
  const current = useWorkspaceStore.getState();
  if (init && projectId === current.id && current.ready && current.dirty)
    return init;
  if (init)
    return projectId ? init.then(() => reopenSavedWorkspace(projectId)) : init;
  init = (async () => {
    try {
      const active = projectId || localStorage.getItem(accountStorageKey("levoks-active-project"));
      const saved = active ? await getProject(active) : undefined;
      if (projectId && !saved)
        throw new Error(
          "This project is not saved on this device. Find it in Home or download it from your cloud projects.",
        );
      const library = await readLibrary();
      const trashed = new Set(
        library.metadata
          .filter((item) => item.trashedAt)
          .map((item) => item.id),
      );
      if (projectId && trashed.has(projectId))
        throw new Error(
          "This project is in Trash. Restore it from Home to continue editing.",
        );
      const fallback =
        (saved && !trashed.has(saved.id) ? saved : undefined) ||
        (projectId
          ? undefined
          : (await listProjects()).find((item) => !trashed.has(item.id)));
      await openWorkspace(
        fallback?.document || emptyProject(),
        fallback?.revision || 0,
      );
    } catch (error) {
      if (projectId) throw error;
      useWorkspaceStore.setState({
        error:
          error instanceof Error
            ? error.message
            : "Workspace could not be restored.",
        status: "Storage unavailable",
      });
      // Do not overwrite existing data after a failed restore.
      const project = emptyProject("Recovery workspace");
      restoreProject(project);
      useWorkspaceStore.setState({
        id: project.id,
        name: project.name,
        ready: true,
        autosave: false,
      });
    }
    useEditorStore.subscribe((next, prev) => {
      if (
        [
          "assets",
          "tokens",
          "components",
          "elementsById",
          "responsiveBaseline",
          "rootIds",
          "globalRootIds",
          "pages",
          "pageElementMap",
          "canvasSettings",
          "activePageId",
        ].some(
          (key) =>
            next[key as keyof typeof next] !== prev[key as keyof typeof prev],
        )
      ) {
        if (!projectHistory.restoring) reconcileRouting();
        markDirty();
      }
    });
    useBackendStore.subscribe((next, prev) => {
      if (
        next.services !== prev.services ||
        next.connections !== prev.connections
      ) {
        if (!projectHistory.restoring) reconcileRouting();
        markDirty();
      }
    });
    useRoutingStore.subscribe((next, prev) => {
      if (next.nodes !== prev.nodes || next.connections !== prev.connections)
        markDirty();
    });
    window.addEventListener("beforeunload", (event) => {
      if (useWorkspaceStore.getState().dirty) {
        event.preventDefault();
        event.returnValue = "";
      }
    });
    document.addEventListener("visibilitychange", () => {
      if (
        document.visibilityState === "hidden" &&
        useWorkspaceStore.getState().autosave
      )
        void flushWorkspace().catch(() => {});
    });
  })();
  return init.catch((error) => {
    init = undefined;
    throw error;
  });
}
