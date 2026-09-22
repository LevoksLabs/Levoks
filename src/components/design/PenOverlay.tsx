"use client";
import { useCallback, useEffect, useRef, useState } from "react";
import { useEditorStore } from "@/store/editorStore";
import { useEditorUIStore } from "@/store/editorUIStore";
import { vectorPath } from "@/lib/design";
import type { ElementNode } from "@/types";
import { isEditingTarget } from "@/lib/editor-shortcuts";

type Point = NonNullable<ElementNode["vector"]>["points"][number];
export default function PenOverlay({
  width,
  height,
  scale,
}: {
  width: number;
  height: number;
  scale: number;
}) {
  const [points, setPoints] = useState<Point[]>([]);
  const svg = useRef<SVGSVGElement>(null);
  const drawing = useRef<number | null>(null);
  const finish = useCallback(
    (closed: boolean) => {
      if (points.length < 2) return;
      const xs = points.flatMap((p) => [p.x, p.inX ?? p.x, p.outX ?? p.x]),
        ys = points.flatMap((p) => [p.y, p.inY ?? p.y, p.outY ?? p.y]);
      const x = Math.min(...xs),
        y = Math.min(...ys),
        w = Math.max(40, Math.max(...xs) - x),
        h = Math.max(40, Math.max(...ys) - y);
      const normalized = points.map((p) => ({
        x: ((p.x - x) / w) * 100,
        y: ((p.y - y) / h) * 100,
        ...(p.inX === undefined
          ? {}
          : {
              inX: ((p.inX - x) / w) * 100,
              inY: ((p.inY! - y) / h) * 100,
              outX: ((p.outX! - x) / w) * 100,
              outY: ((p.outY! - y) / h) * 100,
            }),
      }));
      useEditorStore
        .getState()
        .addElement(
          {
            type: "shape",
            label: closed ? "Custom shape" : "Vector path",
            props: {},
            styles: { backgroundColor: "transparent", padding: "0" },
            layout: { w, h },
            vector: {
              points: normalized,
              closed,
              stroke: "#7654ba",
              strokeWidth: 2,
              fill: "#c2adf5",
            },
          },
          undefined,
          x,
          y,
        );
      useEditorUIStore.getState().setTool("select");
    },
    [points],
  );
  useEffect(() => {
    const handle = (event: KeyboardEvent) => {
      if (isEditingTarget(event.target)) return;
      if (
        event.key === "Escape" ||
        event.key === "Enter" ||
        event.key === "Backspace"
      ) {
        event.preventDefault();
        event.stopImmediatePropagation();
        if (event.key === "Escape")
          useEditorUIStore.getState().setTool("select");
        else if (event.key === "Enter") finish(false);
        else setPoints((current) => current.slice(0, -1));
      }
    };
    window.addEventListener("keydown", handle, true);
    return () => window.removeEventListener("keydown", handle, true);
  }, [finish]);
  const position = (event: React.PointerEvent) => {
    const rect = svg.current!.getBoundingClientRect();
    return {
      x: Math.max(
        0,
        Math.min(width, ((event.clientX - rect.left) / rect.width) * width),
      ),
      y: Math.max(
        0,
        Math.min(height, ((event.clientY - rect.top) / rect.height) * height),
      ),
    };
  };
  return (
    <>
      <svg
        ref={svg}
        className="pen-overlay"
        aria-label="Vector drawing surface"
        viewBox={`0 0 ${width} ${height}`}
        onClick={event => event.stopPropagation()}
        onPointerDown={(event) => {
          if (event.button !== 0) return;
          event.preventDefault();
          event.stopPropagation();
          const p = position(event);
          if (
            points.length > 2 &&
            Math.hypot(p.x - points[0].x, p.y - points[0].y) * scale < 10
          ) {
            finish(true);
            return;
          }
          if (points.length >= 500) return;
          drawing.current = points.length;
          setPoints((current) => [...current, p]);
          event.currentTarget.setPointerCapture(event.pointerId);
        }}
        onPointerMove={(event) => {
          if (drawing.current === null) return;
          const next = position(event),
            index = drawing.current;
          setPoints((current) =>
            current.map((p, i) =>
              i === index && Math.hypot(next.x - p.x, next.y - p.y) * scale > 3
                ? {
                    ...p,
                    outX: next.x,
                    outY: next.y,
                    inX: 2 * p.x - next.x,
                    inY: 2 * p.y - next.y,
                  }
                : p,
            ),
          );
        }}
        onPointerUp={(event) => {
          drawing.current = null;
          event.currentTarget.releasePointerCapture(event.pointerId);
        }}
        onPointerCancel={() => {
          drawing.current = null;
          setPoints((current) => current.slice(0, -1));
        }}
      >
        <path
          d={vectorPath({
            points,
            closed: false,
            fill: "none",
            stroke: "#7654ba",
            strokeWidth: 2,
          })}
          fill="none"
          stroke="#7654ba"
          strokeWidth={2 / scale}
        />
        {points.map((p, index) => (
          <g key={index}>
            {p.inX !== undefined && (
              <>
                <path
                  d={`M ${p.inX} ${p.inY} L ${p.outX} ${p.outY}`}
                  stroke="#7654ba"
                  strokeWidth={1 / scale}
                />
                <circle cx={p.outX} cy={p.outY} r={3 / scale} fill="#7654ba" />
              </>
            )}
            <circle
              cx={p.x}
              cy={p.y}
              r={4 / scale}
              fill="white"
              stroke="#7654ba"
              strokeWidth={2 / scale}
            />
          </g>
        ))}
      </svg>
      <div
        className="pen-instructions"
        style={{
          transform: `scale(${1 / scale})`,
          transformOrigin: "top left",
        }}
        onPointerDown={(event) => event.stopPropagation()}
        onClick={(event) => event.stopPropagation()}
      >
        <span>
          Click for corners. Drag for curves. Click the first point to close.
        </span>
        <button disabled={points.length < 2} onClick={() => finish(false)}>
          Finish path
        </button>
        <button disabled={points.length < 3} onClick={() => finish(true)}>
          Close shape
        </button>
        <button onClick={() => useEditorUIStore.getState().setTool("select")}>
          Cancel
        </button>
      </div>
    </>
  );
}
