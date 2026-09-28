import { generateFrontendProject } from "@/lib/codegen/frontend";
import { compileProject, pageElements } from "./compiler";

/** Opaque-origin iframe: local UI interactions only; never executes backend or edited source. */
export function generatedPreview(value: unknown, pageId: string) {
  const output = compileProject(value as Parameters<typeof compileProject>[0]);
  if (output.project.source)
    throw new Error(
      "Source edits require the exported application runtime. Regenerate from the canvas to use this preview.",
    );
  const failures = output.diagnostics.filter(
    (item) => item.severity === "error",
  );
  if (failures.length)
    throw new Error(failures.map((item) => item.message).join("\n"));
  const { project, graph } = output,
    editor = project.editor;
  const page = editor.pages.find((page) => page.id === pageId);
  if (!page) throw new Error("Choose a page to preview.");
  const { previewHtml } = generateFrontendProject(
    pageElements(project, pageId),
    [],
    editor.canvasSettings,
    page,
    editor.pages,
    undefined,
    graph,
    editor.tokens,
    editor.assets,
  );
  const policy = `default-src 'none'; script-src 'unsafe-inline'; style-src 'unsafe-inline'; img-src data: blob:; font-src data:; media-src data: blob:; connect-src 'none'; frame-src 'none'; form-action 'none'; base-uri 'none';`;
  return previewHtml.replace(
    "<head>",
    `<head><meta http-equiv="Content-Security-Policy" content="${policy}">`,
  );
}
