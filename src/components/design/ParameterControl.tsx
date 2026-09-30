"use client";
import { useEffect, useId, useRef, useState } from "react";
import { projectHistory } from "@/store/projectHistory";
import { measurement, serializeMeasurement } from "@/lib/property-values";

export function ParameterControl({
  label,
  value,
  onChange,
  unit = "",
  units,
  onUnitChange,
  min = -Infinity,
  max = Infinity,
  step = 1,
  sensitivity = 0.5,
  precision = 2,
}: {
  label: string;
  value: number;
  onChange: (value: number) => void;
  unit?: string;
  units?: readonly string[];
  onUnitChange?: (unit: string) => void;
  min?: number;
  max?: number;
  step?: number;
  sensitivity?: number;
  precision?: number;
}) {
  const [draft, setDraft] = useState<string | null>(null);
  const [dragging, setDragging] = useState(false);
  const input = useRef<HTMLInputElement>(null),
    editing = useRef(false),
    cleanup = useRef<(() => void) | null>(null);
  const current = useRef({ value, onChange });
  useEffect(() => {
    current.current = { value, onChange };
  });
  useEffect(
    () => () => {
      cleanup.current?.();
      if (editing.current) projectHistory.end(true);
    },
    [],
  );
  const hint = useId();
  const constrain = (n: number) =>
    Number(Math.min(max, Math.max(min, n)).toFixed(precision));
  const beginEntry = () => {
    if (editing.current) return;
    editing.current = true;
    projectHistory.begin();
    setDraft(String(current.current.value));
  };
  const endEntry = (cancel = false) => {
    if (!editing.current) return;
    editing.current = false;
    projectHistory.end(cancel);
    setDraft(null);
  };
  return (
    <div className={`parameter-control${dragging ? " is-dragging" : ""}`}>
      <input
        ref={input}
        type="text"
        role="spinbutton"
        inputMode="decimal"
        aria-label={label}
        aria-describedby={hint}
        aria-valuenow={value}
        aria-valuemin={Number.isFinite(min) ? min : undefined}
        aria-valuemax={Number.isFinite(max) ? max : undefined}
        aria-valuetext={`${value}${unit}`}
        value={draft ?? String(Number(value.toFixed(precision)))}
        title="Drag horizontally · Click to type · Shift: faster · Alt: finer · Escape: cancel"
        onFocus={beginEntry}
        onBlur={() => endEntry()}
        onChange={(event) => {
          setDraft(event.target.value);
          if (
            event.target.value.trim() &&
            Number.isFinite(Number(event.target.value))
          )
            current.current.onChange(constrain(Number(event.target.value)));
        }}
        onKeyDown={(event) => {
          event.stopPropagation();
          if (event.key === "Escape" || event.key === "Enter") {
            event.preventDefault();
            endEntry(event.key === "Escape");
            input.current?.blur();
          }
          if (event.key === "ArrowUp" || event.key === "ArrowDown") {
            event.preventDefault();
            const next = constrain(
              value +
                (event.key === "ArrowUp" ? 1 : -1) *
                  step *
                  (event.shiftKey ? 10 : event.altKey ? 0.1 : 1),
            );
            current.current.onChange(next);
            setDraft(String(next));
          }
        }}
        onPointerDown={(event) => {
          if (event.button !== 0 || editing.current) return;
          event.preventDefault();
          event.stopPropagation();
          const target = event.currentTarget,
            startX = event.clientX;
          let lastX = startX,
            accumulated = value,
            moved = false;
          target.setPointerCapture(event.pointerId);
          const oldCursor = document.body.style.cursor,
            oldSelection = document.body.style.userSelect;
          const finish = (cancel: boolean, enter = false) => {
            window.removeEventListener("pointermove", move);
            window.removeEventListener("pointerup", up);
            window.removeEventListener("pointercancel", cancelDrag);
            window.removeEventListener("keydown", key, true);
            window.removeEventListener("blur", cancelDrag);
            if (target.hasPointerCapture(event.pointerId))
              target.releasePointerCapture(event.pointerId);
            document.body.style.cursor = oldCursor;
            document.body.style.userSelect = oldSelection;
            cleanup.current = null;
            setDragging(false);
            if (moved) projectHistory.end(cancel);
            else if (enter) {
              beginEntry();
              target.focus();
              requestAnimationFrame(() => target.select());
            }
          };
          const move = (e: PointerEvent) => {
            if (e.pointerId !== event.pointerId) return;
            if (!moved && Math.abs(e.clientX - startX) < 3) return;
            if (!moved) {
              moved = true;
              projectHistory.begin();
              setDragging(true);
              document.body.style.cursor = "ew-resize";
              document.body.style.userSelect = "none";
            }
            accumulated = Math.min(
              max,
              Math.max(
                min,
                accumulated +
                  (e.clientX - lastX) *
                    sensitivity *
                    (e.shiftKey ? 10 : e.altKey ? 0.1 : 1),
              ),
            );
            lastX = e.clientX;
            current.current.onChange(constrain(accumulated));
          };
          const up = (e: PointerEvent) => {
            if (e.pointerId === event.pointerId) finish(false, true);
          };
          const cancelDrag = () => finish(true);
          const key = (e: KeyboardEvent) => {
            if (e.key === "Escape") {
              e.preventDefault();
              e.stopImmediatePropagation();
              finish(true);
            }
          };
          cleanup.current = cancelDrag;
          window.addEventListener("pointermove", move);
          window.addEventListener("pointerup", up);
          window.addEventListener("pointercancel", cancelDrag);
          window.addEventListener("keydown", key, true);
          window.addEventListener("blur", cancelDrag);
        }}
      />
      {units && onUnitChange ? (
        <select
          aria-label={`${label} unit`}
          value={unit}
          onChange={(e) => onUnitChange(e.target.value)}
        >
          {units.map((u) => (
            <option key={u} value={u}>
              {u || "—"}
            </option>
          ))}
        </select>
      ) : (
        unit && <span className="parameter-unit">{unit}</span>
      )}
      <span id={hint} className="sr-only">
        Drag horizontally to change. Click or focus to type. Arrow keys adjust.
        Escape cancels.
      </span>
    </div>
  );
}

export const LENGTH_UNITS = ["px", "%", "rem", "em", "vw", "vh"] as const;
export function DimensionControl({
  label,
  value,
  onChange,
  units = LENGTH_UNITS,
  min = 0,
  fallback = "0px",
}: {
  label: string;
  value: string | number;
  onChange: (value: string) => void;
  units?: readonly string[];
  min?: number;
  fallback?: string;
}) {
  const parsed = measurement(value === "" ? fallback : value);
  if (
    parsed &&
    parsed.unit === "" &&
    !units.includes("") &&
    units.includes("px")
  )
    parsed.unit = "px";
  if (!parsed || !units.includes(parsed.unit))
    return (
      <div className="parameter-control">
        <input
          aria-label={label}
          value={String(value)}
          onChange={(e) => onChange(e.target.value)}
        />
        <select
          aria-label={`${label} unit`}
          value=""
          onChange={(e) =>
            onChange(
              e.target.value === "auto"
                ? "auto"
                : serializeMeasurement({
                    value: parsed?.value ?? 0,
                    unit: e.target.value,
                  }),
            )
          }
        >
          <option value="">{String(value) || "Custom"}</option>
          {units.map((u) => (
            <option key={u} value={u}>
              {u || "—"}
            </option>
          ))}
        </select>
      </div>
    );
  return (
    <ParameterControl
      label={label}
      value={parsed.value}
      unit={parsed.unit}
      units={units}
      min={min}
      sensitivity={
        ["rem", "em"].includes(parsed.unit)
          ? 0.01
          : parsed.unit === "%"
            ? 0.1
            : 0.5
      }
      step={["rem", "em"].includes(parsed.unit) ? 0.05 : 1}
      onChange={(n) =>
        onChange(serializeMeasurement({ value: n, unit: parsed.unit }))
      }
      onUnitChange={(unit) =>
        onChange(
          unit === "auto"
            ? "auto"
            : serializeMeasurement({ value: parsed.value, unit }),
        )
      }
    />
  );
}
