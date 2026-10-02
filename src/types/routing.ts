import type { RequestMapping, ResponseMapping, FailureBehavior } from "@/lib/contracts";
// ═══════════════════════════════════════════════════
// Routing Canvas — Type Definitions
// ═══════════════════════════════════════════════════

import { ElementType } from "./index";
import type { ElementNode } from "./index";
import { definitionFor } from "@/lib/elements/registry";

// Element types that can trigger actions and thus expose output ports
export const ACTIONABLE_ELEMENT_TYPES: ElementType[] = [
    "button",
    "form",
    "menu",
    "socialbar",
    "image",      // image can be a link
];
export function isActionableElement(element: ElementNode) {
    return ACTIONABLE_ELEMENT_TYPES.includes(element.type) || (element.type === "native" && ["button", "a"].includes(definitionFor(element)?.tag || ""));
}

// ─── Routing Node ───
// Represents a page or backend service placed on the routing canvas

export interface RoutingNode {
    id: string;
    type: "page" | "service";
    refId: string;           // references Page.id or ServiceContainer.id
    position: { x: number; y: number };
    width: number;
    height: number;
}

// ─── Node Port ───
// A connection point on a node (output on pages, input on services)

export interface NodePort {
    id: string;
    nodeId: string;
    portType: "output" | "input";
    // For page ports — which element generates this port
    elementId?: string;
    elementType?: ElementType;
    // For service ports — which block generates this port
    blockId?: string;
    blockType?: string;
    // Display
    label: string;
    // Position within the node (computed at render time, stored for wiring)
    relativeY?: number;
}

// ─── Routing Connection ───
// A wire/edge between two ports

export interface RoutingConnection {
    requestMappings?: RequestMapping[];
    responseMappings?: ResponseMapping[];
    failure?: FailureBehavior;
    id: string;
    fromPortId: string;
    toPortId: string;
    fromNodeId: string;
    toNodeId: string;
    label?: string;
    // Animation when data flows
    animated?: boolean;
}

// ─── Canvas Viewport ───

export interface RoutingViewport {
    zoom: number;       // 0.1 – 3.0
    panX: number;
    panY: number;
}

// Default node sizes
export const DEFAULT_PAGE_NODE_SIZE = { width: 240, height: 180 };
export const DEFAULT_SERVICE_NODE_SIZE = { width: 220, height: 160 };

// Zoom limits
export const MIN_ZOOM = 0.1;
export const MAX_ZOOM = 3.0;
export const ZOOM_STEP = 0.1;
