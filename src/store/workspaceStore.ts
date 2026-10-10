import { projectHistory, withProjectHistory, type DurableHistory } from "./projectHistory";
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
  redactProject,
  type ProjectDocument,
} from "@/lib/project/schema";
import { getProject, listProjects, saveProject } from "@/lib/project/storage";
import { readLibrary } from "@/lib/project/library";
import { useCollaborationStore } from "./collaborationStore";

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
export const useWorkspaceStore = create<WorkspaceState>(withProjectHistory("workspace", ["name", "source"], (set) => ({
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
})));
let timer: ReturnType<typeof setTimeout> | undefined;
let writing: Promise<void> | undefined;
let version = 0;
let switching = false;
let init: Promise<void> | undefined;
let initializingProjectId: string | undefined;
let watching = false;
export function currentProject() {
  const state = useWorkspaceStore.getState();
  return { ...captureProject(state.id, state.name), source: state.source };
}

/** Durable history is local account-scoped storage, never application IR/export. */
function normalizeHistory(snapshot: Record<string,Record<string,unknown>>) {
  const current = currentProject();
  const document = redactProject(parseProject({...current,...snapshot.workspace,editor:snapshot.editor,backend:snapshot.backend,routing:snapshot.routing}));
  return {editor:Object.fromEntries(Object.keys(snapshot.editor).map(key=>[key,document.editor[key as keyof typeof document.editor]])),backend:{...document.backend},routing:{...document.routing},workspace:{name:document.name,source:document.source}};
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
  // An explicit project save includes the responsive layout currently on screen.
  // Background autosave retains the baseline until Save/Cancel ends the review.
  if (label) useEditorStore.getState().finishResponsiveEdit();
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
        projectHistory.serialize(normalizeHistory),
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
export async function openWorkspace(document: ProjectDocument, revision = 0, history?: DurableHistory) {
  if (useWorkspaceStore.getState().ready) await flushWorkspace();
  watchWorkspace();
  useCollaborationStore.setState({ project: null });
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
    if (history) projectHistory.hydrate(history, normalizeHistory);
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
  await openWorkspace(saved.document, saved.revision, saved.history);
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
  await openWorkspace(saved.document, saved.revision, saved.history);
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
  projectHistory.run("workspace",()=>useWorkspaceStore.setState({
    source: files
      ? { basedOn: designFingerprint(currentProject()), files }
      : undefined,
  }));
  markDirty();
}
export function initializeWorkspace(projectId?: string): Promise<void> {
  const current = useWorkspaceStore.getState();
  if (init)
    return projectId && projectId !== initializingProjectId
      ? init.then(() => initializeWorkspace(projectId))
      : init;
  // Remounts and Fast Refresh must not restore over an already open workspace.
  if (current.ready && (!projectId || projectId === current.id))
    return Promise.resolve();
  initializingProjectId = projectId;
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
      fallback?.history,
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
    watchWorkspace();
  })();
  const pending = init;
  return pending.finally(() => {
    if (init === pending) {
      init = undefined;
      initializingProjectId = undefined;
    }
  });
}

function watchWorkspace() {
    if (watching) return;
    // A refreshed module must retire the previous module's autosave listeners.
    const lifecycle = window as Window & { levoksDisposeWorkspaceWatchers?: () => void };
    lifecycle.levoksDisposeWorkspaceWatchers?.();
    watching = true;
    const stopEditor = useEditorStore.subscribe((next, prev) => {
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
    const stopBackend = useBackendStore.subscribe((next, prev) => {
      if (
        next.services !== prev.services ||
        next.connections !== prev.connections
      ) {
        if (!projectHistory.restoring) reconcileRouting();
        markDirty();
      }
    });
    const stopRouting = useRoutingStore.subscribe((next, prev) => {
      if (next.nodes !== prev.nodes || next.connections !== prev.connections)
        markDirty();
    });
    const stopHistory = projectHistory.subscribe(()=>markDirty());
    const stopWorkspace = useWorkspaceStore.subscribe((next,prev)=>{if(next.source!==prev.source || next.name!==prev.name) markDirty();});
    const beforeUnload = (event: BeforeUnloadEvent) => {
      if (useWorkspaceStore.getState().dirty) {
        event.preventDefault();
        event.returnValue = "";
      }
    };
    const visibilityChange = () => {
      if (
        document.visibilityState === "hidden" &&
        useWorkspaceStore.getState().autosave
      )
        void flushWorkspace().catch(() => {});
    };
    window.addEventListener("beforeunload", beforeUnload);
    document.addEventListener("visibilitychange", visibilityChange);
    lifecycle.levoksDisposeWorkspaceWatchers = () => {
      clearTimeout(timer);
      stopEditor();
      stopBackend();
      stopRouting();
      stopHistory();
      stopWorkspace();
      window.removeEventListener("beforeunload", beforeUnload);
      document.removeEventListener("visibilitychange", visibilityChange);
      watching = false;
    };
}
