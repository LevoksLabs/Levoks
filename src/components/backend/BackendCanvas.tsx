"use client";

import React, { useEffect, useState, useRef } from "react";
import { useBackendStore } from "@/store/backendStore";
import ServiceWorkflow from "./ServiceWorkflow";
import GraphOverview from "../GraphOverview";
import ServiceContainerComponent from "./ServiceContainer";
import { Plus, Zap, Minus, Maximize2 } from "lucide-react";
import { useCanvasNavigation } from "../useCanvasNavigation";
import { useEditorUIStore } from "@/store/editorUIStore";
import { canvasCommand } from "@/lib/editor-shortcuts";

const BackendCanvas: React.FC = () => {
  const [workflowOpen, setWorkflowOpen] = useState(false);
  const { services, connections, addService, selectService, selectBlock, selectedServiceId } =
    useBackendStore();
  const viewport = useRef<HTMLDivElement>(null),
    world = useRef<HTMLDivElement>(null);
  const [view, setView] = useState({ x: 24, y: 24, scale: 1 });
  const viewRef = useRef(view);
  const apply = (x: number, y: number, scale: number) => {
    viewRef.current = { x, y, scale };
    setView({ x, y, scale });
  };
  const ui = useEditorUIStore();
  const fit = (selectedOnly = false, centerOnly = false) => {
    const root = viewport.current;
    if (!root) return;
    const selectedId = useBackendStore.getState().selectedServiceId;
    const cards = Array.from(
      root.querySelectorAll<HTMLElement>(".service-container"),
    ).filter((el) => !selectedOnly || el.id === `service-${selectedId}`);
    if (!cards.length) return;
    const rects = cards.map((card) => card.getBoundingClientRect()),
      bounds = root.getBoundingClientRect(),
      old = viewRef.current;
    const left =
        (Math.min(...rects.map((r) => r.left)) - bounds.left - old.x) /
        old.scale,
      top =
        (Math.min(...rects.map((r) => r.top)) - bounds.top - old.y) / old.scale;
    const right =
        (Math.max(...rects.map((r) => r.right)) - bounds.left - old.x) /
        old.scale,
      bottom =
        (Math.max(...rects.map((r) => r.bottom)) - bounds.top - old.y) /
        old.scale;
    const scale = centerOnly
      ? old.scale
      : Math.max(
          0.1,
          Math.min(
            1.5,
            (root.clientWidth - 72) / (right - left),
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
    selection: (center) => fit(true, center),
  });
  const [connectionPaths, setConnectionPaths] = useState<
    { id: string; d: string; label: string; x: number; y: number }[]
  >([]);

  const handleCanvasClick = (e: React.MouseEvent) => {
    if ((e.target as HTMLElement).classList.contains("backend-canvas-area")) {
      selectService(null);
      selectBlock(null);
    }
  };

  useEffect(() => {
    const computePaths = () => {
      const canvas = world.current;
      if (!canvas) return;
      const canvasRect = canvas.getBoundingClientRect();
      const next = connections
        .map((conn) => {
          const fromEl = document.getElementById(
            `service-${conn.fromServiceId}`,
          );
          const toEl = document.getElementById(`service-${conn.toServiceId}`);
          if (!fromEl || !toEl) return null;
          const fromRect = fromEl.getBoundingClientRect();
          const toRect = toEl.getBoundingClientRect();
          const x1 = (fromRect.right - canvasRect.left) / view.scale;
          const y1 =
            (fromRect.top + fromRect.height / 2 - canvasRect.top) / view.scale;
          const x2 = (toRect.left - canvasRect.left) / view.scale;
          const y2 =
            (toRect.top + toRect.height / 2 - canvasRect.top) / view.scale;
          const d = `M ${x1} ${y1} C ${x1 + 60} ${y1}, ${x2 - 60} ${y2}, ${x2} ${y2}`;
          return {
            id: conn.id,
            d,
            label: conn.label,
            x: (x1 + x2) / 2,
            y: (y1 + y2) / 2 - 8,
          };
        })
        .filter(
          (
            v,
          ): v is {
            id: string;
            d: string;
            label: string;
            x: number;
            y: number;
          } => Boolean(v),
        );
      setConnectionPaths(next);
    };

    const rafId = requestAnimationFrame(computePaths);
    const handleResize = () => requestAnimationFrame(computePaths);
    const canvas = document.querySelector(".backend-canvas-area");
    window.addEventListener("resize", handleResize);
    canvas?.addEventListener("scroll", handleResize);

    return () => {
      cancelAnimationFrame(rafId);
      window.removeEventListener("resize", handleResize);
      canvas?.removeEventListener("scroll", handleResize);
    };
  }, [connections, services, view.scale]);

  const workflowService = services.find(service => service.id === selectedServiceId) || services[0];
  if (workflowOpen && workflowService) return <ServiceWorkflow key={workflowService.id} service={workflowService} onClose={() => setWorkflowOpen(false)} />;

  return (
    <div className="backend-canvas">
      {/* Top bar */}
      <div className="backend-topbar">
        <div className="backend-topbar-left">
          <Zap size={14} />
          <span>Backend Services</span>
          <span className="backend-service-count">
            {services.length} service{services.length !== 1 ? "s" : ""}
          </span>
        </div>
        <div className="backend-topbar-right">
          <button disabled={!services.length} className="backend-add-service-btn" onClick={() => setWorkflowOpen(true)}>Open workflow</button>
          <button
            className="backend-add-service-btn"
            onClick={() => addService()}
          >
            <Plus size={14} />
            Add Service
          </button>
        </div>
      </div>

      {/* Canvas area */}
      <div
        ref={viewport}
        className={`backend-canvas-area ${ui.gridVisible ? "show-grid" : ""}`}
        style={{ cursor }}
        aria-label="Backend canvas"
        onClick={handleCanvasClick}
      >
        {services.length === 0 ? (
          <div className="backend-empty-state">
            <div className="backend-empty-icon">
              <Zap size={48} strokeWidth={1} />
            </div>
            <h3>No Backend Services Yet</h3>
            <p>
              Create your first service container to start building your backend
            </p>
            <button className="backend-empty-cta" onClick={() => addService()}>
              <Plus size={16} />
              Create Service
            </button>
          </div>
        ) : (
          <div
            ref={world}
            className="backend-world"
            style={{
              transform: `translate(${view.x}px,${view.y}px) scale(${view.scale})`,
            }}
          >
            {services.map((service, index) => (
              <ServiceContainerComponent
                key={service.id}
                service={service}
                position={service.position || { x: index * 390, y: 0 }}
                scale={view.scale}
              />
            ))}
            <svg className="backend-connections-svg">
              <defs>
                <marker
                  id="backend-arrow"
                  viewBox="0 0 10 10"
                  refX="9"
                  refY="5"
                  markerWidth="6"
                  markerHeight="6"
                  orient="auto"
                >
                  <path d="M 0 0 L 10 5 L 0 10 z" fill="var(--accent)" />
                </marker>
              </defs>
              {connectionPaths.map((conn) => (
                <g key={conn.id}>
                  <path
                    d={conn.d}
                    fill="none"
                    stroke="var(--accent)"
                    strokeWidth="1.5"
                    markerEnd="url(#backend-arrow)"
                  />
                  <text
                    x={conn.x}
                    y={conn.y}
                    fill="var(--text-2)"
                    fontSize="11"
                    textAnchor="middle"
                  >
                    {conn.label}
                  </text>
                </g>
              ))}
            </svg>
          </div>
        )}
      </div>

      <div className="backend-viewport-controls">
        <button
          aria-label="Zoom out backend canvas"
          disabled={ui.viewportLocked}
          onClick={() => canvasCommand("out")}
        >
          <Minus size={14} />
        </button>
        <span>{Math.round(view.scale * 100)}%</span>
        <button
          aria-label="Zoom in backend canvas"
          disabled={ui.viewportLocked}
          onClick={() => canvasCommand("in")}
        >
          <Plus size={14} />
        </button>
        <button
          aria-label="Fit backend canvas"
          title="Fit canvas (Shift+1)"
          disabled={ui.viewportLocked}
          onClick={() => fit()}
        >
          <Maximize2 size={14} />
        </button>
      </div>
      <GraphOverview items={services.map((service, index) => ({ id: service.id, label: service.name, x: service.position?.x ?? index * 390, y: service.position?.y ?? 0, w: 340, h: service.collapsed ? 80 : 120 + service.blocks.length * 60, selected: useBackendStore.getState().selectedServiceId === service.id }))} onChoose={id => { selectService(id); if (!ui.viewportLocked) fit(true, true); }} />
    </div>
  );
};

export default BackendCanvas;
