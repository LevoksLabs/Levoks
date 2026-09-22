"use client";
import { useEffect, useRef, useState } from "react";
import { projectHistory } from "@/store/projectHistory";
import { ArrowLeft, Maximize2 } from "lucide-react";
import { useBackendStore } from "@/store/backendStore";
import { useEditorUIStore } from "@/store/editorUIStore";
import {
  workflowOutputs,
  editWorkflow,
  executableBlock,
} from "@/lib/backend/workflow-editor";
import type { ServiceContainer } from "@/types/backend";
import { useCanvasNavigation } from "../useCanvasNavigation";
import GraphOverview from "../GraphOverview";
export default function ServiceWorkflow({
  service,
  onClose,
}: {
  service: ServiceContainer;
  onClose: () => void;
}) {
  const store = useBackendStore(),
    ui = useEditorUIStore();
  const [view, setView] = useState({ x: 24, y: 24, scale: 0.85 }),
    viewRef = useRef(view),
    viewport = useRef<HTMLDivElement>(null);
  const [connecting, setConnecting] = useState<{
      id: string;
      field: string;
    } | null>(null),
    [error, setError] = useState("");
  const [edge, setEdge] = useState<{
    id: string;
    field: string;
    index: number;
  } | null>(null);
  const drag = useRef<{
    id: string;
    x: number;
    y: number;
    left: number;
    top: number;
  } | null>(null);
  useEffect(() => () => { if (drag.current) { drag.current = null; projectHistory.end(true); } }, [service.id]);
  const nodes = service.blocks.map((block, index) => ({
    block,
    x:
      block.position.placed || block.position.x || block.position.y
        ? block.position.x
        : (index % 3) * 310,
    y:
      block.position.placed || block.position.x || block.position.y
        ? block.position.y
        : Math.floor(index / 3) * 230,
    h: 100 + workflowOutputs(block).length * 28,
  }));
  const apply = (x: number, y: number, scale: number) => {
    viewRef.current = { x, y, scale };
    setView(viewRef.current);
  };
  const fit = (id?: string) => {
    const root = viewport.current,
      chosen = id ? nodes.filter((node) => node.block.id === id) : nodes;
    if (!root || !chosen.length) return;
    const left = Math.min(...chosen.map((node) => node.x)),
      top = Math.min(...chosen.map((node) => node.y)),
      right = Math.max(...chosen.map((node) => node.x + 250)),
      bottom = Math.max(...chosen.map((node) => node.y + node.h));
    const scale = id
      ? viewRef.current.scale
      : Math.max(
          0.1,
          Math.min(
            1.25,
            (root.clientWidth - 80) / (right - left),
            (root.clientHeight - 100) / (bottom - top),
          ),
        );
    apply(
      root.clientWidth / 2 - ((left + right) / 2) * scale,
      root.clientHeight / 2 - ((top + bottom) / 2) * scale,
      scale,
    );
  };
  const cursor = useCanvasNavigation(viewport, {
    get: () => viewRef.current,
    apply,
    fit: () => fit(),
    selection: () => fit(store.selectedBlockId || undefined),
    cancel: () => setConnecting(null),
  });
  const edit = (id: string, field: string, ids: string[]) => {
    try {
      const next = editWorkflow(service, id, field, ids);
      const block = next.blocks.find((block) => block.id === id)!;
      store.updateBlock(service.id, id, block);
      setError("");
      return true;
    } catch (failure) {
      setError(
        failure instanceof Error ? failure.message : "Connection failed.",
      );
      return false;
    }
  };
  const edges = nodes.flatMap((node) =>
    workflowOutputs(node.block).flatMap((output, outputIndex) =>
      output.ids.flatMap((target, index) => {
        const to = nodes.find((item) => item.block.id === target);
        return to
          ? [
              {
                id: node.block.id,
                field: output.field,
                index,
                label: `${output.label} ${index + 1}`,
                x1: node.x + 250,
                y1: node.y + 90 + outputIndex * 28,
                x2: to.x,
                y2: to.y + 60,
              },
            ]
          : [];
      }),
    ),
  );
  return (
    <div className="service-workflow">
      <div className="backend-topbar">
        <button onClick={onClose}>
          <ArrowLeft size={14} />
          Services
        </button>
        <strong>{service.name} · workflow</strong>
        <button
          disabled={ui.viewportLocked}
          onClick={() => fit()}
          aria-label="Fit workflow"
        >
          <Maximize2 size={15} />
        </button>
      </div>
      <div
        ref={viewport}
        className="workflow-viewport"
        style={{ cursor }}
        aria-label="Backend workflow canvas"
      >
        <div
          className="workflow-world"
          style={{
            transform: `translate(${view.x}px, ${view.y}px) scale(${view.scale})`,
          }}
        >
          <svg className="workflow-wires">
            {edges.map((link) => (
              <g key={`${link.id}-${link.field}-${link.index}`}>
                <path
                  d={`M ${link.x1} ${link.y1} C ${link.x1 + 90} ${link.y1}, ${link.x2 - 90} ${link.y2}, ${link.x2} ${link.y2}`}
                  fill="none"
                  stroke={
                    edge?.id === link.id &&
                    edge.field === link.field &&
                    edge.index === link.index
                      ? "var(--yellow)"
                      : "var(--accent)"
                  }
                  strokeWidth="3"
                  role="button"
                  tabIndex={0}
                  aria-label={`Select ${link.label} connection`}
                  style={{ pointerEvents: "stroke", cursor: "pointer" }}
                  onClick={() => setEdge(link)}
                  onKeyDown={(event) => {
                    if (event.key === "Enter" || event.key === " ") {
                      event.preventDefault();
                      event.stopPropagation();
                      setEdge(link);
                    }
                  }}
                />
                <text
                  x={(link.x1 + link.x2) / 2}
                  y={(link.y1 + link.y2) / 2 - 8}
                  fill="var(--text-2)"
                  fontSize="11"
                >
                  {link.label}
                </text>
              </g>
            ))}
          </svg>
          {nodes.map((node) => (
            <div
              key={node.block.id}
              className={`workflow-block ${store.selectedBlockId === node.block.id ? "selected" : ""}`}
              style={{ left: node.x, top: node.y, minHeight: node.h }}
              onPointerDown={(event) => {
                if (
                  event.button !== 0 ||
                  (event.target as HTMLElement).closest("button")
                )
                  return;
                event.stopPropagation();
                projectHistory.begin("backend");
                drag.current = {
                  id: node.block.id,
                  x: event.clientX,
                  y: event.clientY,
                  left: node.x,
                  top: node.y,
                };
                event.currentTarget.setPointerCapture(event.pointerId);
                store.selectBlock(node.block.id);
              }}
              onPointerMove={(event) => {
                const current = drag.current;
                if (current)
                  store.moveBlock(
                    service.id,
                    current.id,
                    current.left + (event.clientX - current.x) / view.scale,
                    current.top + (event.clientY - current.y) / view.scale,
                  );
              }}
              onPointerUp={(event) => {
                if (drag.current) projectHistory.end();
                drag.current = null;
                if (event.currentTarget.hasPointerCapture(event.pointerId))
                  event.currentTarget.releasePointerCapture(event.pointerId);
              }}
              onPointerCancel={() => {
                if (drag.current) projectHistory.end(true);
                drag.current = null;
              }}
            >
              <button
                className="workflow-block-title"
                onClick={() => store.selectBlock(node.block.id)}
                title="Select block; use arrow keys to move, Shift for 10 pixels"
                onKeyDown={(event) => {
                  if (
                    ![
                      "ArrowLeft",
                      "ArrowRight",
                      "ArrowUp",
                      "ArrowDown",
                    ].includes(event.key)
                  )
                    return;
                  event.preventDefault();
                  event.stopPropagation();
                  const distance = event.shiftKey ? 10 : 1;
                  store.moveBlock(
                    service.id,
                    node.block.id,
                    node.x +
                      (event.key === "ArrowLeft"
                        ? -distance
                        : event.key === "ArrowRight"
                          ? distance
                          : 0),
                    node.y +
                      (event.key === "ArrowUp"
                        ? -distance
                        : event.key === "ArrowDown"
                          ? distance
                          : 0),
                  );
                }}
              >
                {node.block.label}
              </button>
              <span>{node.block.type.replaceAll("_", " ")}</span>
              {executableBlock(node.block) && (
                <button
                  className="workflow-input"
                  aria-label={`Connect to ${node.block.label}`}
                  disabled={!connecting}
                  onClick={() => {
                    if (!connecting) return;
                    const source = service.blocks.find(
                      (block) => block.id === connecting.id,
                    )!;
                    const output = workflowOutputs(source).find(
                      (output) => output.field === connecting.field,
                    )!;
                    if (
                      edit(source.id, output.field, [
                        ...output.ids,
                        node.block.id,
                      ])
                    )
                      setConnecting(null);
                  }}
                >
                  Input
                </button>
              )}
              {workflowOutputs(node.block).map((output) => (
                <button
                  key={output.field}
                  className="workflow-output"
                  aria-label={`${node.block.label}: ${output.label} output`}
                  aria-pressed={
                    connecting?.id === node.block.id &&
                    connecting.field === output.field
                  }
                  onClick={() => {
                    setConnecting({ id: node.block.id, field: output.field });
                    setEdge(null);
                    setError("");
                  }}
                >
                  {output.label}
                  <span>{output.ids.length} →</span>
                </button>
              ))}
            </div>
          ))}
        </div>
        <GraphOverview
          items={nodes.map((node) => ({
            id: node.block.id,
            label: node.block.label,
            x: node.x,
            y: node.y,
            w: 250,
            h: node.h,
            selected: store.selectedBlockId === node.block.id,
          }))}
          onChoose={(id) => {
            store.selectBlock(id);
            if (!ui.viewportLocked) fit(id);
          }}
        />
      </div>
      <div className="workflow-status">
        <span role={error ? "alert" : "status"}>
          {error ||
            (connecting
              ? "Choose an input. Connections execute in their numbered order."
              : "Drag blocks to organize. Choose an output, then an input to connect. Edit operation details in the Inspector.")}
        </span>
        {connecting && (
          <button onClick={() => setConnecting(null)}>Cancel connection</button>
        )}
        {edge && (
          <button
            onClick={() => {
              const source = service.blocks.find(
                  (block) => block.id === edge.id,
                ),
                output =
                  source &&
                  workflowOutputs(source).find(
                    (output) => output.field === edge.field,
                  );
              if (
                output &&
                edit(
                  edge.id,
                  edge.field,
                  output.ids.filter((_, index) => index !== edge.index),
                )
              )
                setEdge(null);
            }}
          >
            Remove selected connection
          </button>
        )}
      </div>
    </div>
  );
}
