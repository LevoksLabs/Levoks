"use client";
import { useRef, useState } from "react";
import type { ElementNode } from "@/types";
import { useEditorStore } from "@/store/editorStore";
import SelectionLimitsEditor from "./SelectionLimitsEditor";
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
  const [group, setGroup] = useState(choice.group || "");
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
      <label>
        <span>Group (optional)</span>
        <input
          aria-label={`Choice ${index + 1} group`}
          value={group}
          onChange={(e) => setGroup(e.target.value)}
          maxLength={100}
        />
      </label>
      <button
        type="button"
        className="insp-form-add-btn"
        disabled={
          value === choice.value &&
          label === choice.label &&
          group === (choice.group || "")
        }
        onClick={() => onEdit({ ...choice, value, label, group })}
      >
        Apply choice {index + 1}
      </button>
      <label className="select-choice-default">
        <input
          type="checkbox"
          aria-label={`Default: ${choice.value}`}
          checked={selected}
          disabled={choice.disabled || choice.groupDisabled}
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

function AddChoice({
  onAdd,
  disabled,
}: {
  onAdd: (choice: SelectChoice) => boolean;
  disabled: boolean;
}) {
  const [value, setValue] = useState("");
  const [label, setLabel] = useState("");
  const [group, setGroup] = useState("");
  const input = useRef<HTMLInputElement>(null);
  return (
    <>
      <label>
        <span>New submitted value</span>
        <input
          ref={input}
          aria-label="New choice"
          value={value}
          maxLength={10000}
          onChange={(e) => setValue(e.target.value)}
        />
      </label>
      <label>
        <span>Display label (optional)</span>
        <input
          aria-label="New choice label"
          value={label}
          maxLength={200}
          onChange={(e) => setLabel(e.target.value)}
        />
      </label>
      <label>
        <span>Group (optional)</span>
        <input
          aria-label="New choice group"
          value={group}
          maxLength={100}
          onChange={(e) => setGroup(e.target.value)}
        />
      </label>
      <button
        type="button"
        className="insp-form-add-btn"
        disabled={disabled}
        onClick={() => {
          if (onAdd({ value, label: label || value, group, disabled: false })) {
            setValue("");
            setLabel("");
            setGroup("");
            input.current?.focus();
          }
        }}
      >
        Add choice
      </button>
    </>
  );
}

function SelectGroups({
  choices,
  disabled,
  onDisable,
}: {
  choices: SelectChoice[];
  disabled: string[];
  onDisable: (group: string, checked: boolean) => void;
}) {
  const groups = [
    ...new Set(
      choices
        .map((choice) => choice.group)
        .filter((group): group is string => Boolean(group)),
    ),
  ];
  return (
    groups.length > 0 && (
      <fieldset>
        <legend>Option groups</legend>
        <p className="panel-caption">
          Adjacent choices with the same group share a heading. Leave the group
          blank to keep it ungrouped. Disabling a group clears its defaults;
          review connected backend rules.
        </p>
        {groups.map((group) => (
          <label className="select-choice-default" key={group}>
            <input
              type="checkbox"
              aria-label={`Disable group: ${group}`}
              checked={disabled.includes(group)}
              onChange={(e) => onDisable(group, e.target.checked)}
            />
            <span>Disable {group}</span>
          </label>
        ))}
      </fieldset>
    )
  );
}

export default function SelectOptionsEditor({
  element,
}: {
  element: ElementNode;
}) {
  const updateElement = useEditorStore((state) => state.updateElement);
  const [error, setError] = useState("");
  const root = useRef<HTMLDivElement>(null);
  const choices = selectChoices(element.props);
  const disabledGroups = String(element.props.disabledGroups || "")
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
    nextDisabledGroups?: string[],
  ) => {
    try {
      updateElement(element.id, {
        props: selectChoiceProps(
          {
            ...element.props,
            ...(nextDisabledGroups
              ? { disabledGroups: nextDisabledGroups.join("\n") }
              : {}),
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
      if (!rows?.length)
        root.current
          ?.querySelector<HTMLInputElement>('input[aria-label="New choice"]')
          ?.focus();
    });
  return (
    <div className="select-options-editor" ref={root}>
      <h4>Choices and defaults</h4>
      <p className="panel-caption">
        {multiple
          ? "Choose defaults within the maximum selection limit."
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
      {multiple && (
        <SelectionLimitsEditor
          key={`${element.props.minSelections}:${element.props.maxSelections}`}
          element={element}
          apply={(limits) => {
            try {
              validateSelectMetadata({ ...element.props, ...limits });
              updateElement(element.id, { props: limits });
              setError("");
              requestAnimationFrame(() => root.current?.querySelector<HTMLButtonElement>("[data-selection-limits-apply]")?.focus());
              return true;
            } catch (err) { setError((err as Error).message); return false; }
          }}
        />
      )}
      {!choices.length && (
        <p className="panel-caption">No choices yet. Add a choice below.</p>
      )}
      <SelectGroups
        choices={choices}
        disabled={disabledGroups}
        onDisable={(group, checked) =>
          apply(
            choices,
            undefined,
            undefined,
            checked
              ? [...disabledGroups, group]
              : disabledGroups.filter((item) => item !== group),
          )
        }
      />
      <ol className="select-choice-list">
        {choices.map((choice, index) => (
          <ChoiceRow
            key={`${index}:${choice.value}:${choice.label}:${choice.group || ""}`}
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
      <AddChoice
        disabled={choices.length >= 200}
        onAdd={(choice) => apply([...choices, choice])}
      />
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
            element.props.optionGroups,
            element.props.disabledGroups,
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
