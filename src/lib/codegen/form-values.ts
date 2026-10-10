import { URL_VALIDATION_RUNTIME } from "@/lib/backend/text-validation";
import { FILE_VALIDATION_RUNTIME } from "@/lib/backend/files";
/** Shared by HTML preview and React export; native form ownership remains authoritative. */
export const formValueRuntime = `
${URL_VALIDATION_RUNTIME}
${FILE_VALIDATION_RUNTIME}
async function formFileValue(input) {
  if (!input.files?.length) return undefined;
  if (input.multiple || input.files.length !== 1) throw new Error('Choose one file for ' + input.name);
  const file = input.files[0], rule = {file: {maxBytes: Number(input.dataset?.levoksFileMaxBytes || 262144), extensions: input.accept || ''}};
  if (file.size > rule.file.maxBytes || file.size > 262144) throw new Error('The file for ' + input.name + ' exceeds the allowed size.');
  const data = await new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result).split(',')[1] || '');
    reader.onerror = reader.onabort = () => reject(new Error('The file could not be read. Choose it again.'));
    reader.readAsDataURL(file);
  });
  const value = {name: file.name, size: file.size, data};
  if (!fileRuleValid(rule, value)) throw new Error('Choose a file with an allowed name, size and extension for ' + input.name);
  return value;
}
function formControlValue(input, form) {
  if (input.type === 'radio' && input.name) return Array.from(form.elements).find(candidate => candidate.type === 'radio' && candidate.name === input.name && candidate.checked && !candidate.disabled && !candidate.matches?.(':disabled'))?.value;
  if (input.disabled || input.matches?.(':disabled')) return undefined;
  if (input.dataset?.checkboxGroup === 'true') {
    const choices = Array.from(input.querySelectorAll('input[type="checkbox"]')).filter(candidate => candidate.form === form && !candidate.disabled && !candidate.matches(':disabled'));
    const values = choices.filter(candidate => candidate.checked).map(candidate => candidate.value);
    const min = Math.max(Number(input.dataset.checkboxMin || 0), input.dataset.checkboxRequired === 'true' ? 1 : 0);
    const max = input.dataset.checkboxMax === undefined ? undefined : Number(input.dataset.checkboxMax);
    if (values.length < min) {
      choices[0]?.focus();
      throw new Error('Choose at least ' + (min === 1 ? 'one option' : min + ' options') + ' for ' + (input.querySelector('legend')?.textContent || input.name));
    }
    if (max !== undefined && values.length > max) {
      choices.find(candidate => candidate.checked)?.focus();
      throw new Error('Choose at most ' + max + (max === 1 ? ' option' : ' options') + ' for ' + (input.querySelector('legend')?.textContent || input.name));
    }
    return values.length ? values : undefined;
  }
  if (input.type === 'file') return formFileValue(input);
  if (input.type === 'radio') return input.checked ? input.value : undefined;
  if (input.tagName === 'SELECT' && input.multiple) {
    const values = Array.from(input.selectedOptions).filter(option => !option.disabled && !option.closest('optgroup:disabled')).map(option => option.value);
    const min = Math.max(Number(input.dataset?.selectionMin || 0), input.required ? 1 : 0);
    const max = input.dataset?.selectionMax === undefined ? undefined : Number(input.dataset.selectionMax);
    if (values.length < min || (max !== undefined && values.length > max)) {
      input.focus();
      const count = values.length < min ? min : max;
      throw new Error('Choose ' + (values.length < min ? 'at least ' : 'at most ') + count + (count === 1 ? ' option' : ' options') + ' for ' + (input.labels?.[0]?.textContent || input.name));
    }
    return values;
  }
  if (input.tagName === 'SELECT' && input.value === '' && !input.required) return undefined;
  if (input.tagName === 'SELECT' && Array.from(input.selectedOptions).some(option => option.disabled || option.closest('optgroup:disabled'))) {
    if (input.required) throw new Error('Choose an enabled option for ' + input.name);
    return undefined;
  }
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
