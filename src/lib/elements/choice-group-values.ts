import type { ElementNode } from "@/types";
import { validationChoices } from "@/lib/backend/validation";
import { selectionLimits } from "./selection-limits";

type ChoiceNode = Pick<ElementNode, "id" | "type" | "definitionId" | "parentId" | "children" | "props" | "formCondition">;

export function groupChoices<T extends ChoiceNode>(
  group: ChoiceNode,
  nodes: Record<string, T>,
) {
  const checkbox = group.definitionId === "checkboxGroup";
  const choices: T[] = [], seen = new Set<string>();
  const visit = (id: string) => {
    const node = nodes[id];
    if (!node || seen.has(id)) throw new Error("Repair the choice group tree before editing.");
    seen.add(id);
    if (node.definitionId === (checkbox ? "checkbox" : "radioButton") && !node.children.length) choices.push(node);
    else if (["container", "stack", "columns"].includes(node.type) && !node.props.disabled && !node.formCondition) node.children.forEach(visit);
    else if (!["text", "title", "paragraph", "image", "icon", "divider"].includes(node.type) || node.children.length)
      throw new Error(`Use native ${checkbox ? "checkbox" : "radio"} choices, text, images and layout wrappers in this group. Put other controls or conditional sections beside the group.`);
  };
  group.children.forEach(visit);
  return choices;
}

export function choiceGroupOwner<T extends Pick<ElementNode,"id"|"parentId"|"definitionId">>(node: T, nodes: Record<string,T>) {
  let parent = node.parentId;
  const seen = new Set<string>();
  while (parent && !seen.has(parent)) {
    seen.add(parent);
    const current = nodes[parent];
    if (!current) break;
    if (["checkboxGroup","radioGroup"].includes(current.definitionId || "")) return current;
    parent = current.parentId;
  }
}

export function validateCheckboxGroup(
  group: ChoiceNode,
  nodes: Record<string, ChoiceNode>,
) {
  const choices = groupChoices(group, nodes);
  const limits = selectionLimits(group.props);
  if (limits.max !== undefined && choices.filter(choice => choice.props.checked && !choice.props.disabled).length > limits.max)
    throw new Error("Clear selected defaults before reducing the maximum selections.");
  const name = String(group.props.name || "");
  if (!choices.length && !name) return;
  if (
    !/^[A-Za-z][A-Za-z0-9_]{0,79}$/.test(name) ||
    [
      "constructor",
      "prototype",
      "createdAt",
      "updatedAt",
      "deletedAt",
    ].includes(name)
  )
    throw new Error(
      "Checkbox groups need a valid field name. Apply the group field name before saving.",
    );
  if (!choices.length) return;
  const values = choices.map((choice) => String(choice.props.value ?? ""));
  if (values.some((value) => !value.trim() || /[\r\n]/.test(value)))
    throw new Error("Checkbox choices need nonempty, single-line values.");
  validationChoices(values.join("\n"));
  if (
    choices.some(
      (choice) =>
        choice.props.name !== name ||
        choice.props.required ||
        !String(choice.props.label || "").trim() ||
        String(choice.props.label).length > 200 ||
        /[\r\n]/.test(String(choice.props.label)) ||
        (choice.props.disabled && choice.props.checked),
    )
  )
    throw new Error(
      "Apply the checkbox group field name and repair its labels or disabled defaults. Required belongs to the group, rather than individual choices.",
    );
}
