"use client";

import React from "react";
import { useBackendStore } from "@/store/backendStore";
import { BackendBlock, EndpointConfig } from "@/types/backend";
import {
    Globe, Database, Shield, GitBranch, Repeat, AlertTriangle,
    CheckCircle, Link2, Settings, Trash2, GripVertical,
    Layers, UserCheck, Key, Lock, Shuffle, Braces, Zap, List,
    Briefcase, Cpu, Clock, Radio, Bell, Send, Wifi, Mail,
    MessageSquare, CreditCard, Upload, Download, FolderOpen,
    Archive, RefreshCw, AlertOctagon, Activity, FileText, Webhook,
} from "lucide-react";

// Map block type → icon
const BLOCK_ICONS: Record<string, React.ReactNode> = {
    rest_endpoint: <Globe size={14} />,
    db_model: <Database size={14} />,
    db_query: <Database size={14} />,
    db_transaction: <Layers size={14} />,
    middleware: <Settings size={14} />,
    auth_block: <Shield size={14} />,
    authz_role: <UserCheck size={14} />,
    authz_permission: <Key size={14} />,
    authz_policy: <Lock size={14} />,
    logic_if: <GitBranch size={14} />,
    logic_loop: <Repeat size={14} />,
    logic_trycatch: <AlertTriangle size={14} />,
    logic_transform: <Shuffle size={14} />,
    logic_function: <Braces size={14} />,
    validation: <CheckCircle size={14} />,
    relation: <Link2 size={14} />,
    env_var: <Settings size={14} />,
    config_secret: <Lock size={14} />,
    async_event: <Zap size={14} />,
    async_queue: <List size={14} />,
    async_job: <Briefcase size={14} />,
    async_worker: <Cpu size={14} />,
    async_scheduler: <Clock size={14} />,
    realtime_websocket: <Radio size={14} />,
    realtime_sse: <Radio size={14} />,
    realtime_subscribe: <Bell size={14} />,
    realtime_publish: <Send size={14} />,
    realtime_broadcast: <Wifi size={14} />,
    integration_http: <Globe size={14} />,
    integration_webhook: <Webhook size={14} />,
    integration_email: <Mail size={14} />,
    integration_sms: <MessageSquare size={14} />,
    integration_payment: <CreditCard size={14} />,
    storage_upload: <Upload size={14} />,
    storage_download: <Download size={14} />,
    storage_file: <FolderOpen size={14} />,
    storage_delete: <Trash2 size={14} />,
    cache_cache: <Archive size={14} />,
    cache_invalidate: <RefreshCw size={14} />,
    obs_error_handler: <AlertOctagon size={14} />,
    obs_health_check: <Activity size={14} />,
    obs_audit_log: <FileText size={14} />,
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
    rest_endpoint: "Endpoint",
    db_model: "Model",
    db_query: "Query",
    db_transaction: "Transaction",
    middleware: "Middleware",
    auth_block: "Auth",
    authz_role: "Role",
    authz_permission: "Permission",
    authz_policy: "Policy",
    logic_if: "If/Else",
    logic_loop: "Loop",
    logic_trycatch: "Try/Catch",
    logic_transform: "Transform",
    logic_function: "Function",
    validation: "Validation",
    relation: "Relation",
    env_var: "Env Var",
    config_secret: "Secret",
    async_event: "Event",
    async_queue: "Queue",
    async_job: "Job",
    async_worker: "Worker",
    async_scheduler: "Scheduler",
    realtime_websocket: "WebSocket",
    realtime_sse: "SSE",
    realtime_subscribe: "Subscribe",
    realtime_publish: "Publish",
    realtime_broadcast: "Broadcast",
    integration_http: "HTTP Request",
    integration_webhook: "Webhook",
    integration_email: "Email",
    integration_sms: "SMS",
    integration_payment: "Payment",
    storage_upload: "Upload",
    storage_download: "Download",
    storage_file: "Storage",
    storage_delete: "Delete",
    cache_cache: "Cache",
    cache_invalidate: "Invalidate",
    obs_error_handler: "Error Handler",
    obs_health_check: "Health Check",
    obs_audit_log: "Audit Log",
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
