import type { ElementNode, ElementLayout } from "./index";
export type TemplateElement = Omit<ElementNode, "id" | "parentId" | "children" | "layout"> & Partial<ElementLayout> & { id?: string; layout?: Partial<ElementLayout>; children?: TemplateElement[] };
