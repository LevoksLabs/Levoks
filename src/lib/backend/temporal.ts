export type TemporalKind = "date" | "time" | "datetime-local";
export interface TemporalLimits {
  min?: string;
  max?: string;
  step?: string;
  /** Initial value supplies the native step base when there is no minimum. */
  base?: string;
}

export function isTemporalKind(kind: string): kind is TemporalKind {
  return ["date", "time", "datetime-local"].includes(kind);
}

const datePattern = "^(\\d{4,6})-(\\d{2})-(\\d{2})$";
const timePattern = "^(\\d{2}):(\\d{2})(?::(\\d{2})(?:\\.(\\d{1,3}))?)?$";

/** UTC is only an arithmetic coordinate here; local strings never acquire a timezone. */
export function temporalNumber(kind: TemporalKind, value: unknown): number {
  if (typeof value !== "string" || value.length > 40) return NaN;
  const parts = kind === "datetime-local" ? value.split(/[T ]/) : [value];
  if (parts.length !== (kind === "datetime-local" ? 2 : 1)) return NaN;
  let result = 0;
  if (kind !== "time") {
    const match = parts[0].match(new RegExp(datePattern));
    if (!match || match[0] !== parts[0]) return NaN;
    const [, year, month, day] = match.map(Number);
    const date = new Date(0);
    date.setUTCFullYear(year, month - 1, day);
    if (
      year < 1 ||
      date.getUTCFullYear() !== year ||
      date.getUTCMonth() !== month - 1 ||
      date.getUTCDate() !== day
    )
      return NaN;
    result = date.getTime();
  }
  if (kind !== "date") {
    const match = parts.at(-1)!.match(new RegExp(timePattern));
    if (
      !match ||
      match[0] !== parts.at(-1) ||
      Number(match[1]) > 23 ||
      Number(match[2]) > 59 ||
      Number(match[3] || 0) > 59
    )
      return NaN;
    result +=
      Number(match[1]) * 3600000 +
      Number(match[2]) * 60000 +
      Number(match[3] || 0) * 1000 +
      Number((match[4] || "").padEnd(3, "0"));
  }
  return result;
}

export function temporalConfigError(
  kind: TemporalKind,
  limits: TemporalLimits = {},
): string {
  for (const key of ["min", "max", "base"] as const) {
    if (limits[key] && !Number.isFinite(temporalNumber(kind, limits[key])))
      return `Enter a valid ${kind} ${key === "base" ? "initial value" : key}.`;
  }
  if (
    kind !== "time" &&
    limits.min &&
    limits.max &&
    temporalNumber(kind, limits.min) > temporalNumber(kind, limits.max)
  )
    return "The maximum must be on or after the minimum.";
  const step = limits.step;
  if (
    step &&
    step.toLowerCase() !== "any" &&
    (!/^(?:\d+(?:\.\d+)?|\.\d+)(?:e[+-]?\d+)?$/i.test(step) || step.trim() !== step ||
      !Number.isFinite(Number(step) * (kind === "date" ? 86400000 : 1000)) ||
      Number(step) <= 0 ||
      Number(step) * (kind === "date" ? 86400000 : 1000) < 1)
  )
    return "Step must be a positive interval of at least one millisecond, or any.";
  return "";
}

/** Keep parsing identical in editor and standalone exports; parity is covered against native inputs. */
export const TEMPORAL_RUNTIME = String.raw`
function temporalNumber(kind, value) {
  if (typeof value !== 'string' || value.length > 40) return NaN;
  const parts = kind === 'datetime-local' ? value.split(/[T ]/) : [value];
  if (parts.length !== (kind === 'datetime-local' ? 2 : 1)) return NaN;
  let result = 0;
  if (kind !== 'time') {
    const match = parts[0].match(new RegExp(${JSON.stringify(datePattern)}));
    if (!match || match[0] !== parts[0]) return NaN;
    const [, year, month, day] = match.map(Number);
    const date = new Date(0);
    date.setUTCFullYear(year, month - 1, day);
    if (year < 1 || date.getUTCFullYear() !== year || date.getUTCMonth() !== month - 1 || date.getUTCDate() !== day) return NaN;
    result = date.getTime();
  }
  if (kind !== 'date') {
    const match = parts.at(-1).match(new RegExp(${JSON.stringify(timePattern)}));
    if (!match || match[0] !== parts.at(-1) || Number(match[1]) > 23 || Number(match[2]) > 59 || Number(match[3] || 0) > 59) return NaN;
    result += Number(match[1]) * 3600000 + Number(match[2]) * 60000 + Number(match[3] || 0) * 1000 + Number((match[4] || '').padEnd(3, '0'));
  }
  return result;
}
function temporalRuleValid(rule, value) {
  if (value === '') return true;
  const number = temporalNumber(rule.type, value);
  if (!Number.isFinite(number)) return false;
  const limits = rule.temporal || {};
  const min = temporalNumber(rule.type, limits.min), max = temporalNumber(rule.type, limits.max);
  if (rule.type === 'time' && min > max) {
    if (number > max && number < min) return false;
  } else if ((Number.isFinite(min) && number < min) || (Number.isFinite(max) && number > max)) return false;
  if ((limits.step || '').toLowerCase() === 'any') return true;
  const step = Number(limits.step || (rule.type === 'date' ? 1 : 60)) * (rule.type === 'date' ? 86400000 : 1000);
  const initial = temporalNumber(rule.type, limits.base);
  const base = Number.isFinite(min) ? min : Number.isFinite(initial) ? initial : 0;
  const difference = number - base;
  return Math.abs(difference - Math.round(difference / step) * step) < 0.00001;
}
`;
