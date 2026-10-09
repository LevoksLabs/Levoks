"use client";
import { useRef, useState } from "react";
import type { ElementNode } from "@/types";
import { useEditorStore } from "@/store/editorStore";
import { selectOptionProps } from "@/lib/elements/select-options";

function ChoiceRow({
  value,
  index,
  count,
  selected,
  onRename,
  onMove,
  onRemove,
  onDefault,
}: {
  value: string;
  index: number;
  count: number;
  selected: boolean;
  onRename: (value: string) => void;
  onMove: (offset: number) => void;
  onRemove: () => void;
  onDefault: (checked: boolean) => void;
}) {
  const [draft, setDraft] = useState(value);
  return (
    <li className="select-choice-row">
      <label>
        <span>Choice {index + 1}</span>
        <input
          aria-label={`Choice ${index + 1} value`}
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          maxLength={10000}
        />
      </label>
      <button
        type="button"
        className="insp-form-add-btn"
        disabled={draft === value}
        onClick={() => onRename(draft)}
      >
        Apply choice {index + 1}
      </button>
      <label className="select-choice-default">
        <input
          type="checkbox"
          aria-label={`Default: ${value}`}
          checked={selected}
          onChange={(e) => onDefault(e.target.checked)}
        />
        <span>Selected by default</span>
      </label>
      <div className="select-choice-actions">
        <button
          type="button"
          className="insp-form-add-btn"
          aria-label={`Move choice ${index + 1} up`}
          disabled={index === 0}
          onClick={() => onMove(-1)}
        >
          Up
        </button>
        <button
          type="button"
          className="insp-form-add-btn"
          aria-label={`Move choice ${index + 1} down`}
          disabled={index === count - 1}
          onClick={() => onMove(1)}
        >
          Down
        </button>
        <button
          type="button"
          className="insp-form-add-btn"
          aria-label={`Remove choice ${index + 1}`}
          onClick={onRemove}
        >
          Remove
        </button>
      </div>
    </li>
  );
}

export default function SelectOptionsEditor({
  element,
}: {
  element: ElementNode;
}) {
  const updateElement = useEditorStore((state) => state.updateElement);
  const [newValue, setNewValue] = useState("");
  const [error, setError] = useState("");
  const addInput = useRef<HTMLInputElement>(null);
  const root = useRef<HTMLDivElement>(null);
  const options = String(element.props.options || "")
    .split("\n")
    .filter(Boolean);
  const multiple = Boolean(element.props.multiple);
  const selected = multiple
    ? String(element.props.selectedValues || "")
        .split("\n")
        .filter(Boolean)
    : [String(element.props.value || "")].filter(Boolean);
  let configError = "";
  try {
    selectOptionProps(element.props, options);
    if (
      new Set(selected).size !== selected.length ||
      selected.some((value) => !options.includes(value))
    )
      configError =
        "Default selections must be unique and exist in the choices. Choose a default below or repair the text lists.";
  } catch (err) {
    configError = (err as Error).message;
  }
  const apply = (next: string[], rename?: readonly [string, string]) => {
    try {
      updateElement(element.id, {
        props: selectOptionProps(element.props, next, rename),
      });
      setError("");
      return true;
    } catch (err) {
      setError((err as Error).message);
      return false;
    }
  };
  const focusChoice = (index: number) =>
    requestAnimationFrame(() => {
      const rows =
        root.current?.querySelectorAll<HTMLLIElement>(".select-choice-row");
      rows?.[Math.min(index, rows.length - 1)]?.querySelector("input")?.focus();
      if (!rows?.length) addInput.current?.focus();
    });
  return (
    <div className="select-options-editor" ref={root}>
      <h4>Choices and defaults</h4>
      <p className="panel-caption">
        {multiple
          ? "Select any number of defaults."
          : "Select one default, or leave all unselected to show the placeholder."}{" "}
        Apply each rename before saving. Renaming a choice updates its default. Removing it clears that default.
        Review connected backend rules after changing choices.
      </p>
      {(error || configError) && (
        <p role="alert" className="property-error">
          {error || configError}
        </p>
      )}
      {!options.length && (
        <p className="panel-caption">No choices yet. Add a choice below.</p>
      )}
      <ol className="select-choice-list">
        {options.map((value, index) => (
          <ChoiceRow
            key={`${index}:${value}`}
            value={value}
            index={index}
            count={options.length}
            selected={selected.includes(value)}
            onRename={(value) => {
              const next = [...options];
              next[index] = value;
              if (apply(next, [options[index], value])) focusChoice(index);
            }}
            onMove={(offset) => {
              const next = [...options];
              [next[index], next[index + offset]] = [
                next[index + offset],
                next[index],
              ];
              if (apply(next)) focusChoice(index + offset);
            }}
            onRemove={() => {
              if (apply(options.filter((_, i) => i !== index)))
                focusChoice(index);
            }}
            onDefault={(checked) => {
              const defaults = checked
                ? multiple
                  ? [...new Set([...selected, value])]
                  : [value]
                : selected.filter((item) => item !== value);
              updateElement(element.id, {
                props: multiple
                  ? {
                      selectedValues: defaults
                        .filter((item) => options.includes(item))
                        .join("\n"),
                    }
                  : { value: defaults[0] || "" },
              });
              setError("");
            }}
          />
        ))}
      </ol>
      <label>
        <span>New choice</span>
        <input
          ref={addInput}
          aria-label="New choice"
          value={newValue}
          maxLength={10000}
          onChange={(e) => setNewValue(e.target.value)}
        />
      </label>
      <button
        type="button"
        className="insp-form-add-btn"
        disabled={options.length >= 200}
        onClick={() => {
          if (apply([...options, newValue])) {
            setNewValue("");
            addInput.current?.focus();
          }
        }}
      >
        Add choice
      </button>
      <p className="panel-caption">
        Up to 200 unique choices and 10,000 characters in total. Choice text is
        also the submitted value.
      </p>
      <details>
        <summary>Edit lists as text</summary>
        <label>
          <span>Options</span>
          <textarea
            aria-label="Options"
            rows={3}
            value={String(element.props.options || "")}
            onChange={(e) => {
              updateElement(element.id, { props: { options: e.target.value } });
              setError("");
            }}
          />
        </label>
        <label>
          <span>{multiple ? "Selected Values" : "Value"}</span>
          {multiple ? (
            <textarea
              aria-label="Selected Values"
              rows={3}
              value={String(element.props.selectedValues || "")}
              onChange={(e) =>
                updateElement(element.id, {
                  props: { selectedValues: e.target.value },
                })
              }
            />
          ) : (
            <input
              aria-label="Value"
              value={String(element.props.value || "")}
              onChange={(e) =>
                updateElement(element.id, { props: { value: e.target.value } })
              }
            />
          )}
        </label>
      </details>
    </div>
  );
}

