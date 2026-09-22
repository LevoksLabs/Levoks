"use client";

import PrimitiveShape from "./design/PrimitiveShape";
import { useRef, useEffect, useCallback } from "react";
import { ElementType, ElementNode, CONTAINER_TYPES } from "@/types";
import { useEditorUIStore } from "@/store/editorUIStore";
import { assetElement } from "@/lib/design-assets";
import { resolveElement, fontFamily } from "@/lib/design";
import { useEditorStore } from "@/store/editorStore";
import TabsWidget from "./design/TabsWidget";
import { widgetNumber } from "@/lib/widgets";
import { ICON_PATHS } from "@/lib/icon-paths";
import VectorShape from "./design/VectorShape";
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

interface ElementRendererProps {
    elementId: string;
    isRoot?: boolean;
    readOnly?: boolean;
}

const VisibleElement: React.FC<ElementRendererProps & { element: ElementNode }> = ({ element, elementId, isRoot, readOnly = false }) => {
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


    const isSelected = !readOnly && (selectedElementId === elementId || selectedElementIds.includes(elementId));
    const layout = element.layout;
    const isTextLike = element.type === "text" || element.type === "title" || element.type === "paragraph";
    const widthPx = `${Math.max(40, layout.w)}px`;
    const heightPx = `${Math.max(20, layout.h)}px`;
    const rawPosition = String(element.styles.position || element.layout.position || "");
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
        ...(element.type === "shape" && element.props.shapeType && element.props.shapeType !== "rectangle" ? { backgroundColor: "transparent" } : {}),
        fontFamily: fontFamily(element.styles.fontFamily),
        ...(element.type === "gallery" ? { display: "block" } : {}),
        ...(element.type === "input" ? { border: "none", background: "transparent", backgroundColor: "transparent", boxShadow: "none", padding: "0" } : {}),
        cursor: readOnly ? (element.styles.cursor as React.CSSProperties["cursor"]) || "default" : (layout.locked ? "not-allowed" : (isSelected ? "grab" : "default")),
        userSelect: "none",
        overflow: (isContainer || element.vector) ? "visible" : (isTextLike ? "visible" : "hidden"),
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
        // Pointer selection belongs to Canvas; repeating it on click toggles a
        // Shift selection twice and collapses a group after a drag.
        if (e.detail === 0 || layout.locked) {
            if (e.shiftKey) toggleSelectElement(elementId);
            else selectElement(elementId);
        }
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
                    textAlign: (element.styles.textAlign as React.CSSProperties["textAlign"]) || "left", fontFamily: fontFamily(element.styles.fontFamily),
                    letterSpacing: String(element.styles.letterSpacing || "normal"), textDecoration: String(element.styles.textDecoration || "none"),
                    textTransform: (element.styles.textTransform as React.CSSProperties["textTransform"]) || "none"
                }}>
                    {String(element.props.content || "Add a Title")}</Tag>;
            }
            case "text": return <p className="el-text-inner" style={{
                margin: 0, textAlign: (element.styles.textAlign as React.CSSProperties["textAlign"]) || "left",
                fontFamily: fontFamily(element.styles.fontFamily), letterSpacing: String(element.styles.letterSpacing || "normal"),
                textDecoration: String(element.styles.textDecoration || "none"), textTransform: (element.styles.textTransform as React.CSSProperties["textTransform"]) || "none"
            }}>
                {String(element.props.content || "Text")}</p>;
            case "paragraph": return <p className="el-paragraph-inner" style={{
                margin: 0, textAlign: (element.styles.textAlign as React.CSSProperties["textAlign"]) || "left",
                fontFamily: fontFamily(element.styles.fontFamily), letterSpacing: String(element.styles.letterSpacing || "normal"),
                textDecoration: String(element.styles.textDecoration || "none"), textTransform: (element.styles.textTransform as React.CSSProperties["textTransform"]) || "none"
            }}>
                {String(element.props.content || "Paragraph text...")}</p>;
            case "button": return <button className="el-button-inner" onClick={handleReadOnlyAction} style={{
                background: "inherit", backgroundColor: "inherit", color: "inherit", borderRadius: String(element.styles.borderRadius || "6px"),
                fontSize: String(element.styles.fontSize || "14px"), fontWeight: String(element.styles.fontWeight || "500"), cursor: "pointer", border: "none",
                width: "100%", height: "100%", display: "flex", alignItems: "center", justifyContent: "center",
                textAlign: (element.styles.textAlign as React.CSSProperties["textAlign"]) || "center", fontFamily: fontFamily(element.styles.fontFamily),
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
            ) : <div className="gallery-content" style={{ display: "grid", gridTemplateColumns: `repeat(${widgetNumber(element.props.columns, 3, 1, 8)}, minmax(0, 1fr))`, gap: `${widgetNumber(element.props.gap, 8, 0, 100)}px`, width: "100%", height: "100%" }}><Renderer elementIds={element.children} isRoot={false} readOnly={readOnly} /></div>;
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
            case "shape": return element.vector ? <VectorShape element={element} editable={isSelected && !readOnly && !layout.locked} /> : <PrimitiveShape shapeType={String(element.props.shapeType || "rectangle")} color={String(element.styles.backgroundColor || "#6366f1")} />;
            case "divider": return <hr style={{ width: "100%", border: "none", height: "100%", backgroundColor: String(element.styles.backgroundColor || "#e5e7eb") }} />;
            case "menu": {
                const items = String(element.props.items || "Home,About,Contact").split(",");
                const vert = element.props.menuStyle === "vertical";
                return <nav style={{ display: "flex", flexDirection: vert ? "column" : "row", gap: vert ? "4px" : "24px", alignItems: vert ? "stretch" : "center", height: "100%", padding: "0 20px" }}>
                    {items.map((item, i) => <span key={i} className="menu-item">{item.trim()}</span>)}</nav>;
            }
            case "repeater": return <div className="repeater-content" style={{ display: "flex", flexDirection: element.props.direction === "row" ? "row" : "column", gap: String(element.styles.gap || "12px"), width: "100%" }}>{element.children.length ? Array.from({ length: widgetNumber(element.props.repeatCount, 3, 1, 20) }, (_, index) => <div key={index} className="repeater-item"><Renderer elementIds={element.children} isRoot={false} readOnly={readOnly || index > 0} /></div>) : containerPlaceholder("Add a template to repeat")}</div>;
            case "frame": return <div className="frame-placeholder"><span>⟨/⟩</span><span>Embed Frame</span><span className="frame-url">{String(element.props.src || "https://example.com")}</span></div>;
            case "icon": {
                const svg = <svg viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><path d={ICON_PATHS[String(element.props.icon || "star")] || ICON_PATHS.star} /></svg>;
                return <div className="icon-element" style={{ width: "100%", height: "100%", display: "flex", alignItems: "center", justifyContent: "center", color: String(element.props.iconColor || "#374151") }}>
                    <div style={{ width: Number(element.props.iconSize) || 32, height: Number(element.props.iconSize) || 32 }}>{svg}</div></div>;
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
            case "tabs": return <TabsWidget element={element} render={ids => <Renderer elementIds={ids} readOnly={readOnly} />} onSelect={readOnly ? undefined : index => useEditorStore.getState().updateElement(element.id, { props: { activeTab: index } })} />;
            default: return null;
        }
    };

    const selectionClass = isSelected ? "element-selected" : "";
    const dropTargetClass = !readOnly && isContainer && isDropOver ? "element-drop-target" : "";

    // ─── Hover, Scroll & Click animation triggers ───
    const elRef = useRef<HTMLDivElement>(null);
    const animStrRef = useRef(buildAnimStr);
    useEffect(() => { animStrRef.current = buildAnimStr; }, [buildAnimStr]);

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
            const rafId: number | null = null;
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
            data-element-id={readOnly ? undefined : elementId}
            data-preview-element-id={readOnly ? elementId : undefined}
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

const ElementRenderer: React.FC<ElementRendererProps> = (props) => {
    const raw = useEditorStore(s => s.elementsById[props.elementId]);
    const breakpoint = useEditorUIStore(s => s.breakpoint);
    const assets = useEditorStore(s => s.assets);
    const element = raw ? assetElement(resolveElement(raw, breakpoint), assets) : undefined;
    return element?.layout.visible ? <VisibleElement {...props} element={element} /> : null;
};

const Renderer: React.FC<RendererProps> = ({ elementIds, isRoot = false, readOnly = false }) => (
    <>
        {elementIds.map((id) => (
            <ElementRenderer key={id} elementId={id} isRoot={isRoot} readOnly={readOnly} />
        ))}
    </>
);

export default Renderer;
