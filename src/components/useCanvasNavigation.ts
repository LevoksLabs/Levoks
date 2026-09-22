"use client";
import { useEffect, useRef, useState, type RefObject } from "react";
import { useEditorUIStore } from "@/store/editorUIStore";
import { isEditingTarget } from "@/lib/editor-shortcuts";

export function useCanvasNavigation(
  ref: RefObject<HTMLDivElement | null>,
  options: {
    get: () => { x: number; y: number; scale: number };
    apply: (x: number, y: number, scale: number) => void;
    fit: () => void;
    selection: (centerOnly: boolean) => void;
    cancel?: () => void;
  },
) {
  const latest = useRef(options);
  const [panning, setPanning] = useState(false);
  const [space, setSpace] = useState(false);
  const tool = useEditorUIStore((s) => s.tool);
  useEffect(() => {
    latest.current = options;
  });
  useEffect(() => {
    const viewport = ref.current;
    if (!viewport) return;
    let held = false,
      dragging: {
        id: number;
        x: number;
        y: number;
        panX: number;
        panY: number;
      } | null = null,
      suppressClick = false;
    const locked = () => useEditorUIStore.getState().viewportLocked;
    const zoom = (scale: number, cx: number, cy: number) => {
      const old = latest.current.get(),
        rect = viewport.getBoundingClientRect(),
        x = cx - rect.left,
        y = cy - rect.top;
      const next = Math.min(2, Math.max(0.1, scale));
      latest.current.apply(
        x - ((x - old.x) * next) / old.scale,
        y - ((y - old.y) * next) / old.scale,
        next,
      );
    };
    const wheel = (e: WheelEvent) => {
      if (isEditingTarget(e.target)) return;
      e.preventDefault();
      if (locked()) return;
      const old = latest.current.get();
      if (e.ctrlKey || e.metaKey)
        zoom(old.scale * Math.exp(-e.deltaY * 0.004), e.clientX, e.clientY);
      else latest.current.apply(old.x - e.deltaX, old.y - e.deltaY, old.scale);
    };
    const down = (e: PointerEvent) => {
      if (
        locked() ||
        isEditingTarget(e.target) ||
        (e.target as HTMLElement).closest("button,select")
      )
        return;
      if (
        e.button !== 1 &&
        !(
          e.button === 0 &&
          (held || useEditorUIStore.getState().tool === "hand")
        )
      )
        return;
      e.preventDefault();
      e.stopPropagation();
      const view = latest.current.get();
      dragging = {
        id: e.pointerId,
        x: e.clientX,
        y: e.clientY,
        panX: view.x,
        panY: view.y,
      };
      viewport.setPointerCapture(e.pointerId);
      setPanning(true);
      suppressClick = true;
    };
    const move = (e: PointerEvent) => {
      if (!dragging || e.pointerId !== dragging.id) return;
      e.preventDefault();
      e.stopPropagation();
      latest.current.apply(
        dragging.panX + e.clientX - dragging.x,
        dragging.panY + e.clientY - dragging.y,
        latest.current.get().scale,
      );
    };
    const up = () => {
      dragging = null;
      setPanning(false);
    };
    const click = (e: MouseEvent) => {
      if (suppressClick) {
        e.preventDefault();
        e.stopPropagation();
        suppressClick = false;
      }
    };
    const keyDown = (e: KeyboardEvent) => {
      if (
        e.code === "Space" &&
        !isEditingTarget(e.target) &&
        !(
          e.target instanceof HTMLElement &&
          e.target.closest("button,a,summary")
        ) &&
        !document.querySelector(
          'dialog[open]:not([aria-modal="false"]),.site-preview-overlay',
        )
      ) {
        e.preventDefault();
        held = true;
        setSpace(true);
      }
    };
    const keyUp = (e: KeyboardEvent) => {
      if (e.code === "Space") {
        held = false;
        setSpace(false);
        up();
      }
    };
    const blur = () => {
      held = false;
      setSpace(false);
      up();
    };
    const command = (e: Event) => {
      const name = (e as CustomEvent<string>).detail;
      if (name === "cancel") {
        latest.current.cancel?.();
        blur();
        return;
      }
      if (locked()) return;
      if (name === "fit") latest.current.fit();
      else if (name === "selection" || name === "center")
        latest.current.selection(name === "center");
      else {
        const r = viewport.getBoundingClientRect(),
          old = latest.current.get();
        zoom(
          name === "reset" ? 1 : old.scale * (name === "in" ? 1.2 : 1 / 1.2),
          r.left + r.width / 2,
          r.top + r.height / 2,
        );
      }
    };
    viewport.addEventListener("wheel", wheel, { passive: false });
    viewport.addEventListener("pointerdown", down, true);
    viewport.addEventListener("pointermove", move, true);
    viewport.addEventListener("pointerup", up, true);
    viewport.addEventListener("pointercancel", up, true);
    viewport.addEventListener("click", click, true);
    window.addEventListener("keydown", keyDown);
    window.addEventListener("keyup", keyUp);
    window.addEventListener("blur", blur);
    window.addEventListener("levoks:canvas", command);
    return () => {
      viewport.removeEventListener("wheel", wheel);
      viewport.removeEventListener("pointerdown", down, true);
      viewport.removeEventListener("pointermove", move, true);
      viewport.removeEventListener("pointerup", up, true);
      viewport.removeEventListener("pointercancel", up, true);
      viewport.removeEventListener("click", click, true);
      window.removeEventListener("keydown", keyDown);
      window.removeEventListener("keyup", keyUp);
      window.removeEventListener("blur", blur);
      window.removeEventListener("levoks:canvas", command);
    };
  }, [ref]);
  return panning ? "grabbing" : tool === "hand" || space ? "grab" : undefined;
}
