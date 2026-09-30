import { ELEMENT_DEFINITIONS } from "@/lib/elements/registry";
import { templates as legacyTemplates } from "./legacy";
import type { ElementType, SidebarCategory } from "@/types";
import type { ElementTemplate } from "@/lib/elements/registry";

// Compatibility facade; the registry is the public source of definitions.
export const templates: Record<ElementType, ElementTemplate> = {
  ...legacyTemplates,
  native: { type: "native", definitionId: "textInput", definitionVersion: 1, props: { type: "text", name: "text", ariaLabel: "Text" }, styles: {} },
  custom: { type: "custom", props: {}, styles: {} },
};
export const sidebarCategories: SidebarCategory[] = [...new Set(ELEMENT_DEFINITIONS.map(d => d.category))].map(category => ({
  id: category, label: category, icon: "container",
  items: ELEMENT_DEFINITIONS.filter(d => d.category === category).map(d => ({ type: d.template.type, definitionId: d.id, label: d.name, icon: d.icon })),
}));
