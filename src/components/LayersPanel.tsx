"use client";

import { useEditorStore } from "@/store/editorStore";
import { CONTAINER_TYPES } from "@/types";
import { useRef, useState, useCallback, useMemo } from "react";
import { useShallow } from "zustand/shallow";
import { isAncestorOf } from "@/store/editorHelpers";
import {
    Layers, Type, Image, Square, Columns2, AlignJustify,
    MousePointerClick, PlayCircle, LayoutGrid, FileText,
    PenLine, Diamond, Minus, Menu, RotateCcw, Code2,
    Star, ArrowUpDown, Smartphone, ChevronDown, LayoutList,
    Eye, EyeOff, Lock, Unlock, GripVertical, Globe
} from "lucide-react";

const TYPE_ICON_MAP: Record<string, React.ReactNode> = {
    section: <AlignJustify size={14} />, container: <Square size={14} />, columns: <Columns2 size={14} />,
    stack: <Layers size={14} />, title: <Type size={14} strokeWidth={2.5} />, text: <Type size={14} />,
    paragraph: <FileText size={14} />, button: <MousePointerClick size={14} />, image: <Image size={14} />,
    video: <PlayCircle size={14} />, gallery: <LayoutGrid size={14} />, form: <FileText size={14} />,
    input: <PenLine size={14} />, shape: <Diamond size={14} />, divider: <Minus size={14} />,
    menu: <Menu size={14} />, repeater: <RotateCcw size={14} />, frame: <Code2 size={14} />,
    icon: <Star size={14} />, spacer: <ArrowUpDown size={14} />, socialbar: <Smartphone size={14} />,
    accordion: <ChevronDown size={14} />, tabs: <LayoutList size={14} />,
    global: <Globe size={14} />, page: <Layers size={14} />,
};

type Scope = "page" | "global";
type DropPosition = "before" | "after" | "inside";
interface DragState { elementId: string; parentId: string | null; index: number; scope: Scope }
interface DropIndicator { scope: Scope; position: DropPosition; parentId: string | null; index: number; depth: number; targetId: string | null }
interface FlatNode { id: string; parentId: string | null; index: number; depth: number }

// LayerItem now looks up element from store by ID
const LayerItem: React.FC<{
    elementId: string; depth: number; index: number; parentId: string | null; scope: Scope;
    onDragStart: (elementId: string, parentId: string | null, index: number, scope: Scope) => void;
    dropIndicator: DropIndicator | null;
}> = ({ elementId, depth, index, parentId, scope, onDragStart, dropIndicator }) => {
    const element = useEditorStore(s => s.elementsById[elementId]);
    const isSelected = useEditorStore(s => s.selectedElementId === elementId || s.selectedElementIds.includes(elementId));
    const selectElement = useEditorStore(s => s.selectElement);
    const toggleSelectElement = useEditorStore(s => s.toggleSelectElement);
    const toggleVisibility = useEditorStore(s => s.toggleVisibility);
    const toggleLock = useEditorStore(s => s.toggleLock);

    if (!element) return null;

    const showDropBefore = Boolean(dropIndicator && dropIndicator.scope === scope && dropIndicator.position === "before" && dropIndicator.targetId === elementId);
    const showDropAfter = Boolean(dropIndicator && dropIndicator.scope === scope && dropIndicator.position === "after" && dropIndicator.targetId === elementId);
    const showDropInside = Boolean(dropIndicator && dropIndicator.scope === scope && dropIndicator.position === "inside" && dropIndicator.targetId === elementId);

    return (
        <>
            {showDropBefore && <div className="layer-drop-indicator" style={{ marginLeft: `${12 + depth * 16}px` }} />}
            <div
                className={`layer-item ${isSelected ? "layer-selected" : ""} ${!element.layout.visible ? "layer-hidden" : ""} ${showDropInside ? "layer-drop-inside" : ""}`}
                style={{ paddingLeft: `${12 + depth * 16}px` }}
                data-element-id={elementId}
                data-parent-id={parentId || ""}
                data-scope={scope}
                onClick={(e) => { if (e.shiftKey) toggleSelectElement(elementId); else selectElement(elementId); }}
            >
                <div className="layer-grip" onMouseDown={(e) => { e.preventDefault(); e.stopPropagation(); onDragStart(elementId, parentId, index, scope); }} title="Drag to reorder">
                    <GripVertical size={12} />
                </div>
                <span className="layer-icon">{TYPE_ICON_MAP[element.type] || <Square size={14} />}</span>
                <span className="layer-name">{element.label || element.type}</span>
                <div className="layer-actions">
                    <button className={`layer-action-btn ${!element.layout.visible ? "toggled" : ""}`} onClick={(e) => { e.stopPropagation(); toggleVisibility(elementId); }} title={element.layout.visible ? "Hide" : "Show"}>
                        {element.layout.visible ? <Eye size={13} /> : <EyeOff size={13} />}
                    </button>
                    <button className={`layer-action-btn ${element.layout.locked ? "toggled" : ""}`} onClick={(e) => { e.stopPropagation(); toggleLock(elementId); }} title={element.layout.locked ? "Unlock" : "Lock"}>
                        {element.layout.locked ? <Lock size={13} /> : <Unlock size={13} />}
                    </button>
                </div>
            </div>
            {showDropAfter && <div className="layer-drop-indicator" style={{ marginLeft: `${12 + depth * 16}px` }} />}
            {element.children.map((childId, ci) => (
                <LayerItem key={childId} elementId={childId} depth={depth + 1} index={ci} parentId={elementId} scope={scope} onDragStart={onDragStart} dropIndicator={dropIndicator} />
            ))}
        </>
    );
};

const LayerTree: React.FC<{
    title: string; scope: Scope; elementIds: string[];
    dropIndicator: DropIndicator | null;
    onDragStart: (elementId: string, parentId: string | null, index: number, scope: Scope) => void;
    setListRef: (scope: Scope) => (node: HTMLDivElement | null) => void;
}> = ({ title, scope, elementIds, dropIndicator, onDragStart, setListRef }) => {
    const elementsById = useEditorStore(s => s.elementsById);
    const total = useMemo(() => {
        const count = (ids: string[]): number => ids.reduce((sum, id) => { const el = elementsById[id]; return el ? sum + 1 + count(el.children) : sum; }, 0);
        return count(elementIds);
    }, [elementIds, elementsById]);

    return (
        <div className="layers-section">
            <div className="layers-section-header">
                <div className="layers-section-title">
                    <span className="layer-icon">{TYPE_ICON_MAP[scope] || <Square size={14} />}</span>
                    <span>{title}</span>
                </div>
                <span className="layers-section-count">{total}</span>
            </div>
            <div className="layers-tree" ref={setListRef(scope)}>
                {elementIds.length === 0 ? (
                    <div className="layers-empty"><span>No {title.toLowerCase()} elements</span><span>{scope === "global" ? "Add from Global panel" : "Drag elements from the sidebar"}</span></div>
                ) : elementIds.map((id, i) => (
                    <LayerItem key={id} elementId={id} depth={0} index={i} parentId={null} scope={scope} onDragStart={onDragStart} dropIndicator={dropIndicator} />
                ))}
            </div>
        </div>
    );
};

const LayersPanel: React.FC = () => {
    const { rootIds, globalRootIds, elementsById, reorderElements, moveElement } = useEditorStore(useShallow(s => ({
        rootIds: s.rootIds, globalRootIds: s.globalRootIds, elementsById: s.elementsById,
        reorderElements: s.reorderElements, moveElement: s.moveElement,
    })));

    const [dropIndicator, setDropIndicator] = useState<DropIndicator | null>(null);
    const dragRef = useRef<DragState | null>(null);
    const dropRef = useRef<DropIndicator | null>(null);
    const listRefs = useRef<{ page: HTMLDivElement | null; global: HTMLDivElement | null }>({ page: null, global: null });
    const setListRef = useCallback((scope: Scope) => (node: HTMLDivElement | null) => { listRefs.current[scope] = node; }, []);

    const buildFlatList = useCallback(function walk(ids: string[], parentId: string | null, depth: number, acc: FlatNode[]) {
        ids.forEach((id, i) => {
            acc.push({ id, parentId, index: i, depth });
            const el = elementsById[id];
            if (el) walk(el.children, id, depth + 1, acc);
        });
        return acc;
    }, [elementsById]);

    const getScopeRootIds = useCallback((scope: Scope): string[] => {
        const s = useEditorStore.getState();
        return scope === "global" ? s.globalRootIds : s.rootIds;
    }, []);

    const handleDragStart = useCallback((elementId: string, parentId: string | null, index: number, scope: Scope) => {
        dragRef.current = { elementId, parentId, index, scope };
        dropRef.current = null;

        const handleMouseMove = (e: MouseEvent) => {
            const src = dragRef.current;
            if (!src) return;
            const state = useEditorStore.getState();
            const scopeIds = scope === "global" ? state.globalRootIds : state.rootIds;
            const flat = buildFlatList(scopeIds, null, 0, []);
            const byId = new Map(flat.map(item => [item.id, item]));
            const hovered = document.elementFromPoint(e.clientX, e.clientY) as HTMLElement | null;
            const row = hovered?.closest(".layer-item") as HTMLElement | null;
            const rowScope = (row?.getAttribute("data-scope") as Scope | null) || null;
            const listEl = listRefs.current[src.scope];
            const listRect = listEl?.getBoundingClientRect();
            let indicator: DropIndicator | null = null;

            if (row && rowScope === src.scope) {
                const targetId = row.getAttribute("data-element-id");
                if (!targetId || targetId === src.elementId) { setDropIndicator(null); dropRef.current = null; return; }
                const target = byId.get(targetId);
                if (!target) return;
                const targetEl = state.elementsById[targetId];
                if (!targetEl) return;
                const rect = row.getBoundingClientRect();
                const midY = rect.top + rect.height / 2;
                const topZone = rect.top + rect.height * 0.25;
                const bottomZone = rect.bottom - rect.height * 0.25;
                const isCont = CONTAINER_TYPES.includes(targetEl.type);

                if (isCont && e.clientY >= topZone && e.clientY <= bottomZone) {
                    if (!isAncestorOf(state.elementsById, src.elementId, targetId) && src.elementId !== targetId) {
                        indicator = { scope: src.scope, position: "inside", parentId: targetId, index: targetEl.children.length, depth: target.depth + 1, targetId };
                    }
                } else if (e.clientY < midY) {
                    indicator = { scope: src.scope, position: "before", parentId: target.parentId, index: target.index, depth: target.depth, targetId };
                } else {
                    indicator = { scope: src.scope, position: "after", parentId: target.parentId, index: target.index + 1, depth: target.depth, targetId };
                }

                if (indicator?.parentId && isAncestorOf(state.elementsById, src.elementId, indicator.parentId)) indicator = null;
            } else if (listRect && e.clientY >= listRect.top && e.clientY <= listRect.bottom) {
                if (scopeIds.length === 0) {
                    indicator = { scope: src.scope, position: "inside", parentId: null, index: 0, depth: 0, targetId: null };
                } else if (e.clientY < listRect.top + 6) {
                    indicator = { scope: src.scope, position: "before", parentId: null, index: 0, depth: 0, targetId: flat[0]?.id || null };
                } else if (e.clientY > listRect.bottom - 6) {
                    indicator = { scope: src.scope, position: "after", parentId: null, index: scopeIds.length, depth: 0, targetId: flat[flat.length - 1]?.id || null };
                }
            }
            dropRef.current = indicator;
            setDropIndicator(indicator);
        };

        const handleMouseUp = () => {
            const src = dragRef.current;
            const drop = dropRef.current;
            if (src && drop && src.scope === drop.scope) {
                const state = useEditorStore.getState();
                const el = state.elementsById[src.elementId];
                if (el) {
                    const sameParent = drop.parentId === el.parentId && drop.position !== "inside";
                    if (sameParent) {
                        const siblings = el.parentId ? state.elementsById[el.parentId]?.children || [] : (src.scope === "global" ? state.globalRootIds : state.rootIds);
                        const curIdx = siblings.indexOf(src.elementId);
                        const adj = drop.index > curIdx ? drop.index - 1 : drop.index;
                        reorderElements(el.parentId, curIdx, adj);
                    } else {
                        moveElement(src.elementId, drop.parentId, drop.index);
                    }
                }
            }
            dragRef.current = null; dropRef.current = null; setDropIndicator(null);
            document.body.style.userSelect = "";
            document.removeEventListener("mousemove", handleMouseMove);
            document.removeEventListener("mouseup", handleMouseUp);
        };

        document.body.style.userSelect = "none";
        document.addEventListener("mousemove", handleMouseMove);
        document.addEventListener("mouseup", handleMouseUp);
    }, [buildFlatList, getScopeRootIds, moveElement, reorderElements]);

    const totalCount = rootIds.length + globalRootIds.length;

    return (
        <div className="layers-panel">
            <div className="layers-header">
                <span>Layers</span>
                <span className="layers-count">{totalCount}</span>
            </div>
            <div className="layers-list">
                {totalCount === 0 ? (
                    <div className="layers-empty"><span>No elements</span><span>Drag elements from the sidebar</span></div>
                ) : (
                    <>
                        <LayerTree title="Page" scope="page" elementIds={rootIds} dropIndicator={dropIndicator} onDragStart={handleDragStart} setListRef={setListRef} />
                        <LayerTree title="Global" scope="global" elementIds={globalRootIds} dropIndicator={dropIndicator} onDragStart={handleDragStart} setListRef={setListRef} />
                    </>
                )}
            </div>
        </div>
    );
};

export default LayersPanel;
