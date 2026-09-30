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
      .filter(([, value]) => value !== "")
      .sort(([a], [b]) => {
        const rank = (key: string) => {
          const i = shorthand.indexOf(key);
          return i < 0 ? shorthand.length : i;
        };
        return rank(a) - rank(b);
      }),
  );
}
