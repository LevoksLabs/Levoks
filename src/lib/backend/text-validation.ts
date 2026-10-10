import { maskPattern, TEXT_MASK_RUNTIME } from "./text-mask";
/** Native formats and bounded masks never execute authored regular expressions. */
export const textFormats = [
  { label: "Any text", pattern: "" },
  { label: "Numbers only", pattern: "[0-9]+" },
  { label: "Letters only", pattern: "[\\p{L}]+" },
  { label: "Letters and numbers", pattern: "[\\p{L}\\p{N}]+" },
  { label: "Lowercase slug", pattern: "[a-z0-9]+(?:-[a-z0-9]+)*" },
] as const;

export interface TextLimits {
  minLength?: number;
  maxLength?: number;
  pattern?: string;
  mask?: string;
}

export function isTextInput(kind: string) {
  return [
    "text",
    "email",
    "url",
    "search",
    "tel",
    "textarea",
    "password",
  ].includes(kind);
}

export function textConfigError(limits: TextLimits = {}): string {
  for (const key of ["minLength", "maxLength"] as const) {
    const length = limits[key];
    if (
      length !== undefined &&
      (!Number.isInteger(length) || length < 0 || length > 10000)
    )
      return "Text lengths must be whole numbers from 0 to 10,000.";
  }
  if (
    limits.minLength !== undefined &&
    limits.maxLength !== undefined &&
    limits.minLength > limits.maxLength
  )
    return "Maximum text length must be at least the minimum.";
  if (
    limits.pattern &&
    !textFormats.some((format) => format.pattern === limits.pattern)
  )
    return "Choose a supported text format for guided storage. Custom patterns require a reviewed validation workflow.";
  if (limits.mask !== undefined) {
    if (limits.pattern) return "Choose either a preset format or a custom mask.";
    try { maskPattern(limits.mask); } catch (error) { return (error as Error).message; }
  }
  return "";
}

export function textLimits(props: Record<string, unknown>): TextLimits {
  const length = (value: unknown) => {
    if (value === undefined || value === "") return undefined;
    if (typeof value === "number") return value;
    return typeof value === "string" && value.match(/^[0-9]+$/)?.[0] === value
      ? Number(value)
      : NaN;
  };
  return {
    minLength: length(props.minLength),
    maxLength: length(props.maxLength),
    pattern: String(props.pattern || ""),
    ...(props.formatMask ? {mask: String(props.formatMask)} : {}),
  };
}

export const URL_VALIDATION_RUNTIME = String.raw`
function urlRuleValid(value) {
  if (typeof value !== 'string' || value.length > 10000) return false;
  if (value === '') return true;
  if (/[\r\n]/.test(value) || value.replace(/^[\t\n\f\r ]+|[\t\n\f\r ]+$/g, '') !== value) return false;
  try {
    const parsed = new URL(value);
    // Some browser parsers escape forbidden domain characters instead of rejecting them.
    if (['http:', 'https:', 'ftp:', 'file:', 'ws:', 'wss:'].includes(parsed.protocol) && /[\u0000-\u0020\u007f%<>|\\/#?@]/.test(parsed.hostname)) return false;
    return true;
  } catch { return false; }
}
`;

export const TEXT_VALIDATION_RUNTIME = String.raw`
${URL_VALIDATION_RUNTIME}
${TEXT_MASK_RUNTIME}
const textPatterns = ${JSON.stringify(textFormats.map((format) => format.pattern))};
function textRuleValid(rule, value) {
  if (typeof value !== 'string') return false;
  const limits = rule.text || {};
  if (value.length > (limits.maxLength ?? 10000)) return false;
  if (value === '') return true;
  if (value.length < (limits.minLength ?? 0)) return false;
  if (limits.mask !== undefined) {
    try { return new RegExp('^(?:' + textMaskPattern(limits.mask) + ')$', 'v').exec(value)?.[0] === value; }
    catch { return false; }
  }
  if (!limits.pattern) return true;
  if (!textPatterns.includes(limits.pattern)) return false;
  return new RegExp('^(?:' + limits.pattern + ')$(?![\\s\\S])', 'v').test(value);
}
`;
