"use client";
import { useEffect, useRef } from "react";
import { useEditorStore } from "@/store/editorStore";
import { vectorPath } from "@/lib/design";
import type { ElementNode } from "@/types";

export default function VectorShape({
  element,
  editable,
}: {
  element: ElementNode;
  editable: boolean;
}) {
  const vector = element.vector!;
  const drag = useRef<{
    index: number;
    kind: "anchor" | "in" | "out";
    vector: typeof vector;
  } | null>(null);
  useEffect(() => () => {
    if (drag.current) {
      drag.current = null;
      useEditorStore.getState().endInteraction(true);
    }
  }, [element.id, editable]);
  const start = (
    event: React.PointerEvent<SVGCircleElement>,
    index: number,
    kind: "anchor" | "in" | "out",
  ) => {
    event.preventDefault();
    event.stopPropagation();
    if (event.button !== 0) return;
    useEditorStore.getState().beginInteraction();
    drag.current = { index, kind, vector: structuredClone(vector) };
    event.currentTarget.setPointerCapture(event.pointerId);
  };
  const move = (event: React.PointerEvent<SVGCircleElement>) => {
    const active = drag.current,
      svg = event.currentTarget.ownerSVGElement;
    if (!active || !svg) return;
    const matrix = svg.getScreenCTM()?.inverse();
    if (!matrix) return;
    const p = new DOMPoint(event.clientX, event.clientY).matrixTransform(
      matrix,
    );
    const original = active.vector.points[active.index],
      x = Math.max(-10000, Math.min(10000, p.x)),
      y = Math.max(-10000, Math.min(10000, p.y));
    const point =
      active.kind === "anchor"
        ? {
            ...original,
            x,
            y,
            ...(original.inX === undefined
              ? {}
              : {
                  inX: original.inX + x - original.x,
                  inY: original.inY! + y - original.y,

                }),
            ...(original.outX === undefined ? {} : { outX: original.outX + x - original.x, outY: original.outY! + y - original.y }),
          }
        : { ...original, [`${active.kind}X`]: x, [`${active.kind}Y`]: y };
    useEditorStore
      .getState()
      .updateElement(element.id, {
        vector: {
          ...active.vector,
          points: active.vector.points.map((entry, index) =>
            index === active.index ? point : entry,
          ),
        },
      });
  };
  const handle = (
    index: number,
    kind: "anchor" | "in" | "out",
    x: number,
    y: number,
  ) => (
    <circle
      key={kind}
      data-vector-handle="true"
      cx={x}
      cy={y}
      r={kind === "anchor" ? 2.5 : 2}
      fill={kind === "anchor" ? "white" : "#b899ff"}
      stroke="#7654ba"
      strokeWidth="1"
      vectorEffect="non-scaling-stroke"
      style={{ cursor: "crosshair" }}
      onPointerDown={(event) => start(event, index, kind)}
      onPointerMove={move}
      onPointerUp={(event) => {
        move(event);
        drag.current = null;
        useEditorStore.getState().endInteraction();
        event.currentTarget.releasePointerCapture(event.pointerId);
      }}
      onPointerCancel={() => {
        drag.current = null;
        useEditorStore.getState().endInteraction(true);
      }}
    />
  );
  return (
    <svg
      viewBox="0 0 100 100"
      preserveAspectRatio="none"
      style={{
        width: "100%",
        height: "100%",
        overflow: "visible",
        touchAction: "none",
      }}
      aria-label={element.label || "Vector shape"}
    >
      <path
        d={vectorPath(vector)}
        fill={vector.closed ? vector.fill : "none"}
        stroke={vector.stroke}
        strokeWidth={vector.strokeWidth}
        vectorEffect="non-scaling-stroke"
      />
      {editable &&
        vector.points.map((p, index) => (
          <g key={index}>
            {(p.inX !== undefined || p.outX !== undefined) && (
              <>
                <path
                  d={`M ${p.inX ?? p.x} ${p.inY ?? p.y} L ${p.x} ${p.y} L ${p.outX ?? p.x} ${p.outY ?? p.y}`}
                  stroke="#7654ba"
                  strokeWidth="1"
                  vectorEffect="non-scaling-stroke"
                />
                {p.inX !== undefined && handle(index, "in", p.inX, p.inY!)}
                {p.outX !== undefined && handle(index, "out", p.outX, p.outY!)}
              </>
            )}
            {handle(index, "anchor", p.x, p.y)}
          </g>
        ))}
    </svg>
  );
}
