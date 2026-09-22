import { useEditorStore } from "@/store/editorStore";
import { useBackendStore } from "@/store/backendStore";
import { useRoutingStore } from "@/store/routingStore";
export function reconcileRouting() {
  const e = useEditorStore.getState();
  const b = useBackendStore.getState();
  const r = useRoutingStore.getState();
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
