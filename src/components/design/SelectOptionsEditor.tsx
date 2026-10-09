"use client";
import { useRef, useState } from "react";
import type { ElementNode } from "@/types";
import { useEditorStore } from "@/store/editorStore";
import {
  selectChoiceProps,
  selectChoices,
  selectOptionProps,
  validateSelectMetadata,
  type SelectChoice,
} from "@/lib/elements/select-options";

function ChoiceRow({
  choice,
  index,
  count,
  selected,
  onEdit,
  onMove,
  onRemove,
  onDefault,
}: {
  choice: SelectChoice;
  index: number;
  count: number;
  selected: boolean;
  onEdit: (choice: SelectChoice) => void;
  onMove: (offset: number) => void;
  onRemove: () => void;
  onDefault: (checked: boolean) => void;
}) {
  const [value, setValue] = useState(choice.value);
  const [label, setLabel] = useState(choice.label);
  return (
    <li className="select-choice-row">
      <label>
        <span>Choice {index + 1} submitted value</span>
        <input
          aria-label={`Choice ${index + 1} value`}
          value={value}
          onChange={(e) => setValue(e.target.value)}
          maxLength={10000}
        />
      </label>
      <label>
        <span>Display label</span>
        <input
          aria-label={`Choice ${index + 1} label`}
          value={label}
          onChange={(e) => setLabel(e.target.value)}
          maxLength={200}
        />
      </label>
      <button
        type="button"
        className="insp-form-add-btn"
        disabled={value === choice.value && label === choice.label}
        onClick={() => onEdit({ ...choice, value, label })}
      >
        Apply choice {index + 1}
      </button>
      <label className="select-choice-default">
        <input
          type="checkbox"
          aria-label={`Default: ${choice.value}`}
          checked={selected}
          disabled={choice.disabled}
          onChange={(e) => onDefault(e.target.checked)}
        />
        <span>Selected by default</span>
      </label>
      <label className="select-choice-default">
        <input
          type="checkbox"
          aria-label={`Disable choice: ${choice.value}`}
          checked={choice.disabled}
          onChange={(e) => onEdit({ ...choice, disabled: e.target.checked })}
        />
        <span>Disabled</span>
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

function TextLists({
  element,
  apply,
}: {
  element: ElementNode;
  apply: (patch: Record<string, string>) => void;
}) {
  const [options, setOptions] = useState(String(element.props.options || ""));
  const multiple = Boolean(element.props.multiple);
  const [defaults, setDefaults] = useState(
    String(element.props[multiple ? "selectedValues" : "value"] || ""),
  );
  const [error, setError] = useState("");
  return (
    <>
      <p className="panel-caption">
        One submitted value per line. Apply lists before saving. Unchanged
        values retain their labels and disabled state; new values use their text
        as the label.
      </p>
      <label>
        <span>Options</span>
        <textarea
          aria-label="Options"
          rows={3}
          value={options}
          onChange={(e) => setOptions(e.target.value)}
        />
      </label>
      <label>
        <span>{multiple ? "Selected Values" : "Value"}</span>
        {multiple ? (
          <textarea
            aria-label="Selected Values"
            rows={3}
            value={defaults}
            onChange={(e) => setDefaults(e.target.value)}
          />
        ) : (
          <input
            aria-label="Value"
            value={defaults}
            onChange={(e) => setDefaults(e.target.value)}
          />
        )}
      </label>
      {error && (
        <p role="alert" className="property-error">
          {error}
        </p>
      )}
      <button
        type="button"
        className="insp-form-add-btn"
        onClick={() => {
          try {
            const patch = selectOptionProps(
              {
                ...element.props,
                [multiple ? "selectedValues" : "value"]: defaults,
              },
              options.split("\n").filter(Boolean),
            );
            // Reject invalid drafts rather than silently dropping a requested default.
            const candidate = {
              ...element.props,
              ...patch,
              [multiple ? "selectedValues" : "value"]: defaults,
            };
            validateSelectMetadata(candidate);
            const values = defaults.split("\n").filter(Boolean);
            if (
              new Set(values).size !== values.length ||
              values.some(
                (value) =>
                  !selectChoices(candidate).some(
                    (choice) => choice.value === value,
                  ),
              )
            )
              throw new Error(
                "Default selections must be unique and exist in the choices.",
              );
            apply({
              ...patch,
              [multiple ? "selectedValues" : "value"]: defaults,
            });
            setError("");
          } catch (err) {
            setError((err as Error).message);
          }
        }}
      >
        Apply text lists
      </button>
    </>
  );
}

export default function SelectOptionsEditor({
  element,
}: {
  element: ElementNode;
}) {
  const updateElement = useEditorStore((state) => state.updateElement);
  const [newValue, setNewValue] = useState("");
  const [newLabel, setNewLabel] = useState("");
  const [error, setError] = useState("");
  const addInput = useRef<HTMLInputElement>(null);
  const root = useRef<HTMLDivElement>(null);
  const choices = selectChoices(element.props);
  const multiple = Boolean(element.props.multiple);
  const selected = multiple
    ? String(element.props.selectedValues || "")
        .split("\n")
        .filter(Boolean)
    : [String(element.props.value || "")].filter(Boolean);
  let configError = "";
  try {
    selectOptionProps(
      element.props,
      choices.map((choice) => choice.value),
    );
    validateSelectMetadata(element.props);
    if (
      new Set(selected).size !== selected.length ||
      selected.some(
        (value) => !choices.some((choice) => choice.value === value),
      )
    )
      configError =
        "Default selections must be unique and exist in the choices. Choose a default below or repair the text lists.";
  } catch (err) {
    configError = (err as Error).message;
  }
  const apply = (
    next: SelectChoice[],
    rename?: readonly [string, string],
    defaults?: string[],
  ) => {
    try {
      updateElement(element.id, {
        props: selectChoiceProps(
          {
            ...element.props,
            ...(defaults
              ? { [multiple ? "selectedValues" : "value"]: defaults.join("\n") }
              : {}),
          },
          next,
          rename,
        ),
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
        Display labels can differ from submitted values. Apply drafts before
        saving. Removing or disabling a choice clears its default. Review
        connected backend rules after changing values or disabled choices.
      </p>
      {(error || configError) && (
        <p role="alert" className="property-error">
          {error || configError}
        </p>
      )}
      {!choices.length && (
        <p className="panel-caption">No choices yet. Add a choice below.</p>
      )}
      <ol className="select-choice-list">
        {choices.map((choice, index) => (
          <ChoiceRow
            key={`${index}:${choice.value}:${choice.label}`}
            choice={choice}
            index={index}
            count={choices.length}
            selected={selected.includes(choice.value)}
            onEdit={(nextChoice) => {
              const next = [...choices];
              next[index] = nextChoice;
              if (apply(next, [choice.value, nextChoice.value]))
                focusChoice(index);
            }}
            onMove={(offset) => {
              const next = [...choices];
              [next[index], next[index + offset]] = [
                next[index + offset],
                next[index],
              ];
              if (apply(next)) focusChoice(index + offset);
            }}
            onRemove={() => {
              if (apply(choices.filter((_, i) => i !== index)))
                focusChoice(index);
            }}
            onDefault={(checked) =>
              apply(
                choices,
                undefined,
                checked
                  ? multiple
                    ? [...new Set([...selected, choice.value])]
                    : [choice.value]
                  : selected.filter((value) => value !== choice.value),
              )
            }
          />
        ))}
      </ol>
      <label>
        <span>New submitted value</span>
        <input
          ref={addInput}
          aria-label="New choice"
          value={newValue}
          maxLength={10000}
          onChange={(e) => setNewValue(e.target.value)}
        />
      </label>
      <label>
        <span>Display label (optional)</span>
        <input
          aria-label="New choice label"
          value={newLabel}
          maxLength={200}
          onChange={(e) => setNewLabel(e.target.value)}
        />
      </label>
      <button
        type="button"
        className="insp-form-add-btn"
        disabled={choices.length >= 200}
        onClick={() => {
          if (
            apply([
              ...choices,
              { value: newValue, label: newLabel || newValue, disabled: false },
            ])
          ) {
            setNewValue("");
            setNewLabel("");
            addInput.current?.focus();
          }
        }}
      >
        Add choice
      </button>
      <p className="panel-caption">
        Up to 200 unique submitted values and 10,000 characters per list. Labels
        are at most 200 characters each.
      </p>
      <details>
        <summary>Edit lists as text</summary>
        <TextLists
          key={JSON.stringify([
            element.props.options,
            element.props.value,
            element.props.selectedValues,
            element.props.optionLabels,
            element.props.disabledValues,
          ])}
          element={element}
          apply={(patch) => {
            updateElement(element.id, { props: patch });
            setError("");
          }}
        />
      </details>
    </div>
  );
}
