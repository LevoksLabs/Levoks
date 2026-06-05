"use client";

import { useEditorStore } from "@/store/editorStore";
import { CONTAINER_TYPES, ElementNode } from "@/types";
import Renderer from "./Renderer";
import ContextMenu from "./ContextMenu";
import { useDroppable } from "@dnd-kit/core";
import { useRef, useState, useCallback } from "react";
import { Monitor, Tablet, Smartphone, Globe, Lock } from "lucide-react";

const ZOOM_LEVELS = [50, 75, 100, 125, 150];
const GRID_SIZE = 8;
const SNAP_THRESHOLD = 6;

const RESOLUTION_PRESETS = [
    { label: "Desktop", width: 1280, icon: <Monitor size={14} /> },
    { label: "Tablet", width: 768, icon: <Tablet size={14} /> },
    { label: "Mobile", width: 375, icon: <Smartphone size={14} /> },
];

// findParentId is no longer needed — elements have explicit parentId

const Canvas: React.FC = () => {
    const {
        elementsById,
        rootIds,
        globalRootIds,
        selectElement,
        selectElements,
        toggleSelectElement,
        updateElement,
        updateElementPosition,
        updateElementSize,
        updateElementRotationLive,
        moveElement,
        pages,
        activePageId,
        canvasSettings,
        updateCanvasSettings,
        getElement,
    } = useEditorStore();
    const [zoom, setZoom] = useState(100);
    const canvasPageRef = useRef<HTMLDivElement>(null);
    const [snapGuides, setSnapGuides] = useState<{ x: number[]; y: number[] }>({ x: [], y: [] });
    const [selectionBox, setSelectionBox] = useState<{ x: number; y: number; w: number; h: number } | null>(null);
    const selectionStart = useRef<{ x: number; y: number } | null>(null);

    // Canvas height resize state
    const [isResizingHeight, setIsResizingHeight] = useState(false);
    const [pendingHeight, setPendingHeight] = useState<number | null>(null);
    const resizeStartY = useRef<number>(0);
    const resizeStartH = useRef<number>(0);

    // Context menu state
    const [ctxMenu, setCtxMenu] = useState<{ x: number; y: number; elementId: string } | null>(null);

    const activePage = pages.find((p) => p.id === activePageId);
    const activePageTitle = activePage?.title || "Home";
    const activePageRoute = activePage?.route || "/";

    const canvasWidth = Math.max(320, Number(canvasSettings.width) || 1280);
    const canvasHeight = Math.max(200, Number(canvasSettings.height) || 900);
    const activeRes = RESOLUTION_PRESETS.find((r) => r.width === canvasWidth);
    const canvasBackground = String(canvasSettings.backgroundColor || "#ffffff");
    const canvasHasGradient = /gradient\(/i.test(canvasBackground);

    // Drag state for moving elements
    const dragState = useRef<{
        dragging: boolean;
        resizing: boolean;
        rotating: boolean;
        elementId: string;
        startX: number;
        startY: number;
        startElX: number;
        startElY: number;
        startElW: number;
        startElH: number;
        handle: string;
        parentContainerId: string | null;
        pointerId: number;
        startAngle: number;
        startRotation: number;
        centerX: number;
        centerY: number;
    } | null>(null);
    const rafRef = useRef<number | null>(null);
    const latestPointRef = useRef<{ x: number; y: number; shiftKey: boolean } | null>(null);

    const { setNodeRef, isOver } = useDroppable({
        id: "canvas-root",
        data: { type: "canvas", parentId: null },
    });

    const setRefs = useCallback((node: HTMLDivElement | null) => {
        setNodeRef(node);
        (canvasPageRef as React.MutableRefObject<HTMLDivElement | null>).current = node;
    }, [setNodeRef]);

    const getSnap = useCallback((
        x: number,
        y: number,
        w: number,
        h: number,
        siblings: ElementNode[],
        options?: { canvasCenterX?: number; canvasCenterY?: number }
    ): { x: number; y: number; guideX: number[]; guideY: number[] } => {
        let snappedX = x;
        let snappedY = y;
        let bestDx = SNAP_THRESHOLD + 1;
        let bestDy = SNAP_THRESHOLD + 1;
        const guideX: number[] = [];
        const guideY: number[] = [];

        const selfEdgesX = [
            { key: "left", value: x },
            { key: "center", value: x + w / 2 },
            { key: "right", value: x + w },
        ];
        const selfEdgesY = [
            { key: "top", value: y },
            { key: "center", value: y + h / 2 },
            { key: "bottom", value: y + h },
        ];

        const considerX = (target: number, key: "left" | "center" | "right") => {
            const edge = selfEdgesX.find((s) => s.key === key);
            if (!edge) return;
            const dx = Math.abs(edge.value - target);
            if (dx <= SNAP_THRESHOLD && dx < bestDx) {
                bestDx = dx;
                guideX.length = 0;
                guideX.push(target);
                if (key === "left") snappedX = target;
                if (key === "center") snappedX = target - w / 2;
                if (key === "right") snappedX = target - w;
            } else if (dx <= SNAP_THRESHOLD && dx === bestDx) {
                if (!guideX.includes(target)) guideX.push(target);
            }
        };

        const considerY = (target: number, key: "top" | "center" | "bottom") => {
            const edge = selfEdgesY.find((s) => s.key === key);
            if (!edge) return;
            const dy = Math.abs(edge.value - target);
            if (dy <= SNAP_THRESHOLD && dy < bestDy) {
                bestDy = dy;
                guideY.length = 0;
                guideY.push(target);
                if (key === "top") snappedY = target;
                if (key === "center") snappedY = target - h / 2;
                if (key === "bottom") snappedY = target - h;
            } else if (dy <= SNAP_THRESHOLD && dy === bestDy) {
                if (!guideY.includes(target)) guideY.push(target);
            }
        };

        siblings.forEach((el) => {
            if (el.id === dragState.current?.elementId) return;
            const edgesX = [
                { key: "left", value: el.layout.x },
                { key: "center", value: el.layout.x + el.layout.w / 2 },
                { key: "right", value: el.layout.x + el.layout.w },
            ];
            const edgesY = [
                { key: "top", value: el.layout.y },
                { key: "center", value: el.layout.y + el.layout.h / 2 },
                { key: "bottom", value: el.layout.y + el.layout.h },
            ];

            edgesX.forEach((t) => {
                considerX(t.value, "left");
                considerX(t.value, "center");
                considerX(t.value, "right");
            });

            edgesY.forEach((t) => {
                considerY(t.value, "top");
                considerY(t.value, "center");
                considerY(t.value, "bottom");
            });
        });

        if (options?.canvasCenterX !== undefined) {
            considerX(options.canvasCenterX, "center");
        }
        if (options?.canvasCenterY !== undefined) {
            considerY(options.canvasCenterY, "center");
        }

        if (guideX.length === 0) {
            const gx = Math.round(snappedX / GRID_SIZE) * GRID_SIZE;
            if (Math.abs(gx - snappedX) <= SNAP_THRESHOLD) snappedX = gx;
        }
        if (guideY.length === 0) {
            const gy = Math.round(snappedY / GRID_SIZE) * GRID_SIZE;
            if (Math.abs(gy - snappedY) <= SNAP_THRESHOLD) snappedY = gy;
        }

        return { x: snappedX, y: snappedY, guideX, guideY };
    }, []);

    const scheduleDragUpdate = useCallback(() => {
        if (rafRef.current) return;
        rafRef.current = requestAnimationFrame(() => {
            rafRef.current = null;
            const ds = dragState.current;
            const latest = latestPointRef.current;
            if (!ds || !latest) return;

            const scale = zoom / 100;
            let dx = (latest.x - ds.startX) / scale;
            let dy = (latest.y - ds.startY) / scale;
            if (latest.shiftKey && ds.dragging) {
                if (Math.abs(dx) >= Math.abs(dy)) dy = 0;
                else dx = 0;
            }

            if (ds.dragging) {
                if (ds.parentContainerId) {
                    const parentEl = useEditorStore.getState().getElement(ds.parentContainerId);
                    if (!parentEl || parentEl.type !== "container") {
                        dragState.current = { ...ds, parentContainerId: null };
                        return;
                    }

                    const maxX = Math.max(0, parentEl.w - ds.startElW);
                    const maxY = Math.max(0, parentEl.h - ds.startElH);
                    const rawX = ds.startElX + dx;
                    const rawY = ds.startElY + dy;
                    const overflowLeft = Math.max(0, -rawX);
                    const overflowRight = Math.max(0, rawX - maxX);
                    const overflowTop = Math.max(0, -rawY);
                    const overflowBottom = Math.max(0, rawY - maxY);
                    const maxOverflow = Math.max(overflowLeft, overflowRight, overflowTop, overflowBottom);
                    const detachThreshold = 48;
                    const resistance = 0.28;

                    if (maxOverflow > detachThreshold) {
                        const canvasNode = document.querySelector(".canvas-page") as HTMLElement | null;
                        const draggedNode = document.querySelector(`[data-element-id="${ds.elementId}"]`) as HTMLElement | null;
                        if (canvasNode && draggedNode) {
                            const canvasRect = canvasNode.getBoundingClientRect();
                            const draggedRect = draggedNode.getBoundingClientRect();
                            const detachedX = Math.max(0, (draggedRect.left - canvasRect.left) / scale);
                            const detachedY = Math.max(0, (draggedRect.top - canvasRect.top) / scale);
                            moveElement(ds.elementId, null, useEditorStore.getState().rootIds.length);
                            updateElementPosition(ds.elementId, detachedX, detachedY);
                            dragState.current = {
                                ...ds,
                                parentContainerId: null,
                                startX: latest.x,
                                startY: latest.y,
                                startElX: detachedX,
                                startElY: detachedY,
                            };
                            return;
                        }
                    }

                    let newX = rawX;
                    let newY = rawY;
                    if (rawX < 0) newX = -overflowLeft * resistance;
                    if (rawX > maxX) newX = maxX + overflowRight * resistance;
                    if (rawY < 0) newY = -overflowTop * resistance;
                    if (rawY > maxY) newY = maxY + overflowBottom * resistance;
                    const snapX = Math.round(newX / GRID_SIZE) * GRID_SIZE;
                    const snapY = Math.round(newY / GRID_SIZE) * GRID_SIZE;
                    const finalX = Math.abs(snapX - newX) <= SNAP_THRESHOLD ? snapX : newX;
                    const finalY = Math.abs(snapY - newY) <= SNAP_THRESHOLD ? snapY : newY;
                    const siblings = parentEl.children.filter((el) => el.id !== ds.elementId);
                    const snap = getSnap(finalX, finalY, ds.startElW, ds.startElH, siblings);
                    let guideX = snap.guideX;
                    let guideY = snap.guideY;
                    if (snap.guideX.length > 0 || snap.guideY.length > 0) {
                        const canvasNode = document.querySelector(".canvas-page") as HTMLElement | null;
                        const containerNode = document.querySelector(`[data-element-id="${ds.parentContainerId}"]`) as HTMLElement | null;
                        if (canvasNode && containerNode) {
                            const canvasRect = canvasNode.getBoundingClientRect();
                            const containerRect = containerNode.getBoundingClientRect();
                            const offsetX = (containerRect.left - canvasRect.left) / scale;
                            const offsetY = (containerRect.top - canvasRect.top) / scale;
                            guideX = snap.guideX.map((x) => x + offsetX);
                            guideY = snap.guideY.map((y) => y + offsetY);
                        }
                    }
                    setSnapGuides({ x: guideX, y: guideY });
                    updateElementPosition(ds.elementId, snap.x, snap.y);
                    return;
                }

                const newX = Math.max(0, ds.startElX + dx);
                const newY = Math.max(0, ds.startElY + dy);
                const state = useEditorStore.getState();
                const siblings = state.rootIds.map(id => state.elementsById[id]).filter(el => el && el.id !== ds.elementId);
                const snap = getSnap(newX, newY, ds.startElW, ds.startElH, siblings, {
                    canvasCenterX: canvasWidth / 2,
                    canvasCenterY: canvasHeight / 2,
                });
                setSnapGuides({ x: snap.guideX, y: snap.guideY });
                updateElementPosition(ds.elementId, snap.x, snap.y);
                return;
            }

            if (ds.resizing) {
                const handle = ds.handle;
                let newX = ds.startElX;
                let newY = ds.startElY;
                let newW = ds.startElW;
                let newH = ds.startElH;

                if (handle.includes("e")) newW = Math.max(40, ds.startElW + dx);
                if (handle.includes("s")) newH = Math.max(20, ds.startElH + dy);
                if (handle.includes("w")) {
                    newW = Math.max(40, ds.startElW - dx);
                    newX = ds.startElX + (ds.startElW - newW);
                }
                if (handle.includes("n")) {
                    newH = Math.max(20, ds.startElH - dy);
                    newY = ds.startElY + (ds.startElH - newH);
                }

                updateElementPosition(ds.elementId, newX, newY);
                updateElementSize(ds.elementId, newW, newH);
                setSnapGuides({ x: [], y: [] });
                return;
            }

            if (ds.rotating) {
                const angle = Math.atan2(latest.y - ds.centerY, latest.x - ds.centerX);
                let deg = ds.startRotation + ((angle - ds.startAngle) * 180) / Math.PI;
                if (latest.shiftKey) {
                    deg = Math.round(deg / 15) * 15;
                }
                updateElementRotationLive(ds.elementId, deg);
                setSnapGuides({ x: [], y: [] });
            }
        });
    }, [canvasHeight, canvasWidth, getSnap, moveElement, updateElementPosition, updateElementRotationLive, updateElementSize, zoom]);

    const handlePointerMove = useCallback((e: PointerEvent) => {
        if (selectionStart.current) {
            const start = selectionStart.current;
            const w = e.clientX - start.x;
            const h = e.clientY - start.y;
            setSelectionBox({
                x: w < 0 ? e.clientX : start.x,
                y: h < 0 ? e.clientY : start.y,
                w: Math.abs(w),
                h: Math.abs(h),
            });
            return;
        }
        const ds = dragState.current;
        if (!ds || e.pointerId !== ds.pointerId) return;
        latestPointRef.current = { x: e.clientX, y: e.clientY, shiftKey: e.shiftKey };
        scheduleDragUpdate();
    }, [scheduleDragUpdate]);

    const finalizeDrag = useCallback(() => {
        if (rafRef.current) {
            cancelAnimationFrame(rafRef.current);
            rafRef.current = null;
        }
        latestPointRef.current = null;
        dragState.current = null;
        document.body.style.userSelect = "";
        document.body.style.cursor = "";
        setSnapGuides({ x: [], y: [] });
        selectionStart.current = null;
        setSelectionBox(null);
    }, []);

    const handleContextMenu = useCallback((e: React.MouseEvent) => {
        const target = e.target as HTMLElement;
        const elementWrapper = target.closest("[data-element-id]") as HTMLElement | null;
        if (elementWrapper) {
            e.preventDefault();
            e.stopPropagation();
            const elId = elementWrapper.getAttribute("data-element-id")!;
            selectElement(elId);
            setCtxMenu({ x: e.clientX, y: e.clientY, elementId: elId });
        }
    }, [selectElement]);

    const handleDragEnd = useCallback((e?: { clientX: number; clientY: number }) => {
        const ds = dragState.current;
        if (!ds) return;

        if (ds.dragging) {
            const state = useEditorStore.getState();
            const draggedEl = state.getElement(ds.elementId);
            const scale = zoom / 100;

            if (draggedEl) {
                let targetContainerId: string | null = null;
                if (e) {
                    const targetNode = document.elementFromPoint(e.clientX, e.clientY) as HTMLElement | null;
                    let walkNode: HTMLElement | null = targetNode;
                    while (walkNode && !targetContainerId) {
                        const maybeId = walkNode.getAttribute("data-element-id");
                        if (maybeId && maybeId !== ds.elementId) {
                            const maybeEl = state.getElement(maybeId);
                            if (maybeEl && CONTAINER_TYPES.includes(maybeEl.type)) {
                                targetContainerId = maybeId;
                            }
                        }
                        walkNode = walkNode.parentElement;
                    }
                }

                const pageParentId = state.elementsById[ds.elementId]?.parentId ?? null;
                if (pageParentId === undefined) {
                    dragState.current = null;
                    return;
                }
                const currentParentId = pageParentId;
                const currentParent = currentParentId ? state.getElement(currentParentId) : undefined;

                if (targetContainerId && targetContainerId !== currentParentId) {
                    const targetContainer = state.getElement(targetContainerId);
                    if (targetContainer) {
                        const targetIsDescendant = (() => {
                            const stack = [...draggedEl.children];
                            while (stack.length > 0) {
                                const node = stack.pop()!;
                                if (node.id === targetContainerId) return true;
                                stack.push(...node.children);
                            }
                            return false;
                        })();
                        if (!targetIsDescendant) {
                            let nextX = 0;
                            let nextY = 0;
                            const containerNode = document.querySelector(`[data-element-id="${targetContainerId}"]`) as HTMLElement | null;
                            const draggedNode = document.querySelector(`[data-element-id="${ds.elementId}"]`) as HTMLElement | null;
                            if (containerNode && draggedNode) {
                                const containerRect = containerNode.getBoundingClientRect();
                                const draggedRect = draggedNode.getBoundingClientRect();
                                const maxX = Math.max(0, targetContainer.w - draggedEl.w);
                                const maxY = Math.max(0, targetContainer.h - draggedEl.h);
                                const relX = (draggedRect.left - containerRect.left) / scale;
                                const relY = (draggedRect.top - containerRect.top) / scale;
                                nextX = Math.min(maxX, Math.max(0, relX));
                                nextY = Math.min(maxY, Math.max(0, relY));
                            }

                            moveElement(ds.elementId, targetContainerId, targetContainer.children.length);
                            const rawPosition = String(draggedEl.styles.position || "");
                            if (!rawPosition || rawPosition === "static") {
                                updateElement(ds.elementId, {
                                    styles: {
                                        ...draggedEl.styles,
                                        position: "absolute",
                                    },
                                });
                            }
                            updateElementPosition(ds.elementId, nextX, nextY);
                        }
                    }
                } else if (currentParent?.type === "container") {
                    const maxX = Math.max(0, currentParent.w - draggedEl.w);
                    const maxY = Math.max(0, currentParent.h - draggedEl.h);
                    const clampedX = Math.min(maxX, Math.max(0, draggedEl.x));
                    const clampedY = Math.min(maxY, Math.max(0, draggedEl.y));
                    if (clampedX !== draggedEl.x || clampedY !== draggedEl.y) {
                        updateElementPosition(ds.elementId, clampedX, clampedY);
                    }
                }
            }
        }

    }, [moveElement, updateElement, updateElementPosition, zoom]);

    const handlePointerUp = useCallback((e: PointerEvent) => {
        const ds = dragState.current;
        if (!ds && selectionStart.current) {
            const start = selectionStart.current;
            const end = { x: e.clientX, y: e.clientY };
            const rect = {
                left: Math.min(start.x, end.x),
                top: Math.min(start.y, end.y),
                right: Math.max(start.x, end.x),
                bottom: Math.max(start.y, end.y),
            };
            const nodes = Array.from(document.querySelectorAll<HTMLElement>(".canvas-page [data-element-id]"));
            const hits = nodes.filter((node) => {
                const r = node.getBoundingClientRect();
                return r.right >= rect.left && r.left <= rect.right && r.bottom >= rect.top && r.top <= rect.bottom;
            }).map((node) => node.getAttribute("data-element-id")).filter((id): id is string => Boolean(id));
            selectElements(hits);
            finalizeDrag();
            window.removeEventListener("pointermove", handlePointerMove);
            window.removeEventListener("pointerup", handlePointerUp);
            window.removeEventListener("pointercancel", handlePointerUp);
            return;
        }
        if (!ds || e.pointerId !== ds.pointerId) return;
        handleDragEnd({ clientX: e.clientX, clientY: e.clientY });
        window.removeEventListener("pointermove", handlePointerMove);
        window.removeEventListener("pointerup", handlePointerUp);
        window.removeEventListener("pointercancel", handlePointerUp);
        finalizeDrag();
    }, [finalizeDrag, handleDragEnd, handlePointerMove, selectElements]);

    const handlePointerDown = useCallback((e: React.PointerEvent) => {
        if (e.button !== 0) return;
        if (ctxMenu) setCtxMenu(null);

        const target = e.target as HTMLElement;
        const rotateHandle = target.closest("[data-rotate-handle]") as HTMLElement | null;
        const resizeHandle = target.closest("[data-resize-handle]") as HTMLElement | null;
        const elementWrapper = target.closest("[data-element-id]") as HTMLElement | null;

        if (!elementWrapper && target.classList.contains("canvas-page")) {
            selectionStart.current = { x: e.clientX, y: e.clientY };
            setSelectionBox({ x: e.clientX, y: e.clientY, w: 0, h: 0 });
            document.body.style.userSelect = "none";
            window.addEventListener("pointermove", handlePointerMove);
            window.addEventListener("pointerup", handlePointerUp);
            window.addEventListener("pointercancel", handlePointerUp);
            return;
        }

        if (rotateHandle && elementWrapper) {
            e.preventDefault();
            e.stopPropagation();
            const elId = elementWrapper.getAttribute("data-element-id")!;
            const el = useEditorStore.getState().getElement(elId);
            if (!el || el.layout.locked) return;
            const rect = elementWrapper.getBoundingClientRect();
            const centerX = rect.left + rect.width / 2;
            const centerY = rect.top + rect.height / 2;
            dragState.current = {
                dragging: false,
                resizing: false,
                rotating: true,
                elementId: elId,
                startX: e.clientX,
                startY: e.clientY,
                startElX: el.layout.x,
                startElY: el.layout.y,
                startElW: el.layout.w,
                startElH: el.layout.h,
                handle: "",
                parentContainerId: null,
                pointerId: e.pointerId,
                startAngle: Math.atan2(e.clientY - centerY, e.clientX - centerX),
                startRotation: el.layout.rotation || 0,
                centerX,
                centerY,
            };
            document.body.style.userSelect = "none";
            document.body.style.cursor = "grabbing";
            window.addEventListener("pointermove", handlePointerMove);
            window.addEventListener("pointerup", handlePointerUp);
            window.addEventListener("pointercancel", handlePointerUp);
            return;
        }

        if (resizeHandle && elementWrapper) {
            e.preventDefault();
            e.stopPropagation();
            const elId = elementWrapper.getAttribute("data-element-id")!;
            const handle = resizeHandle.getAttribute("data-resize-handle")!;
            const el = useEditorStore.getState().getElement(elId);
            if (!el || el.layout.locked) return;

            dragState.current = {
                dragging: false,
                resizing: true,
                rotating: false,
                elementId: elId,
                startX: e.clientX,
                startY: e.clientY,
                startElX: el.layout.x,
                startElY: el.layout.y,
                startElW: el.layout.w,
                startElH: el.layout.h,
                handle,
                parentContainerId: null,
                pointerId: e.pointerId,
                startAngle: 0,
                startRotation: el.layout.rotation || 0,
                centerX: 0,
                centerY: 0,
            };
            document.body.style.userSelect = "none";
            document.body.style.cursor = "grabbing";
            window.addEventListener("pointermove", handlePointerMove);
            window.addEventListener("pointerup", handlePointerUp);
            window.addEventListener("pointercancel", handlePointerUp);
            return;
        }

        if (elementWrapper) {
            e.stopPropagation();
            const elId = elementWrapper.getAttribute("data-element-id")!;
            const el = useEditorStore.getState().getElement(elId);
            if (!el || el.layout.locked) return;

            if (e.shiftKey) toggleSelectElement(elId);
            else selectElement(elId);
            const parentWrapper = elementWrapper.parentElement?.closest("[data-element-id]") as HTMLElement | null;
            const parentId = parentWrapper?.getAttribute("data-element-id") || null;
            const parentEl = parentId ? useEditorStore.getState().getElement(parentId) : undefined;
            const parentContainerId = parentEl?.type === "container" ? parentId : null;
            const rawPosition = String(el.styles.position || "");
            const isStaticPosition = !rawPosition || rawPosition === "static";
            if (parentContainerId && isStaticPosition) {
                updateElement(el.id, {
                    styles: {
                        ...el.styles,
                        position: "absolute",
                    },
                });
            }

            dragState.current = {
                dragging: true,
                resizing: false,
                rotating: false,
                elementId: elId,
                startX: e.clientX,
                startY: e.clientY,
                startElX: el.layout.x,
                startElY: el.layout.y,
                startElW: el.layout.w,
                startElH: el.layout.h,
                handle: "",
                parentContainerId,
                pointerId: e.pointerId,
                startAngle: 0,
                startRotation: el.layout.rotation || 0,
                centerX: 0,
                centerY: 0,
            };
            document.body.style.userSelect = "none";
            document.body.style.cursor = "grabbing";
            window.addEventListener("pointermove", handlePointerMove);
            window.addEventListener("pointerup", handlePointerUp);
            window.addEventListener("pointercancel", handlePointerUp);
        }
    }, [selectElement, ctxMenu, updateElement, handlePointerMove, handlePointerUp]);

    return (
        <div className="canvas-area">
            {/* Top bar */}
            <div className="canvas-topbar">
                <div className="canvas-url-bar">
                    <span className="url-icon"><Lock size={12} /></span>
                    <span className="url-text">https://yoursite.com{activePageRoute}</span>
                    <button className="url-action-btn" disabled title="Coming soon">
                        Connect Domain
                    </button>
                </div>
                <div className="canvas-topbar-right">
                    <span className="page-label">{activePageTitle}</span>
                </div>
            </div>

            {/* Workspace */}
            <div
                className="canvas-workspace"
                onClick={() => { selectElement(null); setCtxMenu(null); }}
                onContextMenu={handleContextMenu}
                style={{ overflowY: "auto", overflowX: "auto" }}
            >
                <div style={{ display: "flex", flexDirection: "column", alignItems: "center", paddingBottom: "60px" }}>
                <div
                    ref={setRefs}
                    className={`canvas-page ${isOver ? "canvas-page-over" : ""}`}
                    style={{
                        width: `${canvasWidth}px`,
                        maxWidth: `${canvasWidth}px`,
                        minHeight: `${pendingHeight ?? canvasHeight}px`,
                        height: `${pendingHeight ?? canvasHeight}px`,
                        transform: `scale(${zoom / 100})`,
                        transformOrigin: "top center",
                        background: canvasBackground,
                        backgroundColor: canvasHasGradient ? undefined : canvasBackground,
                        overflow: "hidden",
                    }}
                    onPointerDown={handlePointerDown}
                    onClick={(e) => {
                        if (e.target === e.currentTarget) selectElement(null);
                    }}
                >
                    {selectionBox && (
                        <div
                            className="selection-box"
                            style={{
                                left: `${selectionBox.x}px`,
                                top: `${selectionBox.y}px`,
                                width: `${selectionBox.w}px`,
                                height: `${selectionBox.h}px`,
                            }}
                        />
                    )}
                    {snapGuides.x.map((x) => (
                        <div
                            key={`gx-${x}`}
                            className="snap-guide snap-guide-vertical"
                            style={{ left: `${x}px` }}
                        />
                    ))}
                    {snapGuides.y.map((y) => (
                        <div
                            key={`gy-${y}`}
                            className="snap-guide snap-guide-horizontal"
                            style={{ top: `${y}px` }}
                        />
                    ))}
                    {/* Global elements — rendered on top of every page */}
                    {globalRootIds.length > 0 && (
                        <div className="canvas-global-zone canvas-global-top">
                            <div className="global-zone-label">
                                <Globe size={10} />
                                <span>Global</span>
                            </div>
                            <Renderer elementIds={globalRootIds} isRoot={false} />
                        </div>
                    )}

                    {/* Page elements */}
                    {rootIds.length === 0 && globalRootIds.length === 0 ? (
                        <div className="canvas-empty-state">
                            <div className="empty-icon">
                                <svg width="48" height="48" viewBox="0 0 48 48" fill="none">
                                    <rect x="6" y="6" width="36" height="36" rx="4" stroke="#d1d5db" strokeWidth="2" strokeDasharray="4 4" />
                                    <path d="M24 16v16M16 24h16" stroke="#9ca3af" strokeWidth="2" strokeLinecap="round" />
                                </svg>
                            </div>
                            <h3>Start Building</h3>
                            <p>Drag elements from the sidebar or double-click to add</p>
                        </div>
                    ) : (
                        <Renderer elementIds={rootIds} isRoot={true} />
                    )}
                </div>

                {/* ─── Canvas Height Resize Handle ─── */}
                <div
                    className={`canvas-height-handle ${isResizingHeight ? "active" : ""}`}
                    style={{ width: `${canvasWidth * (zoom / 100)}px` }}
                    onPointerDown={(e) => {
                        e.preventDefault();
                        e.stopPropagation();
                        const target = e.currentTarget;
                        target.setPointerCapture(e.pointerId);
                        setIsResizingHeight(true);
                        const startY = e.clientY;
                        const startH = pendingHeight ?? canvasHeight;
                        const scale = zoom / 100;
                        let raf = 0;
                        let latestY = e.clientY;
                        const update = () => {
                            const dy = (latestY - startY) / scale;
                            setPendingHeight(Math.max(200, Math.round(startH + dy)));
                        };
                        const onMove = (ev: PointerEvent) => {
                            latestY = ev.clientY;
                            cancelAnimationFrame(raf);
                            raf = requestAnimationFrame(update);
                        };
                        const onUp = () => {
                            cancelAnimationFrame(raf);
                            update();
                            setIsResizingHeight(false);
                            target.releasePointerCapture(e.pointerId);
                            target.removeEventListener("pointermove", onMove);
                            target.removeEventListener("pointerup", onUp);
                        };
                        target.addEventListener("pointermove", onMove);
                        target.addEventListener("pointerup", onUp);
                    }}
                >
                    <div className="canvas-height-handle-bar" />
                </div>

                {/* Save / Cancel prompt */}
                {pendingHeight !== null && pendingHeight !== canvasHeight && !isResizingHeight && (
                    <div className="canvas-resize-prompt">
                        <span className="canvas-resize-label">{pendingHeight}px</span>
                        <button className="canvas-resize-save" onClick={() => { updateCanvasSettings({ height: pendingHeight }); setPendingHeight(null); }}>Save</button>
                        <button className="canvas-resize-cancel" onClick={() => setPendingHeight(null)}>Cancel</button>
                    </div>
                )}
                </div>

                {/* Context Menu */}
                {ctxMenu && (
                    <ContextMenu
                        x={ctxMenu.x}
                        y={ctxMenu.y}
                        elementId={ctxMenu.elementId}
                        onClose={() => setCtxMenu(null)}
                    />
                )}
            </div>

            {/* Bottom bar: resolution + zoom */}
            <div className="canvas-zoom-bar">
                <div className="resolution-controls">
                    {RESOLUTION_PRESETS.map((preset) => (
                        <button
                            key={preset.label}
                            className={`resolution-btn ${canvasWidth === preset.width ? "resolution-active" : ""}`}
                            onClick={() => updateCanvasSettings({ width: preset.width })}
                            title={`${preset.label} (${preset.width}px)`}
                        >
                            {preset.icon}
                        </button>
                    ))}
                    <span className="resolution-label">
                        {activeRes?.label || "Custom"} • {canvasWidth}px
                    </span>
                </div>
                <div className="zoom-controls">
                    <button onClick={() => setZoom((z) => Math.max(50, z - 25))} className="zoom-btn">−</button>
                    <select value={zoom} onChange={(e) => setZoom(Number(e.target.value))} className="zoom-select">
                        {ZOOM_LEVELS.map((z) => (
                            <option key={z} value={z}>{z}%</option>
                        ))}
                    </select>
                    <button onClick={() => setZoom((z) => Math.min(150, z + 25))} className="zoom-btn">+</button>
                </div>
            </div>
        </div>
    );
};

export default Canvas;
