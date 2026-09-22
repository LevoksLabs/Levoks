import type { ComponentDefinition, ElementNode } from "@/types";
import { generateElementId } from "./idGenerator";

export function componentDefinition(
  root: string,
  elements: Record<string, ElementNode>,
  name: string,
  componentId: string,
): ComponentDefinition {
  const nodes: Record<string, ElementNode> = {};
  const canonical = (id: string) =>
    elements[id].component?.id === componentId
      ? elements[id].component!.node
      : id;
  const visit = (id: string, parentId: string | null) => {
    const element = elements[id],
      key = canonical(id);
    const node = structuredClone(element);
    delete node.component;
    nodes[key] = {
      ...node,
      id: key,
      parentId,
      children: element.children.map(canonical),
    };
    element.children.forEach((child) => visit(child, key));
  };
  visit(root, null);
  return { name, rootId: canonical(root), nodes };
}

/** Reconcile by stable definition node IDs so wiring and local overrides survive updates. */
export function componentInstance(
  definition: ComponentDefinition,
  componentId: string,
  elements: Record<string, ElementNode>,
  oldRoot?: string,
  publishing = false,
) {
  const oldNodes: Record<string, ElementNode> = {},
    removed: string[] = [];
  const collect = (id: string) => {
    const node = elements[id];
    if (!node) return;
    removed.push(id);
    if (node.component?.id === componentId)
      oldNodes[node.component.node] = node;
    else if (publishing && definition.nodes[id]) oldNodes[id] = node;
    node.children.forEach(collect);
  };
  if (oldRoot) collect(oldRoot);
  const ids = Object.fromEntries(
    Object.values(definition.nodes).map((node) => [
      node.id,
      node.id === definition.rootId && oldRoot
        ? oldRoot
        : oldNodes[node.id]?.id || generateElementId(node.type),
    ]),
  );
  const nodes: Record<string, ElementNode> = {};
  for (const source of Object.values(definition.nodes)) {
    const old = oldNodes[source.id],
      root = source.id === definition.rootId;
    const node: ElementNode = {
      ...structuredClone(source),
      id: ids[source.id],
      parentId: root
        ? oldRoot
          ? elements[oldRoot].parentId
          : null
        : ids[source.parentId!],
      children: source.children.map((child) => ids[child]),
      component: {
        id: componentId,
        node: source.id,
        overrides: publishing ? [] : old?.component?.overrides || [],
      },
    };
    for (const path of node.component!.overrides) {
      if (!old) continue;
      const [group, key] = path.split(".");
      if (key && ["styles", "layout", "props"].includes(group)) {
        const field = group as "styles" | "layout" | "props";
        Object.assign(node[field], {
          [key]: (old[field] as Record<string, unknown>)[key],
        });
      } else if (
        ["responsive", "animation", "motion", "vector"].includes(group)
      )
        Object.assign(node, { [group]: old[group as keyof ElementNode] });
    }
    if (root && oldRoot)
      node.layout = {
        ...node.layout,
        x: elements[oldRoot].layout.x,
        y: elements[oldRoot].layout.y,
      };
    nodes[node.id] = node;
  }
  return { rootId: ids[definition.rootId], nodes, removed };
}
