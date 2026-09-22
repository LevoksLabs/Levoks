"use client";

import React, { useRef, useCallback } from "react";
import { useRoutingStore } from "@/store/routingStore";
import GraphOverview from "../GraphOverview";
import { useEditorStore } from "@/store/editorStore";
import { useBackendStore } from "@/store/backendStore";
import RoutingNodeComponent from "./RoutingNode";
import ConnectionWire from "./ConnectionWire";
import { useCanvasNavigation } from "../useCanvasNavigation";
import { useEditorUIStore } from "@/store/editorUIStore";
import { canvasCommand } from "@/lib/editor-shortcuts";
import { Plus, ZoomIn, ZoomOut, Maximize2, LayoutGrid } from "lucide-react";

const RoutingCanvas: React.FC = () => {
  const {
    nodes,
    connections,
    zoom,
    panX,
    panY,
    connectingFrom,
    mousePos,
    cancelConnecting,
    updateMousePos,
    selectNode,
    selectConnection,
    autoLayoutNodes,
    getPortsForNode,
    addNode,
  } = useRoutingStore();

  const pages = useEditorStore(state => state.pages), services = useBackendStore(state => state.services);
  const selectedNode = useRoutingStore(state => state.selectedNodeId);
  const canvasRef = useRef<HTMLDivElement>(null);
  const fitNodes = (selectedOnly = false, centerOnly = false) => {
    const state = useRoutingStore.getState(),
      viewport = canvasRef.current;
    const selected = selectedOnly
      ? state.nodes.filter((n) => n.id === state.selectedNodeId)
      : state.nodes;
    if (!viewport || !selected.length) return;
    const left = Math.min(...selected.map((n) => n.position.x)),
      top = Math.min(...selected.map((n) => n.position.y));
    const right = Math.max(...selected.map((n) => n.position.x + n.width)),
      bottom = Math.max(...selected.map((n) => n.position.y + n.height));
    const scale = centerOnly
      ? state.zoom
      : Math.max(
          0.1,
          Math.min(
            1.5,
            (viewport.clientWidth - 96) / (right - left),
            (viewport.clientHeight - 140) / (bottom - top),
          ),
        );
    useRoutingStore.setState({
      zoom: scale,
      panX: viewport.clientWidth / 2 - ((left + right) / 2) * scale,
      panY: viewport.clientHeight / 2 - ((top + bottom) / 2) * scale,
    });
  };
  const cursor = useCanvasNavigation(canvasRef, {
    get: () => {
      const s = useRoutingStore.getState();
      return { x: s.panX, y: s.panY, scale: s.zoom };
    },
    apply: (x, y, scale) =>
      useRoutingStore.setState({ panX: x, panY: y, zoom: scale }),
    fit: () => fitNodes(),
    selection: (centerOnly) => fitNodes(true, centerOnly),
    cancel: cancelConnecting,
  });
  const ui = useEditorUIStore();
  const handleMouseMove = (e: React.MouseEvent) => {
    if (connectingFrom && canvasRef.current) {
      const rect = canvasRef.current.getBoundingClientRect();
      updateMousePos(
        (e.clientX - rect.left - panX) / zoom,
        (e.clientY - rect.top - panY) / zoom,
      );
    }
  };
  const handleMouseUp = (e: React.MouseEvent) => {
    if (
      connectingFrom &&
      (e.target as HTMLElement).classList.contains("routing-canvas-transform")
    )
      cancelConnecting();
  };

  // Click empty canvas → deselect
  const handleCanvasClick = (e: React.MouseEvent) => {
    if (
      (e.target as HTMLElement).classList.contains("routing-canvas-transform")
    ) {
      selectNode(null);
      selectConnection(null);
    }
  };

  // ─── Compute port positions for wires ───
  const getPortWorldPosition = useCallback(
    (portId: string): { x: number; y: number } | null => {
      for (const node of nodes) {
        const ports = getPortsForNode(node.id);
        const port = ports.find((p) => p.id === portId);
        if (port) {
          return {
            x: node.position.x + (port.portType === "output" ? node.width : 0),
            y: node.position.y + (port.relativeY ?? 60),
          };
        }
      }
      return null;
    },
    [nodes, getPortsForNode],
  );

  // Connecting-from port position for in-progress wire
  const connectingFromPos = connectingFrom
    ? getPortWorldPosition(connectingFrom.id)
    : null;

  // Drop handler for pages/services
  const handleDrop = useCallback(
    (e: React.DragEvent) => {
      e.preventDefault();
      const data = e.dataTransfer.getData("text/plain");
      if (!data) return;

      try {
        const parsed = JSON.parse(data);
        if (parsed.routingType && parsed.refId) {
          if (canvasRef.current) {
            const rect = canvasRef.current.getBoundingClientRect();
            const x = (e.clientX - rect.left - panX) / zoom;
            const y = (e.clientY - rect.top - panY) / zoom;
            addNode(parsed.routingType, parsed.refId, x, y);
          }
        }
      } catch {
        // ignore non-JSON drops
      }
    },
    [addNode, panX, panY, zoom],
  );

  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault();
    e.dataTransfer.dropEffect = "copy";
  };

  const gridSize = 20;

  return (
    <div
      className="routing-canvas"
      style={{ cursor }}
      aria-label="Routing canvas"
      ref={canvasRef}
      onMouseMove={handleMouseMove}
      onMouseUp={handleMouseUp}
      onClick={handleCanvasClick}
      onDrop={handleDrop}
      onDragOver={handleDragOver}
    >
      {/* Zoom controls */}
      <div className="routing-zoom-controls">
        <button
          className="routing-zoom-btn"
          disabled={ui.viewportLocked}
          onClick={() => canvasCommand("out")}
          title="Zoom out (−)"
        >
          <ZoomOut size={14} />
        </button>
        <span className="routing-zoom-level">{Math.round(zoom * 100)}%</span>
        <button
          className="routing-zoom-btn"
          disabled={ui.viewportLocked}
          onClick={() => canvasCommand("in")}
          title="Zoom in (+)"
        >
          <ZoomIn size={14} />
        </button>
        <div className="routing-zoom-divider" />
        <button
          className="routing-zoom-btn"
          disabled={ui.viewportLocked}
          onClick={() => fitNodes()}
          title="Fit routing canvas (Shift+1)"
        >
          <Maximize2 size={14} />
        </button>
        <button
          className="routing-zoom-btn"
          onClick={autoLayoutNodes}
          title="Auto layout"
        >
          <LayoutGrid size={14} />
        </button>
      </div>

      {/* Top bar */}
      <div className="routing-topbar">
        <h2>Routing Canvas</h2>
        <span className="routing-stats">
          {nodes.length} nodes · {connections.length} connections
        </span>
      </div>

      {/* Infinite canvas area */}
      <div
        className="routing-canvas-transform"
        style={{
          transform: `translate(${panX}px, ${panY}px) scale(${zoom})`,
          transformOrigin: "0 0",
          backgroundImage: ui.gridVisible ? undefined : "none",
          backgroundSize: `${gridSize}px ${gridSize}px`,
          backgroundPosition: `${panX % gridSize}px ${panY % gridSize}px`,
        }}
      >
        {/* Nodes */}
        {nodes.map((node) => (
          <RoutingNodeComponent key={node.id} node={node} />
        ))}

        {/* SVG overlay for connections */}
        <svg className="routing-connections-svg">
          {/* Completed connections */}
          {connections.map((conn) => {
            const fromPos = getPortWorldPosition(conn.fromPortId);
            const toPos = getPortWorldPosition(conn.toPortId);
            if (!fromPos || !toPos) return null;
            return (
              <ConnectionWire
                key={conn.id}
                connection={conn}
                fromPos={fromPos}
                toPos={toPos}
              />
            );
          })}

          {/* In-progress wire */}
          {connectingFrom && connectingFromPos && (
            <path
              d={`M ${connectingFromPos.x} ${connectingFromPos.y} C ${connectingFromPos.x + 80} ${connectingFromPos.y}, ${mousePos.x - 80} ${mousePos.y}, ${mousePos.x} ${mousePos.y}`}
              fill="none"
              stroke="var(--accent)"
              strokeWidth="2"
              strokeDasharray="8 4"
              opacity="0.8"
              className="routing-wire-active"
            />
          )}
        </svg>
      </div>

      {/* Empty state */}
      {nodes.length === 0 && (
        <div className="routing-empty-state">
          <Plus size={32} />
          <p>Drop pages & services here</p>
          <span>
            Drag pages from the left panel and services from the right panel to
            start wiring your application flow.
          </span>
        </div>
      )}
      <GraphOverview items={nodes.map(node => ({ id: node.id, label: node.type === "page" ? pages.find(page => page.id === node.refId)?.title || "Page" : services.find(service => service.id === node.refId)?.name || "Service", x: node.position.x, y: node.position.y, w: node.width, h: node.height, selected: selectedNode === node.id }))} onChoose={id => { selectNode(id); if (!ui.viewportLocked) fitNodes(true, true); }} />
      <p className="graph-connection-status" role="status">{connectingFrom ? `Connecting ${connectingFrom.label}. Focus a port on another node and press Enter to connect, or Escape to cancel.` : `${connections.length} connections. Ports support Enter or Space to start and finish a connection.`}</p>
    </div>
  );
};

export default RoutingCanvas;
