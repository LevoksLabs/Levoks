"use client";
import { useRef, useState } from "react";
import { useEditorStore } from "@/store/editorStore";
import { useEditorUIStore } from "@/store/editorUIStore";

export default function BreakpointManager() {
  const dialog = useRef<HTMLDialogElement>(null);
  const trigger = useRef<HTMLButtonElement>(null);
  const store = useEditorStore();
  const [name, setName] = useState("");
  const [width, setWidth] = useState("900");
  const [editing, setEditing] = useState<number | null>(null);
  const [error, setError] = useState("");
  const points = store.canvasSettings.breakpoints || [];
  return (
    <>
      <button
        ref={trigger}
        aria-label="Manage breakpoints"
        onClick={() => dialog.current?.showModal()}
      >
        Breakpoints
      </button>
      <dialog
        ref={dialog}
        className="breakpoint-dialog"
        aria-labelledby="breakpoint-title"
        onClose={() => trigger.current?.focus()}
      >
        <h2 id="breakpoint-title">Responsive breakpoints</h2>
        <p>
          Styles cascade from wider screens to narrower screens. Content is
          shared.
        </p>
        <p>Tablet: up to 1024px · Mobile: up to 600px</p>
        <ul>
          {[...points]
            .sort((a, b) => b.width - a.width)
            .map((point) => (
              <li key={point.width}>
                <span>
                  {point.name} · up to {point.width}px
                </span>
                <button
                  onClick={() => {
                    setEditing(point.width);
                    setName(point.name);
                    setWidth(String(point.width));
                    setError("");
                  }}
                >
                  Edit {point.name}
                </button>
                <button
                  onClick={() =>
                    store.setBreakpoints(
                      points.filter((bp) => bp.width !== point.width),
                    )
                  }
                >
                  Remove {point.name}
                </button>
              </li>
            ))}
        </ul>
        <form
          onSubmit={(event) => {
            event.preventDefault();
            try {
              const next = { name: name.trim(), width: Number(width) };
              store.setBreakpoints(
                [...points.filter((bp) => bp.width !== editing), next],
                editing === null
                  ? undefined
                  : { from: editing, to: next.width },
              );
              useEditorUIStore.getState().setBreakpoint(`custom_${next.width}`);
              setEditing(null);
              setName("");
              setError("");
            } catch (error) {
              setError(
                error instanceof Error
                  ? error.message
                  : "Could not save breakpoint.",
              );
            }
          }}
        >
          <label>
            Name
            <input
              aria-label="Breakpoint name"
              required
              maxLength={40}
              value={name}
              onChange={(event) => setName(event.target.value)}
            />
          </label>
          <label>
            Maximum width (px)
            <input
              aria-label="Breakpoint maximum width"
              required
              type="number"
              min={240}
              max={20000}
              step={1}
              value={width}
              onChange={(event) => setWidth(event.target.value)}
            />
          </label>
          {error && <p role="alert">{error}</p>}
          <button type="submit">
            {editing === null ? "Add breakpoint" : "Save breakpoint"}
          </button>
          {editing !== null && (
            <button
              type="button"
              onClick={() => {
                setEditing(null);
                setName("");
                setError("");
              }}
            >
              Cancel edit
            </button>
          )}
        </form>
        <p>
          Removing a breakpoint removes its overrides from elements and reusable
          components. Undo restores them.
        </p>
        <button onClick={() => dialog.current?.close()}>
          Close breakpoints
        </button>
      </dialog>
    </>
  );
}
