"use client";

import { useEditorStore } from "@/store/editorStore";
import { CONTAINER_TYPES, ElementNode } from "@/types";
import Renderer from "./Renderer";
import ContextMenu from "./ContextMenu";
import { useDroppable } from "@dnd-kit/core";
import { useRef, useState, useCallback, useEffect } from "react";
import { Monitor, Tablet, Smartphone, Globe, Lock, Maximize2, RotateCcw } from "lucide-react";

const MIN_ZOOM = 10;
const MAX_ZOOM = 200;
const ZOOM_STEP = 25;
const ZOOM_LEVELS = [25, 50, 75, 100, 125, 150, 200];
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
    } = useEditorStore();
    // ─── Transform matrix state (Figma-style) ───
    const [panX, setPanX] = useState(0);
    const [panY, setPanY] = useState(0);
    const [zoom, setZoom] = useState(100);
    const panRef = useRef({ x: 0, y: 0 });
    const scaleRef = useRef(1);
    const workspaceRef = useRef<HTMLDivElement>(null);
    const canvasPageRef = useRef<HTMLDivElement>(null);
    const [snapGuides, setSnapGuides] = useState<{ x: number[]; y: number[] }>({ x: [], y: [] });
    const [selectionBox, setSelectionBox] = useState<{ x: number; y: number; w: number; h: number } | null>(null);
    const selectionStart = useRef<{ x: number; y: number } | null>(null);
    const didInitialCenter = useRef(false);

    // Canvas height resize state
    const [isResizingHeight, setIsResizingHeight] = useState(false);
    const [pendingHeight, setPendingHeight] = useState<number | null>(null);
    const resizeStartY = useRef<number>(0);
    const resizeStartH = useRef<number>(0);
    const pinchState = useRef<{ startDistance: number; startZoom: number; startPanX: number; startPanY: number; centerX: number; centerY: number } | null>(null);

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
    const visibleCanvasHeight = pendingHeight ?? canvasHeight;
    const zoomScale = zoom / 100;

    // Sync refs for use in non-passive event listeners
    useEffect(() => { scaleRef.current = zoomScale; }, [zoomScale]);
    useEffect(() => { panRef.current = { x: panX, y: panY }; }, [panX, panY]);

    const applyView = useCallback((nextPanX: number, nextPanY: number, nextZoomPct: number) => {
        const clamped = Math.round(Math.min(MAX_ZOOM, Math.max(MIN_ZOOM, nextZoomPct)));
        setPanX(nextPanX);
        setPanY(nextPanY);
        setZoom(clamped);
        panRef.current = { x: nextPanX, y: nextPanY };
        scaleRef.current = clamped / 100;
    }, []);

    // Zoom at a specific screen point using world-coordinate math
    const zoomAtPoint = useCallback((nextZoomPct: number, clientX: number, clientY: number) => {
        const ws = workspaceRef.current;
        if (!ws) { applyView(panRef.current.x, panRef.current.y, nextZoomPct); return; }
        const wsRect = ws.getBoundingClientRect();
        const mx = clientX - wsRect.left;
        const my = clientY - wsRect.top;
        const oldScale = scaleRef.current;
        // World coords under cursor
        const wx = (mx - panRef.current.x) / oldScale;
        const wy = (my - panRef.current.y) / oldScale;
        const clamped = Math.round(Math.min(MAX_ZOOM, Math.max(MIN_ZOOM, nextZoomPct)));
        const newScale = clamped / 100;
        // Keep same world point under cursor
        const newPanX = mx - wx * newScale;
        const newPanY = my - wy * newScale;
        applyView(newPanX, newPanY, clamped);
    }, [applyView]);

    const zoomAtPointRef = useRef(zoomAtPoint);
    useEffect(() => { zoomAtPointRef.current = zoomAtPoint; }, [zoomAtPoint]);

    const zoomAtWorkspaceCenter = useCallback((value: number) => {
        const ws = workspaceRef.current;
        if (!ws) { applyView(panRef.current.x, panRef.current.y, value); return; }
        const rect = ws.getBoundingClientRect();
        zoomAtPoint(value, rect.left + rect.width / 2, rect.top + rect.height / 2);
    }, [applyView, zoomAtPoint]);

    const fitCanvasToView = useCallback(() => {
        const ws = workspaceRef.current;
        if (!ws) return;
        const pad = 48;
        const availW = Math.max(1, ws.clientWidth - pad * 2);
        const availH = Math.max(1, ws.clientHeight - pad * 2);
        const fitScale = Math.min(1, availW / canvasWidth, availH / visibleCanvasHeight);
        const fitZoom = Math.round(fitScale * 100);
        const s = fitZoom / 100;
        const newPanX = (ws.clientWidth - canvasWidth * s) / 2;
        const newPanY = (ws.clientHeight - visibleCanvasHeight * s) / 2;
        applyView(newPanX, newPanY, fitZoom);
    }, [applyView, canvasWidth, visibleCanvasHeight]);

    // Center canvas on initial mount
    useEffect(() => {
        if (didInitialCenter.current) return;
        const ws = workspaceRef.current;
        if (!ws) return;
        didInitialCenter.current = true;
        const s = scaleRef.current;
        const newPanX = (ws.clientWidth - canvasWidth * s) / 2;
        const newPanY = Math.max(32, (ws.clientHeight - visibleCanvasHeight * s) / 2);
        applyView(newPanX, newPanY, zoom);
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, []);

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
    const handlePointerUpRef = useRef<((e: PointerEvent) => void) | null>(null);
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

            const scale = scaleRef.current;
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

                    const maxX = Math.max(0, parentEl.layout.w - ds.startElW);
                    const maxY = Math.max(0, parentEl.layout.h - ds.startElH);
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
                    const state = useEditorStore.getState();
                    const siblings = parentEl.children
                        .map((id) => state.elementsById[id])
                        .filter((el): el is ElementNode => Boolean(el) && el.id !== ds.elementId);
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
    }, [canvasHeight, canvasWidth, getSnap, moveElement, updateElementPosition, updateElementRotationLive, updateElementSize]);

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
            const scale = scaleRef.current;

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
                                const nodeId = stack.pop()!;
                                if (nodeId === targetContainerId) return true;
                                const node = state.elementsById[nodeId];
                                if (node) stack.push(...node.children);
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
                                const maxX = Math.max(0, targetContainer.layout.w - draggedEl.layout.w);
                                const maxY = Math.max(0, targetContainer.layout.h - draggedEl.layout.h);
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
                    const maxX = Math.max(0, currentParent.layout.w - draggedEl.layout.w);
                    const maxY = Math.max(0, currentParent.layout.h - draggedEl.layout.h);
                    const clampedX = Math.min(maxX, Math.max(0, draggedEl.layout.x));
                    const clampedY = Math.min(maxY, Math.max(0, draggedEl.layout.y));
                    if (clampedX !== draggedEl.layout.x || clampedY !== draggedEl.layout.y) {
                        updateElementPosition(ds.elementId, clampedX, clampedY);
                    }
                }
            }
        }

    }, [moveElement, updateElement, updateElementPosition]);

    const handlePointerUp = useCallback((e: PointerEvent) => {
        const ds = dragState.current;
        const onPointerUp = handlePointerUpRef.current;
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
            if (onPointerUp) {
                window.removeEventListener("pointerup", onPointerUp);
                window.removeEventListener("pointercancel", onPointerUp);
            }
            return;
        }
        if (!ds || e.pointerId !== ds.pointerId) return;
        handleDragEnd({ clientX: e.clientX, clientY: e.clientY });
        window.removeEventListener("pointermove", handlePointerMove);
        if (onPointerUp) {
            window.removeEventListener("pointerup", onPointerUp);
            window.removeEventListener("pointercancel", onPointerUp);
        }
        finalizeDrag();
    }, [finalizeDrag, handleDragEnd, handlePointerMove, selectElements]);

    useEffect(() => {
        handlePointerUpRef.current = handlePointerUp;
    }, [handlePointerUp]);

    // Native non-passive wheel listener — handles BOTH pan and zoom
    // ctrlKey/metaKey (trackpad pinch) → zoom at cursor
    // no modifier (two-finger scroll) → pan the canvas
    useEffect(() => {
        const ws = workspaceRef.current;
        if (!ws) return;

        const onWheel = (e: WheelEvent) => {
            e.preventDefault();
            e.stopPropagation();

            if (e.ctrlKey || e.metaKey) {
                // Pinch-to-zoom on trackpad — zoom at cursor
                const factor = Math.exp(-e.deltaY * 0.004);
                const currentZoom = Math.round(scaleRef.current * 100);
                zoomAtPointRef.current(currentZoom * factor, e.clientX, e.clientY);
            } else {
                // Two-finger scroll/slide — pan the canvas
                const { x, y } = panRef.current;
                const newX = x - e.deltaX;
                const newY = y - e.deltaY;
                setPanX(newX);
                setPanY(newY);
                panRef.current = { x: newX, y: newY };
            }
        };

        ws.addEventListener("wheel", onWheel, { passive: false });
        return () => ws.removeEventListener("wheel", onWheel);
    }, []);

    const getTouchMetrics = (touches: React.TouchList) => {
        const first = touches[0];
        const second = touches[1];
        const dx = second.clientX - first.clientX;
        const dy = second.clientY - first.clientY;
        return {
            distance: Math.sqrt(dx * dx + dy * dy),
            centerX: (first.clientX + second.clientX) / 2,
            centerY: (first.clientY + second.clientY) / 2,
        };
    };

    const handleWorkspaceTouchStart = useCallback((e: React.TouchEvent<HTMLDivElement>) => {
        if (e.touches.length !== 2) return;
        e.preventDefault();
        finalizeDrag();
        const metrics = getTouchMetrics(e.touches);
        pinchState.current = {
            startDistance: metrics.distance,
            startZoom: Math.round(scaleRef.current * 100),
            startPanX: panRef.current.x,
            startPanY: panRef.current.y,
            centerX: metrics.centerX,
            centerY: metrics.centerY,
        };
    }, [finalizeDrag]);

    const handleWorkspaceTouchMove = useCallback((e: React.TouchEvent<HTMLDivElement>) => {
        if (e.touches.length !== 2 || !pinchState.current) return;
        e.preventDefault();
        const metrics = getTouchMetrics(e.touches);
        if (pinchState.current.startDistance <= 0) return;
        const nextZoom = pinchState.current.startZoom * (metrics.distance / pinchState.current.startDistance);
        zoomAtPoint(nextZoom, metrics.centerX, metrics.centerY);
    }, [zoomAtPoint]);

    const handleWorkspaceTouchEnd = useCallback((e: React.TouchEvent<HTMLDivElement>) => {
        if (e.touches.length < 2) {
            pinchState.current = null;
        }
    }, []);

    const handleCanvasHeightPointerDown = useCallback((e: React.PointerEvent<HTMLDivElement>) => {
        e.preventDefault();
        e.stopPropagation();

        setIsResizingHeight(true);
        resizeStartY.current = e.clientY;
        resizeStartH.current = pendingHeight ?? canvasHeight;
        let raf: number | null = null;
        let latestY = e.clientY;

        const applyHeight = () => {
            raf = null;
            const scale = scaleRef.current;
            const dy = (latestY - resizeStartY.current) / Math.max(0.01, scale);
            setPendingHeight(Math.max(200, Math.round(resizeStartH.current + dy)));
        };

        const onMove = (ev: PointerEvent) => {
            latestY = ev.clientY;
            if (raf === null) raf = requestAnimationFrame(applyHeight);
        };

        const finish = () => {
            if (raf !== null) cancelAnimationFrame(raf);
            applyHeight();
            setIsResizingHeight(false);
            document.body.style.cursor = "";
            document.body.style.userSelect = "";

            // Clean up global listeners
            window.removeEventListener("pointermove", onMove);
            window.removeEventListener("pointerup", finish);
            window.removeEventListener("pointercancel", finish);
        };

        // Lock cursor and prevent text selection globally during drag
        document.body.style.cursor = "ns-resize";
        document.body.style.userSelect = "none";

        // Bind directly to window
        window.addEventListener("pointermove", onMove);
        window.addEventListener("pointerup", finish);
        window.addEventListener("pointercancel", finish);
    }, [canvasHeight, pendingHeight]);

    const handlePointerDown = useCallback((e: React.PointerEvent) => {
        if (e.button !== 0) return;
        if (e.pointerType === "touch") return;
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
    }, [selectElement, toggleSelectElement, ctxMenu, updateElement, handlePointerMove, handlePointerUp]);

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

            {/* Workspace (viewport — overflow hidden, no native scroll) */}
            <div
                ref={workspaceRef}
                className="canvas-workspace"
                onClick={() => { selectElement(null); setCtxMenu(null); }}
                onContextMenu={handleContextMenu}
                /* wheel is handled via native non-passive listener in useEffect */
                onTouchStart={handleWorkspaceTouchStart}
                onTouchMove={handleWorkspaceTouchMove}
                onTouchEnd={handleWorkspaceTouchEnd}
                onTouchCancel={handleWorkspaceTouchEnd}
            >
                {/* Transform layer — single CSS transform for pan + zoom */}
                <div
                    className="canvas-transform-layer"
                    style={{
                        transform: `translate(${panX}px, ${panY}px) scale(${zoomScale})`,
                    }}
                >
                    <div
                        ref={setRefs}
                        className={`canvas-page ${isOver ? "canvas-page-over" : ""}`}
                        style={{
                            width: `${canvasWidth}px`,
                            maxWidth: `${canvasWidth}px`,
                            minHeight: `${visibleCanvasHeight}px`,
                            height: `${visibleCanvasHeight}px`,
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
                        style={{ width: `${canvasWidth}px` }}
                        onPointerDown={handleCanvasHeightPointerDown}
                    >
                        <div className="canvas-height-handle-bar" />
                    </div>

                    {/* Save / Cancel prompt */}
                    {pendingHeight !== null && pendingHeight !== canvasHeight && !isResizingHeight && (
                        <div
                            className="canvas-resize-prompt"
                            style={{
                                left: `${canvasWidth / 2}px`,
                                top: `${pendingHeight + 16}px`,
                            }}
                        >
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
                    <button onClick={() => zoomAtWorkspaceCenter(zoom - ZOOM_STEP)} className="zoom-btn">−</button>
                    <select value={zoom} onChange={(e) => zoomAtWorkspaceCenter(Number(e.target.value))} className="zoom-select">
                        {!ZOOM_LEVELS.includes(zoom) && <option value={zoom}>{zoom}%</option>}
                        {ZOOM_LEVELS.map((z) => (
                            <option key={z} value={z}>{z}%</option>
                        ))}
                    </select>
                    <button onClick={() => zoomAtWorkspaceCenter(zoom + ZOOM_STEP)} className="zoom-btn">+</button>
                    <button onClick={() => {
                        const ws = workspaceRef.current;
                        if (ws) {
                            const cx = (ws.clientWidth - canvasWidth) / 2;
                            const cy = Math.max(32, (ws.clientHeight - visibleCanvasHeight) / 2);
                            applyView(cx, cy, 100);
                        } else {
                            applyView(0, 0, 100);
                        }
                    }} className={`zoom-btn zoom-reset-btn ${zoom === 100 ? 'zoom-reset-active' : ''}`} title="Reset to 100%">
                        <RotateCcw size={13} />
                    </button>
                    <button onClick={fitCanvasToView} className="zoom-btn zoom-fit-btn" title="Fit canvas">
                        <Maximize2 size={13} />
                    </button>
                </div>
            </div>
        </div>
    );
};

export default Canvas;
