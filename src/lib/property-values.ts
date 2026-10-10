/** Structured editing values; CSS is the version-1 project's serialization boundary. */
export type Measurement = { value: number; unit: string };
export function measurement(
  value: string | number,
  fallbackUnit = "px",
): Measurement | null {
  const match = String(value)
    .trim()
    .match(/^(-?(?:\d+\.?\d*|\.\d+))(px|%|rem|em|vw|vh|fr|deg|ms|s)?$/);
  return match
    ? {
        value: Number(match[1]),
        unit: match[2] ?? (typeof value === "number" ? fallbackUnit : ""),
      }
    : null;
}
export const serializeMeasurement = ({ value, unit }: Measurement) =>
  `${Number(value.toFixed(4))}${unit}`;

/** Shorthands precede local longhands in React and generated CSS alike. */
export function orderedStyles(styles: Record<string, string | number>) {
  const shorthand = [
    "background",
    "border",
    "borderWidth",
    "borderStyle",
    "borderColor",
    "borderRadius",
    "padding",
    "margin",
    "font",
  ];
  return Object.fromEntries(
    Object.entries(styles)
      .filter(([key, value]) => value !== "" && !(key === "background" && value === styles.backgroundColor))
      .sort(([a], [b]) => {
        const rank = (key: string) => {
          const i = shorthand.indexOf(key);
          return i < 0 ? shorthand.length : i;
        };
        return rank(a) - rank(b);
      }),
  );
}

// The editor has a selection wrapper; exported elements do not. Keep external
// layout on that wrapper, and visual/content styles on the semantic element.
const boxProperties = /^(?:opacity|transform|transformOrigin|transformStyle|perspective|perspectiveOrigin|backfaceVisibility|width|height|minWidth|maxWidth|minHeight|maxHeight|margin(?:Top|Right|Bottom|Left)?|position|top|right|bottom|left|inset|zIndex|order|flex(?:Basis|Grow|Shrink)?|alignSelf|justifySelf|grid(?:Area|Column(?:Start|End)?|Row(?:Start|End)?)|display)$/;
export function semanticStyleParts(styles: Record<string, string | number>) {
  const box: Record<string, string | number> = {};
  const surface: Record<string, string | number> = {};
  for (const [key, value] of Object.entries(orderedStyles(styles))) {
    // display controls both participation in parent layout and child layout.
    if (boxProperties.test(key)) box[key] = value;
    if (!boxProperties.test(key) || key === "display") surface[key] = value;
  }
  return { box, surface };
}
