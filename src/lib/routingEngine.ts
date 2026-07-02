// ═══════════════════════════════════════════════════
// Routing Engine — Runtime Route Resolution
// ═══════════════════════════════════════════════════
//
// This module is now a thin wrapper around the unified graph resolver (graphResolver.ts).
// It converts FlowGraph → ResolvedRoute for backward compatibility with the runtime
// preview system, while guaranteeing that preview and codegen use the same logic.
//
// ── MIGRATION NOTE ──
// resolveRouteForElement() and resolveAllRoutes() now delegate to resolveGraph().
// simulateServiceBlock() remains as a runtime-only simulation helper.
//

import { useRoutingStore } from "@/store/routingStore";
import { useEditorStore } from "@/store/editorStore";
import { useBackendStore } from "@/store/backendStore";
import { RoutingConnection } from "@/types/routing";
import { BackendBlock, ServiceContainer } from "@/types/backend";
import { resolveGraph, GraphResolverInput } from "@/lib/graphResolver";
import { Flow, FlowGraph, ApiCallStep } from "@/types/ir";

// ─── Route Resolution (legacy shape, kept for preview consumers) ───

export interface ResolvedRoute {
    sourceElementId: string;
    sourcePageId: string;
    service?: ServiceContainer;
    block?: BackendBlock;
    targetPageId?: string;
    targetPageTitle?: string;
    connections: RoutingConnection[];
}

/**
 * For a given actionable element on a given page, trace the routing connections
 * to find what happens when the element is activated (click/submit).
 *
 * Delegates to resolveGraph() and converts the matching Flow → ResolvedRoute.
 */
export function resolveRouteForElement(
    elementId: string,
    pageId: string
): ResolvedRoute | null {
    const graph = buildGraphFromStores();
    const flow = graph.flows.find(
        (f) => f.trigger.elementId === elementId && f.trigger.pageId === pageId
    );
    if (!flow) return null;

    return flowToResolvedRoute(flow, pageId);
}

/**
 * Resolve all routes for all actionable elements across all pages.
 * Returns a map: elementId → ResolvedRoute
 */
export function resolveAllRoutes(): Map<string, ResolvedRoute> {
    const graph = buildGraphFromStores();
    const routeMap = new Map<string, ResolvedRoute>();

    for (const flow of graph.flows) {
        const route = flowToResolvedRoute(flow, flow.trigger.pageId);
        if (route) {
            routeMap.set(flow.trigger.elementId, route);
        }
    }

    return routeMap;
}

// ─── Internal: build graph from store state ───

function buildGraphFromStores(): FlowGraph {
    const routingState = useRoutingStore.getState();
    const editorState = useEditorStore.getState();
    const backendState = useBackendStore.getState();

    const input: GraphResolverInput = {
        nodes: routingState.nodes,
        connections: routingState.connections,
        pages: editorState.pages,
        activePageId: editorState.activePageId,
        activeElements: editorState.rootIds.map((id: string) => editorState.elementsById[id]).filter(Boolean),
        services: backendState.services,
    };

    return resolveGraph(input);
}

// ─── Internal: convert Flow → ResolvedRoute ───

function flowToResolvedRoute(flow: Flow, pageId: string): ResolvedRoute | null {
    const backendState = useBackendStore.getState();
    const editorState = useEditorStore.getState();
    const routingState = useRoutingStore.getState();

    const result: ResolvedRoute = {
        sourceElementId: flow.trigger.elementId,
        sourcePageId: pageId,
        connections: [],
    };

    for (const step of flow.steps) {
        if (step.type === "api_call") {
            const apiStep = step as ApiCallStep;
            const service = backendState.services.find((s) => s.id === apiStep.serviceId);
            if (service) {
                result.service = service;
                result.block = service.blocks.find((b) => b.id === apiStep.blockId);
            }
        } else if (step.type === "navigate") {
            const page = editorState.pages.find((p) => p.id === step.pageId);
            if (page) {
                result.targetPageId = page.id;
                result.targetPageTitle = page.title;
            }
        }
    }

    // Populate connections array from routing store for display purposes
    const { connections, nodes } = routingState;
    const pageNode = nodes.find((n) => n.type === "page" && n.refId === pageId);
    if (pageNode) {
        const outputPortId = `${pageNode.id}:out:${flow.trigger.elementId}`;
        const outConn = connections.find((c) => c.fromPortId === outputPortId);
        if (outConn) {
            result.connections.push(outConn);
            // Follow chain
            const serviceNode = nodes.find((n) => n.id === outConn.toNodeId);
            if (serviceNode) {
                const serviceOutConns = connections.filter((c) => c.fromNodeId === serviceNode.id);
                for (const sc of serviceOutConns) {
                    result.connections.push(sc);
                }
            }
        }
    }

    return result;
}

/**
 * Simulate a backend service block execution.
 * Returns a simulated response based on block type/config.
 *
 * NOTE: This function remains as-is — simulation is runtime-only
 * and is NOT part of the IR/codegen pipeline.
 */
export function simulateServiceBlock(
    block: BackendBlock,
    inputData: Record<string, string>
): { success: boolean; data: Record<string, unknown>; message: string } {
    switch (block.type) {
        case "auth_block": {
            const hasCredentials = Object.values(inputData).some(
                (v) => v && v.trim().length > 0
            );
            if (hasCredentials) {
                return {
                    success: true,
                    data: { token: "sim_jwt_" + Date.now(), authenticated: true },
                    message: "Authentication successful",
                };
            }
            return {
                success: false,
                data: {},
                message: "Authentication failed — missing credentials",
            };
        }

        case "logic_if": {
            const condition = Object.values(inputData).some(
                (v) => v && v.trim().length > 0
            );
            return {
                success: condition,
                data: { condition, inputData },
                message: condition ? "Condition met" : "Condition not met",
            };
        }

        case "rest_endpoint": {
            return {
                success: true,
                data: { received: inputData, status: 200 },
                message: `${block.label} processed`,
            };
        }

        case "db_model": {
            return {
                success: true,
                data: { id: "sim_" + Date.now(), ...inputData, createdAt: new Date().toISOString() },
                message: `Record created in ${block.label}`,
            };
        }

        case "validation": {
            const allFilled = Object.values(inputData).every(
                (v) => v && v.trim().length > 0
            );
            return {
                success: allFilled,
                data: { valid: allFilled, inputData },
                message: allFilled ? "Validation passed" : "Validation failed — empty fields",
            };
        }

        case "middleware": {
            return {
                success: true,
                data: { processed: true, inputData },
                message: "Middleware processed",
            };
        }

        default: {
            return {
                success: true,
                data: inputData,
                message: `${block.type} processed`,
            };
        }
    }
}
