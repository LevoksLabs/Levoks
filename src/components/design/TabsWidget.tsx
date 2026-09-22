"use client";
import { useId, useState } from "react";
import type { ElementNode } from "@/types";
import { tabLabels, widgetNumber } from "@/lib/widgets";
export default function TabsWidget({ element, render, onSelect }: { element: ElementNode; render: (ids: string[]) => React.ReactNode; onSelect?: (index: number) => void }) {
  const labels = tabLabels(element), id = useId();
  const [localTab, setLocalTab] = useState<number | null>(null);
  const active = widgetNumber(localTab ?? element.props.activeTab, 0, 0, labels.length - 1);
  const select = (index: number) => { if (onSelect) onSelect(index); else setLocalTab(index); };
  return <div className="tabs-element"><div className="tabs-header" role="tablist" aria-label={element.label || "Content tabs"}>{labels.map((label, index) => <button key={index} type="button" role="tab" id={`${id}-tab-${index}`} aria-controls={`${id}-panel-${index}`} aria-selected={active === index} tabIndex={active === index ? 0 : -1} className={`tab-btn ${active === index ? "active" : ""}`} onClick={() => select(index)} onKeyDown={event => {
    const next = event.key === "ArrowRight" ? (index + 1) % labels.length : event.key === "ArrowLeft" ? (index + labels.length - 1) % labels.length : event.key === "Home" ? 0 : event.key === "End" ? labels.length - 1 : null;
    if (next === null) return; event.preventDefault(); event.stopPropagation(); select(next); document.getElementById(`${id}-tab-${next}`)?.focus();
  }}>{label}</button>)}</div>{labels.map((_, index) => <div key={index} className="tabs-body" role="tabpanel" id={`${id}-panel-${index}`} aria-labelledby={`${id}-tab-${index}`} hidden={active !== index} tabIndex={0}>{element.children[index] ? render([element.children[index]]) : <span className="widget-empty">Add a child container for this tab’s content.</span>}</div>)}</div>;
}
