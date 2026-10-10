import type { ElementNode, FormCondition, FormConditionRule } from "@/types";
import { definitionFor } from "./elements/registry";
import {groupChoices} from "./elements/choice-group-values";
import { selectChoices } from "./elements/select-options";

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
export function conditionOwner(node: Node, nodes: Record<string, Node>) {
  return path(node, nodes)
    .slice(1)
    .find((item) => item.formCondition);
}
export function fieldConditions(node: Node, nodes: Record<string, Node>) {
  return path(node, nodes)
    .filter((item) => item.formCondition)
    .reverse()
    .map((item) => item.formCondition!);
}
export function fieldCondition(node: Node, nodes: Record<string, Node>) {
  return node.formCondition || conditionOwner(node, nodes)?.formCondition;
}
export function conditionRules(condition: FormCondition): FormConditionRule[] {
  return [
    {
      sourceId: condition.sourceId,
      checked: condition.checked,
      ...(condition.operator ? { operator: condition.operator } : {}),
      ...(condition.value !== undefined ? { value: condition.value } : {}),
    },
    ...(condition.rules || []),
  ];
}
export function remapCondition(
  condition: FormCondition,
  map: (id: string) => string,
): FormCondition {
  return {
    ...condition,
    sourceId: map(condition.sourceId),
    ...(condition.rules
      ? {
          rules: condition.rules.map((rule) => ({
            ...rule,
            sourceId: map(rule.sourceId),
          })),
        }
      : {}),
  };
}
export function conditionKind(source: Node) {
  if (["checkbox", "switch"].includes(source.definitionId || ""))
    return "boolean";
  if (
    source.definitionId === "checkboxGroup" ||
    (definitionFor(source)?.tag === "select" && source.props.multiple)
  )
    return "array";
  return "string";
}
export function conditionChoices(source: Node, nodes: Record<string, Node>) {
  if (definitionFor(source)?.tag === "select")
    return selectChoices(source.props).filter(
      (choice) => !choice.disabled && !choice.groupDisabled,
    );
  return groupChoices(source,nodes)
    .filter(
      (node) =>
        node &&
        !node.props.disabled &&
        ["checkbox", "radioButton"].includes(node.definitionId || ""),
    )
    .map((node) => ({
      value: String(node.props.value ?? "on"),
      label: String(node.props.label || node.label || node.props.value),
    }));
}
/** Radio groups submit through one stable representative control; array groups own their field. */
export function conditionInputId(source: Node, nodes: Record<string, Node>) {
  return source.definitionId === "radioGroup"
    ? groupChoices(source,nodes).find(node=>!node.props.disabled)?.id
    : source.id;
}
export function conditionSources(target: Node, nodes: Record<string, Node>) {
  const ancestors = path(target, nodes),
    owner = ancestors.at(-1);
  if (owner?.type !== "form") return [];
  const permitted = new Set(
    ancestors
      .slice(1)
      .filter((node) => node.formCondition)
      .map((node) => node.id),
  );
  return Object.values(nodes).filter((node) => {
    const sourcePath = path(node, nodes);
    return (
      (["checkbox", "switch", "radioGroup", "checkboxGroup"].includes(
        node.definitionId || "",
      ) ||
        definitionFor(node)?.tag === "select") &&
      !sourcePath.some(
        (item) =>
          item.id === target.id ||
          item.props.disabled ||
          (item.formCondition && !permitted.has(item.id)),
      ) &&
      !(
        conditionKind(node) === "boolean" &&
        sourcePath
          .slice(1)
          .some((item) => item.definitionId === "checkboxGroup")
      ) &&
      sourcePath.at(-1)?.id === owner.id &&
      (conditionKind(node) === "boolean" ||
        conditionChoices(node, nodes).length > 0)
    );
  });
}
export function validateFormConditions(
  nodes: Record<string, Node>,
  onlyId?: string,
) {
  for (const target of Object.values(nodes).filter(
    (node) =>
      node.formCondition &&
      (onlyId === undefined ||
        node.id === onlyId ||
        path(node, nodes).some((item) => item.id === onlyId)),
  )) {
    const ancestors = path(target, nodes);
    const fullAncestors = [...ancestors];
    let parent = ancestors.at(-1)?.parentId;
    const seenAncestors = new Set(fullAncestors.map(node => node.id));
    while (parent && nodes[parent] && !seenAncestors.has(parent)) {
      seenAncestors.add(parent); fullAncestors.push(nodes[parent]); parent = nodes[parent].parentId;
    }
    if (
      fullAncestors.some(
        (node) =>
          node.type === "repeater" || ("dataSource" in node && node.dataSource),
      )
    )
      throw new Error(
        "Keep conditional forms outside repeaters and live record templates.",
      );
    if (!conditionalGroups.includes(target.definitionId || ""))
      throw new Error("Conditions support native form groups.");
    if (fieldConditions(target, nodes).flatMap(conditionRules).length > 16)
      throw new Error(
        "Use at most sixteen rules across nested conditional sections.",
      );
    const sources = conditionSources(target, nodes),
      rules = conditionRules(target.formCondition!);
    if (rules.length > 8)
      throw new Error("Use at most eight rules per section.");
    for (const rule of rules) {
      const source = sources.find((node) => node.id === rule.sourceId);
      if (rule.value !== undefined && rule.value.length > 1000) throw new Error("Conditional choices must be no more than 1000 characters.");
      if (!source)
        throw new Error(
          "Choose an enabled form choice outside this section, in the same form and an available parent scope.",
        );
      const kind = conditionKind(source);
      if (kind === "boolean") {
        if (
          typeof rule.checked !== "boolean" ||
          rule.operator ||
          rule.value !== undefined
        )
          throw new Error(
            "Checkbox and Switch conditions use checked or unchecked state.",
          );
      } else {
        if (
          !(
            kind === "array" ? ["includes", "excludes"] : ["eq", "ne"]
          ).includes(rule.operator || "") ||
          !conditionChoices(source, nodes).some(
            (choice) => choice.value === rule.value,
          )
        )
          throw new Error(
            "Choose an enabled option and a comparison compatible with this field.",
          );
      }
    }
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
            path(other, nodes).at(-1)?.id === ancestors.at(-1)?.id &&
            !path(other, nodes).some((node) => node.id === target.id),
        )
      )
        throw new Error(
          "Keep same-name radio choices together inside one conditional section.",
        );
      if (
        child.type === "form" ||
        child.type === "custom" ||
        child.type === "repeater" ||
        ((child.type === "button" || child.props.type === "submit") &&
          (child.props.type || "submit") === "submit")
      )
        throw new Error(
          "Keep submit buttons, nested forms, custom components and repeaters outside conditional sections.",
        );
      pending.push(...child.children);
    }
  }
}
export function conditionDefault(
  node: ElementNode,
  nodes: Record<string, ElementNode>,
) {
  if (!node.formCondition) return undefined;
  return fieldConditions(node, nodes).every((condition) => {
    const results = conditionRules(condition).map((rule) => {
      const source = nodes[rule.sourceId];
      if (!source || path(source, nodes).some((item) => item.props.disabled))
        return false;
      const kind = conditionKind(source);
      if (kind === "boolean")
        return Boolean(source.props.checked) === rule.checked;
      const choices = conditionChoices(source, nodes);
      const values =
        definitionFor(source)?.tag === "select"
          ? String(
              kind === "array"
                ? source.props.selectedValues || ""
                : source.props.value ||
                    (!source.props.placeholder ? choices[0]?.value || "" : ""),
            ).split("\n")
          : groupChoices(source,nodes).filter(node=>node.props.checked && !node.props.disabled).map(node=>String(node.props.value ?? "on"));
      const equal = values.includes(rule.value!);
      return rule.operator === "ne" || rule.operator === "excludes"
        ? !equal
        : equal;
    });
    return condition.match === "any"
      ? results.some(Boolean)
      : results.every(Boolean);
  });
}
