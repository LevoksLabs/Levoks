import type { ElementNode } from "@/types";

type Node = Pick<
  ElementNode,
  | "id"
  | "label"
  | "type"
  | "definitionId"
  | "parentId"
  | "children"
  | "props"
  | "formCondition"
>;
export const conditionalGroups = ["formField", "radioGroup", "checkboxGroup"];

export function conditionOwner(node: Node, nodes: Record<string, Node>) {
  const seen = new Set<string>();
  while (node.parentId && !seen.has(node.id)) {
    seen.add(node.id);
    node = nodes[node.parentId];
    if (!node) return;
    if (node.formCondition) return node;
    if (node.type === "form") return;
  }
}

export function fieldCondition(node: Node, nodes: Record<string, Node>) {
  return node.formCondition || conditionOwner(node, nodes)?.formCondition;
}

function path(node: Node, nodes: Record<string, Node>) {
  const result: Node[] = [],
    seen = new Set<string>();
  while (node && !seen.has(node.id)) {
    seen.add(node.id);
    result.push(node);
    if (node.type === "form" || !node.parentId) break;
    node = nodes[node.parentId];
  }
  return result;
}

export function conditionSources(target: Node, nodes: Record<string, Node>) {
  const owner = path(target, nodes).find((node) => node.type === "form");
  return owner
    ? Object.values(nodes).filter((node) => {
        const ancestors = path(node, nodes);
        return (
          ["checkbox", "switch"].includes(node.definitionId || "") &&
          !ancestors.some(
            (item) =>
              item.formCondition ||
              item.id === target.id ||
              item.props.disabled ||
              item.definitionId === "checkboxGroup",
          ) &&
          ancestors.at(-1)?.id === owner.id
        );
      })
    : [];
}

export function validateFormConditions(
  nodes: Record<string, Node>,
  onlyId?: string,
) {
  for (const target of Object.values(nodes).filter(
    (node) =>
      node.formCondition && (onlyId === undefined || node.id === onlyId),
  )) {
    let ancestor: Node | undefined = target;
    const ancestors = new Set<string>();
    while (ancestor && !ancestors.has(ancestor.id)) {
      ancestors.add(ancestor.id);
      if (
        ancestor.type === "repeater" ||
        ("dataSource" in ancestor && ancestor.dataSource)
      )
        throw new Error(
          "Keep conditional forms outside repeaters and live record templates.",
        );
      ancestor = ancestor.parentId ? nodes[ancestor.parentId] : undefined;
    }
    if (
      !conditionalGroups.includes(target.definitionId || "") ||
      conditionOwner(target, nodes)
    )
      throw new Error(
        "Conditions support native form groups without nested conditional sections.",
      );
    if (
      !conditionSources(target, nodes).some(
        (node) => node.id === target.formCondition!.sourceId,
      )
    )
      throw new Error(
        "Choose an enabled, unconditional Checkbox or Switch outside this section in the same form.",
      );
    const pending = [...target.children],
      seen = new Set<string>();
    while (pending.length) {
      const id = pending.pop()!;
      if (seen.has(id)) continue;
      seen.add(id);
      const child = nodes[id];
      if (!child) continue;
      if (
        String(child.props.inputType || child.props.type) === "radio" &&
        child.props.name &&
        Object.values(nodes).some(
          (other) =>
            other.id !== child.id &&
            other.props.name === child.props.name &&
            String(other.props.inputType || other.props.type) === "radio" &&
            path(other, nodes).at(-1)?.id === path(target, nodes).at(-1)?.id &&
            !path(other, nodes).some((node) => node.id === target.id),
        )
      )
        throw new Error(
          "Keep same-name radio choices together inside one conditional section.",
        );
      if (
        child.formCondition ||
        child.type === "form" ||
        child.type === "custom" ||
        child.type === "repeater" ||
        ((child.type === "button" || child.props.type === "submit") &&
          (child.props.type || "submit") === "submit")
      )
        throw new Error(
          "Keep nested conditional sections, submit buttons, nested forms, custom components and repeaters outside conditional sections.",
        );
      pending.push(...child.children);
    }
  }
}

export function conditionDefault(
  node: ElementNode,
  nodes: Record<string, ElementNode>,
) {
  return node.formCondition
    ? Boolean(nodes[node.formCondition.sourceId]?.props.checked) ===
        node.formCondition.checked
    : undefined;
}
