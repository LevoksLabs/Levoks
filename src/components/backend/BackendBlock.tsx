"use client";

import React from "react";
import { useBackendStore } from "@/store/backendStore";
import { BackendBlock, EndpointConfig } from "@/types/backend";
import {
    Globe, Database, Shield, GitBranch, Repeat, AlertTriangle,
    CheckCircle, Link2, Settings, Trash2, GripVertical,
} from "lucide-react";

// Map block type → icon
const BLOCK_ICONS: Record<string, React.ReactNode> = {
    rest_endpoint: <Globe size={14} />,
    db_model: <Database size={14} />,
    middleware: <Settings size={14} />,
    auth_block: <Shield size={14} />,
    logic_if: <GitBranch size={14} />,
    logic_loop: <Repeat size={14} />,
    logic_trycatch: <AlertTriangle size={14} />,
    validation: <CheckCircle size={14} />,
    relation: <Link2 size={14} />,
    env_var: <Settings size={14} />,
};

// Method color badges
const METHOD_COLORS: Record<string, string> = {
    GET: "#22c55e",
    POST: "#3b82f6",
    PUT: "#f59e0b",
    DELETE: "#ef4444",
    PATCH: "#8b5cf6",
};

// Block type labels
const BLOCK_TYPE_LABELS: Record<string, string> = {
    health_check: "Health Check",
    error_handler: "Error Handler",
    audit_log: "Audit Log",
    rest_endpoint: "Endpoint",
    db_model: "Model",
    middleware: "Middleware",
    auth_block: "Auth",
    logic_if: "If/Else",
    logic_loop: "Loop",
    logic_trycatch: "Try/Catch",
    validation: "Validation",
    relation: "Relation",
    env_var: "Env Var",
};

interface Props {
    block: BackendBlock;
    serviceId: string;
}

const BackendBlockComponent: React.FC<Props> = ({ block, serviceId }) => {
    const { selectedBlockId, selectBlock, removeBlock } = useBackendStore();
    const isSelected = selectedBlockId === block.id;

    const endpointConfig = block.type === "rest_endpoint" ? (block.config as EndpointConfig) : null;

    return (
        <div
            className={`backend-block ${isSelected ? "backend-block-selected" : ""}`}
            onClick={(e) => {
                e.stopPropagation();
                selectBlock(block.id);
            }}
        >
            <div className="backend-block-grip">
                <GripVertical size={12} />
            </div>

            <div className="backend-block-icon">
                {BLOCK_ICONS[block.type] || <Settings size={14} />}
            </div>

            <div className="backend-block-info">
                <div className="backend-block-label-row">
                    <span className="backend-block-label">{block.label}</span>
                    <span className={`backend-block-type-badge type-${block.type}`}>
                        {BLOCK_TYPE_LABELS[block.type] || block.type}
                    </span>
                </div>

                {/* Endpoint-specific details */}
                {endpointConfig && (
                    <div className="backend-block-detail">
                        <span
                            className="method-badge"
                            style={{ background: METHOD_COLORS[endpointConfig.method] || "#6b7280" }}
                        >
                            {endpointConfig.method}
                        </span>
                        <span className="route-text">{endpointConfig.route}</span>
                        {endpointConfig.authRequired && (
                            <Shield size={10} className="auth-indicator" />
                        )}
                    </div>
                )}
            </div>

            <button
                className="backend-block-delete"
                onClick={(e) => {
                    e.stopPropagation();
                    removeBlock(serviceId, block.id);
                }}
                title="Remove block"
            >
                <Trash2 size={12} />
            </button>
        </div>
    );
};

export default BackendBlockComponent;
