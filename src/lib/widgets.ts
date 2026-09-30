import type { ElementNode } from "@/types";
export const widgetNumber = (value: unknown, fallback: number, min: number, max: number) => Math.max(min, Math.min(max, Math.floor(Number.isFinite(Number(value)) ? Number(value) : fallback)));
export function tabLabels(element: ElementNode) {
  const labels = String(element.props.tabTitles || "Tab 1,Tab 2").split(",").slice(0, 20).map((label, index) => label.trim() || `Tab ${index + 1}`);
  while (labels.length < Math.min(20, element.children.length)) labels.push(`Tab ${labels.length + 1}`);
  return labels;
}

// A single stylesheet contract for canvas, HTML preview and generated React.
export function tabsCSS(selector: string) {
  return `${selector} { display:flex; flex-direction:column; }
${selector} > [role="tablist"] { display:flex; flex-shrink:0; gap:var(--tab-gap,4px); overflow:auto; border-bottom:1px solid currentColor; }
${selector} > [role="tablist"] > button { appearance:none; border:0; margin:0; padding:10px 16px; font:inherit; cursor:pointer; white-space:nowrap; background:var(--tab-inactive-bg,transparent); color:var(--tab-inactive-color,inherit); }
${selector} > [role="tablist"] > button[aria-selected="true"] { background:var(--tab-active-bg,transparent); color:var(--tab-active-color,inherit); box-shadow:inset 0 -2px currentColor; }
${selector} > [role="tablist"] > button:focus-visible { outline:2px solid currentColor; outline-offset:-3px; }
${selector} > [role="tabpanel"] { flex:1; position:relative; padding:var(--tab-panel-padding,16px); min-height:0; }
${selector} > [hidden] { display:none !important; }`;
}

export const choiceCSS = `[data-choice] { display:flex; align-items:center; gap:8px; cursor:pointer; }
[data-choice] > input { flex:none; width:16px; height:16px; margin:0; accent-color:currentColor; }
[data-choice] > input:focus-visible { outline:2px solid currentColor; outline-offset:3px; }
[data-choice]:has(input:disabled) { cursor:not-allowed; opacity:0.55; }
[data-choice] > span { min-width:0; overflow-wrap:anywhere; }
[data-button] { display:inline-flex; align-items:center; justify-content:center; gap:8px; text-decoration:none; }
[data-button]:disabled, [data-button][aria-disabled=true] { cursor:not-allowed; opacity:.55; }
[data-button]:focus-visible { outline:2px solid currentColor; outline-offset:3px; }
[data-button]:active:not(:disabled):not([aria-disabled=true]) { filter:brightness(.92); }
[data-button][data-button-hover]:hover:not(:disabled):not([aria-disabled=true]) { background:var(--button-hover); }
[data-field] { display:flex; flex-direction:column; gap:4px; }
[data-field] > label, [data-field] > small { flex:none; font-size:.85em; }
[data-field] > input, [data-field] > textarea, [data-field] > select { width:100%; min-width:0; flex:1; min-height:20px; font:inherit; color:inherit; background:transparent; border:0; }
[data-field] [aria-invalid=true] { outline:2px solid #b91c1c; }
[data-field] > [role=alert] { color:#b91c1c; }
[data-field] :focus-visible { outline:2px solid currentColor; outline-offset:2px; }
`;
