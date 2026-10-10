import type { ComponentDefinition, ElementNode } from "@/types";
import { generateElementId } from "./idGenerator";
import { remapCondition } from "./form-conditions";

export function componentRoot(id: string | null, nodes: Record<string, ElementNode>, definitions: Record<string, ComponentDefinition>) {
  const seen = new Set<string>();
  while (id && nodes[id] && !seen.has(id)) {
    seen.add(id); const node = nodes[id];
    if (node.component && definitions[node.component.id]?.rootId === node.component.node) return node;
    id = node.parentId;
  }
}
export function markComponentStructure(nodes: Record<string, ElementNode>, id: string | null, definitions: Record<string, ComponentDefinition>) {
  const root = componentRoot(id, nodes, definitions);
  if (!root?.component || root.component.overrides.includes("structure")) return nodes;
  return {...nodes, [root.id]: {...root, component: {...root.component, overrides: [...root.component.overrides, "structure"]}}};
}

export function componentDefinition(
  root: string,
  elements: Record<string, ElementNode>,
  name: string,
  componentId: string,
): ComponentDefinition {
  const nodes: Record<string, ElementNode> = {};
  const subtree = new Set<string>();
  const collect = (id: string) => {
    if (subtree.has(id)) return;
    subtree.add(id);
    elements[id].children.forEach(collect);
  };
  collect(root);
  const canonical = (id: string) =>
    subtree.has(id) && elements[id].component?.id === componentId
      ? elements[id].component!.node
      : id;
  const visit = (id: string, parentId: string | null) => {
    const element = elements[id],
      key = canonical(id);
    const node = structuredClone(element);
    delete node.component;
    if (node.formCondition)
      node.formCondition = remapCondition(node.formCondition, (id) =>
        elements[id] ? canonical(id) : id,
      );
    if (node.props.htmlFor && elements[String(node.props.htmlFor)]) node.props.htmlFor = canonical(String(node.props.htmlFor));
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
  const preserveStructure = !publishing && !!oldRoot && elements[oldRoot].component?.overrides.includes("structure");
  const ids = Object.fromEntries(
    Object.values(definition.nodes).map((node) => [
      node.id,
      node.id === definition.rootId && oldRoot
        ? oldRoot
        : oldNodes[node.id]?.id || generateElementId(node.type),
    ]),
  );
  const nodes: Record<string, ElementNode> = {};
  if (preserveStructure) for (const old of Object.values(oldNodes)) ids[old.component!.node] = old.id;
  for (const source of Object.values(definition.nodes)) {
    const old = oldNodes[source.id],
      root = source.id === definition.rootId;
    if (preserveStructure && !old) continue;
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
    if (node.formCondition)
      node.formCondition = remapCondition(
        node.formCondition,
        (id) => ids[id] || id,
      );
    for (const path of node.component!.overrides) {
      if (!old) continue;
      const [group, key] = path.split(".");
      if (key && ["styles", "layout", "props"].includes(group)) {
        const field = group as "styles" | "layout" | "props";
        Object.assign(node[field], {
          [key]: (old[field] as Record<string, unknown>)[key],
        });
      } else if (
        [
          "responsive",
          "animation",
          "motion",
          "vector",
          "formCondition",
        ].includes(group)
      )
        Object.assign(node, { [group]: old[group as keyof ElementNode] });
    }
    if (root && oldRoot)
      node.layout = {
        ...node.layout,
        x: elements[oldRoot].layout.x,
        y: elements[oldRoot].layout.y,
      };
    if (preserveStructure && old) { node.parentId = old.parentId; node.children = [...old.children]; }
    if (node.props.htmlFor) node.props.htmlFor = ids[String(node.props.htmlFor)] || node.props.htmlFor;
    nodes[node.id] = node;
  }
  if (preserveStructure) for (const id of removed) if (!nodes[id]) {
    const node = structuredClone(elements[id]);
    if (node.component?.id === componentId && !definition.nodes[node.component.node]) delete node.component;
    nodes[id] = node;
  }
  return { rootId: ids[definition.rootId], nodes, removed };
}
