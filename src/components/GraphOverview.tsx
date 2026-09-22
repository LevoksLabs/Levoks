"use client";
export default function GraphOverview({ items, onChoose }: { items: { id: string; label: string; x: number; y: number; w: number; h: number; selected?: boolean }[]; onChoose: (id: string) => void }) {
  if (!items.length) return null;
  const left = Math.min(...items.map(item => item.x)) - 32, top = Math.min(...items.map(item => item.y)) - 32;
  const width = Math.max(...items.map(item => item.x + item.w)) - left + 32, height = Math.max(...items.map(item => item.y + item.h)) - top + 32;
  return <details className="graph-overview"><summary>Overview · {items.length}</summary><svg viewBox={`${left} ${top} ${width} ${height}`} aria-label="Canvas overview">{items.map(item => <g role="button" tabIndex={0} aria-label={`Focus ${item.label}`} aria-pressed={!!item.selected} key={item.id} onClick={() => onChoose(item.id)} onKeyDown={event => { if (event.key === "Enter" || event.key === " ") { event.preventDefault(); event.stopPropagation(); onChoose(item.id); } }}><title>{item.label}</title><rect x={item.x} y={item.y} width={item.w} height={item.h} rx="8" fill={item.selected ? "var(--accent)" : "var(--bg-elevated)"} stroke="var(--accent)" strokeWidth="1" vectorEffect="non-scaling-stroke" /></g>)}</svg><span>Choose a node to select and center it.</span></details>;
}
