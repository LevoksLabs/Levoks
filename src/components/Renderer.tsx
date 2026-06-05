"use client";

import { useRef, useEffect, useCallback } from "react";
import { ElementType, CONTAINER_TYPES } from "@/types";
import { useEditorStore } from "@/store/editorStore";
import { useDroppable } from "@dnd-kit/core";

interface RendererProps {
    elementIds: string[];
    isRoot?: boolean;
    readOnly?: boolean;
}

const ResizeHandles: React.FC = () => {
    const handles = ["n", "s", "e", "w", "ne", "nw", "se", "sw"];
    return (
        <>
            {handles.map((h) => (
                <div key={h} className={`resize-handle resize-handle-${h}`} data-resize-handle={h} />
            ))}
        </>
    );
};

const ICON_SVGS: Record<string, React.ReactNode> = {
    star: <svg viewBox="0 0 24 24" fill="currentColor"><path d="M12 2l3.09 6.26L22 9.27l-5 4.87 1.18 6.88L12 17.77l-6.18 3.25L7 14.14 2 9.27l6.91-1.01L12 2z" /></svg>,
    heart: <svg viewBox="0 0 24 24" fill="currentColor"><path d="M12 21.35l-1.45-1.32C5.4 15.36 2 12.28 2 8.5 2 5.42 4.42 3 7.5 3c1.74 0 3.41.81 4.5 2.09C13.09 3.81 14.76 3 16.5 3 19.58 3 22 5.42 22 8.5c0 3.78-3.4 6.86-8.55 11.54L12 21.35z" /></svg>,
    home: <svg viewBox="0 0 24 24" fill="currentColor"><path d="M10 20v-6h4v6h5v-8h3L12 3 2 12h3v8z" /></svg>,
    search: <svg viewBox="0 0 24 24" fill="currentColor"><path d="M15.5 14h-.79l-.28-.27A6.471 6.471 0 0016 9.5 6.5 6.5 0 109.5 16c1.61 0 3.09-.59 4.23-1.57l.27.28v.79l5 4.99L20.49 19l-4.99-5zm-6 0C7.01 14 5 11.99 5 9.5S7.01 5 9.5 5 14 7.01 14 9.5 11.99 14 9.5 14z" /></svg>,
    mail: <svg viewBox="0 0 24 24" fill="currentColor"><path d="M20 4H4c-1.1 0-1.99.9-1.99 2L2 18c0 1.1.9 2 2 2h16c1.1 0 2-.9 2-2V6c0-1.1-.9-2-2-2zm0 4l-8 5-8-5V6l8 5 8-5v2z" /></svg>,
    phone: <svg viewBox="0 0 24 24" fill="currentColor"><path d="M6.62 10.79c1.44 2.83 3.76 5.14 6.59 6.59l2.2-2.2c.27-.27.67-.36 1.02-.24 1.12.37 2.33.57 3.57.57.55 0 1 .45 1 1V20c0 .55-.45 1-1 1-9.39 0-17-7.61-17-17 0-.55.45-1 1-1h3.5c.55 0 1 .45 1 1 0 1.25.2 2.45.57 3.57.11.35.03.74-.25 1.02l-2.2 2.2z" /></svg>,
    settings: <svg viewBox="0 0 24 24" fill="currentColor"><path d="M19.14 12.94c.04-.3.06-.61.06-.94 0-.32-.02-.64-.07-.94l2.03-1.58a.49.49 0 00.12-.61l-1.92-3.32a.488.488 0 00-.59-.22l-2.39.96c-.5-.38-1.03-.7-1.62-.94l-.36-2.54a.484.484 0 00-.48-.41h-3.84c-.24 0-.43.17-.47.41l-.36 2.54c-.59.24-1.13.57-1.62.94l-2.39-.96c-.22-.08-.47 0-.59.22L2.74 8.87c-.12.21-.08.47.12.61l2.03 1.58c-.05.3-.07.62-.07.94s.02.64.07.94l-2.03 1.58a.49.49 0 00-.12.61l1.92 3.32c.12.22.37.29.59.22l2.39-.96c.5.38 1.03.7 1.62.94l.36 2.54c.05.24.24.41.48.41h3.84c.24 0 .44-.17.47-.41l.36-2.54c.59-.24 1.13-.56 1.62-.94l2.39.96c.22.08.47 0 .59-.22l1.92-3.32c.12-.22.07-.47-.12-.61l-2.01-1.58zM12 15.6A3.6 3.6 0 1115.6 12 3.611 3.611 0 0112 15.6z" /></svg>,
    check: <svg viewBox="0 0 24 24" fill="currentColor"><path d="M9 16.17L4.83 12l-1.42 1.41L9 19 21 7l-1.41-1.41z" /></svg>,
    close: <svg viewBox="0 0 24 24" fill="currentColor"><path d="M19 6.41L17.59 5 12 10.59 6.41 5 5 6.41 10.59 12 5 17.59 6.41 19 12 13.41 17.59 19 19 17.59 13.41 12z" /></svg>,
    arrow: <svg viewBox="0 0 24 24" fill="currentColor"><path d="M12 4l-1.41 1.41L16.17 11H4v2h12.17l-5.58 5.59L12 20l8-8z" /></svg>,
    user: <svg viewBox="0 0 24 24" fill="currentColor"><path d="M12 12c2.21 0 4-1.79 4-4s-1.79-4-4-4-4 1.79-4 4 1.79 4 4 4zm0 2c-2.67 0-8 1.34-8 4v2h16v-2c0-2.66-5.33-4-8-4z" /></svg>,
    cart: <svg viewBox="0 0 24 24" fill="currentColor"><path d="M7 18c-1.1 0-1.99.9-1.99 2S5.9 22 7 22s2-.9 2-2-.9-2-2-2zM1 2v2h2l3.6 7.59-1.35 2.45c-.16.28-.25.61-.25.96 0 1.1.9 2 2 2h12v-2H7.42c-.14 0-.25-.11-.25-.25l.03-.12.9-1.63h7.45c.75 0 1.41-.41 1.75-1.03l3.58-6.49A1.003 1.003 0 0020.01 4H5.21l-.94-2H1zm16 16c-1.1 0-1.99.9-1.99 2s.89 2 1.99 2 2-.9 2-2-.9-2-2-2z" /></svg>,
};

const SocialIcon: React.FC<{ platform: string; size: number; style: string }> = ({ platform, size, style: iconStyle }) => {
    const colors: Record<string, string> = { facebook: "#1877F2", twitter: "#1DA1F2", instagram: "#E4405F", linkedin: "#0A66C2", youtube: "#FF0000" };
    const color = iconStyle === "filled" ? colors[platform] || "#666" : "#666";
    return (
        <div className="social-icon-item" style={{
            width: size + 12, height: size + 12,
            backgroundColor: iconStyle === "filled" ? color : "transparent",
            border: iconStyle === "outline" ? `2px solid ${color}` : "none",
            borderRadius: "50%", display: "flex", alignItems: "center", justifyContent: "center",
            color: iconStyle === "filled" ? "#fff" : color, fontSize: size * 0.6, fontWeight: 700,
        }}>
            {platform[0].toUpperCase()}
        </div>
    );
};

const ShapeSVG: React.FC<{ shapeType: string; color: string }> = ({ shapeType, color }) => {
    switch (shapeType) {
        case "circle": return <svg viewBox="0 0 100 100" style={{ width: "100%", height: "100%" }}><circle cx="50" cy="50" r="48" fill={color} /></svg>;
        case "triangle": return <svg viewBox="0 0 100 100" style={{ width: "100%", height: "100%" }}><polygon points="50,2 98,98 2,98" fill={color} /></svg>;
        case "star": return <svg viewBox="0 0 100 100" style={{ width: "100%", height: "100%" }}><polygon points="50,2 63,38 98,38 70,60 80,98 50,75 20,98 30,60 2,38 37,38" fill={color} /></svg>;
        case "hexagon": return <svg viewBox="0 0 100 100" style={{ width: "100%", height: "100%" }}><polygon points="50,2 93,25 93,75 50,98 7,75 7,25" fill={color} /></svg>;
        case "heart": return <svg viewBox="0 0 100 100" style={{ width: "100%", height: "100%" }}><path d="M50 88 C25 65 5 50 5 30 C5 15 15 5 30 5 C40 5 47 12 50 18 C53 12 60 5 70 5 C85 5 95 15 95 30 C95 50 75 65 50 88Z" fill={color} /></svg>;
        default: return <div style={{ width: "100%", height: "100%", backgroundColor: color, borderRadius: "inherit" }} />;
    }
};

interface ElementRendererProps {
    elementId: string;
    isRoot?: boolean;
    readOnly?: boolean;
}

const ElementRenderer: React.FC<ElementRendererProps> = ({ elementId, isRoot, readOnly = false }) => {
    const element = useEditorStore(s => s.elementsById[elementId]);
    const selectedElementId = useEditorStore(s => s.selectedElementId);
    const selectedElementIds = useEditorStore(s => s.selectedElementIds);
    const selectElement = useEditorStore(s => s.selectElement);
    const toggleSelectElement = useEditorStore(s => s.toggleSelectElement);

    const isContainer = element ? CONTAINER_TYPES.includes(element.type) : false;
    const { setNodeRef: setDropRef, isOver: isDropOver } = useDroppable({
        id: `drop-${elementId}`,
        data: { type: "container", parentId: elementId },
        disabled: !isContainer || readOnly,
    });

    if (!element || !element.layout.visible) return null;

    const isSelected = !readOnly && (selectedElementId === elementId || selectedElementIds.includes(elementId));
    const layout = element.layout;
    const isTextLike = element.type === "text" || element.type === "title" || element.type === "paragraph";
    const widthPx = `${Math.max(40, layout.w)}px`;
    const heightPx = `${Math.max(20, layout.h)}px`;
    const rawPosition = String(element.styles.position || "");
    const resolvedPosition = (rawPosition || (isContainer ? "relative" : "static")) as React.CSSProperties["position"];
    const isPositionedChild = resolvedPosition !== "static";
    const positionStyles: React.CSSProperties = isRoot
        ? { position: "absolute", left: `${layout.x}px`, top: `${layout.y}px`, width: widthPx, minHeight: heightPx, height: isTextLike ? "auto" : heightPx }
        : {
            position: resolvedPosition, left: isPositionedChild ? `${layout.x}px` : undefined, top: isPositionedChild ? `${layout.y}px` : undefined,
            width: String(element.styles.width || widthPx), minHeight: heightPx, height: isTextLike ? "auto" : String(element.styles.height || heightPx)
        };

    const mergedStyles: React.CSSProperties = {
        ...element.styles as React.CSSProperties,
        ...positionStyles,
        ...(element.type === "input" ? { border: "none", background: "transparent", backgroundColor: "transparent", boxShadow: "none", padding: "0" } : {}),
        cursor: readOnly ? (element.styles.cursor as React.CSSProperties["cursor"]) || "default" : (layout.locked ? "not-allowed" : (isSelected ? "grab" : "default")),
        userSelect: "none",
        overflow: isContainer ? "visible" : (isTextLike ? "visible" : "hidden"),
        opacity: layout.opacity ?? 1,
        transform: layout.rotation ? `rotate(${layout.rotation}deg)` : undefined,
    };

    // ─── Animation support ───
    const anim = element.animation;
    const hasAnim = anim && anim.type !== "none";
    const isTypewriter = hasAnim && anim.type === "typewriter";

    const buildAnimStr = useCallback(() => {
        if (!anim || anim.type === "none" || anim.type === "typewriter") return "";
        const iter = anim.iterationCount === "infinite" ? "infinite" : String(anim.iterationCount ?? 1);
        return `${anim.type} ${anim.duration}s ${anim.easing} ${anim.delay}s ${iter} ${anim.direction} ${anim.fillMode}`;
    }, [anim]);

    if (hasAnim && !isTypewriter && (anim.trigger === "onLoad" || anim.trigger === "continuous")) {
        mergedStyles.animation = buildAnimStr();
    }

    const handleClick = (e: React.MouseEvent) => {
        if (readOnly) return;
        e.stopPropagation();
        if (e.shiftKey) toggleSelectElement(elementId);
        else selectElement(elementId);
    };

    const handleReadOnlyAction = () => {
        if (!readOnly) return;
        if (element.actions?.type === "redirect" && element.actions.target) window.open(String(element.actions.target), "_blank", "noopener,noreferrer");
        if (element.actions?.type === "scroll" && element.actions.target) {
            const target = document.querySelector(String(element.actions.target));
            if (target) target.scrollIntoView({ behavior: "smooth", block: "start" });
        }
    };

    const containerPlaceholder = (text: string) =>
        element.children.length === 0 && <div className="container-placeholder"><span>{text}</span></div>;

    const renderContent = () => {
        switch (element.type) {
            case "section": return <>{containerPlaceholder("Drop elements into this section")}<Renderer elementIds={element.children} isRoot={false} readOnly={readOnly} /></>;
            case "container": return <Renderer elementIds={element.children} isRoot={false} readOnly={readOnly} />;
            case "columns": return element.children.length === 0 ? (
                <div style={{ display: "flex", gap: "16px", width: "100%", height: "100%" }}>
                    {Array.from({ length: Number(element.props.columnCount) || 2 }).map((_, i) => <div key={i} className="column-placeholder">Column {i + 1}</div>)}
                </div>
            ) : <Renderer elementIds={element.children} isRoot={false} readOnly={readOnly} />;
            case "stack": return <>{containerPlaceholder("Stack — elements stack vertically")}<Renderer elementIds={element.children} isRoot={false} readOnly={readOnly} /></>;
            case "title": {
                const lvl = Math.min(Math.max(Number(element.props.level) || 2, 1), 6) as 1 | 2 | 3 | 4 | 5 | 6;
                const Tag = `h${lvl}` as `h${typeof lvl}`;
                return <Tag className="el-title-inner" style={{
                    margin: 0, fontSize: "inherit", fontWeight: "inherit", color: "inherit", lineHeight: "inherit",
                    textAlign: (element.styles.textAlign as React.CSSProperties["textAlign"]) || "left", fontFamily: String(element.styles.fontFamily || "inherit"),
                    letterSpacing: String(element.styles.letterSpacing || "normal"), textDecoration: String(element.styles.textDecoration || "none"),
                    textTransform: (element.styles.textTransform as React.CSSProperties["textTransform"]) || "none"
                }}>
                    {String(element.props.content || "Add a Title")}</Tag>;
            }
            case "text": return <p className="el-text-inner" style={{
                margin: 0, textAlign: (element.styles.textAlign as React.CSSProperties["textAlign"]) || "left",
                fontFamily: String(element.styles.fontFamily || "inherit"), letterSpacing: String(element.styles.letterSpacing || "normal"),
                textDecoration: String(element.styles.textDecoration || "none"), textTransform: (element.styles.textTransform as React.CSSProperties["textTransform"]) || "none"
            }}>
                {String(element.props.content || "Text")}</p>;
            case "paragraph": return <p className="el-paragraph-inner" style={{
                margin: 0, textAlign: (element.styles.textAlign as React.CSSProperties["textAlign"]) || "left",
                fontFamily: String(element.styles.fontFamily || "inherit"), letterSpacing: String(element.styles.letterSpacing || "normal"),
                textDecoration: String(element.styles.textDecoration || "none"), textTransform: (element.styles.textTransform as React.CSSProperties["textTransform"]) || "none"
            }}>
                {String(element.props.content || "Paragraph text...")}</p>;
            case "button": return <button className="el-button-inner" onClick={handleReadOnlyAction} style={{
                background: "inherit", backgroundColor: "inherit", color: "inherit", borderRadius: String(element.styles.borderRadius || "6px"),
                fontSize: String(element.styles.fontSize || "14px"), fontWeight: String(element.styles.fontWeight || "500"), cursor: "pointer", border: "none",
                width: "100%", height: "100%", display: "flex", alignItems: "center", justifyContent: "center",
                textAlign: (element.styles.textAlign as React.CSSProperties["textAlign"]) || "center", fontFamily: String(element.styles.fontFamily || "inherit"),
                textTransform: (element.styles.textTransform as React.CSSProperties["textTransform"]) || "none", letterSpacing: String(element.styles.letterSpacing || "normal"),
                padding: String(element.styles.padding || "0")
            }}>{String(element.props.label || "Button")}</button>;
            case "image": return <img draggable={false} src={String(element.props.src || "")} alt={String(element.props.alt || "")} style={{
                width: "100%", height: "100%", objectFit: (String(element.props.objectFit || "cover")) as React.CSSProperties["objectFit"],
                borderRadius: String(element.styles.borderRadius || "0"), pointerEvents: "none",
            }} />;
            case "video": return <div className="video-placeholder"><span className="video-icon">▶</span><span>Video Player</span>
                <span className="video-meta">{element.props.autoplay ? "Autoplay" : ""} {element.props.loop ? "• Loop" : ""} {element.props.muted ? "• Muted" : ""}</span></div>;
            case "gallery": return element.children.length === 0 ? (
                <div className="gallery-placeholder" style={{ gridTemplateColumns: `repeat(${Number(element.props.columns) || 3}, 1fr)`, gap: `${Number(element.props.gap) || 8}px` }}>
                    {Array.from({ length: Number(element.props.columns) || 3 }).map((_, i) => <div key={i} className="gallery-item-ph">🖼</div>)}</div>
            ) : <Renderer elementIds={element.children} isRoot={false} readOnly={readOnly} />;
            case "form": {
                const rm = String(element.props.requestMethod || "POST").toUpperCase();
                const hm = rm === "GET" ? "get" : "post";
                return <form method={hm} action={String(element.props.requestUrl || "") || undefined} data-request-method={rm} onSubmit={e => e.preventDefault()}
                    style={{ display: "flex", flexDirection: "column", gap: "8px", width: "100%", height: "100%" }}>
                    {element.children.length === 0 ? containerPlaceholder("Drop form elements here") : <Renderer elementIds={element.children} isRoot={false} readOnly={readOnly} />}
                </form>;
            }
            case "input": {
                const it = String(element.props.inputType || "text");
                const cip = {
                    name: String(element.props.name || ""), placeholder: String(element.props.placeholder || ""),
                    required: Boolean(element.props.required), maxLength: Number(element.props.maxLength) > 0 ? Number(element.props.maxLength) : undefined,
                    style: {
                        width: "100%", height: "100%", padding: String(element.styles.padding || "12px 16px"), border: String(element.styles.border || "1px solid #d1d5db"),
                        borderRadius: String(element.styles.borderRadius || "8px"), fontSize: String(element.styles.fontSize || "14px"),
                        backgroundColor: String(element.styles.backgroundColor || "#fff"), boxShadow: String(element.styles.boxShadow || "none"),
                        boxSizing: "border-box" as const, outline: "none", resize: "none" as const
                    }, readOnly: true,
                };
                return it === "textarea" ? <textarea {...cip} /> : <input {...cip} type={it} />;
            }
            case "shape": return <ShapeSVG shapeType={String(element.props.shapeType || "rectangle")} color={String(element.styles.backgroundColor || "#6366f1")} />;
            case "divider": return <hr style={{ width: "100%", border: "none", height: "100%", backgroundColor: String(element.styles.backgroundColor || "#e5e7eb") }} />;
            case "menu": {
                const items = String(element.props.items || "Home,About,Contact").split(",");
                const vert = element.props.menuStyle === "vertical";
                return <nav style={{ display: "flex", flexDirection: vert ? "column" : "row", gap: vert ? "4px" : "24px", alignItems: vert ? "stretch" : "center", height: "100%", padding: "0 20px" }}>
                    {items.map((item, i) => <span key={i} className="menu-item">{item.trim()}</span>)}</nav>;
            }
            case "repeater": return <><div className="repeater-badge">↻ Repeater</div>{containerPlaceholder("Add items to repeat")}<Renderer elementIds={element.children} isRoot={false} readOnly={readOnly} /></>;
            case "frame": return <div className="frame-placeholder"><span>⟨/⟩</span><span>Embed Frame</span><span className="frame-url">{String(element.props.src || "https://example.com")}</span></div>;
            case "icon": {
                const svg = ICON_SVGS[String(element.props.icon || "star")];
                return <div className="icon-element" style={{ width: "100%", height: "100%", display: "flex", alignItems: "center", justifyContent: "center", color: String(element.props.iconColor || "#374151") }}>
                    <div style={{ width: Number(element.props.iconSize) || 32, height: Number(element.props.iconSize) || 32 }}>{svg || ICON_SVGS.star}</div></div>;
            }
            case "spacer": return <div className="spacer-element" style={{ width: "100%", height: `${Number(element.props.spacerHeight) || 40}px`, display: "flex", alignItems: "center", justifyContent: "center" }}>
                <span className="spacer-label">↕ Spacer</span></div>;
            case "socialbar": {
                const plat = ["facebook", "twitter", "instagram", "linkedin", "youtube"].filter(p => element.props[p]);
                return <div className="social-bar" style={{ display: "flex", gap: "12px", alignItems: "center", justifyContent: "center", height: "100%" }}>
                    {plat.length > 0 ? plat.map(p => <SocialIcon key={p} platform={p} size={Number(element.props.iconSize) || 24} style={String(element.props.iconStyle || "filled")} />) :
                        <span className="social-placeholder">Add social links</span>}</div>;
            }
            case "accordion": {
                const expanded = Boolean(element.props.expanded);
                return <div className="accordion-element"><div className="accordion-header"><span>{String(element.props.headerText || "Accordion Header")}</span>
                    <span className="accordion-arrow">{expanded ? "▼" : "▶"}</span></div>
                    {expanded && <div className="accordion-body">{element.children.length === 0 ? containerPlaceholder("Drop content here") :
                        <Renderer elementIds={element.children} isRoot={false} readOnly={readOnly} />}</div>}</div>;
            }
            case "tabs": {
                const titles = String(element.props.tabTitles || "Tab 1,Tab 2,Tab 3").split(",");
                const active = Number(element.props.activeTab) || 0;
                return <div className="tabs-element"><div className="tabs-header">{titles.map((t, i) =>
                    <button key={i} className={`tab-btn ${i === active ? "active" : ""}`}>{t.trim()}</button>)}</div>
                    <div className="tabs-body">{element.children.length === 0 ? containerPlaceholder("Drop content in tab") :
                        <Renderer elementIds={element.children} isRoot={false} readOnly={readOnly} />}</div></div>;
            }
            default: return null;
        }
    };

    const selectionClass = isSelected ? "element-selected" : "";
    const dropTargetClass = !readOnly && isContainer && isDropOver ? "element-drop-target" : "";

    // ─── Hover, Scroll & Click animation triggers ───
    const elRef = useRef<HTMLDivElement>(null);
    const animStrRef = useRef(buildAnimStr);
    animStrRef.current = buildAnimStr;

    useEffect(() => {
        const node = elRef.current;
        if (!node || !hasAnim) return;

        const cleanups: (() => void)[] = [];

        // ─── Typewriter effect (JS-driven) ───
        if (isTypewriter) {
            const textNode = node.querySelector(".el-text-inner, .el-title-inner, .el-paragraph-inner") as HTMLElement | null;
            if (!textNode) return;

            const fullText = String(element.props.content || "");
            const speed = anim.textSpeed ?? 50; // ms per character
            const delay = (anim.delay ?? 0) * 1000;

            let timerId: ReturnType<typeof setTimeout> | null = null;
            let rafId: number | null = null;
            let cancelled = false;

            const runTypewriter = () => {
                if (cancelled) return;
                let idx = 0;
                textNode.style.borderRight = "2px solid currentColor";
                textNode.style.animation = "typewriterCursor 0.7s step-end infinite";
                textNode.textContent = "";

                const typeNext = () => {
                    if (cancelled) return;
                    if (idx <= fullText.length) {
                        textNode.textContent = fullText.slice(0, idx);
                        idx++;
                        timerId = setTimeout(typeNext, speed);
                    } else {
                        // Remove cursor after typing finishes
                        setTimeout(() => {
                            if (!cancelled) {
                                textNode.style.borderRight = "";
                                textNode.style.animation = "";
                            }
                        }, 1500);
                    }
                };
                typeNext();
            };

            const resetText = () => {
                if (timerId) clearTimeout(timerId);
                textNode.textContent = fullText;
                textNode.style.borderRight = "";
                textNode.style.animation = "";
            };

            if (anim.trigger === "onLoad" || anim.trigger === "continuous") {
                timerId = setTimeout(runTypewriter, delay);
            }

            if (anim.trigger === "onHover") {
                const onEnter = () => {
                    resetText();
                    runTypewriter();
                };
                node.addEventListener("mouseenter", onEnter);
                cleanups.push(() => node.removeEventListener("mouseenter", onEnter));
            }

            if (anim.trigger === "onClick") {
                const onClick = () => {
                    resetText();
                    runTypewriter();
                };
                node.addEventListener("click", onClick);
                cleanups.push(() => node.removeEventListener("click", onClick));
            }

            if (anim.trigger === "onScroll") {
                const observer = new IntersectionObserver(
                    (entries) => {
                        entries.forEach((entry) => {
                            if (entry.isIntersecting) {
                                runTypewriter();
                                observer.unobserve(node);
                            }
                        });
                    },
                    { threshold: (anim.scrollOffset ?? 20) / 100 }
                );
                observer.observe(node);
                cleanups.push(() => observer.disconnect());
            }

            cleanups.push(() => {
                cancelled = true;
                if (timerId) clearTimeout(timerId);
                if (rafId) cancelAnimationFrame(rafId);
                // Restore full text
                textNode.textContent = fullText;
                textNode.style.borderRight = "";
                textNode.style.animation = "";
            });

            return () => cleanups.forEach(fn => fn());
        }

        // ─── Standard CSS animation triggers ───
        if (anim.trigger === "onHover") {
            const onEnter = () => {
                node.style.animation = "none";
                void node.offsetHeight;
                node.style.animation = animStrRef.current();
            };
            const onEnd = () => { node.style.animation = ""; };
            node.addEventListener("mouseenter", onEnter);
            node.addEventListener("animationend", onEnd);
            cleanups.push(() => {
                node.removeEventListener("mouseenter", onEnter);
                node.removeEventListener("animationend", onEnd);
            });
        }

        if (anim.trigger === "onScroll") {
            const observer = new IntersectionObserver(
                (entries) => {
                    entries.forEach((entry) => {
                        if (entry.isIntersecting) {
                            node.style.animation = animStrRef.current();
                            observer.unobserve(node);
                        }
                    });
                },
                { threshold: (anim.scrollOffset ?? 20) / 100 }
            );
            observer.observe(node);
            cleanups.push(() => observer.disconnect());
        }

        if (anim.trigger === "onClick") {
            const onClick = () => {
                node.style.animation = "none";
                void node.offsetHeight;
                node.style.animation = animStrRef.current();
            };
            node.addEventListener("click", onClick);
            cleanups.push(() => node.removeEventListener("click", onClick));
        }

        return () => cleanups.forEach(fn => fn());
    }, [hasAnim, anim, isTypewriter, element.props.content]);

    const setRef = useCallback((node: HTMLDivElement | null) => {
        (elRef as React.MutableRefObject<HTMLDivElement | null>).current = node;
        if (isContainer && !readOnly && setDropRef) setDropRef(node);
    }, [isContainer, readOnly, setDropRef]);

    return (
        <div
            ref={setRef}
            data-element-id={elementId}
            data-element-type={element.type}
            className={`element-wrapper ${selectionClass} element-hoverable ${layout.locked ? "element-locked" : ""} ${dropTargetClass}`}
            style={mergedStyles}
            onClick={handleClick}
        >
            {renderContent()}
            {isSelected && !layout.locked && !readOnly && (
                <>
                    <div className="rotate-handle" data-rotate-handle><span className="rotate-knob" /></div>
                    <div className="rotate-line" />
                    <ResizeHandles />
                </>
            )}
        </div>
    );
};

const Renderer: React.FC<RendererProps> = ({ elementIds, isRoot = false, readOnly = false }) => (
    <>
        {elementIds.map((id) => (
            <ElementRenderer key={id} elementId={id} isRoot={isRoot} readOnly={readOnly} />
        ))}
    </>
);

export default Renderer;
