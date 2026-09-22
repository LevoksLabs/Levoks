"use client";
import { useMemo } from "react";
import { useEditorStore } from "@/store/editorStore";
import { captureProject } from "@/lib/project/workspace";
import { generatedPreview } from "@/lib/project/preview";

export default function GeneratedPreview({ pageId, width }: { pageId: string; width: number }) {
  const editor = useEditorStore();
  const result = useMemo(() => {
    try { return { html: generatedPreview(captureProject("preview", "Preview"), pageId), error: "" }; }
    catch (error) { return { html: "", error: error instanceof Error ? error.message : "Preview generation failed." }; }
    // All immutable editor slices used by captureProject participate in regeneration.
  }, [pageId, editor.elementsById, editor.assets, editor.tokens, editor.components, editor.pages, editor.rootIds, editor.globalRootIds, editor.pageElementMap, editor.activePageId, editor.canvasSettings]);
  return <div className="generated-preview" style={{ width, maxWidth: "100%" }}><p>Generated frontend · isolated preview. External assets, navigation, forms and network requests are blocked. Source overrides and backend services require an exported application runtime.</p>{result.error ? <p role="alert">{result.error}</p> : <iframe title="Generated frontend preview" sandbox="allow-scripts" referrerPolicy="no-referrer" srcDoc={result.html} style={{ width: "100%", height: "100%", minHeight: 500, border: 0, background: "white" }} />}</div>;
}
