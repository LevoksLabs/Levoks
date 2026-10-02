import type { SchemaField } from "@/types/backend";

/** Defaults are data, never expressions. Keep saved field text separate from its emitted value. */
export function modelDefault(field: SchemaField): unknown {
  const raw = field.defaultValue;
  if (raw === undefined) return undefined;
  if (field.type === "string") return raw;
  if (field.type === "objectId") {
    if (!/^[a-fA-F0-9]{24}$/.test(raw))
      throw new Error("Use a 24-character hexadecimal ObjectId.");
    return raw;
  }
  if (field.type === "date") {
    if (
      !/^\d{4}-\d{2}-\d{2}(?:T\d{2}:\d{2}:\d{2}(?:\.\d{1,3})?(?:Z|[+-]\d{2}:\d{2}))?$/.test(
        raw,
      ) ||
      !Number.isFinite(Date.parse(raw))
    )
      throw new Error("Use an ISO date or timestamp with a timezone.");
    const date = new Date(raw);
    if (
      new Date(`${raw.slice(0, 10)}T00:00:00Z`).toISOString().slice(0, 10) !==
      raw.slice(0, 10)
    )
      throw new Error("Use a valid calendar date.");
    return date.toISOString();
  }
  let value: unknown;
  try {
    value = JSON.parse(raw);
  } catch {
    throw new Error(`Use valid JSON for a ${field.type} default.`);
  }
  const valid =
    field.type === "array"
      ? Array.isArray(value)
      : field.type === "object"
        ? value !== null && typeof value === "object" && !Array.isArray(value)
        : typeof value === field.type;
  if (!valid) throw new Error(`Default must be a ${field.type}.`);
  function safe(item: unknown, depth = 0): void {
    if (depth > 30) throw new Error("Default nesting is too deep.");
    if (typeof item === "number" && !Number.isFinite(item))
      throw new Error("Default numbers must be finite.");
    if (item && typeof item === "object")
      for (const [key, child] of Object.entries(item)) {
        if (
          !Array.isArray(item) &&
          (!/^[A-Za-z_][A-Za-z0-9_]*$/.test(key) ||
            ["__proto__", "prototype", "constructor"].includes(key))
        )
          throw new Error("Default objects must use safe field names.");
        safe(child, depth + 1);
      }
  }
  safe(value);
  return value;
}
