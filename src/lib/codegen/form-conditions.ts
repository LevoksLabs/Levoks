export const formConditionsCSS =
  "[data-form-condition][hidden] { display: none !important; }";

export const formConditionsRuntime = `
function syncFormConditions(root) {
  if (!root) return;
  const sources = new Map();
  for (const group of root.querySelectorAll('[data-form-condition]')) {
    const form = group.form;
    if (!sources.has(form)) sources.set(form, new Map(Array.from(form?.elements || []).map(input => [input.id, input])));
    const controls = sources.get(form);
    const data = group.getAttribute('data-condition-rules');
    let condition;
    try { condition = data ? JSON.parse(data) : {sourceId: group.getAttribute('data-condition-source'), checked: group.getAttribute('data-condition-checked') === 'true'}; }
    catch { condition = {rules: []}; }
    const rules = [condition, ...(condition.rules || [])];
    const results = rules.map(rule => {
      const source = controls.get(rule.sourceId + '-control') || controls.get(rule.sourceId);
      if (!source || source.matches(':disabled')) return false;
      if (source.type === 'checkbox') return source.checked === rule.checked;
      let values;
      if (source.tagName === 'SELECT') values = Array.from(source.selectedOptions).filter(option => !option.disabled && !option.parentElement?.disabled).map(option => option.value);
      else if (source.tagName === 'FIELDSET') values = Array.from(source.querySelectorAll('input')).filter(input => ['radio', 'checkbox'].includes(input.type) && input.checked && !input.matches(':disabled')).map(input => input.value);
      else return false;
      const equal = values.includes(rule.value);
      return rule.operator === 'ne' || rule.operator === 'excludes' ? !equal : equal;
    });
    const active = !group.parentElement?.closest('[data-form-condition][hidden]') && (condition.match === 'any' ? results.some(Boolean) : results.every(Boolean));
    if (!active && group.contains?.(group.ownerDocument?.activeElement)) {
      const source = controls.get(condition.sourceId + '-control') || controls.get(condition.sourceId);
      (source?.querySelector?.('input:not(:disabled)') || source)?.focus?.();
    }
    group.hidden = !active;
    group.disabled = !active || group.getAttribute('data-condition-disabled') === 'true';
  }
}
function setupFormConditions(root) {
  if (!root) return;
  const change = () => syncFormConditions(root);
  const reset = () => queueMicrotask(() => syncFormConditions(root));
  syncFormConditions(root);
  root.addEventListener('change', change);
  root.addEventListener('input', change);
  root.addEventListener('reset', reset);
  return () => {
    root.removeEventListener('change', change);
    root.removeEventListener('input', change);
    root.removeEventListener('reset', reset);
  };
}
`;
