"use client";
import { useRef, useState } from "react";
import type { ElementNode } from "@/types";
import { useEditorStore } from "@/store/editorStore";
import { editChoiceGroup } from "@/lib/elements/radio-group";
import { groupChoices } from "@/lib/elements/choice-group-values";
import SelectionLimitsEditor from "./SelectionLimitsEditor";

function ChoiceRow({
  choice,
  index,
  count,
  apply,
  kind,
}: {
  choice: ElementNode;
  index: number;
  count: number;
  kind: "Radio" | "Checkbox";
  apply: (
    edit: Parameters<typeof editChoiceGroup>[1],
    focus?: number,
  ) => boolean;
}) {
  const [label, setLabel] = useState(String(choice.props.label || ""));
  const [value, setValue] = useState(String(choice.props.value ?? "on"));
  return (
    <li className="select-choice-row">
      <label>
        <span>Choice {index + 1} label</span>
        <input
          aria-label={`${kind} choice ${index + 1} label`}
          value={label}
          maxLength={200}
          onChange={(e) => setLabel(e.target.value)}
        />
      </label>
      <label>
        <span>Submitted value</span>
        <input
          aria-label={`${kind} choice ${index + 1} value`}
          value={value}
          maxLength={10000}
          onChange={(e) => setValue(e.target.value)}
        />
      </label>
      <button
        type="button"
        className="insp-form-add-btn"
        disabled={label === choice.props.label && value === choice.props.value}
        onClick={() =>
          apply({ type: "choice", id: choice.id, label, value }, index)
        }
      >
        Apply {kind.toLowerCase()} choice {index + 1}
      </button>
      <label className="select-choice-default">
        <input
          type="checkbox"
          aria-label={`Default ${kind.toLowerCase()} choice: ${choice.props.label}`}
          checked={Boolean(choice.props.checked)}
          disabled={Boolean(choice.props.disabled)}
          onChange={(e) =>
            apply({ type: "default", id: choice.id, checked: e.target.checked })
          }
        />
        <span>Selected by default</span>
      </label>
      <label className="select-choice-default">
        <input
          type="checkbox"
          aria-label={`Disable ${kind.toLowerCase()} choice: ${choice.props.label}`}
          checked={Boolean(choice.props.disabled)}
          onChange={(e) =>
            apply({
              type: "disabled",
              id: choice.id,
              disabled: e.target.checked,
            })
          }
        />
        <span>Disabled</span>
      </label>
      <div className="select-choice-actions">
        <button
          type="button"
          className="insp-form-add-btn"
          aria-label={`Move ${kind.toLowerCase()} choice ${index + 1} up`}
          disabled={index === 0}
          onClick={() =>
            apply({ type: "move", id: choice.id, offset: -1 }, index - 1)
          }
        >
          Up
        </button>
        <button
          type="button"
          className="insp-form-add-btn"
          aria-label={`Move ${kind.toLowerCase()} choice ${index + 1} down`}
          disabled={index === count - 1}
          onClick={() =>
            apply({ type: "move", id: choice.id, offset: 1 }, index + 1)
          }
        >
          Down
        </button>
        <button
          type="button"
          className="insp-form-add-btn"
          aria-label={`Remove ${kind.toLowerCase()} choice ${index + 1}`}
          onClick={() => apply({ type: "remove", id: choice.id }, index)}
        >
          Remove
        </button>
      </div>
    </li>
  );
}

export default function ChoiceGroupEditor({
  element,
}: {
  element: ElementNode;
}) {
  const kind = element.definitionId === "checkboxGroup" ? "Checkbox" : "Radio";
  const lower = kind.toLowerCase();
  const nodes = useEditorStore((state) => state.elementsById);
  const updateElement = useEditorStore((state) => state.updateElement);
  let choices: ElementNode[] = [],
    configError = "";
  try {
    choices = groupChoices(element, nodes);
  } catch (error) {
    configError = (error as Error).message;
  }
  const savedName = String(
    element.props.name || choices[0]?.props.name || `choice_${element.id}`,
  );
  const [nameDraft, setNameDraft] = useState({
      saved: savedName,
      value: savedName,
    }),
    [label, setLabel] = useState(""),
    [value, setValue] = useState(""),
    [error, setError] = useState("");
  const name = nameDraft.saved === savedName ? nameDraft.value : savedName;
  const root = useRef<HTMLDivElement>(null),
    addInput = useRef<HTMLInputElement>(null);
  const required = Boolean(
    element.props.required ?? choices.some((choice) => choice.props.required),
  );
  const apply = (
    edit: Parameters<typeof editChoiceGroup>[1],
    focus?: number,
  ) => {
    try {
      editChoiceGroup(element.id, edit);
      setError("");
      if (edit.type === "limits") requestAnimationFrame(() => root.current?.querySelector<HTMLButtonElement>("[data-selection-limits-apply]")?.focus());
      if (focus !== undefined)
        requestAnimationFrame(() => {
          const rows =
            root.current?.querySelectorAll<HTMLLIElement>(".select-choice-row");
          rows?.[Math.min(focus, rows.length - 1)]
            ?.querySelector("input")
            ?.focus();
          if (!rows?.length) addInput.current?.focus();
        });
      return true;
    } catch (error) {
      setError((error as Error).message);
      return false;
    }
  };
  return (
    <div className="select-options-editor" ref={root}>
      <h4>{kind} choices</h4>
      <p className="panel-caption">
        {kind === "Checkbox"
          ? "Choose several defaults, or leave all unselected. Required asks for at least one choice."
          : "Choose one default, or leave all unselected."}{" "}
        Labels can differ from submitted values. Apply drafts before saving.
        Review connected backend rules after changing choices or Required.
      </p>
      {(error || configError) && (
        <p role="alert" className="property-error">
          {error || configError}
        </p>
      )}
      {!configError && (
        <>
          <label>
            <span>Group question</span>
            <input
              aria-label={`${kind} group question`}
              value={String(element.props.legend || "")}
              maxLength={200}
              onChange={(e) =>
                updateElement(element.id, { props: { legend: e.target.value } })
              }
            />
          </label>
          <label>
            <span>Field name</span>
            <input
              aria-label={`${kind} group field name`}
              value={name}
              maxLength={80}
              onChange={(e) =>
                setNameDraft({ saved: savedName, value: e.target.value })
              }
            />
          </label>
          <button
            type="button"
            className="insp-form-add-btn"
            onClick={() => apply({ type: "group", name, required })}
          >
            Apply {lower} field name
          </button>
          <label className="select-choice-default">
            <input
              aria-label={`${kind} group required`}
              type="checkbox"
              checked={required}
              onChange={(e) =>
                apply({
                  type: "group",
                  name: savedName,
                  required: e.target.checked,
                })
              }
            />
            <span>Required</span>
          </label>
          {!choices.length && (
            <p className="panel-caption">
              No choices yet. Add at least one enabled choice for a working
              field.
            </p>
          )}
          {kind === "Checkbox" && <SelectionLimitsEditor key={`${element.props.minSelections}:${element.props.maxSelections}`} element={element} apply={(limits) => apply({ type: "limits", ...limits })} />}
          <ol className="select-choice-list">
            {choices.map((choice, index) => (
              <ChoiceRow
                key={`${choice.id}:${choice.props.label}:${choice.props.value}`}
                choice={choice}
                index={index}
                count={choices.length}
                apply={apply}
                kind={kind}
              />
            ))}
          </ol>
          <label>
            <span>New choice label</span>
            <input
              ref={addInput}
              aria-label={`New ${lower} choice label`}
              value={label}
              maxLength={200}
              onChange={(e) => setLabel(e.target.value)}
            />
          </label>
          <label>
            <span>New submitted value</span>
            <input
              aria-label={`New ${lower} choice value`}
              value={value}
              maxLength={10000}
              onChange={(e) => setValue(e.target.value)}
            />
          </label>
          <button
            type="button"
            className="insp-form-add-btn"
            disabled={choices.length >= 200}
            onClick={() => {
              if (apply({ type: "add", label, value })) {
                setLabel("");
                setValue("");
                addInput.current?.focus();
              }
            }}
          >
            Add {lower} choice
          </button>
          <p className="panel-caption">
            Up to 200 unique values and 10,000 characters in total.{" "}
            {kind === "Checkbox"
              ? "The group retains its mapping when choices change; disconnect before removing its last enabled choice."
              : "Removing a mapped choice uses another enabled choice from this group; disconnect before removing the last one."}
          </p>
        </>
      )}
    </div>
  );
}
