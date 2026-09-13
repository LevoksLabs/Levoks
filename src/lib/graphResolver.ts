// ═══════════════════════════════════════════════════
// Unified Graph Resolver
// ═══════════════════════════════════════════════════
//
// Replaces both routingEngine.ts (runtime) and connectionResolver.ts (codegen)
// with a single deterministic traversal that produces the IR (FlowGraph).
//
// Pipeline:  Canvas State → resolveGraph() → FlowGraph
//

import {
  RoutingNode,
  RoutingConnection,
  ACTIONABLE_ELEMENT_TYPES,
} from "@/types/routing";
import { Page, ElementNode } from "@/types";
import {
  ServiceContainer,
  EndpointConfig,
  AuthConfig,
  ValidationConfig,
} from "@/types/backend";
import {
  FlowGraph,
  Flow,
  FlowStep,
  ApiCallStep,
  NavigateStep,
  AuthStep,
  ValidateStep,
} from "@/types/ir";

// ─── Input State Shape ───
// Deliberately not importing store hooks — this module is a pure function.

export interface GraphResolverInput {
  nodes: RoutingNode[];
  connections: RoutingConnection[];
  pages: Page[];
  activePageId: string;
  activeElements: ElementNode[]; // elements on the currently active page
  services: ServiceContainer[];
  elementsByPage?: Record<string, ElementNode[]>;
}

// ─── Helpers ───

/** Collect actionable elements from a flat array of elements. */
function collectActionableElements(
  elements: ElementNode[],
): { id: string; type: string }[] {
  const result: { id: string; type: string }[] = [];
  for (const el of elements) {
    if (ACTIONABLE_ELEMENT_TYPES.includes(el.type)) {
      result.push({ id: el.id, type: el.type });
    }
  }
  return result;
}

/** Get the effective elements for a page.
 * In the flat-map model, the caller provides activeElements for the current page.
 * For non-active pages, we return an empty array (elements are loaded via pageElementMap). */
function getPageElements(
  page: Page,
  activePageId: string,
  activeElements: ElementNode[],
): ElementNode[] {
  if (page.id === activePageId) {
    return activeElements;
  }
  // Non-active pages: elements not in memory in flat model
  // Caller should pass all elements if multi-page resolution is needed
  return [];
}

/** Determine the trigger event based on element type. */
function eventForType(type: string): "click" | "submit" {
  return type === "form" ? "submit" : "click";
}

// ─── Main Resolver ───

/**
 * Resolves the entire routing canvas into a FlowGraph (IR).
 *
 * Algorithm:
 *   1. For each page node on the routing canvas, find all actionable elements.
 *   2. For each actionable element, find its output port & connection.
 *   3. BFS from that connection, tracking visited node IDs to prevent loops.
 *   4. At each hop, resolve the target node (service block or page) into a FlowStep.
 *   5. If a service node has outgoing connections, continue traversal.
 */
export function resolveGraph(input: GraphResolverInput): FlowGraph {
  const { nodes, connections, pages, activePageId, activeElements, services } =
    input;

  const flows: Flow[] = [];
  const pagesMeta = pages.map((p) => ({
    id: p.id,
    title: p.title,
    route: p.route,
  }));
  const servicesMeta = services.map((s) => ({
    id: s.id,
    name: s.name,
    port: s.port,
  }));

  // Index structures for O(1) lookups
  const nodeById = new Map(nodes.map((n) => [n.id, n]));
  const pageById = new Map(pages.map((p) => [p.id, p]));
  const serviceById = new Map(services.map((s) => [s.id, s]));

  // Index connections by fromPortId and fromNodeId
  const connsByFromPort = new Map<string, RoutingConnection>();
  const connsByFromNode = new Map<string, RoutingConnection[]>();
  for (const conn of connections) {
    connsByFromPort.set(conn.fromPortId, conn);
    const list = connsByFromNode.get(conn.fromNodeId) || [];
    list.push(conn);
    connsByFromNode.set(conn.fromNodeId, list);
  }

  // For each page node on the routing canvas
  const pageNodes = nodes.filter((n) => n.type === "page");

  for (const pageNode of pageNodes) {
    const page = pageById.get(pageNode.refId);
    if (!page) continue;

    const elements =
      input.elementsByPage?.[page.id] ??
      getPageElements(page, activePageId, activeElements);
    const actionables = collectActionableElements(elements);

    for (const actionable of actionables) {
      // Build the output port ID (matches the format in routingStore)
      const outputPortId = `${pageNode.id}:out:${actionable.id}`;
      const firstConn = connsByFromPort.get(outputPortId);
      if (!firstConn) continue;

      // BFS traversal
      const steps: FlowStep[] = [];
      const visited = new Set<string>();
      visited.add(pageNode.id);

      let currentConn: RoutingConnection | undefined = firstConn;

      while (currentConn) {
        const targetNodeId = currentConn.toNodeId;

        // Loop detection
        if (visited.has(targetNodeId)) break;
        visited.add(targetNodeId);

        const targetNode = nodeById.get(targetNodeId);
        if (!targetNode) break;

        if (targetNode.type === "page") {
          // ── Navigate step ──
          const targetPage = pageById.get(targetNode.refId);
          if (targetPage) {
            steps.push({
              type: "navigate",
              pageId: targetPage.id,
              pageRoute: targetPage.route,
              pageTitle: targetPage.title,
            } satisfies NavigateStep);
          }
          // Page is a terminal node — stop traversal
          break;
        }

        if (targetNode.type === "service") {
          // ── Service step ──
          const service = serviceById.get(targetNode.refId);
          if (!service) break;

          // Determine which block the connection targets
          const toPortParts = currentConn.toPortId.split(":");
          const blockId = toPortParts[toPortParts.length - 1];
          const block = service.blocks.find((b) => b.id === blockId);

          if (block) {
            const serviceName = service.name.toLowerCase().replace(/\s+/g, "-");

            if (block.type === "rest_endpoint") {
              const config = block.config as EndpointConfig;
              steps.push({
                type: "api_call",
                method: config.method,
                endpoint: config.route,
                serviceName,
                servicePort: service.port,
                serviceId: service.id,
                blockId: block.id,
                authRequired: config.authRequired,
              } satisfies ApiCallStep);
            } else if (block.type === "auth_block") {
              const config = block.config as AuthConfig;
              steps.push({
                type: "auth",
                strategy: config.strategy,
                serviceId: service.id,
                blockId: block.id,
              } satisfies AuthStep);
            } else if (block.type === "validation") {
              const config = block.config as ValidationConfig;
              steps.push({
                type: "validate",
                rules: config.rules.map((r) => ({
                  fieldName: config.fieldName,
                  ruleType: r.type,
                  value: r.value,
                  message: r.message,
                })),
                blockId: block.id,
              } satisfies ValidateStep);
            }
          }

          // Continue traversal: find outgoing connections from this service node
          const serviceOutConns = connsByFromNode.get(targetNode.id) || [];
          currentConn = undefined;

          for (const outConn of serviceOutConns) {
            if (outConn.fromPortId !== `${targetNode.id}:out:${blockId}`)
              continue;
            const destNode = nodeById.get(outConn.toNodeId);
            if (destNode && !visited.has(destNode.id)) {
              currentConn = outConn;
              break;
            }
          }
          continue;
        }

        // Unknown node type — stop
        break;
      }

      if (steps.length > 0) {
        flows.push({
          id: `flow_${page.id}_${actionable.id}`,
          trigger: {
            elementId: actionable.id,
            elementType: actionable.type,
            pageId: page.id,
            pageRoute: page.route,
            event: eventForType(actionable.type),
          },
          steps,
        });
      }
    }
  }

  return {
    flows,
    pages: pagesMeta,
    services: servicesMeta,
  };
}

// ─── Convenience: resolve from store state ───
// This is the common pattern for callers that already have store access.
