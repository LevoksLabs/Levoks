import { useEditorStore } from "@/store/editorStore";
import { useRoutingStore } from "@/store/routingStore";
import { projectHistory } from "@/store/projectHistory";
import { validationChoices } from "@/lib/backend/validation";
import { elementTemplate } from "./registry";
import type { ElementNode } from "@/types";

import { groupChoices } from "./choice-group-values";
import { selectionLimits } from "./selection-limits";
export { groupChoices as radioChoices } from "./choice-group-values";

type ChoiceEdit =
  | { type: "group"; name: string; required: boolean }
  | { type: "limits"; minSelections: string; maxSelections: string }
  | { type: "add"; label: string; value: string }
  | { type: "choice"; id: string; label: string; value: string }
  | { type: "remove"; id: string }
  | { type: "move"; id: string; offset: number }
  | { type: "default"; id: string; checked: boolean }
  | { type: "disabled"; id: string; disabled: boolean };

/** Ordinary children and mappings, updated together through existing project history. */
export function editChoiceGroup(groupId: string, edit: ChoiceEdit) {
  const store = useEditorStore.getState(),
    group = store.elementsById[groupId];
  if (
    !group ||
    !["radioGroup", "checkboxGroup"].includes(group.definitionId || "")
  )
    throw new Error("Choose a radio or checkbox group.");
  const checkbox = group.definitionId === "checkboxGroup";
  const choices = groupChoices(group, store.elementsById);
  if (
    [group, ...choices].some((node) =>
      store
        .getBreadcrumbPath(node.id)
        .some((item) => store.elementsById[item.id].layout.locked),
    )
  )
    throw new Error("Unlock this group and its choices before editing them.");
  const name =
    edit.type === "group"
      ? edit.name
      : String(
          group.props.name || choices[0]?.props.name || `choice_${group.id}`,
        );
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
      "Use a unique field name starting with a letter, with up to 80 letters, numbers or underscores.",
    );
  const owner = (node: ElementNode) => {
    const path = store.getBreadcrumbPath(node.id);
    return (
      path.find((item) => item.type === "form")?.id ||
      Object.entries(store.pageElementMap).find(([, roots]) =>
        roots.includes(path[0]?.id),
      )?.[0] ||
      store.activePageId
    );
  };
  if (
    Object.values(store.elementsById).some(
      (node) =>
        !choices.some((choice) => choice.id === node.id) &&
        node.id !== groupId &&
        ["input", "native"].includes(node.type) &&
        node.props.name === name &&
        owner(node) === owner(group),
    )
  )
    throw new Error(
      "Another control in this form or page uses that field name. Choose a different name.",
    );
  const selected =
    "id" in edit ? choices.find((node) => node.id === edit.id) : undefined;
  if ("id" in edit && !selected)
    throw new Error("This choice no longer exists.");
  if (
    (edit.type === "add" || edit.type === "choice") &&
    (!edit.label.trim() || edit.label.length > 200 || /[\r\n]/.test(edit.label))
  )
    throw new Error(
      "Each choice needs a nonempty, single-line label of up to 200 characters.",
    );
  if (edit.type === "add" || edit.type === "choice") {
    const values = choices.map((node) =>
      node.id === ("id" in edit ? edit.id : "")
        ? edit.value
        : String(node.props.value ?? "on"),
    );
    if (edit.type === "add") values.push(edit.value);
    if (values.some((value) => !value.trim() || /[\r\n]/.test(value)))
      throw new Error(
        "Each choice needs a nonempty, single-line submitted value.",
      );
    validationChoices(values.join("\n"));
  }
  if (edit.type === "default" && edit.checked && selected!.props.disabled)
    throw new Error("Enable this choice before selecting it by default.");
  const replacement = choices.find(
    (node) => node.id !== selected?.id && !node.props.disabled,
  );
  const wires = useRoutingStore
    .getState()
    .connections.filter((wire) =>
      wire.requestMappings?.some(
        (mapping) =>
          mapping.source.kind === "element" &&
          mapping.source.elementId === (checkbox ? groupId : selected?.id),
      ),
    );
  if (edit.type === "remove" && wires.length && !replacement)
    throw new Error(
      "Disconnect or remap this field before removing its last enabled choice.",
    );
  const required =
    edit.type === "group"
      ? edit.required
      : Boolean(
          group.props.required ?? choices.some((node) => node.props.required),
        );
  if (edit.type === "limits" && !checkbox) throw new Error("Selection limits belong to checkbox groups.");
  if (checkbox) {
    const limits = selectionLimits({ ...group.props, required, ...(edit.type === "limits" ? edit : {}) });
    const defaults = choices.filter(choice => !choice.props.disabled &&
      (edit.type === "default" && edit.id === choice.id ? edit.checked : choice.props.checked)).length;
    if (limits.max !== undefined && defaults > limits.max)
      throw new Error("Clear selected defaults before exceeding or reducing the maximum selections.");
  }
  return projectHistory.run("editor", () => {
    store.updateElement(groupId, {
      props: { name, required, ...(edit.type === "limits" ? {minSelections: edit.minSelections, maxSelections: edit.maxSelections} : {}) },
      ...(!group.styles.height
        ? {
            styles: {
              height: "auto",
              minHeight: group.styles.minHeight || `${group.layout.h}px`,
            },
          }
        : {}),
    });
    for (const choice of choices)
      store.updateElement(choice.id, {
        props: { name, required: checkbox ? false : required },
      });
    let added: string | undefined;
    if (edit.type === "add") {
      const template = elementTemplate(checkbox ? "checkbox" : "radioButton");
      added = store.addElement(
        {
          ...template,
          props: {
            ...template.props,
            name,
            required: checkbox ? false : required,
            label: edit.label,
            value: edit.value,
          },
          styles: {
            ...template.styles,
            width: "100%",
            height: "auto",
            minHeight: "36px",
          },
          layout: { ...template.layout, position: "static", x: 0, y: 0, h: 36 },
        },
        groupId,
      );
    } else if (edit.type === "choice")
      store.updateElement(edit.id, {
        props: { label: edit.label, value: edit.value },
      });
    else if (edit.type === "default")
      store.updateElement(edit.id, { props: { checked: edit.checked } });
    else if (edit.type === "disabled")
      store.updateElement(edit.id, {
        props: {
          disabled: edit.disabled,
          ...(edit.disabled ? { checked: false } : {}),
        },
      });
    else if (edit.type === "move") {
      const index = choices.findIndex(choice=>choice.id === edit.id),
        next = index + edit.offset;
      if (next < 0 || next >= choices.length)
        throw new Error("Choose a position inside this group.");
      const source = store.elementsById[edit.id], target = choices[next];
      if (source.parentId === target.parentId) {
        const siblings = store.elementsById[source.parentId!].children;
        store.reorderElements(source.parentId!,siblings.indexOf(source.id),siblings.indexOf(target.id));
      } else {
        const siblings = store.elementsById[target.parentId!].children;
        const issue = store.moveElement(source.id,target.parentId,siblings.indexOf(target.id)+(edit.offset>0 ? 1 : 0));
        if (issue) throw new Error(issue);
      }
    } else if (edit.type === "remove") {
      for (const wire of checkbox ? [] : wires)
        useRoutingStore.getState().updateConnection(wire.id, {
          requestMappings: wire.requestMappings!.map((mapping) =>
            mapping.source.kind === "element" &&
            mapping.source.elementId === edit.id
              ? {
                  ...mapping,
                  source: { ...mapping.source, elementId: replacement!.id },
                }
              : mapping,
          ),
        });
      store.deleteElement(edit.id);
    }
    store.selectElement(groupId);
    return added;
  });
}

export const editRadioGroup = editChoiceGroup;
