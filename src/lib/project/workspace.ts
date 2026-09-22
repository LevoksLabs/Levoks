import { projectHistory } from "@/store/projectHistory";
import { reconcileRouting } from "./links";
import { useEditorStore } from "@/store/editorStore";
import { useBackendStore } from "@/store/backendStore";
import { useRoutingStore } from "@/store/routingStore";
import { useEditorUIStore } from "@/store/editorUIStore";
import { syncCounters } from "@/lib/idGenerator";
import { parseProject, type ProjectDocument } from "./schema";
import type { ElementNode, ComponentDefinition } from "@/types";

projectHistory.reconcile(reconcileRouting);

export function captureProject(id: string, name: string): ProjectDocument {
  const e = useEditorStore.getState();
  const b = useBackendStore.getState();
  const r = useRoutingStore.getState();
  return {
    schemaVersion: 1,
    id,
    name,
    updatedAt: new Date().toISOString(),
    editor: {
      assets: e.assets, tokens: e.tokens, components: e.components,
      elementsById: e.elementsById,
      rootIds: e.rootIds,
      globalRootIds: e.globalRootIds,
      pages: e.pages,
      activePageId: e.activePageId,
      pageElementMap: { ...e.pageElementMap, [e.activePageId]: e.rootIds },
      canvasSettings: e.canvasSettings,
    },
    backend: { services: b.services, connections: b.connections },
    routing: { nodes: r.nodes, connections: r.connections },
  } as ProjectDocument;
}

export function restoreProject(value: unknown) {
  const project = parseProject(value);
  useEditorUIStore.setState({ breakpoint: "base", tool: "select", motionOpen: false });
  syncCounters([
    ...Object.keys(project.editor.elementsById),
    ...project.editor.pages.map((p) => p.id),
  ]);
  useEditorStore.setState({
    ...project.editor,
    assets: project.editor.assets || {}, tokens: project.editor.tokens || {}, components: (project.editor.components || {}) as Record<string, ComponentDefinition>,
    elementsById: project.editor.elementsById as Record<string, ElementNode>,
    selectedElementId: null,
    selectedElementIds: [],
    canUndo: false,
    canRedo: false,
    clipboard: null,
    frontendGeneratedCode: null,
  });
  useBackendStore.setState({
    ...project.backend,
    selectedBlockId: null,
    selectedServiceId: null,
    generatedCode: null,
  });
  useRoutingStore.setState({
    ...project.routing,
    selectedNodeId: null,
    selectedConnectionId: null,
    connectingFrom: null,
    zoom: 1,
    panX: 0,
    panY: 0,
  });
  projectHistory.clear();
  return project;
}

export function emptyProject(name = "Untitled project"): ProjectDocument {
  return {
    schemaVersion: 1,
    id: crypto.randomUUID(),
    name,
    updatedAt: new Date().toISOString(),
    editor: {
      elementsById: {},
      rootIds: [],
      globalRootIds: [],
      pages: [{ id: "page_1", title: "Home", route: "/" }],
      activePageId: "page_1",
      pageElementMap: { page_1: [] },
      canvasSettings: { width: 1920, height: 1080, backgroundColor: "#ffffff" },
    },
    backend: { services: [], connections: [] },
    routing: { nodes: [], connections: [] },
  };
}

export function downloadProject(project: ProjectDocument) {
  const url = URL.createObjectURL(
    new Blob([JSON.stringify(project, null, 2)], { type: "application/json" }),
  );
  const link = document.createElement("a");
  link.href = url;
  link.download = `${project.name.replace(/[^a-z0-9_-]/gi, "-")}.levoks.json`;
  link.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
