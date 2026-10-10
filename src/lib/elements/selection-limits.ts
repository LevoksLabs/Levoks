/** Blank bounds preserve existing multiple-choice fields; Required raises the minimum to one. */
export function selectionCount(value: unknown): number | undefined {
  if (value === undefined || value === "") return undefined;
  if (
    (typeof value !== "number" && typeof value !== "string") ||
    !/^\d+$/.test(String(value)) ||
    !Number.isSafeInteger(Number(value)) ||
    Number(value) > 200
  )
    throw new Error(
      "Selection limits must be whole numbers from 0 to 200, or blank.",
    );
  return Number(value);
}

export function selectionLimits(props: Record<string, unknown>) {
  const min = Math.max(
    selectionCount(props.minSelections) ?? 0,
    props.required ? 1 : 0,
  );
  const max = selectionCount(props.maxSelections);
  if (max !== undefined && min > max)
    throw new Error(
      "Maximum selections must be at least the minimum (including Required).",
    );
  return { min, max };
}

export function selectionHelp({
  min,
  max,
}: ReturnType<typeof selectionLimits>) {
  if (max === min && min > 0)
    return `Select exactly ${min} ${min === 1 ? "option" : "options"}.`;
  if (min > 0 && max !== undefined) return `Select ${min}–${max} options.`;
  if (max !== undefined)
    return `Select at most ${max} ${max === 1 ? "option" : "options"}.`;
  return min > 0
    ? `Select at least ${min === 1 ? "one option" : `${min} options`}.`
    : "";
}
