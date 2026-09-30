// This source is emitted into React's effect and into the isolated HTML preview.
// Event delegation also supports nested tabs and repeated widgets.
export const widgetRuntime = `
function setupWidgets(root) {
  root.querySelectorAll('[data-error-message]').forEach(input => input.setCustomValidity?.(input.dataset.errorMessage));
  const widgets = Array.from(root.querySelectorAll('[data-levoks-tabs]'));
  const cleanup = [];
  const semanticClick = event => {
    const open = event.target.closest('[data-dialog-open]'), close = event.target.closest('[data-dialog-close]'), slide = event.target.closest('[data-slide]');
    if (open) open.closest('[data-levoks-dialog]').querySelector('dialog').showModal();
    if (close) close.closest('dialog').close();
    if (slide) { const panels = Array.from(slide.closest('[data-levoks-carousel]').querySelectorAll('[data-slide-panel]')); if (!panels.length) return; const active = panels.findIndex(p => !p.hidden); const next = (active + Number(slide.dataset.slide) + panels.length) % panels.length; panels.forEach((panel, index) => panel.hidden = index !== next); }
  };
  root.addEventListener('click', semanticClick); cleanup.push(() => root.removeEventListener('click', semanticClick));
  widgets.forEach((widget, widgetIndex) => {
    const list = widget.querySelector(':scope > [role="tablist"]');
    const tabs = Array.from(list.children);
    const panels = Array.from(widget.children).filter(node => node.getAttribute('role') === 'tabpanel');
    tabs.forEach((tab, index) => { tab.id = 'lv-tab-' + widgetIndex + '-' + index; tab.setAttribute('aria-controls', 'lv-panel-' + widgetIndex + '-' + index); panels[index].id = 'lv-panel-' + widgetIndex + '-' + index; panels[index].setAttribute('aria-labelledby', tab.id); });
    const select = (index) => { tabs.forEach((tab, i) => { tab.setAttribute('aria-selected', String(i === index)); tab.tabIndex = i === index ? 0 : -1; panels[i].hidden = i !== index; }); };
    select(Math.max(0, Math.min(tabs.length - 1, Number(widget.dataset.activeTab) || 0)));
    const click = event => { const index = tabs.indexOf(event.target.closest('[role="tab"]')); if (index >= 0) select(index); };
    const key = event => { const index = tabs.indexOf(event.target); if (index < 0) return; const next = event.key === 'ArrowRight' ? (index + 1) % tabs.length : event.key === 'ArrowLeft' ? (index + tabs.length - 1) % tabs.length : event.key === 'Home' ? 0 : event.key === 'End' ? tabs.length - 1 : -1; if (next < 0) return; event.preventDefault(); event.stopPropagation(); select(next); tabs[next].focus(); };
    list.addEventListener('click', click); list.addEventListener('keydown', key);
    cleanup.push(() => { list.removeEventListener('click', click); list.removeEventListener('keydown', key); });
  });
  return () => cleanup.forEach(remove => remove());
}
`;
