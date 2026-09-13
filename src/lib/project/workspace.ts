import { useEditorStore } from "@/store/editorStore";
import { useBackendStore } from "@/store/backendStore";
import { useRoutingStore } from "@/store/routingStore";
import { syncCounters } from "@/lib/idGenerator";
import { parseProject, type ProjectDocument } from "./schema";
import type { ElementNode } from "@/types";

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
  syncCounters([
    ...Object.keys(project.editor.elementsById),
    ...project.editor.pages.map((p) => p.id),
  ]);
  useEditorStore.setState({
    ...project.editor,
    elementsById: project.editor.elementsById as Record<string, ElementNode>,
    selectedElementId: null,
    selectedElementIds: [],
    past: [],
    future: [],
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
      canvasSettings: { width: 1280, height: 900, backgroundColor: "#ffffff" },
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
