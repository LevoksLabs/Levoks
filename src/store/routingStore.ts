import { withProjectHistory } from "./projectHistory";
// ═══════════════════════════════════════════════════
// Routing Canvas — Zustand Store
// ═══════════════════════════════════════════════════

import { create } from "zustand";
import { v4 as uuidv4 } from "uuid";
import {
    RoutingNode,
    NodePort,
    RoutingConnection,
    ACTIONABLE_ELEMENT_TYPES,
    DEFAULT_PAGE_NODE_SIZE,
    DEFAULT_SERVICE_NODE_SIZE,
    MIN_ZOOM,
    MAX_ZOOM,
    ZOOM_STEP,
} from "@/types/routing";
import { useEditorStore } from "./editorStore";
import { useBackendStore } from "./backendStore";
import { ElementNode } from "@/types";

// ─── Store Interface ───

interface RoutingStore {
    // Canvas state
    nodes: RoutingNode[];
    connections: RoutingConnection[];
    zoom: number;
    panX: number;
    panY: number;

    // Selection
    selectedNodeId: string | null;
    selectedConnectionId: string | null;

    // Wiring state
    connectingFrom: NodePort | null;
    mousePos: { x: number; y: number };

    // Hovered port
    hoveredPortId: string | null;

    // Actions — Nodes
    addNode: (type: "page" | "service", refId: string, x?: number, y?: number) => void;
    removeNode: (id: string) => void;
    moveNode: (id: string, x: number, y: number) => void;
    selectNode: (id: string | null) => void;

    // Actions — Connections
    addConnection: (fromPortId: string, toPortId: string, fromNodeId: string, toNodeId: string) => void;
    removeConnection: (id: string) => void;
    selectConnection: (id: string | null) => void;

    // Actions — Wiring
    startConnecting: (port: NodePort) => void;
    updateMousePos: (x: number, y: number) => void;
    endConnecting: (port?: NodePort) => void;
    cancelConnecting: () => void;
    setHoveredPort: (portId: string | null) => void;

    // Actions — Viewport
    setZoom: (zoom: number) => void;
    zoomIn: () => void;
    zoomOut: () => void;
    resetView: () => void;
    setPan: (x: number, y: number) => void;

    // Getters
    getPortsForNode: (nodeId: string) => NodePort[];
    getNodeByRefId: (refId: string) => RoutingNode | undefined;
    getConnectionsForNode: (nodeId: string) => RoutingConnection[];
    autoLayoutNodes: () => void;
}

// ─── Helper: collect actionable elements recursively ───

function collectActionableElements(
    elements: ElementNode[],
    path: string = ""
): { id: string; label: string; type: ElementNode["type"] }[] {
    const result: { id: string; label: string; type: ElementNode["type"] }[] = [];
    for (const el of elements) {
        if (ACTIONABLE_ELEMENT_TYPES.includes(el.type)) {
            const displayLabel = getElementDisplayLabel(el);
            result.push({
                id: el.id,
                label: path ? `${path} › ${displayLabel}` : displayLabel,
                type: el.type,
            });
        }
    }
    return result;
}

function getElementDisplayLabel(el: ElementNode): string {
    const candidates = [el.label, el.props?.label, el.props?.content, el.props?.text];
    for (const candidate of candidates) {
        if (typeof candidate === "string" && candidate.trim()) return candidate.trim();
        if (typeof candidate === "number") return String(candidate);
    }
    return el.type;
}

// ─── Store Implementation ───

export const useRoutingStore = create<RoutingStore>(withProjectHistory("routing", ["nodes", "connections"], (set, get) => ({
    nodes: [],
    connections: [],
    zoom: 1,
    panX: 0,
    panY: 0,
    selectedNodeId: null,
    selectedConnectionId: null,
    connectingFrom: null,
    mousePos: { x: 0, y: 0 },
    hoveredPortId: null,

    // ─── Node CRUD ───

    addNode: (type, refId, x, y) => {
        const state = get();
        // Don't add duplicates
        if (state.nodes.find((n) => n.refId === refId && n.type === type)) return;

        const size = type === "page" ? DEFAULT_PAGE_NODE_SIZE : DEFAULT_SERVICE_NODE_SIZE;
        const existingCount = state.nodes.length;
        const col = existingCount % 3;
        const row = Math.floor(existingCount / 3);

        const node: RoutingNode = {
            id: uuidv4(),
            type,
            refId,
            position: {
                x: x ?? 100 + col * 300,
                y: y ?? 100 + row * 280,
            },
            width: size.width,
            height: size.height,
        };
        set({ nodes: [...state.nodes, node] });
    },

    removeNode: (id) => {
        const state = get();
        set({
            nodes: state.nodes.filter((n) => n.id !== id),
            connections: state.connections.filter(
                (c) => c.fromNodeId !== id && c.toNodeId !== id
            ),
            selectedNodeId: state.selectedNodeId === id ? null : state.selectedNodeId,
        });
    },

    moveNode: (id, x, y) => {
        set({
            nodes: get().nodes.map((n) =>
                n.id === id ? { ...n, position: { x, y } } : n
            ),
        });
    },

    selectNode: (id) => {
        set({ selectedNodeId: id, selectedConnectionId: null });
    },

    // ─── Connection CRUD ───

    addConnection: (fromPortId, toPortId, fromNodeId, toNodeId) => {
        const state = get();
        // Prevent duplicate connections
        const exists = state.connections.find(
            (c) => c.fromPortId === fromPortId && c.toPortId === toPortId
        );
        if (exists) return;
        const from = get().getPortsForNode(fromNodeId).find(p => p.id === fromPortId);
        const to = get().getPortsForNode(toNodeId).find(p => p.id === toPortId);
        if (!from || !to || from.portType !== "output" || to.portType !== "input" || fromNodeId === toNodeId) return;

        const conn: RoutingConnection = {
            id: uuidv4(),
            fromPortId,
            toPortId,
            fromNodeId,
            toNodeId,
            animated: true,
        };
        set({ connections: [...state.connections.filter(c => c.fromPortId !== fromPortId), conn] });
    },

    removeConnection: (id) => {
        set({
            connections: get().connections.filter((c) => c.id !== id),
            selectedConnectionId: get().selectedConnectionId === id ? null : get().selectedConnectionId,
        });
    },

    selectConnection: (id) => {
        set({ selectedConnectionId: id, selectedNodeId: null });
    },

    // ─── Wiring ───

    startConnecting: (port) => {
        set({ connectingFrom: port });
    },

    updateMousePos: (x, y) => {
        set({ mousePos: { x, y } });
    },

    endConnecting: (port) => {
        const state = get();
        if (!state.connectingFrom || !port) {
            set({ connectingFrom: null });
            return;
        }
        // Can't connect to same node
        if (state.connectingFrom.nodeId === port.nodeId) {
            set({ connectingFrom: null });
            return;
        }
        // Must be output → input or input → output
        if (state.connectingFrom.portType === port.portType) {
            set({ connectingFrom: null });
            return;
        }

        const from = state.connectingFrom.portType === "output" ? state.connectingFrom : port;
        const to = state.connectingFrom.portType === "input" ? state.connectingFrom : port;

        get().addConnection(from.id, to.id, from.nodeId, to.nodeId);
        set({ connectingFrom: null });
    },

    cancelConnecting: () => {
        set({ connectingFrom: null });
    },

    setHoveredPort: (portId) => {
        set({ hoveredPortId: portId });
    },

    // ─── Viewport ───

    setZoom: (zoom) => {
        set({ zoom: Math.min(MAX_ZOOM, Math.max(MIN_ZOOM, zoom)) });
    },

    zoomIn: () => {
        const z = get().zoom;
        set({ zoom: Math.min(MAX_ZOOM, z + ZOOM_STEP) });
    },

    zoomOut: () => {
        const z = get().zoom;
        set({ zoom: Math.max(MIN_ZOOM, z - ZOOM_STEP) });
    },

    resetView: () => {
        set({ zoom: 1, panX: 0, panY: 0 });
    },

    setPan: (x, y) => {
        set({ panX: x, panY: y });
    },

    // ─── Port Derivation ───

    getPortsForNode: (nodeId) => {
        const state = get();
        const node = state.nodes.find((n) => n.id === nodeId);
        if (!node) return [];

        const ports: NodePort[] = [];

        if (node.type === "page") {
            // Find the page in editorStore
            const editorState = useEditorStore.getState();
            const page = editorState.pages.find((p) => p.id === node.refId);
            if (!page) return [];

            // Get current elements for this page from flat store
            const pageRootIds =
                editorState.activePageId === page.id
                    ? editorState.rootIds
                    : (editorState.pageElementMap?.[page.id] || []);
            
            // Collect all elements (including children) for this page
            const allElements: ElementNode[] = [];
            const stack = [...pageRootIds, ...editorState.globalRootIds];
            while (stack.length > 0) {
                const id = stack.pop()!;
                const el = editorState.elementsById[id];
                if (el) { allElements.push(el); stack.push(...el.children); }
            }

            // Collect actionable elements as output ports
            const actionables = collectActionableElements(allElements);
            actionables.forEach((el, idx) => {
                ports.push({
                    id: `${nodeId}:out:${el.id}`,
                    nodeId,
                    portType: "output",
                    elementId: el.id,
                    elementType: el.type,
                    label: el.label,
                    relativeY: 60 + idx * 28,
                });
            });

            // Also add the page itself as an input port (so other pages can navigate TO it)
            ports.push({
                id: `${nodeId}:in:page`,
                nodeId,
                portType: "input",
                label: "Navigate here",
                relativeY: 40,
            });
        }

        if (node.type === "service") {
            // Find the service in backendStore
            const backendState = useBackendStore.getState();
            const service = backendState.services.find((s) => s.id === node.refId);
            if (!service) return [];

            // Each block becomes an input port
            service.blocks.forEach((block, idx) => {
                ports.push({
                    id: `${nodeId}:in:${block.id}`,
                    nodeId,
                    portType: "input",
                    blockId: block.id,
                    blockType: block.type,
                    label: block.label,
                    relativeY: 60 + idx * 28,
                });
            });

            // Service also has output ports (responses flow back)
            service.blocks
                .filter((b) => b.type === "rest_endpoint")
                .forEach((block, idx) => {
                    ports.push({
                        id: `${nodeId}:out:${block.id}`,
                        nodeId,
                        portType: "output",
                        blockId: block.id,
                        blockType: block.type,
                        label: `${block.label} response`,
                        relativeY: 60 + idx * 28,
                    });
                });
        }

        return ports;
    },

    getNodeByRefId: (refId) => {
        return get().nodes.find((n) => n.refId === refId);
    },

    getConnectionsForNode: (nodeId) => {
        return get().connections.filter(
            (c) => c.fromNodeId === nodeId || c.toNodeId === nodeId
        );
    },

    // ─── Auto Layout ───

    autoLayoutNodes: () => {
        const state = get();
        const pageNodes = state.nodes.filter((n) => n.type === "page");
        const serviceNodes = state.nodes.filter((n) => n.type === "service");

        const updatedNodes = state.nodes.map((node) => {
            if (node.type === "page") {
                const idx = pageNodes.indexOf(node);
                const col = idx % 3;
                const row = Math.floor(idx / 3);
                return {
                    ...node,
                    position: { x: 100 + col * 300, y: 100 + row * 280 },
                };
            } else {
                const idx = serviceNodes.indexOf(node);
                const col = idx % 2;
                const row = Math.floor(idx / 2);
                return {
                    ...node,
                    position: { x: 1100 + col * 280, y: 100 + row * 240 },
                };
            }
        });

        set({ nodes: updatedNodes });
    },
}), (state, document) => ({ selectedNodeId: document.nodes?.some(node => node.id === state.selectedNodeId) ? state.selectedNodeId : null, selectedConnectionId: document.connections?.some(connection => connection.id === state.selectedConnectionId) ? state.selectedConnectionId : null, connectingFrom: null })));
