"use client";
import { useRef, useState } from "react";
import type { ElementNode } from "@/types";
import {
  ELEMENT_REGISTRY,
  canHaveChildren,
  elementTemplate,
  definitionFor,
} from "@/lib/elements/registry";
import { formControls } from "@/lib/form-destination";
import { isFormInput } from "@/lib/contracts";
import { useEditorStore } from "@/store/editorStore";
import { isAncestorOf } from "@/store/editorHelpers";

const choices = [
  "textInput",
  "emailInput",
  "numberInput",
  "phoneInput",
  "urlInput",
  "dateInput",
  "timeInput",
  "dateTimeInput",
  "textarea",
  "select",
  "multiSelect",
  "checkbox",
  "switch",
  "radioButton",
  "radioGroup",
  "checkboxGroup",
  "fileUpload",
  "formField",
];
export default function FormControls({ form }: { form: ElementNode }) {
  const store = useEditorStore(),
    [kind, setKind] = useState("select"),
    [parent, setParent] = useState(form.id),
    [error, setError] = useState(""),
    [moving, setMoving] = useState(""),
    [destination, setDestination] = useState(form.id);
  const moveButtons = useRef<Record<string, HTMLButtonElement | null>>({});
  const descendants = formControls(form.id, store.elementsById, true);
  const groups = descendants.filter(
    (node) =>
      canHaveChildren(node, store.customElements) && node.type !== "custom",
  );
  const controls = descendants.filter(
    (node) => isFormInput(node) || definitionFor(node)?.tag === "fieldset",
  );
  const movingNode = controls.find((node) => node.id === moving);
  const finishMove = () => {
    setMoving("");
    moveButtons.current[moving]?.focus();
  };
  const add = () => {
    const template = elementTemplate(kind)!;
    const owner =
      parent === form.id || groups.some((node) => node.id === parent)
        ? parent
        : form.id;
    const choice = ["checkbox", "switch", "radioButton"].includes(kind);
    const id = store.addElement(
      {
        ...template,
        props: {
          ...template.props,
          ...(!choice && !["formField", "radioGroup", "checkboxGroup"].includes(kind) ? { label: template.label } : {}),
        },
        styles: {
          ...template.styles,
          width: "100%",
          ...(["formField", "radioGroup", "checkboxGroup"].includes(kind) ? { height: "auto" } : {}),
        },
        layout: {
          ...template.layout,
          position: "static",
          x: 0,
          y: 0,
          h: choice
            ? 36
            : ["textarea", "multiSelect"].includes(kind)
              ? 156
              : ["formField", "radioGroup", "checkboxGroup"].includes(kind)
                ? 140
                : 84,
        },
      },
      owner,
    );
    store.selectElement(form.id);
    return id;
  };
  return (
    <div className="form-controls">
      <p className="panel-caption">
        Add controls here and edit any field, including fields inside groups.
        Fields share their visual order with the generated form.
      </p>
      <label>
        New form control
        <select
          aria-label="New form control"
          value={kind}
          onChange={(e) => setKind(e.target.value)}
        >
          {choices.map((id) => (
            <option key={id} value={id}>
              {ELEMENT_REGISTRY[id].name}
            </option>
          ))}
        </select>
      </label>
      <label>
        Add inside
        <select
          aria-label="Add control inside"
          value={groups.some((node) => node.id === parent) ? parent : form.id}
          onChange={(e) => setParent(e.target.value)}
        >
          <option value={form.id}>This form</option>
          {groups.map((node) => (
            <option key={node.id} value={node.id}>
              {node.label || node.id}
            </option>
          ))}
        </select>
      </label>
      <button type="button" onClick={add}>
        Add form control
      </button>
      {error && <p role="alert">{error}</p>}
      {movingNode && (
        <fieldset
          className="form-control-move"
          aria-label="Move existing control"
        >
          <label>
            Move {String(movingNode.props.label || movingNode.label)} into
            <select
              autoFocus
              aria-label={`Move ${movingNode.props.label || movingNode.label} into`}
              value={destination}
              onChange={(event) => setDestination(event.target.value)}
            >
              <option value={form.id}>This form</option>
              {groups
                .filter(
                  (group) =>
                    group.id !== movingNode.id &&
                    !isAncestorOf(store.elementsById, movingNode.id, group.id),
                )
                .map((group) => (
                  <option key={group.id} value={group.id}>
                    {store
                      .getBreadcrumbPath(group.id)
                      .slice(1)
                      .map((item) => item.label || item.id)
                      .join(" › ")}
                  </option>
                ))}
            </select>
          </label>
          <button
            type="button"
            disabled={destination === movingNode.parentId}
            onClick={() => {
              const issue = store.moveElement(
                moving,
                destination,
                store.elementsById[destination]?.children.length || 0,
              );
              setError(issue || "");
              if (!issue) finishMove();
            }}
          >
            Move control
          </button>
          <button type="button" onClick={finishMove}>
            Cancel move
          </button>
        </fieldset>
      )}
      <ul aria-label="Form controls">
        {controls.map((node) => {
          const siblings = store.elementsById[node.parentId!]?.children || [],
            index = siblings.indexOf(node.id);
          const name = String(node.props.label || node.label || node.id);
          const locked = store
            .getBreadcrumbPath(node.id)
            .some((item) => store.elementsById[item.id].layout.locked);
          return (
            <li key={node.id}>
              <span>
                {name}
                <small>
                  {node.parentId !== form.id
                    ? `Inside ${store.elementsById[node.parentId!]?.label || "group"}`
                    : ""}
                  {node.props.disabled ? " · Disabled" : ""}
                </small>
              </span>
              <button
                type="button"
                aria-label={`Edit ${name}`}
                onClick={() => store.selectElement(node.id)}
              >
                Edit
              </button>
              <button
                type="button"
                ref={(button) => {
                  moveButtons.current[node.id] = button;
                }}
                aria-label={`Move ${name} into another group`}
                disabled={locked}
                onClick={() => {
                  setMoving(node.id);
                  setDestination(node.parentId || form.id);
                  setError("");
                }}
              >
                Move
              </button>
              <button
                type="button"
                aria-label={`Move ${name} earlier`}
                disabled={locked || index <= 0}
                onClick={() =>
                  store.reorderElements(node.parentId, index, index - 1)
                }
              >
                ↑
              </button>
              <button
                type="button"
                aria-label={`Move ${name} later`}
                disabled={locked || index < 0 || index >= siblings.length - 1}
                onClick={() =>
                  store.reorderElements(node.parentId, index, index + 1)
                }
              >
                ↓
              </button>
            </li>
          );
        })}
      </ul>
    </div>
  );
}
