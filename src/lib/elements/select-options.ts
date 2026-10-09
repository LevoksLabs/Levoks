import { validationChoices } from "@/lib/backend/validation";

export type SelectChoice = { value: string; label: string; disabled: boolean };

/** Old documents have no label list: their display text remains their value. */
export function selectChoices(props: Record<string, unknown>): SelectChoice[] {
  const labels = props.optionLabels
    ? String(props.optionLabels).split("\n")
    : [];
  const disabled = new Set(
    String(props.disabledValues || "")
      .split("\n")
      .filter(Boolean),
  );
  return String(props.options || "")
    .split("\n")
    .filter(Boolean)
    .map((value, index) => ({
      value,
      label: labels[index] ?? value,
      disabled: disabled.has(value),
    }));
}

/** Validate optional metadata at the import/compiler boundary, including component definitions. */
export function validateSelectMetadata(props: Record<string, unknown>) {
  const choices = selectChoices(props);
  if (props.optionLabels || props.disabledValues) {
    validationChoices(props.options);
    if (choices.some((choice) => !choice.value.trim()))
      throw new Error("Each choice needs a nonempty, single-line value.");
    const selected = props.multiple
      ? String(props.selectedValues || "").split("\n").filter(Boolean)
      : [String(props.value || "")].filter(Boolean);
    if (new Set(selected).size !== selected.length || selected.some(value => !choices.some(choice => choice.value === value)))
      throw new Error("Default selections must be unique and exist in the choices.");
  }
  if (props.optionLabels) {
    const labels = String(props.optionLabels).split("\n");
    if (
      String(props.optionLabels).length > 10000 ||
      labels.length !== choices.length ||
      labels.some(
        (label) => !label.trim() || /[\r\n]/.test(label) || label.length > 200,
      )
    )
      throw new Error(
        "Provide one nonempty display label per choice, at most 200 characters each and 10,000 in total.",
      );
  }
  if (props.disabledValues) {
    const disabled = validationChoices(props.disabledValues);
    if (
      disabled.some(
        (value) => !choices.some((choice) => choice.value === value),
      )
    )
      throw new Error("Disabled values must exist in the choices.");
    const selected = props.multiple
      ? String(props.selectedValues || "")
          .split("\n")
          .filter(Boolean)
      : [String(props.value || "")];
    if (selected.some((value) => disabled.includes(value)))
      throw new Error(
        "A disabled choice cannot be selected by default. Clear its default or enable it.",
      );
  }
}

/** One patch keeps labels, disabled state and defaults attached to their submitted values. */
export function selectChoiceProps(
  props: Record<string, unknown>,
  choices: SelectChoice[],
  rename?: readonly [string, string],
): Record<string, string> {
  const options = choices.map((choice) => choice.value);
  if (options.some((value) => !value.trim() || /[\r\n]/.test(value)))
    throw new Error("Each choice needs a nonempty, single-line value.");
  if (options.length) validationChoices(options.join("\n"));
  if (
    choices.some(
      (choice) =>
        !choice.label.trim() ||
        /[\r\n]/.test(choice.label) ||
        choice.label.length > 200,
    ) ||
    choices.map((choice) => choice.label).join("\n").length > 10000
  )
    throw new Error(
      "Each choice needs a nonempty, single-line display label, at most 200 characters each and 10,000 in total.",
    );
  const enabled = choices
    .filter((choice) => !choice.disabled)
    .map((choice) => choice.value);
  const remap = (value: string) =>
    rename && value === rename[0] ? rename[1] : value;
  const patch = {
    options: options.join("\n"),
    optionLabels: choices.map((choice) => choice.label).join("\n"),
    disabledValues: choices
      .filter((choice) => choice.disabled)
      .map((choice) => choice.value)
      .join("\n"),
  };
  if (props.multiple)
    return {
      ...patch,
      selectedValues: [
        ...new Set(
          String(props.selectedValues || "")
            .split("\n")
            .filter(Boolean)
            .map(remap),
        ),
      ]
        .filter((value) => enabled.includes(value))
        .join("\n"),
    };
  const value = remap(String(props.value || ""));
  return { ...patch, value: enabled.includes(value) ? value : "" };
}

/** Preserve the bulk newline contract and metadata of unchanged or explicitly renamed values. */
export function selectOptionProps(
  props: Record<string, unknown>,
  options: string[],
  rename?: readonly [string, string],
): Record<string, string> {
  if (!props.optionLabels && !props.disabledValues) {
    if (options.some((value) => !value || /[\r\n]/.test(value)))
      throw new Error("Each choice needs a nonempty, single-line value.");
    if (options.length) validationChoices(options.join("\n"));
    const remap = (value: string) =>
      rename && value === rename[0] ? rename[1] : value;
    if (props.multiple)
      return {
        options: options.join("\n"),
        selectedValues: [
          ...new Set(
            String(props.selectedValues || "")
              .split("\n")
              .filter(Boolean)
              .map(remap),
          ),
        ]
          .filter((value) => options.includes(value))
          .join("\n"),
      };
    const value = remap(String(props.value || ""));
    return {
      options: options.join("\n"),
      value: options.includes(value) ? value : "",
    };
  }
  const previous = selectChoices(props);
  const patch = selectChoiceProps(
    props,
    options.map((value) => {
      const old = previous.find(
        (choice) =>
          choice.value === (rename && value === rename[1] ? rename[0] : value),
      );
      return {
        value,
        label: old && props.optionLabels ? old.label : value,
        disabled: old?.disabled || false,
      };
    }),
    rename,
  );
  return patch;
}
