import type { ElementNode } from "@/types";
import { validationChoices } from "@/lib/backend/validation";

type ChoiceNode = Pick<ElementNode, "id" | "definitionId" | "children" | "props">;

export function groupChoices<T extends ChoiceNode>(
  group: ChoiceNode,
  nodes: Record<string, T>,
) {
  const checkbox = group.definitionId === "checkboxGroup";
  const choices = group.children.map((id) => nodes[id]);
  if (
    choices.some(
      (node) =>
        !node ||
        node.definitionId !== (checkbox ? "checkbox" : "radioButton") ||
        node.children.length,
    )
  )
    throw new Error(
      `This editor supports direct native ${checkbox ? "checkbox" : "radio"} choices. Edit nested or mixed content individually.`,
    );
  return choices;
}

export function validateCheckboxGroup(
  group: ChoiceNode,
  nodes: Record<string, ChoiceNode>,
) {
  const choices = groupChoices(group, nodes);
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
