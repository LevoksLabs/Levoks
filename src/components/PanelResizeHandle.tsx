"use client";
import { useRef } from "react";
import { useEditorUIStore } from "@/store/editorUIStore";
export default function PanelResizeHandle({ side }: { side: "tray" | "inspector" }) {
  const ui = useEditorUIStore(), key = side === "tray" ? "trayWidth" : "inspectorWidth";
  const drag = useRef<{ x: number; width: number } | null>(null);
  const change = (width: number) => useEditorUIStore.setState({ [key]: Math.max(220, Math.min(440, width)) });
  return <div className="panel-resize-handle" role="separator" tabIndex={0} aria-orientation="vertical" aria-label={`Resize ${side === "tray" ? "sub-tray" : "inspector"}`} aria-valuemin={220} aria-valuemax={440} aria-valuenow={ui[key]} onDoubleClick={() => change(side === "tray" ? 252 : 284)} onPointerDown={event => { if (event.button !== 0) return; event.preventDefault(); drag.current = { x: event.clientX, width: ui[key] }; event.currentTarget.setPointerCapture(event.pointerId); }} onPointerMove={event => { if (drag.current) change(drag.current.width + (event.clientX - drag.current.x) * (side === "tray" ? 1 : -1)); }} onPointerUp={event => { drag.current = null; event.currentTarget.releasePointerCapture(event.pointerId); }} onPointerCancel={() => { if (drag.current) change(drag.current.width); drag.current = null; }} onKeyDown={event => { if (event.key === "ArrowLeft" || event.key === "ArrowRight") { event.preventDefault(); event.stopPropagation(); change(ui[key] + (event.key === "ArrowRight" ? 16 : -16) * (side === "tray" ? 1 : -1)); } else if (event.key === "Home") { event.preventDefault(); change(side === "tray" ? 252 : 284); } }} />;
}
