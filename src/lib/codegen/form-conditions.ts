export const formConditionsCSS = "[data-form-condition][hidden] { display: none !important; }";

export const formConditionsRuntime = `
function syncFormConditions(root) {
  if (!root) return;
  const sources = new Map();
  for (const group of root.querySelectorAll('[data-form-condition]')) {
    const form = group.form;
    if (!sources.has(form)) sources.set(form, new Map(Array.from(form?.elements || []).map(input => [input.id, input])));
    const sourceId = group.getAttribute('data-condition-source');
    const controls = sources.get(form);
    const source = controls.get(sourceId + '-control') || controls.get(sourceId);
    const active = source?.type === 'checkbox' && !source.matches(':disabled') && source.checked === (group.getAttribute('data-condition-checked') === 'true');
    group.hidden = !active;
    group.disabled = !active || group.getAttribute('data-condition-disabled') === 'true';
  }
}
function setupFormConditions(root) {
  if (!root) return;
  const change = e => { if (e.target.type === 'checkbox') syncFormConditions(root); };
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
