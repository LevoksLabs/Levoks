import { useEditorStore } from "@/store/editorStore";
import { useBackendStore } from "@/store/backendStore";
import { useRoutingStore } from "@/store/routingStore";
export function reconcileRouting() {
  const e = useEditorStore.getState();
  const b = useBackendStore.getState();
  const r = useRoutingStore.getState();
  // Deleting a target removes its semantic event bindings in the same history entry.
  let changed = false;
  const elementsById = Object.fromEntries(Object.entries(e.elementsById).map(([id, node]) => {
    const events = Object.fromEntries(Object.entries(node.events || {}).filter(([, event]) => event.action === "navigate" ? e.pages.some(page => page.id === event.target) : Boolean(e.elementsById[event.target])));
    if (Object.keys(events).length !== Object.keys(node.events || {}).length) { changed = true; return [id, { ...node, events }]; }
    return [id, node];
  }));
  if (changed) useEditorStore.setState({ elementsById });
  const nodes = r.nodes.filter((n) =>
    (n.type === "page" ? e.pages : b.services).some(
      (item) => item.id === n.refId,
    ),
  );
  const connections = r.connections.filter(
    (c) =>
      nodes.some((n) => n.id === c.fromNodeId) &&
      nodes.some((n) => n.id === c.toNodeId) &&
      r.getPortsForNode(c.fromNodeId).some((p) => p.id === c.fromPortId) &&
      r.getPortsForNode(c.toNodeId).some((p) => p.id === c.toPortId),
  );
  if (
    nodes.length !== r.nodes.length ||
    connections.length !== r.connections.length
  )
    useRoutingStore.setState({ nodes, connections });
}
