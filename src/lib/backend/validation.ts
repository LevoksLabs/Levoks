import { TEMPORAL_RUNTIME } from "./temporal";
import { TEXT_VALIDATION_RUNTIME } from "./text-validation";

/** Choice rules use the same one-value-per-line format as native Select. */
export function validationChoices(value: unknown): string[] {
  if (typeof value !== "string" || value.length > 10000 || value.includes("\r"))
    throw new Error(
      "Allowed values must be single-line text, at most 10,000 characters in total.",
    );
  const choices = value.split("\n").filter(Boolean);
  if (
    !choices.length ||
    choices.length > 200 ||
    new Set(choices).size !== choices.length
  )
    throw new Error("Provide 1–200 unique allowed values, one per line.");
  return choices;
}

/** Emitted into both workflow and legacy middleware; keep their existing coercion behavior. */
export const VALIDATION_RUNTIME = String.raw`
${TEMPORAL_RUNTIME}
${TEXT_VALIDATION_RUNTIME}
function validationRuleValid(rule, value, coerce = false) {
  if (rule.type === 'required') return value !== undefined && value !== '' && (!Array.isArray(value) || value.length > 0);
  if (rule.type === 'accepted') return value === true;
  if (value === undefined) return true;
  if (rule.type === 'text') return textRuleValid(rule, value);
  if (rule.type === 'url') return urlRuleValid(value);
  if (['date', 'time', 'datetime-local'].includes(rule.type)) return temporalRuleValid(rule, value);
  if (rule.type === 'oneOf') {
    const choices = String(rule.value || '').split('\n').filter(Boolean);
    const selected = Array.isArray(value) ? value : [value];
    return selected.length <= choices.length && new Set(selected).size === selected.length && selected.every(item => typeof item === 'string' && choices.includes(item));
  }
  if (rule.type === 'email') return typeof value === 'string' && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value);
  if (rule.type === 'minLength') return (coerce || typeof value === 'string') && String(value).length >= Number(rule.value);
  if (rule.type === 'maxLength') return (coerce || typeof value === 'string') && String(value).length <= Number(rule.value);
  if (rule.type === 'min') return (coerce || typeof value === 'number') && Number(value) >= Number(rule.value);
  if (rule.type === 'max') return (coerce || typeof value === 'number') && Number(value) <= Number(rule.value);
  return false;
}
`;
