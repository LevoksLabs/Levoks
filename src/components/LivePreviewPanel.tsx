"use client";

import PrimitiveShape from "./design/PrimitiveShape";
import React, { useState, useCallback, useEffect, useMemo } from "react";
import TabsWidget from "./design/TabsWidget";
import { widgetNumber } from "@/lib/widgets";
import { ICON_PATHS } from "@/lib/icon-paths";
import GeneratedPreview from "./design/GeneratedPreview";
import VectorShape from "./design/VectorShape";
import { assetElement } from "@/lib/design-assets";
import { resolveElement, fontFamily } from "@/lib/design";
import { useEditorUIStore } from "@/store/editorUIStore";
import { useEditorStore } from "@/store/editorStore";
import { resolveAllRoutes, simulateServiceBlock, ResolvedRoute } from "@/lib/routingEngine";
import { ElementNode, CONTAINER_TYPES } from "@/types";
import {
    ChevronLeft, Globe, Activity,
    CheckCircle2, XCircle, ArrowRight
} from "lucide-react";

interface LivePreviewPanelProps {
    onClose: () => void;
}

// ─── Interactive Element Renderer ───
// Renders elements with functional forms, inputs, and routing-aware actions
// Now works with flat-map store: children are string[] IDs

interface LiveElementProps {
    elementId: string;
    isRoot: boolean;
    formData: Record<string, string>;
    setFormData: React.Dispatch<React.SetStateAction<Record<string, string>>>;
    routeMap: Map<string, ResolvedRoute>;
    onAction: (elementId: string, data: Record<string, string>) => void;
    pageId: string;
}

const LiveElement: React.FC<LiveElementProps> = ({
    elementId, isRoot, formData, setFormData, routeMap, onAction, pageId
}) => {
    const raw = useEditorStore(s => s.elementsById[elementId]);
    const assets = useEditorStore(s => s.assets);
    const breakpoint = useEditorUIStore(s => s.breakpoint);
    const element = raw ? assetElement(resolveElement(raw, breakpoint), assets) : undefined;
    if (!element) return null;
    if (!element.layout.visible) return null;

    const isContainer = CONTAINER_TYPES.includes(element.type);
    const isTextLike = element.type === "text" || element.type === "title" || element.type === "paragraph";
    const widthPx = `${Math.max(40, element.layout.w)}px`;
    const heightPx = `${Math.max(20, element.layout.h)}px`;
    const rawPosition = String(element.styles.position || element.layout.position || "");
    const resolvedPosition = (rawPosition || (isContainer ? "relative" : "static")) as React.CSSProperties["position"];
    const isPositionedChild = resolvedPosition !== "static";

    const positionStyles: React.CSSProperties = isRoot
        ? {
            position: "absolute",
            left: `${element.layout.x}px`,
            top: `${element.layout.y}px`,
            width: widthPx,
            minHeight: heightPx,
            height: isTextLike ? "auto" : heightPx,
        }
        : {
            position: resolvedPosition,
            left: isPositionedChild ? `${element.layout.x}px` : undefined,
            top: isPositionedChild ? `${element.layout.y}px` : undefined,
            width: String(element.styles.width || widthPx),
            minHeight: heightPx,
            height: isTextLike ? "auto" : String(element.styles.height || heightPx),
        };

    const mergedStyles: React.CSSProperties = {
        ...element.styles as React.CSSProperties,
        ...positionStyles,
        ...(element.type === "shape" && element.props.shapeType && element.props.shapeType !== "rectangle" ? { backgroundColor: "transparent" } : {}),
        fontFamily: fontFamily(element.styles.fontFamily),
        ...(element.type === "gallery" ? { display: "block" } : {}),
        cursor: (element.styles.cursor as React.CSSProperties["cursor"]) || "default",
        userSelect: "none",
        overflow: isContainer ? "visible" : (isTextLike ? "visible" : "hidden"),
        opacity: element.layout.opacity ?? 1,
        transform: element.layout.rotation ? `rotate(${element.layout.rotation}deg)` : undefined,
    };

    const hasRoute = routeMap.has(element.id);

    const renderChildren = (ids = element.children) =>
        ids.map((childId) => (
            <LiveElement
                key={childId}
                elementId={childId}
                isRoot={false}
                formData={formData}
                setFormData={setFormData}
                routeMap={routeMap}
                onAction={onAction}
                pageId={pageId}
            />
        ));

    const renderContent = () => {
        switch (element.type) {
            case "section":
            case "container":
            case "stack":
                return <>{renderChildren()}</>;

            case "columns":
                return <>{renderChildren()}</>;

            case "title": {
                const lvl = Math.min(Math.max(Number(element.props.level) || 2, 1), 6) as 1 | 2 | 3 | 4 | 5 | 6;
                const Tag = `h${lvl}` as `h${typeof lvl}`;
                return (
                    <Tag style={{
                        margin: 0, fontSize: "inherit", fontWeight: "inherit",
                        color: "inherit", lineHeight: "inherit",
                        textAlign: (element.styles.textAlign as React.CSSProperties["textAlign"]) || "left",
                        fontFamily: fontFamily(element.styles.fontFamily),
                    }}>
                        {String(element.props.content || "Heading")}
                    </Tag>
                );
            }

            case "text":
            case "paragraph":
                return (
                    <p style={{
                        margin: 0,
                        textAlign: (element.styles.textAlign as React.CSSProperties["textAlign"]) || "left",
                        fontFamily: fontFamily(element.styles.fontFamily),
                    }}>
                        {String(element.props.content || "Text")}
                    </p>
                );

            case "button":
                return (
                    <button
                        className={`live-preview-btn ${hasRoute ? "live-preview-btn-routed" : ""}`}
                        onClick={(e) => {
                            e.preventDefault();
                            e.stopPropagation();
                            onAction(element.id, formData);
                        }}
                        style={{
                            background: "inherit",
                            backgroundColor: "inherit",
                            color: "inherit",
                            borderRadius: String(element.styles.borderRadius || "6px"),
                            fontSize: String(element.styles.fontSize || "14px"),
                            fontWeight: String(element.styles.fontWeight || "500"),
                            cursor: "pointer",
                            border: "none",
                            width: "100%",
                            height: "100%",
                            display: "flex",
                            alignItems: "center",
                            justifyContent: "center",
                            fontFamily: fontFamily(element.styles.fontFamily),
                            padding: String(element.styles.padding || "0"),
                        }}
                    >
                        {String(element.props.label || "Button")}
                        {hasRoute && <ArrowRight size={12} style={{ marginLeft: 6, opacity: 0.7 }} />}
                    </button>
                );

            case "image":
                return (
                    <img
                        src={String(element.props.src || "")}
                        alt={String(element.props.alt || "")}
                        style={{
                            width: "100%", height: "100%",
                            objectFit: (String(element.props.objectFit || "cover")) as React.CSSProperties["objectFit"],
                            borderRadius: String(element.styles.borderRadius || "0"),
                        }}
                    />
                );

            case "form":
                return (
                    <form
                        noValidate={false}
                        onSubmit={(e) => {
                            e.preventDefault();
                            const formEl = e.currentTarget;
                            if (!formEl.reportValidity()) {
                                return;
                            }
                            const submitBtn = findActionableChildById(element, useEditorStore.getState().elementsById);
                            if (submitBtn) {
                                onAction(submitBtn.id, formData);
                            }
                        }}
                        style={{
                            display: "flex", flexDirection: "column",
                            gap: "8px", width: "100%", height: "100%",
                        }}
                    >
                        {renderChildren()}
                    </form>
                );

            case "input": {
                const inputType = String(element.props.inputType || "text");
                const name = String(element.props.name || element.id);
                const isRequired = !!element.props.required;
                const maxLength = Number(element.props.maxLength);
                const minLength = Number(element.props.minLength);
                const pattern = inputType === "email"
                    ? String(element.props.pattern || "[a-zA-Z0-9._%+\\-]+@[a-zA-Z0-9.\\-]+\\.[a-zA-Z]{2,}")
                    : element.props.pattern ? String(element.props.pattern) : undefined;
                const commonProps = {
                    name,
                    placeholder: String(element.props.placeholder || ""),
                    value: formData[name] || "",
                    required: isRequired,
                    pattern,
                    minLength: Number.isFinite(minLength) && minLength > 0 ? minLength : undefined,
                    maxLength: Number.isFinite(maxLength) && maxLength > 0 ? maxLength : undefined,
                    title: inputType === "email" ? "Please enter a valid email address" : undefined,
                    onChange: (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => {
                        setFormData((prev) => ({ ...prev, [name]: e.target.value }));
                    },
                    style: {
                        width: "100%",
                        height: "100%",
                        padding: String(element.styles.padding || "12px 16px"),
                        border: String(element.styles.border || "1px solid #d1d5db"),
                        borderRadius: String(element.styles.borderRadius || "8px"),
                        fontSize: String(element.styles.fontSize || "14px"),
                        backgroundColor: String(element.styles.backgroundColor || "#fff"),
                        boxSizing: "border-box" as const,
                        outline: "none",
                        resize: "none" as const,
                        color: "#1a1a2e",
                    },
                };

                if (inputType === "textarea") {
                    return <textarea {...commonProps} />;
                }
                return <input {...commonProps} type={inputType} />;
            }

            case "divider":
                return <hr style={{ width: "100%", border: "none", height: "100%", backgroundColor: String(element.styles.backgroundColor || "#e5e7eb") }} />;

            case "menu": {
                const items = String(element.props.items || "Home,About,Contact").split(",");
                const isVertical = element.props.menuStyle === "vertical";
                return (
                    <nav style={{
                        display: "flex",
                        flexDirection: isVertical ? "column" : "row",
                        gap: isVertical ? "4px" : "24px",
                        alignItems: isVertical ? "stretch" : "center",
                        height: "100%", padding: "0 20px",
                    }}>
                        {items.map((item, i) => (
                            <span key={i} className="menu-item" style={{ cursor: "pointer" }}>{item.trim()}</span>
                        ))}
                    </nav>
                );
            }

            case "tabs": return <TabsWidget element={element} render={renderChildren} />;
            case "gallery": return <div className="gallery-content" style={{ display: "grid", gridTemplateColumns: `repeat(${widgetNumber(element.props.columns, 3, 1, 8)}, minmax(0, 1fr))`, gap: `${widgetNumber(element.props.gap, 8, 0, 100)}px` }}>{renderChildren()}</div>;
            case "repeater": return <div style={{ display: "flex", flexDirection: element.props.direction === "row" ? "row" : "column", gap: String(element.styles.gap || "12px") }}>{Array.from({ length: widgetNumber(element.props.repeatCount, 3, 1, 20) }, (_, index) => <div className="repeater-item" key={index}>{renderChildren()}</div>)}</div>;
            case "accordion": return <details open={Boolean(element.props.expanded)}><summary>{String(element.props.headerText || "Accordion")}</summary>{renderChildren()}</details>;
            case "icon": return <svg viewBox="0 0 24 24" width={widgetNumber(element.props.iconSize, 32, 8, 256)} height={widgetNumber(element.props.iconSize, 32, 8, 256)} fill={String(element.props.iconColor || "#374151")} role="img" aria-label={element.label || "Icon"}><path d={ICON_PATHS[String(element.props.icon)] || ICON_PATHS.star} /></svg>;
            case "shape": return element.vector ? <VectorShape element={element} editable={false} /> : <PrimitiveShape shapeType={String(element.props.shapeType || "rectangle")} color={String(element.styles.backgroundColor || "#6366f1")} />;

            case "spacer":
                return <div style={{ width: "100%", height: `${Number(element.props.spacerHeight) || 40}px` }} />;

            default:
                return <>{renderChildren()}</>;
        }
    };

    return (
        <div
            data-element-id={element.id}
            data-element-type={element.type}
            className={`lp-element ${hasRoute ? "live-routed-element" : ""}`}
            style={mergedStyles}
        >
            {renderContent()}
        </div>
    );
};

// Find the first actionable child (button) inside a form — flat-map version
function findActionableChildById(element: ElementNode, elementsById: Record<string, ElementNode>): ElementNode | null {
    if (element.type === "button") return element;
    for (const childId of element.children) {
        const child = elementsById[childId];
        if (!child) continue;
        const found = findActionableChildById(child, elementsById);
        if (found) return found;
    }
    return null;
}

// ─── Toast Notification ───

interface ToastMsg {
    id: string;
    type: "success" | "error" | "info";
    message: string;
    detail?: string;
}

// ─── Main Panel ───

const LivePreviewPanel: React.FC<LivePreviewPanelProps> = ({ onClose }) => {
    const { pages, activePageId, rootIds, globalRootIds, canvasSettings, pageElementMap, tokens } = useEditorStore();

    const [generated, setGenerated] = useState(false);
    const breakpoint = useEditorUIStore(s => s.breakpoint);

    // Current page being viewed
    const [currentPageId, setCurrentPageId] = useState(activePageId || pages[0]?.id || "");
    const [formData, setFormData] = useState<Record<string, string>>({});
    const [toasts, setToasts] = useState<ToastMsg[]>([]);
    const [navHistory, setNavHistory] = useState<string[]>([]);

    // Compute route map once
    const routeMap = useMemo(() => resolveAllRoutes(), []);

    // Find current page
    const currentPage = pages.find((p) => p.id === currentPageId);
    const pageRootIds = currentPageId === activePageId ? rootIds : (pageElementMap?.[currentPageId] || []);

    const canvasWidth = breakpoint === "mobile" ? 390 : breakpoint === "tablet" ? 820 : Math.max(320, Number(canvasSettings.width) || 1280);
    const canvasHeight = Math.max(200, Number(canvasSettings.height) || 900);
    const canvasBackground = String(canvasSettings.backgroundColor || "#ffffff");
    const canvasHasGradient = /gradient\(/i.test(canvasBackground);

    // Toast helpers
    const addToast = useCallback((type: ToastMsg["type"], message: string, detail?: string) => {
        const id = Date.now().toString();
        setToasts((prev) => [...prev, { id, type, message, detail }]);
        setTimeout(() => {
            setToasts((prev) => prev.filter((t) => t.id !== id));
        }, 3500);
    }, []);

    // Navigation
    const navigateToPage = useCallback((pageId: string) => {
        setNavHistory((prev) => [...prev, currentPageId]);
        setCurrentPageId(pageId);
        setFormData({});
        const page = pages.find((p) => p.id === pageId);
        addToast("info", `Navigated to ${page?.title || "page"}`, page?.route);
    }, [currentPageId, pages, addToast]);

    const goBack = useCallback(() => {
        if (navHistory.length > 0) {
            const prev = navHistory[navHistory.length - 1];
            setNavHistory((h) => h.slice(0, -1));
            setCurrentPageId(prev);
            setFormData({});
        }
    }, [navHistory]);

    // Escape to close
    useEffect(() => {
        const onKeyDown = (e: KeyboardEvent) => {
            if (e.key === "Escape") onClose();
        };
        window.addEventListener("keydown", onKeyDown);
        return () => window.removeEventListener("keydown", onKeyDown);
    }, [onClose]);

    // Action handler — when a button/form is triggered
    const handleAction = useCallback((elementId: string, data: Record<string, string>) => {
        const route = routeMap.get(elementId);
        if (!route) {
            addToast("info", "No routing connected", "Connect this element in the Routes canvas");
            return;
        }

        if (route.service && route.block) {
            const result = simulateServiceBlock(route.block, data);
            if (result.success) {
                addToast("success", result.message, route.block.label);
                if (route.targetPageId) {
                    setTimeout(() => {
                        navigateToPage(route.targetPageId!);
                    }, 600);
                }
            } else {
                addToast("error", result.message, "Action blocked");
            }
        } else if (route.targetPageId) {
            navigateToPage(route.targetPageId);
        }
    }, [routeMap, addToast, navigateToPage]);

    return (
        <div className="site-preview-overlay live-preview">
            {/* Header */}
            <div className="site-preview-header live-preview-header">
                <button className="site-preview-close" onClick={onClose}>
                    Back To Editor
                </button>

                <div className="live-preview-nav">
                    <button
                        className="live-nav-btn"
                        disabled={navHistory.length === 0}
                        onClick={goBack}
                    >
                        <ChevronLeft size={14} />
                    </button>
                    <div className="live-nav-url">
                        <Globe size={12} />
                        <span>localhost{currentPage?.route || "/"}</span>
                    </div>
                </div>

                <div className="live-preview-meta">
                    <span className="site-preview-title">{currentPage?.title || "Preview"}</span>
                    <div className="live-preview-indicator">
                        <Activity size={10} />
                        <span>Design preview</span>
                    </div>
                </div>

                <select aria-label="Preview mode" value={generated ? "generated" : "design"} onChange={event => setGenerated(event.target.value === "generated")}><option value="design">Design simulation</option><option value="generated">Generated frontend</option></select>
                <select aria-label="Preview breakpoint" value={breakpoint} onChange={event => useEditorUIStore.setState({ breakpoint: event.target.value as "base" | "tablet" | "mobile" })}><option value="base">Desktop</option><option value="tablet">Tablet</option><option value="mobile">Mobile</option></select>
                {/* Page tabs */}
                <div className="live-preview-tabs">
                    {pages.map((page) => (
                        <button
                            key={page.id}
                            className={`live-tab ${page.id === currentPageId ? "live-tab-active" : ""}`}
                            onClick={() => {
                                if (page.id !== currentPageId) navigateToPage(page.id);
                            }}
                        >
                            {page.title}
                        </button>
                    ))}
                </div>
            </div>

            {/* Body */}
            <div className="site-preview-body">
                <div className="site-preview-scroll">
                    {generated ? <GeneratedPreview pageId={currentPageId} width={canvasWidth} /> : <div
                        className="site-preview-page"
                        style={{
                            ...Object.fromEntries(Object.entries(tokens).map(([id, token]) => [`--lv-${id}`, token.value])),
                            width: `${canvasWidth}px`,
                            maxWidth: `${canvasWidth}px`,
                            minHeight: `${canvasHeight}px`,
                            background: canvasBackground,
                            backgroundColor: canvasHasGradient ? undefined : canvasBackground,
                        }}
                    >
                        {globalRootIds.length > 0 &&
                            globalRootIds.map((id) => (
                                <LiveElement
                                    key={id}
                                    elementId={id}
                                    isRoot={false}
                                    formData={formData}
                                    setFormData={setFormData}
                                    routeMap={routeMap}
                                    onAction={handleAction}
                                    pageId={currentPageId}
                                />
                            ))
                        }
                        {pageRootIds.map((id) => (
                            <LiveElement
                                key={id}
                                elementId={id}
                                isRoot={true}
                                formData={formData}
                                setFormData={setFormData}
                                routeMap={routeMap}
                                onAction={handleAction}
                                pageId={currentPageId}
                            />
                        ))}
                    </div>}
                </div>
            </div>

            {/* Toast notifications */}
            <div className="live-toast-container">
                {toasts.map((toast) => (
                    <div
                        key={toast.id}
                        className={`live-toast live-toast-${toast.type}`}
                    >
                        {toast.type === "success" && <CheckCircle2 size={14} />}
                        {toast.type === "error" && <XCircle size={14} />}
                        {toast.type === "info" && <Activity size={14} />}
                        <div className="live-toast-content">
                            <span className="live-toast-msg">{toast.message}</span>
                            {toast.detail && <span className="live-toast-detail">{toast.detail}</span>}
                        </div>
                    </div>
                ))}
            </div>
        </div>
    );
};

export default LivePreviewPanel;
