"use client";
import { useEffect, useMemo, useRef } from "react";
import { useEditorStore } from "@/store/editorStore";
import { useBackendStore } from "@/store/backendStore";
import { useRoutingStore } from "@/store/routingStore";
import { currentProject, useWorkspaceStore } from "@/store/workspaceStore";
import { generatedPreview } from "@/lib/project/preview";

export default function GeneratedPreview({
  pageId,
  width,
  onNavigate,
}: {
  pageId: string;
  width: number;
  onNavigate: (pageId: string) => void;
}) {
  const editor = useEditorStore(),
    backend = useBackendStore(),
    routing = useRoutingStore();
  const source = useWorkspaceStore((state) => state.source);
  const frame = useRef<HTMLIFrameElement>(null);
  const result = useMemo(() => {
    try {
      return { html: generatedPreview(currentProject(), pageId), error: "" };
    } catch (error) {
      return {
        html: "",
        error:
          error instanceof Error ? error.message : "Preview generation failed.",
      };
    }
  }, [
    pageId,
    editor.elementsById,
    editor.assets, editor.customElements,
    editor.tokens,
    editor.components,
    editor.pages,
    editor.rootIds,
    editor.globalRootIds,
    editor.pageElementMap,
    editor.activePageId,
    editor.canvasSettings,
    backend.services,
    backend.connections,
    routing.nodes,
    routing.connections,
    source,
  ]);
  useEffect(() => {
    const navigate = (event: MessageEvent) => {
      // A sandboxed srcdoc has an opaque origin. Only this exact iframe may request
      // a local page switch; messages cannot open URLs or mutate the project.
      if (
        event.source !== frame.current?.contentWindow ||
        event.origin !== "null" ||
        event.data?.type !== "levoks:preview:navigate"
      )
        return;
      const destination = editor.pages.find(
        (page) => page.id === event.data.pageId,
      );
      if (destination) {
        // React preserves an unchanged srcDoc; explicitly reload same-page links
        // so form values and widget state reset just as in the exported app.
        if (destination.id === pageId && frame.current)
          frame.current.srcdoc = result.html;
        onNavigate(destination.id);
      }
    };
    window.addEventListener("message", navigate);
    return () => window.removeEventListener("message", navigate);
  }, [editor.pages, onNavigate, pageId, result.html]);
  return (
    <div className="generated-preview" style={{ width, flexShrink: 0 }}>
      <p>
        Generated frontend · isolated preview. Page links, widgets and
        animations work here. Use Local full-stack for generated MongoDB APIs.
        Custom source still requires the exported application runtime.
      </p>
      {result.error ? (
        <p role="alert">{result.error}</p>
      ) : (
        <iframe
          ref={frame}
          title="Generated frontend preview"
          sandbox="allow-scripts allow-forms"
          referrerPolicy="no-referrer"
          srcDoc={result.html}
          style={{
            width: "100%",
            height: "100%",
            minHeight: 500,
            border: 0,
            background: "white",
          }}
        />
      )}
    </div>
  );
}
