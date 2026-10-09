import { URL_VALIDATION_RUNTIME } from "@/lib/backend/text-validation";
/** Shared by HTML preview and React export; native form ownership remains authoritative. */
export const formValueRuntime = `
${URL_VALIDATION_RUNTIME}
function formControlValue(input, form) {
  if (input.type === 'radio' && input.name) return Array.from(form.elements).find(candidate => candidate.type === 'radio' && candidate.name === input.name && candidate.checked && !candidate.disabled && !candidate.matches?.(':disabled'))?.value;
  if (input.disabled || input.matches?.(':disabled')) return undefined;
  if (input.type === 'file') {if (input.files?.length) throw new Error('File uploads require a storage endpoint.'); return undefined;}
  if (input.type === 'radio') return input.checked ? input.value : undefined;
  if (input.tagName === 'SELECT' && input.multiple) return Array.from(input.selectedOptions).filter(option => !option.disabled && !option.closest('optgroup:disabled')).map(option => option.value);
  if (input.tagName === 'SELECT' && input.value === '' && !input.required) return undefined;
  if (input.type === 'checkbox') return input.checked;
  if (['text', 'email', 'url', 'search', 'tel'].includes(input.type) && input.value === '' && !input.required) return undefined;
  if (input.tagName === 'TEXTAREA' && input.value === '' && !input.required) return undefined;
  if (input.type === 'url' && !urlRuleValid(input.value)) throw new Error('Enter a valid absolute URL for ' + input.name);
  if (['date', 'time', 'datetime-local'].includes(input.type) && input.value === '' && !input.required) return undefined;
  if (input.type === 'number' || input.type === 'range') {
    if (input.value === '') return undefined;
    if (!Number.isFinite(input.valueAsNumber)) throw new Error('Enter a valid number for ' + input.name);
    return input.valueAsNumber;
  }
  return input.value;
}
`;
