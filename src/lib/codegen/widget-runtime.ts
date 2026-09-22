// This source is emitted into React's effect and into the isolated HTML preview.
// Event delegation also supports nested tabs and repeated widgets.
export const widgetRuntime = `
function setupWidgets(root) {
  const widgets = Array.from(root.querySelectorAll('[data-levoks-tabs]'));
  const cleanup = [];
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
