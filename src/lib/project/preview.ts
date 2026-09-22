import { generateFrontendProject } from "@/lib/codegen/frontend";
import { parseProject } from "./schema";
import type { ElementNode } from "@/types";

/** Opaque-origin iframe only: no network, parent access, popups or form submission. */
export function generatedPreview(value: unknown, pageId: string) {
  const project = parseProject(value), editor = project.editor;
  const page = editor.pages.find(page => page.id === pageId);
  if (!page) throw new Error("Choose a page to preview.");
  const roots = [...editor.globalRootIds, ...(pageId === editor.activePageId ? editor.rootIds : editor.pageElementMap[pageId] || [])];
  const ids = new Set<string>();
  const visit = (id: string) => { if (ids.has(id)) return; ids.add(id); editor.elementsById[id]?.children.forEach(visit); };
  roots.forEach(visit);
  const { previewHtml } = generateFrontendProject([...ids].map(id => editor.elementsById[id]) as ElementNode[], [], editor.canvasSettings, page, editor.pages, undefined, undefined, editor.tokens, editor.assets);
  const policy = `default-src 'none'; script-src 'unsafe-inline'; style-src 'unsafe-inline'; img-src data: blob:; font-src data:; media-src data: blob:; connect-src 'none'; frame-src 'none'; form-action 'none'; base-uri 'none';`;
  return previewHtml.replace("<head>", `<head><meta http-equiv="Content-Security-Policy" content="${policy}">`);
}
