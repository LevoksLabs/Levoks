import { validationChoices } from "@/lib/backend/validation";

/** Keep the existing newline contract; edit choices and their defaults in one history step. */
export function selectOptionProps(
  props: Record<string, unknown>,
  options: string[],
  rename?: readonly [string, string],
): Record<string, string> {
  if (options.some((value) => !value || /[\r\n]/.test(value)))
    throw new Error("Each choice needs a nonempty, single-line value.");
  const joined = options.join("\n");
  if (options.length) validationChoices(joined);
  const remap = (value: string) =>
    rename && value === rename[0] ? rename[1] : value;
  if (props.multiple) {
    const selected = String(props.selectedValues || "")
      .split("\n")
      .filter(Boolean)
      .map(remap);
    return {
      options: joined,
      selectedValues: [...new Set(selected)]
        .filter((value) => options.includes(value))
        .join("\n"),
    };
  }
  const value = remap(String(props.value || ""));
  return { options: joined, value: options.includes(value) ? value : "" };
}
