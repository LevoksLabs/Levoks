"use client";

import { Monitor, Tablet, Smartphone } from "lucide-react";
import { useEditorStore } from "@/store/editorStore";
import { useEditorUIStore } from "@/store/editorUIStore";

const screens = [
  { id: "base", label: "Desktop", Icon: Monitor },
  { id: "tablet", label: "Tablet", Icon: Tablet },
  { id: "mobile", label: "Mobile", Icon: Smartphone },
] as const;

export default function ResponsiveControls() {
  const ui = useEditorUIStore();
  const { responsiveBaseline, elementsById, beginResponsiveEdit, finishResponsiveEdit } = useEditorStore();
  const changed = responsiveBaseline !== null && JSON.stringify(elementsById) !== JSON.stringify(responsiveBaseline);

  return (
    <div className="canvas-responsive-actions">
      <div className="canvas-breakpoints" role="group" aria-label="Responsive screens">
        {screens.map(({ id, label, Icon }) => (
          <button key={id} aria-label={`${label} layout`} title={`${label} layout${id === "base" ? " · default styles" : id === "tablet" ? " · up to 1024px, inherited by mobile" : " · up to 600px"}`}
            aria-pressed={ui.breakpoint === id} onClick={() => ui.setBreakpoint(id)}>
            <Icon size={14} /><span>{label}</span>
          </button>
        ))}
      </div>
      {ui.breakpoint !== "base" && <button className="canvas-responsive-toggle"
        aria-pressed={responsiveBaseline !== null}
        onClick={() => responsiveBaseline ? finishResponsiveEdit() : beginResponsiveEdit()}
        title="Review layout changes as one undo step. Save keeps them; Cancel restores them. Switching screens also keeps them.">
        Responsive
      </button>}
      {changed && <>
        <button className="canvas-resize-save" aria-label="Save responsive changes" onClick={() => finishResponsiveEdit()}>Save</button>
        <button className="canvas-resize-cancel" aria-label="Cancel responsive changes" onClick={() => finishResponsiveEdit(true)}>Cancel</button>
      </>}
    </div>
  );
}
