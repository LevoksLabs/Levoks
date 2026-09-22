"use client";

import React, { useCallback, useEffect, useRef, useState } from "react";
import { projectHistory } from "@/store/projectHistory";
import { useRoutingStore } from "@/store/routingStore";
import { useEditorStore } from "@/store/editorStore";
import { useBackendStore } from "@/store/backendStore";
import { RoutingNode, NodePort } from "@/types/routing";
import {
    FileText, Server, Circle, MousePointer2, X,
    Globe, Database, Shield, Zap, Code2, FormInput
} from "lucide-react";

interface Props {
    node: RoutingNode;
}

const PORT_RADIUS = 6;

// Icon map for block types
const getBlockIcon = (type: string) => {
    switch (type) {
        case "rest_endpoint": return <Globe size={10} />;
        case "db_model": return <Database size={10} />;
        case "auth_block": return <Shield size={10} />;
        case "middleware": return <Code2 size={10} />;
        case "logic_if":
        case "logic_loop":
        case "logic_trycatch": return <Zap size={10} />;
        default: return <Circle size={10} />;
    }
};

// Icon for element types
const getElementIcon = (type: string) => {
    switch (type) {
        case "button": return <MousePointer2 size={10} />;
        case "form": return <FormInput size={10} />;
        case "menu": return <Globe size={10} />;
        default: return <Circle size={10} />;
    }
};

const RoutingNodeComponent: React.FC<Props> = ({ node }) => {
    const {
        selectedNodeId,
        selectNode,
        moveNode,
        removeNode,
        getPortsForNode,
        startConnecting,
        endConnecting,
        connectingFrom,
        hoveredPortId,
        setHoveredPort,
    } = useRoutingStore();
    const editorStore = useEditorStore();
    const backendStore = useBackendStore();

    const [isDragging, setIsDragging] = useState(false);
    const dragStart = useRef({ x: 0, y: 0, nodeX: 0, nodeY: 0 });

    const stopDrag = useRef<(() => void) | null>(null);
    useEffect(() => () => stopDrag.current?.(), [node.id]);
    const isSelected = selectedNodeId === node.id;
    const ports = getPortsForNode(node.id);
    const inputPorts = ports.filter((p) => p.portType === "input");
    const outputPorts = ports.filter((p) => p.portType === "output");

    // Get display info
    let title = "Unknown";
    let subtitle = "";
    let color = "var(--accent)";

    if (node.type === "page") {
        const page = editorStore.pages.find((p) => p.id === node.refId);
        if (page) {
            title = page.title;
            subtitle = page.route;
        }
    } else {
        const service = backendStore.services.find((s) => s.id === node.refId);
        if (service) {
            title = service.name;
            subtitle = `Port ${service.port}`;
            color = service.color;
        }
    }

    // ─── Drag to move ───
    const handleMouseDown = useCallback(
        (e: React.MouseEvent) => {
            if (e.button !== 0 || (e.target as HTMLElement).closest(".routing-port")) return;
            if ((e.target as HTMLElement).closest(".routing-node-remove")) return;
            e.stopPropagation();
            projectHistory.begin("routing");
            setIsDragging(true);
            const zoom = useRoutingStore.getState().zoom;
            dragStart.current = {
                x: e.clientX,
                y: e.clientY,
                nodeX: node.position.x,
                nodeY: node.position.y,
            };

            const onMouseMove = (ev: MouseEvent) => {
                const dx = (ev.clientX - dragStart.current.x) / zoom;
                const dy = (ev.clientY - dragStart.current.y) / zoom;
                moveNode(
                    node.id,
                    dragStart.current.nodeX + dx,
                    dragStart.current.nodeY + dy
                );
            };
            const finish = (cancel: boolean) => {
                stopDrag.current = null;
                window.removeEventListener("mousemove", onMouseMove);
                window.removeEventListener("mouseup", onMouseUp);
                window.removeEventListener("blur", onCancel);
                setIsDragging(false);
                projectHistory.end(cancel);
            };
            const onMouseUp = () => finish(false), onCancel = () => finish(true);
            stopDrag.current = onCancel;
            window.addEventListener("mousemove", onMouseMove);
            window.addEventListener("mouseup", onMouseUp);
            window.addEventListener("blur", onCancel);
        },
        [node.id, node.position, moveNode]
    );

    const handleClick = (e: React.MouseEvent) => {
        e.stopPropagation();
        selectNode(node.id);
    };

    // ─── Port interactions ───
    const handlePortMouseDown = (e: React.MouseEvent, port: NodePort) => {
        e.stopPropagation();
        e.preventDefault();
        if (!useRoutingStore.getState().connectingFrom) startConnecting(port);
    };

    const handlePortMouseUp = (e: React.MouseEvent, port: NodePort) => {
        e.stopPropagation();
        const from = useRoutingStore.getState().connectingFrom;
        if (from && from.id !== port.id) endConnecting(port);
    };

    const keyboardPort = (event: React.KeyboardEvent, port: NodePort) => {
        if (event.key !== "Enter" && event.key !== " ") return;
        event.preventDefault(); event.stopPropagation();
        if (connectingFrom) endConnecting(port); else {
            startConnecting(port);
            useRoutingStore.getState().updateMousePos(node.position.x + (port.portType === "output" ? node.width : 0), node.position.y + (port.relativeY || 60));
        }
    };

    // Compute node height based on max port count — use generous sizing for services
    const maxPorts = Math.max(inputPorts.length, outputPorts.length, 1);
    const computedHeight = Math.max(node.height, 90 + maxPorts * 32);

    return (
        <div
            className={`routing-node ${node.type === "page" ? "routing-node-page" : "routing-node-service"} ${isSelected ? "routing-node-selected" : ""} ${isDragging ? "routing-node-dragging" : ""}`}
            style={{
                left: node.position.x,
                top: node.position.y,
                width: node.width,
                height: computedHeight,
            }}
            onMouseDown={handleMouseDown}
            onClick={handleClick}
            tabIndex={0} role="group" aria-label={`${title} routing node`}
            onFocus={event => { if (event.target === event.currentTarget) selectNode(node.id); }}
        >
            {/* Header */}
            <div
                className="routing-node-header"
                style={{
                    borderColor: node.type === "service" ? color : undefined,
                    background: node.type === "service" ? `${color}22` : undefined,
                }}
            >
                <div className="routing-node-icon">
                    {node.type === "page" ? <FileText size={14} /> : <Server size={14} />}
                </div>
                <div className="routing-node-title">
                    <span className="routing-node-name">{title}</span>
                    <span className="routing-node-sub">{subtitle}</span>
                </div>
                <button
                    className="routing-node-remove"
                    aria-label={`Remove ${title} from routing canvas`}
                    onClick={(e) => {
                        e.stopPropagation();
                        removeNode(node.id);
                    }}
                >
                    <X size={12} />
                </button>
            </div>

            {/* Ports */}
            <div className="routing-node-body">
                {/* Input ports (left side) */}
                <div className="routing-ports-column routing-ports-left">
                    {inputPorts.map((port) => (
                        <div
                            key={port.id}
                            role="button" tabIndex={0} aria-label={`${title}: ${port.label} ${port.portType} port`} aria-pressed={connectingFrom?.id === port.id}
                            onKeyDown={event => keyboardPort(event, port)}
                            className={`routing-port routing-port-input ${hoveredPortId === port.id ? "routing-port-hovered" : ""} ${connectingFrom && connectingFrom.portType === "output" ? "routing-port-connectable" : ""}`}
                            onMouseDown={(e) => handlePortMouseDown(e, port)}
                            onMouseUp={(e) => handlePortMouseUp(e, port)}
                            onMouseEnter={() => setHoveredPort(port.id)}
                            onMouseLeave={() => setHoveredPort(null)}
                        >
                            <div className="routing-port-dot" />
                            <span className="routing-port-label">
                                {port.blockType ? getBlockIcon(port.blockType) : null}
                                {port.label}
                            </span>
                        </div>
                    ))}
                </div>

                {/* Output ports (right side) */}
                <div className="routing-ports-column routing-ports-right">
                    {outputPorts.map((port) => (
                        <div
                            key={port.id}
                            role="button" tabIndex={0} aria-label={`${title}: ${port.label} ${port.portType} port`} aria-pressed={connectingFrom?.id === port.id}
                            onKeyDown={event => keyboardPort(event, port)}
                            className={`routing-port routing-port-output ${hoveredPortId === port.id ? "routing-port-hovered" : ""} ${connectingFrom && connectingFrom.portType === "input" ? "routing-port-connectable" : ""}`}
                            onMouseDown={(e) => handlePortMouseDown(e, port)}
                            onMouseUp={(e) => handlePortMouseUp(e, port)}
                            onMouseEnter={() => setHoveredPort(port.id)}
                            onMouseLeave={() => setHoveredPort(null)}
                        >
                            <span className="routing-port-label">
                                {port.elementType ? getElementIcon(port.elementType) : null}
                                {port.label}
                            </span>
                            <div className="routing-port-dot" />
                        </div>
                    ))}
                </div>
            </div>

            {/* Type badge */}
            <div
                className="routing-node-badge"
                style={{ background: node.type === "service" ? color : undefined }}
            >
                {node.type}
            </div>
        </div>
    );
};

export default RoutingNodeComponent;
