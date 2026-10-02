"use client";

import React from "react";
import { ConnectionContract } from "./ConnectionContract";
import { useRoutingStore } from "@/store/routingStore";
import { useBackendStore } from "@/store/backendStore";
import {
    Server, Globe, Database, Shield, Code2, Zap,
    Trash2, Link, Unlink, GripVertical
} from "lucide-react";

const RoutingRightPanel: React.FC = () => {
    const {
        nodes,
        connections,
        selectedNodeId,
        selectedConnectionId,
        removeConnection,
        getPortsForNode,
        getConnectionsForNode,
    } = useRoutingStore();
    const backendStore = useBackendStore();

    const selectedNode = nodes.find((n) => n.id === selectedNodeId);
    const selectedConnection = connections.find((c) => c.id === selectedConnectionId);

    // ─── Block Icon ───
    const getBlockIcon = (type: string, size: number = 14) => {
        switch (type) {
            case "rest_endpoint": return <Globe size={size} />;
            case "db_model": return <Database size={size} />;
            case "auth_block": return <Shield size={size} />;
            case "middleware": return <Code2 size={size} />;
            case "logic_if":
            case "logic_loop":
            case "logic_trycatch": return <Zap size={size} />;
            default: return <Server size={size} />;
        }
    };

    return (
        <div className="routing-right-panel">
            {/* Backend Services — Draggable onto canvas */}
            <div className="routing-rp-section">
                <div className="routing-rp-header">
                    <h3>Backend Services</h3>
                    <span className="routing-rp-count">{backendStore.services.length}</span>
                </div>
                <div className="routing-rp-list">
                    {backendStore.services.length === 0 ? (
                        <div className="routing-rp-empty">
                            <Server size={20} />
                            <span>No services yet. Create services in the Backend builder.</span>
                        </div>
                    ) : (
                        backendStore.services.map((service) => {
                            const alreadyOnCanvas = nodes.some(
                                (n) => n.type === "service" && n.refId === service.id
                            );
                            return (
                                <div
                                    key={service.id}
                                    className={`routing-rp-item ${alreadyOnCanvas ? "routing-rp-item-placed" : ""}`}
                                    draggable={!alreadyOnCanvas}
                                    onDragStart={(e) => {
                                        e.dataTransfer.setData(
                                            "text/plain",
                                            JSON.stringify({ routingType: "service", refId: service.id })
                                        );
                                        e.dataTransfer.effectAllowed = "copy";
                                    }}
                                >
                                    <GripVertical size={12} className="routing-rp-grip" />
                                    <div
                                        className="routing-rp-color"
                                        style={{ background: service.color }}
                                    />
                                    <div className="routing-rp-info">
                                        <span className="routing-rp-name">{service.name}</span>
                                        <span className="routing-rp-sub">
                                            {service.blocks.length} blocks · Port {service.port}
                                        </span>
                                    </div>
                                    {alreadyOnCanvas && (
                                        <span className="routing-rp-badge">On Canvas</span>
                                    )}
                                </div>
                            );
                        })
                    )}
                </div>
            </div>

            {/* Node Inspector */}
            {selectedNode && (
                <div className="routing-rp-section">
                    <div className="routing-rp-header">
                        <h3>
                            {selectedNode.type === "page" ? "Page" : "Service"} Node
                        </h3>
                    </div>
                    <div className="routing-rp-inspector">
                        <div className="routing-rp-field">
                            <label>Ports</label>
                            <div className="routing-rp-ports-list">
                                {getPortsForNode(selectedNode.id).map((port) => (
                                    <div key={port.id} className="routing-rp-port-item">
                                        <span className={`routing-rp-port-dot ${port.portType}`} />
                                        <span className="routing-rp-port-label">{port.label}</span>
                                        <span className="routing-rp-port-type">{port.portType}</span>
                                    </div>
                                ))}
                            </div>
                        </div>
                        <div className="routing-rp-field">
                            <label>Connections</label>
                            <div className="routing-rp-connections-list">
                                {getConnectionsForNode(selectedNode.id).length === 0 ? (
                                    <span className="routing-rp-no-conn">No connections</span>
                                ) : (
                                    getConnectionsForNode(selectedNode.id).map((conn) => {
                                        const otherNodeId =
                                            conn.fromNodeId === selectedNode.id
                                                ? conn.toNodeId
                                                : conn.fromNodeId;
                                        const otherNode = nodes.find((n) => n.id === otherNodeId);
                                        return (
                                            <div key={conn.id} className="routing-rp-conn-item">
                                                <Link size={12} />
                                                <span>→ {otherNode?.type} node</span>
                                                <button
                                                    className="routing-rp-conn-delete"
                                                    onClick={() => removeConnection(conn.id)}
                                                >
                                                    <Unlink size={12} />
                                                </button>
                                            </div>
                                        );
                                    })
                                )}
                            </div>
                        </div>
                    </div>
                </div>
            )}

            {/* Connection Inspector */}
            {selectedConnection && (
                <div className="routing-rp-section">
                    <div className="routing-rp-header">
                        <h3>Connection</h3>
                    </div>
                    <div className="routing-rp-inspector">
                        <div className="routing-rp-field">
                            <label>From</label>
                            <span className="routing-rp-conn-detail">
                                {nodes.find((n) => n.id === selectedConnection.fromNodeId)?.type} node
                            </span>
                        </div>
                        <div className="routing-rp-field">
                            <label>To</label>
                            <span className="routing-rp-conn-detail">
                                {nodes.find((n) => n.id === selectedConnection.toNodeId)?.type} node
                            </span>
                        </div>
                        <ConnectionContract connection={selectedConnection} />
                        <button
                            className="routing-rp-delete-btn"
                            onClick={() => removeConnection(selectedConnection.id)}
                        >
                            <Trash2 size={14} />
                            Delete Connection
                        </button>
                    </div>
                </div>
            )}
        </div>
    );
};

export default RoutingRightPanel;
