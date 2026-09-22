"use client";

import React, { useState } from "react";
import { useRoutingStore } from "@/store/routingStore";
import { RoutingConnection } from "@/types/routing";
import { X } from "lucide-react";

interface Props {
    connection: RoutingConnection;
    fromPos: { x: number; y: number };
    toPos: { x: number; y: number };
}

const ConnectionWire: React.FC<Props> = ({ connection, fromPos, toPos }) => {
    const { selectedConnectionId, selectConnection, removeConnection } = useRoutingStore();
    const [hovered, setHovered] = useState(false);
    const isSelected = selectedConnectionId === connection.id;

    // Cubic Bézier control points
    const dx = Math.abs(toPos.x - fromPos.x);
    const offset = Math.max(60, dx * 0.4);
    const d = `M ${fromPos.x} ${fromPos.y} C ${fromPos.x + offset} ${fromPos.y}, ${toPos.x - offset} ${toPos.y}, ${toPos.x} ${toPos.y}`;

    const midX = (fromPos.x + toPos.x) / 2;
    const midY = (fromPos.y + toPos.y) / 2;

    return (
        <g
            className={`routing-wire-group ${isSelected ? "routing-wire-selected" : ""}`}
            tabIndex={0}
            role="button"
            aria-label={`Select connection ${connection.label || connection.id}`}
            onKeyDown={e=>{if(e.key==='Enter'){e.preventDefault();selectConnection(connection.id);}}}
            onMouseEnter={() => setHovered(true)}
            onMouseLeave={() => setHovered(false)}
        >
            {/* Invisible wider path for easier mouse targeting */}
            <path
                d={d}
                fill="none"
                stroke="transparent"
                strokeWidth="16"
                style={{ cursor: "pointer" }}
                onClick={(e) => {
                    e.stopPropagation();
                    selectConnection(connection.id);
                }}
            />

            <defs><marker id={`arrow-${connection.id}`} viewBox="0 0 10 10" refX="9" refY="5" markerWidth="5" markerHeight="5" orient="auto"><path d="M 0 0 L 10 5 L 0 10 z" fill={isSelected?'var(--accent)':'var(--text-3)'}/></marker></defs>
            {/* Visible wire */}
            <path
                d={d}
                fill="none"
                stroke={isSelected ? "var(--accent)" : "var(--text-3)"}
                strokeWidth={isSelected ? 2.5 : 2}
                markerEnd={`url(#arrow-${connection.id})`}
                strokeDasharray={connection.animated ? "none" : "6 3"}
                opacity={hovered || isSelected ? 1 : 0.6}
                className={connection.animated ? "routing-wire-animated" : ""}
            />

            {/* Flow dots for animated wires */}
            {connection.animated && (
                <circle className="routing-flow-dot" r="3" fill="var(--accent)" opacity="0.9">
                    <animateMotion
                        dur="2s"
                        repeatCount="indefinite"
                        path={d}
                    />
                </circle>
            )}

            {/* Delete button at midpoint on hover */}
            {(hovered || isSelected) && (
                <g
                    className="routing-wire-delete"
                    onClick={(e) => {
                        e.stopPropagation();
                        removeConnection(connection.id);
                    }}
                    style={{ cursor: "pointer" }}
                >
                    <circle cx={midX} cy={midY} r="10" fill="var(--bg-panel)" stroke="var(--border)" strokeWidth="1" />
                    <foreignObject x={midX - 6} y={midY - 6} width="12" height="12">
                        <X size={12} color="var(--text-2)" />
                    </foreignObject>
                </g>
            )}

            {/* Label */}
            {connection.label && (
                <text
                    x={midX}
                    y={midY - 14}
                    fill="var(--text-3)"
                    fontSize="10"
                    textAnchor="middle"
                >
                    {connection.label}
                </text>
            )}
        </g>
    );
};

export default ConnectionWire;
