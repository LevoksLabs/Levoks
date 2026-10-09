"use client";
import { useRef, useState } from "react";
import type { ElementNode } from "@/types";
import { useEditorStore } from "@/store/editorStore";
import { editRadioGroup, radioChoices } from "@/lib/elements/radio-group";

function RadioRow({
  choice,
  index,
  count,
  apply,
}: {
  choice: ElementNode;
  index: number;
  count: number;
  apply: (
    edit: Parameters<typeof editRadioGroup>[1],
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
          aria-label={`Radio choice ${index + 1} label`}
          value={label}
          maxLength={200}
          onChange={(e) => setLabel(e.target.value)}
        />
      </label>
      <label>
        <span>Submitted value</span>
        <input
          aria-label={`Radio choice ${index + 1} value`}
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
        Apply radio choice {index + 1}
      </button>
      <label className="select-choice-default">
        <input
          type="checkbox"
          aria-label={`Default radio choice: ${choice.props.label}`}
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
          aria-label={`Disable radio choice: ${choice.props.label}`}
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
          aria-label={`Move radio choice ${index + 1} up`}
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
          aria-label={`Move radio choice ${index + 1} down`}
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
          aria-label={`Remove radio choice ${index + 1}`}
          onClick={() => apply({ type: "remove", id: choice.id }, index)}
        >
          Remove
        </button>
      </div>
    </li>
  );
}

export default function RadioGroupEditor({
  element,
}: {
  element: ElementNode;
}) {
  const nodes = useEditorStore((state) => state.elementsById);
  const updateElement = useEditorStore((state) => state.updateElement);
  let choices: ElementNode[] = [],
    configError = "";
  try {
    choices = radioChoices(element, nodes);
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
    edit: Parameters<typeof editRadioGroup>[1],
    focus?: number,
  ) => {
    try {
      editRadioGroup(element.id, edit);
      setError("");
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
      <h4>Radio choices</h4>
      <p className="panel-caption">
        Choose one default, or leave all unselected. Labels can differ from
        submitted values. Apply drafts before saving. Review connected backend
        rules after changing choices or Required.
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
              aria-label="Radio group question"
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
              aria-label="Radio group field name"
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
            Apply radio field name
          </button>
          <label className="select-choice-default">
            <input
              aria-label="Radio group required"
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
          <ol className="select-choice-list">
            {choices.map((choice, index) => (
              <RadioRow
                key={`${choice.id}:${choice.props.label}:${choice.props.value}`}
                choice={choice}
                index={index}
                count={choices.length}
                apply={apply}
              />
            ))}
          </ol>
          <label>
            <span>New choice label</span>
            <input
              ref={addInput}
              aria-label="New radio choice label"
              value={label}
              maxLength={200}
              onChange={(e) => setLabel(e.target.value)}
            />
          </label>
          <label>
            <span>New submitted value</span>
            <input
              aria-label="New radio choice value"
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
            Add radio choice
          </button>
          <p className="panel-caption">
            Up to 200 unique values and 10,000 characters in total. Removing a
            mapped choice uses another enabled choice from this group;
            disconnect before removing the last one.
          </p>
        </>
      )}
    </div>
  );
}
