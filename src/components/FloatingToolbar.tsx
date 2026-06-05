"use client";

import { useEditorStore } from "@/store/editorStore";
import { useEffect, useState, useRef, useCallback } from "react";

const FloatingToolbar: React.FC = () => {
    const {
        selectedElementId,
        getElement,
        duplicateElement,
        deleteElement,
        updateElement,
        toggleVisibility,
        toggleLock,
    } =
        useEditorStore();
    const [position, setPosition] = useState<{ top: number; left: number } | null>(null);
    const toolbarRef = useRef<HTMLDivElement>(null);

    // Inline text editing state
    const [isEditing, setIsEditing] = useState(false);
    const [editValue, setEditValue] = useState("");
    const editInputRef = useRef<HTMLInputElement>(null);

    const updatePosition = useCallback(() => {
        if (!selectedElementId) {
            setPosition(null);
            return;
        }
        const elNode = document.querySelector(`[data-element-id="${selectedElementId}"]`);
        const workspace = document.querySelector(".canvas-workspace");
        if (!elNode || !workspace) {
            setPosition(null);
            return;
        }

        const elRect = elNode.getBoundingClientRect();
        const wsRect = workspace.getBoundingClientRect();
        const toolbarHeight = 40;
        const gap = 8;

        let top = elRect.top - wsRect.top - toolbarHeight - gap;
        if (top < 4) {
            // Show below the element instead
            top = elRect.bottom - wsRect.top + gap;
        }

        const left = elRect.left - wsRect.left + elRect.width / 2;

        setPosition({ top, left });
    }, [selectedElementId]);

    useEffect(() => {
        const rafId = requestAnimationFrame(updatePosition);

        // Update position on scroll/resize
        const workspace = document.querySelector(".canvas-workspace");
        if (workspace) {
            workspace.addEventListener("scroll", updatePosition);
        }
        window.addEventListener("resize", updatePosition);

        // Also update on any mouse movement (for drag repositioning)
        const handleMove = () => {
            requestAnimationFrame(updatePosition);
        };
        document.addEventListener("mousemove", handleMove);

        return () => {
            cancelAnimationFrame(rafId);
            if (workspace) {
                workspace.removeEventListener("scroll", updatePosition);
            }
            window.removeEventListener("resize", updatePosition);
            document.removeEventListener("mousemove", handleMove);
        };
    }, [updatePosition]);

    // Close editing when selection changes
    useEffect(() => {
        setIsEditing(false);
    }, [selectedElementId]);

    // Focus the input when editing starts
    useEffect(() => {
        if (isEditing && editInputRef.current) {
            editInputRef.current.focus();
            editInputRef.current.select();
        }
    }, [isEditing]);

    if (!selectedElementId || !position) return null;
    const el = getElement(selectedElementId);
    if (!el) return null;

    const hasText =
        el.type === "text" ||
        el.type === "title" ||
        el.type === "paragraph" ||
        el.type === "button";

    const textKey = el.type === "button" ? "label" : "content";
    const currentText = String(el.props[textKey] || "");

    const startEditing = () => {
        setEditValue(currentText);
        setIsEditing(true);
    };

    const commitEdit = () => {
        if (editValue !== currentText) {
            updateElement(el.id, { props: { ...el.props, [textKey]: editValue } });
        }
        setIsEditing(false);
    };

    const cancelEdit = () => {
        setIsEditing(false);
    };

    return (
        <div
            ref={toolbarRef}
            className="floating-toolbar"
            style={{
                top: `${position.top}px`,
                left: `${position.left}px`,
                transform: "translateX(-50%)",
            }}
        >
            {hasText && !isEditing && (
                <button
                    className="ft-btn ft-primary"
                    onClick={startEditing}
                >
                    Change Text
                </button>
            )}
            {hasText && isEditing && (
                <div className="ft-inline-edit" onClick={(e) => e.stopPropagation()}>
                    <input
                        ref={editInputRef}
                        type="text"
                        className="ft-inline-input"
                        value={editValue}
                        onChange={(e) => setEditValue(e.target.value)}
                        onKeyDown={(e) => {
                            if (e.key === "Enter") commitEdit();
                            if (e.key === "Escape") cancelEdit();
                            e.stopPropagation();
                        }}
                        onBlur={commitEdit}
                    />
                    <button className="ft-btn ft-confirm" onClick={commitEdit} title="Confirm">
                        <svg width="14" height="14" viewBox="0 0 16 16" fill="none">
                            <path d="M3 8l3.5 3.5L13 5" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
                        </svg>
                    </button>
                    <button className="ft-btn ft-cancel-edit" onClick={cancelEdit} title="Cancel">
                        <svg width="14" height="14" viewBox="0 0 16 16" fill="none">
                            <path d="M4 4l8 8M12 4l-8 8" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
                        </svg>
                    </button>
                </div>
            )}
            <button
                className="ft-btn"
                onClick={() => duplicateElement(selectedElementId)}
                title="Duplicate"
            >
                <svg width="16" height="16" viewBox="0 0 16 16" fill="none">
                    <rect x="5" y="5" width="9" height="9" rx="1.5" stroke="currentColor" strokeWidth="1.5" />
                    <path d="M11 5V3.5A1.5 1.5 0 009.5 2h-6A1.5 1.5 0 002 3.5v6A1.5 1.5 0 003.5 11H5" stroke="currentColor" strokeWidth="1.5" />
                </svg>
            </button>
            <button className={`ft-btn ${!el.layout.visible ? "ft-primary" : ""}`} onClick={() => toggleVisibility(el.id)} title={el.layout.visible ? "Hide" : "Show"}>
                <svg width="16" height="16" viewBox="0 0 16 16" fill="none">
                    {el.layout.visible ? (
                        <>
                            <path d="M1 8s2.5-4 7-4 7 4 7 4-2.5 4-7 4-7-4-7-4Z" stroke="currentColor" strokeWidth="1.3" />
                            <circle cx="8" cy="8" r="2" stroke="currentColor" strokeWidth="1.3" />
                        </>
                    ) : (
                        <>
                            <path d="M1 8s2.5-4 7-4 7 4 7 4-2.5 4-7 4-7-4-7-4Z" stroke="currentColor" strokeWidth="1.3" />
                            <path d="M3 13L13 3" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round" />
                        </>
                    )}
                </svg>
            </button>
            <button className={`ft-btn ${el.layout.locked ? "ft-primary" : ""}`} onClick={() => toggleLock(el.id)} title={el.layout.locked ? "Unlock" : "Lock"}>
                <svg width="16" height="16" viewBox="0 0 16 16" fill="none">
                    <rect x="3.5" y="7" width="9" height="7" rx="1.5" stroke="currentColor" strokeWidth="1.3" />
                    <path d="M5.5 7V5.5a2.5 2.5 0 015 0V7" stroke="currentColor" strokeWidth="1.3" />
                </svg>
            </button>
            <div className="ft-sep" />
            <button
                className="ft-btn ft-danger"
                onClick={() => deleteElement(selectedElementId)}
                title="Delete"
            >
                <svg width="16" height="16" viewBox="0 0 16 16" fill="none">
                    <path d="M3 4h10M6 4V3a1 1 0 011-1h2a1 1 0 011 1v1M5 7v5M8 7v5M11 7v5M4.5 4l.5 9a1 1 0 001 1h4a1 1 0 001-1l.5-9" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round" />
                </svg>
            </button>
        </div>
    );
};

export default FloatingToolbar;
