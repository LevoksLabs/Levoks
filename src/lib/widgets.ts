import type { ElementNode } from "@/types";
export const widgetNumber = (value: unknown, fallback: number, min: number, max: number) => Math.max(min, Math.min(max, Math.floor(Number.isFinite(Number(value)) ? Number(value) : fallback)));
export function tabLabels(element: ElementNode) {
  const labels = String(element.props.tabTitles || "Tab 1,Tab 2").split(",").slice(0, 20).map((label, index) => label.trim() || `Tab ${index + 1}`);
  while (labels.length < Math.min(20, element.children.length)) labels.push(`Tab ${labels.length + 1}`);
  return labels;
}
