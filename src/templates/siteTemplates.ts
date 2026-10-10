import type { TemplateElement } from "@/types/template";
import { SITE_STARTERS, starterElements } from "@/lib/site-starters";
export interface SiteTemplate {
  id: string;
  name: string;
  description: string;
  category: string;
  elements: TemplateElement[];
}
export const siteTemplates: SiteTemplate[] = SITE_STARTERS.map((starter) => ({
  ...starter,
  elements: starterElements(starter),
}));
