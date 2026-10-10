"use client";
import { flushSync } from "react-dom";

import { useEditorStore } from "@/store/editorStore";
import { ElementNode } from "@/types";
import { canHaveChildren } from "@/lib/elements/registry";
import Renderer from "./Renderer";
import PenOverlay from "./design/PenOverlay";
import ContextMenu from "./ContextMenu";
import { useDroppable } from "@dnd-kit/core";
import { useRef, useState, useCallback, useEffect } from "react";
import {
  Globe,
  Lock,
  Unlock,
  Maximize2,
  RotateCcw,
  MousePointer2,
  Hand,
  Magnet,
  Plus,
  Minus,
  Layers,
  PanelsTopLeft,
  PenTool,
  Film,
  Scan,
  ScanEye,
} from "lucide-react";
import { useEditorUIStore } from "@/store/editorUIStore";
import { useWorkspaceStore } from "@/store/workspaceStore";
import { useCanvasNavigation } from "./useCanvasNavigation";
import { canvasSize, elementTransform } from "@/lib/design";
import { screenPlane, childPosition } from "@/lib/canvas-geometry";
import ResponsiveControls from "./design/ResponsiveControls";

const MIN_ZOOM = 10;
const MAX_ZOOM = 200;
const ZOOM_STEP = 25;
const ZOOM_LEVELS = [25, 50, 75, 100, 125, 150, 200];
const GRID_SIZE = 8;
const SNAP_THRESHOLD = 6;

type DragElement = {
  id: string;
  x: number;
  y: number;
  w: number;
  h: number;
  maxX?: number;
  maxY?: number;
  position?: "absolute" | "relative";
  autoHeightParent?: { id: string; minHeight: number };
};

// Measure in the parent's padding box, which is the origin for absolute children.
// Stored layout dimensions can differ from CSS widths, auto heights and breakpoints.
function dragElement(element: ElementNode): DragElement {
  const result: DragElement = {
    id: element.id, x: element.layout.x, y: element.layout.y,
    w: element.layout.w, h: element.layout.h,
  };
  const parent = element.parentId
    ? useEditorStore.getState().getElement(element.parentId)
    : undefined;
  if (!parent) {
    if ((element.styles.position || element.layout.position) === "static") {
      result.x = 0;
      result.y = 0;
      result.position = "relative";
    }
    return result;
  }
  const node = document.querySelector<HTMLElement>(`.canvas-page [data-element-id="${element.id}"]`);
  const parentNode = document.querySelector<HTMLElement>(`.canvas-page [data-element-id="${parent.id}"]`);
  if (!node || !parentNode) return result;
  const styles = getComputedStyle(node);
  const marginX = parseFloat(styles.marginLeft) || 0;
  const marginY = parseFloat(styles.marginTop) || 0;
  result.w = node.offsetWidth;
  result.h = node.offsetHeight;
  result.maxX = Math.max(0, parentNode.clientWidth - result.w - marginX - (parseFloat(styles.marginRight) || 0));
  result.maxY = Math.max(0, parentNode.clientHeight - result.h - marginY - (parseFloat(styles.marginBottom) || 0));
  if (styles.position !== "absolute") {
    const position = childPosition(node, parentNode);
    result.x = position.x; result.y = position.y;
    result.position = "absolute";
    if (!parent.styles.height || parent.styles.height === "auto") {
      result.autoHeightParent = { id: parent.id, minHeight: parentNode.offsetHeight };
    }
  }
  return result;
}

// findParentId is no longer needed — elements have explicit parentId

const Canvas: React.FC = () => {
  const ui = useEditorUIStore();
  const workspaceReady = useWorkspaceStore((s) => s.ready);
  const projectId = useWorkspaceStore((s) => s.id);
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
    tokens,
    updateCanvasSettings,
  } = useEditorStore();
  // ─── Transform matrix state (Figma-style) ───
  const [panX, setPanX] = useState(0);
  const [panY, setPanY] = useState(0);
  const [zoom, setZoom] = useState(100);
  const [workspaceWidth, setWorkspaceWidth] = useState(320);
  const panRef = useRef({ x: 0, y: 0 });
  const scaleRef = useRef(1);
  const workspaceRef = useRef<HTMLDivElement>(null);
  const canvasPageRef = useRef<HTMLDivElement>(null);
  const [snapGuides, setSnapGuides] = useState<{ x: number[]; y: number[] }>({
    x: [],
    y: [],
  });
  const [selectionBox, setSelectionBox] = useState<{
    x: number;
    y: number;
    w: number;
    h: number;
  } | null>(null);
  const selectionStart = useRef<{ x: number; y: number } | null>(null);
  const centeredProject = useRef<string | null>(null);
  const suppressSelectionClick = useRef(false);

  // Canvas height resize state
  const [isResizingHeight, setIsResizingHeight] = useState(false);
  const [pendingHeight, setPendingHeight] = useState<number | null>(null);
  const resizeStartY = useRef<number>(0);
  const resizeStartH = useRef<number>(0);
  const pinchState = useRef<{
    startDistance: number;
    startZoom: number;
    startPanX: number;
    startPanY: number;
    centerX: number;
    centerY: number;
  } | null>(null);

  // Context menu state
  const [ctxMenu, setCtxMenu] = useState<{
    x: number;
    y: number;
    elementId: string;
  } | null>(null);

  const activePage = pages.find((p) => p.id === activePageId);
  const activePageTitle = activePage?.title || "Home";
  const activePageRoute = activePage?.route || "/";

  const { width: canvasWidth, height: canvasHeight } = canvasSize(canvasSettings, ui.breakpoint, ui.viewportSize);
  useEffect(() => () => useEditorStore.getState().finishResponsiveEdit(), []);
  const canvasBackground = String(canvasSettings.backgroundColor || "#ffffff");
  const canvasHasGradient = /gradient\(/i.test(canvasBackground);
  const visibleCanvasHeight = pendingHeight ?? canvasHeight;
  const zoomScale = zoom / 100;
  const emptyStateWidth = Math.max(120, Math.min(320, workspaceWidth - 24, canvasWidth * zoomScale - 16));

  // Sync refs for use in non-passive event listeners
  useEffect(() => {
    scaleRef.current = zoomScale;
  }, [zoomScale]);
  useEffect(() => {
    panRef.current = { x: panX, y: panY };
  }, [panX, panY]);

  const applyView = useCallback(
    (nextPanX: number, nextPanY: number, nextZoomPct: number) => {
      const clamped = Math.round(
        Math.min(MAX_ZOOM, Math.max(MIN_ZOOM, nextZoomPct)),
      );
      setPanX(nextPanX);
      setPanY(nextPanY);
      setZoom(clamped);
      panRef.current = { x: nextPanX, y: nextPanY };
      scaleRef.current = clamped / 100;
    },
    [],
  );

  // Zoom at a specific screen point using world-coordinate math
  const zoomAtPoint = useCallback(
    (nextZoomPct: number, clientX: number, clientY: number) => {
      const ws = workspaceRef.current;
      if (!ws) {
        applyView(panRef.current.x, panRef.current.y, nextZoomPct);
        return;
      }
      const wsRect = ws.getBoundingClientRect();
      const mx = clientX - wsRect.left;
      const my = clientY - wsRect.top;
      const oldScale = scaleRef.current;
      // World coords under cursor
      const wx = (mx - panRef.current.x) / oldScale;
      const wy = (my - panRef.current.y) / oldScale;
      const clamped = Math.round(
        Math.min(MAX_ZOOM, Math.max(MIN_ZOOM, nextZoomPct)),
      );
      const newScale = clamped / 100;
      // Keep same world point under cursor
      const newPanX = mx - wx * newScale;
      const newPanY = my - wy * newScale;
      applyView(newPanX, newPanY, clamped);
    },
    [applyView],
  );

  const zoomAtPointRef = useRef(zoomAtPoint);
  useEffect(() => {
    zoomAtPointRef.current = zoomAtPoint;
  }, [zoomAtPoint]);

  const zoomAtWorkspaceCenter = useCallback(
    (value: number) => {
      const ws = workspaceRef.current;
      if (!ws) {
        applyView(panRef.current.x, panRef.current.y, value);
        return;
      }
      const rect = ws.getBoundingClientRect();
      zoomAtPoint(
        value,
        rect.left + rect.width / 2,
        rect.top + rect.height / 2,
      );
    },
    [applyView, zoomAtPoint],
  );

  const fitCanvasToView = useCallback(() => {
    const ws = workspaceRef.current;
    if (!ws) return;
    const pad = 48;
    const availW = Math.max(1, ws.clientWidth - pad * 2);
    const availH = Math.max(1, ws.clientHeight - pad * 2);
    const fitScale = Math.min(
      1,
      availW / canvasWidth,
      availH / visibleCanvasHeight,
    );
    const fitZoom = Math.max(MIN_ZOOM, Math.round(fitScale * 100));
    const s = fitZoom / 100;
    const newPanX = (ws.clientWidth - canvasWidth * s) / 2;
    const newPanY = (ws.clientHeight - visibleCanvasHeight * s) / 2;
    applyView(newPanX, newPanY, fitZoom);
  }, [applyView, canvasWidth, visibleCanvasHeight]);

  const cursor = useCanvasNavigation(workspaceRef, {
    get: () => ({ ...panRef.current, scale: scaleRef.current }),
    apply: (x, y, scale) => applyView(x, y, scale * 100),
    fit: fitCanvasToView,
    selection: (centerOnly) => {
      const ws = workspaceRef.current;
      if (!ws) return;
      const rects = useEditorStore
        .getState()
        .selectedElementIds.map((id) =>
          ws
            .querySelector(`[data-element-id="${CSS.escape(id)}"]`)
            ?.getBoundingClientRect(),
        )
        .filter((r): r is DOMRect => Boolean(r));
      if (!rects.length) return;
      const viewport = ws.getBoundingClientRect(),
        left = Math.min(...rects.map((r) => r.left)),
        right = Math.max(...rects.map((r) => r.right)),
        top = Math.min(...rects.map((r) => r.top)),
        bottom = Math.max(...rects.map((r) => r.bottom));
      const old = scaleRef.current,
        cx = ((left + right) / 2 - viewport.left - panRef.current.x) / old,
        cy = ((top + bottom) / 2 - viewport.top - panRef.current.y) / old;
      const next = centerOnly
        ? old
        : Math.max(
            0.1,
            Math.min(
              2,
              (ws.clientWidth - 96) / Math.max(1, (right - left) / old),
              (ws.clientHeight - 96) / Math.max(1, (bottom - top) / old),
            ),
          );
      applyView(
        ws.clientWidth / 2 - cx * next,
        ws.clientHeight / 2 - cy * next,
        next * 100,
      );
    },
    cancel: () => {
      useEditorStore.getState().endInteraction(true);
      finalizeDrag();
    },
  });

  // Restore dimensions before framing the project; storage loads asynchronously.
  useEffect(() => {
    if (!workspaceReady || centeredProject.current === `${projectId}:${canvasWidth}:${canvasHeight}`) return;
    const ws = workspaceRef.current;
    if (!ws) return;
    centeredProject.current = `${projectId}:${canvasWidth}:${canvasHeight}`;
    fitCanvasToView();
  }, [workspaceReady, projectId, canvasWidth, canvasHeight, fitCanvasToView]);

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
    group?: DragElement[];
    plane?: ReturnType<typeof screenPlane>;
    anchor?: {x:number;y:number;u:number;v:number};
    parentPlane?: ReturnType<typeof screenPlane>;
    groupPlanes?: Record<string, ReturnType<typeof screenPlane>>;
    moved?: boolean;
  } | null>(null);
  const handlePointerUpRef = useRef<((e: PointerEvent) => void) | null>(null);
  useEffect(() => {
    const workspace = workspaceRef.current;
    if (!workspace || !workspaceReady) return;
    let frame = 0;
    const observer = new ResizeObserver(() => {
      cancelAnimationFrame(frame);
      frame = requestAnimationFrame(() => {
        setWorkspaceWidth(workspace.clientWidth);
        if (!dragState.current) fitCanvasToView();
      });
    });
    observer.observe(workspace);
    return () => { observer.disconnect(); cancelAnimationFrame(frame); };
  }, [workspaceReady, fitCanvasToView]);
  const rafRef = useRef<number | null>(null);
  const latestPointRef = useRef<{
    x: number;
    y: number;
    shiftKey: boolean;
  } | null>(null);

  const { setNodeRef, isOver } = useDroppable({
    id: "canvas-root",
    data: { type: "canvas", parentId: null },
  });

  const setRefs = useCallback(
    (node: HTMLDivElement | null) => {
      setNodeRef(node);
      (canvasPageRef as React.MutableRefObject<HTMLDivElement | null>).current =
        node;
    },
    [setNodeRef],
  );

  const getSnap = useCallback(
    (
      x: number,
      y: number,
      w: number,
      h: number,
      siblings: ElementNode[],
      options?: { canvasCenterX?: number; canvasCenterY?: number },
    ): { x: number; y: number; guideX: number[]; guideY: number[] } => {
      if (!useEditorUIStore.getState().snapEnabled)
        return { x, y, guideX: [], guideY: [] };
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
    },
    [],
  );

  const applyDragUpdate = useCallback(() => {
    const ds = dragState.current;
    const latest = latestPointRef.current;
    if (!ds || !latest) return;

    const scale = scaleRef.current;
    let dx = (latest.x - ds.startX) / scale;
    let dy = (latest.y - ds.startY) / scale;
    const editedNode = document.querySelector<HTMLElement>(`.canvas-page [data-element-id="${ds.elementId}"]`);
    const coordinateNode = ds.resizing ? editedNode : editedNode?.parentElement;
    if (coordinateNode) {
      try {
        if(!ds.plane) ds.plane=screenPlane(coordinateNode);
        const from=ds.plane.toLocal(ds.startX,ds.startY),to=ds.plane.toLocal(latest.x,latest.y);
        dx=to.x-from.x;dy=to.y-from.y;
      } catch {return;}
    }

    if (latest.shiftKey && ds.dragging) {
      if (Math.abs(dx) >= Math.abs(dy)) dy = 0;
      else dx = 0;
    }

    if (ds.dragging) {
      if (dx === 0 && dy === 0 && !ds.moved) return;
      ds.moved = true;
      const positionElement = (element: DragElement, x: number, y: number) => {
        if (element.position) {
          const current = useEditorStore.getState().getElement(element.id);
          if (!current) return;
          if (current.layout.position === element.position && current.styles.position === element.position) {
            updateElementPosition(element.id, x, y);
            return;
          }
          // Taking a flow child out of document flow must not collapse its
          // auto-height container underneath the drag.
          if (element.autoHeightParent) {
            updateElement(element.autoHeightParent.id, {
              styles: { minHeight: `${element.autoHeightParent.minHeight}px` },
            });
          }
          updateElement(element.id, {
            layout: { ...current.layout, position: element.position, x, y },
            styles: { position: element.position },
          });
        } else updateElementPosition(element.id, x, y);
      };
      if (ds.group && ds.group.length > 1) {
        const parents = ds.group.map(el=>useEditorStore.getState().elementsById[el.id]?.parentId);
        if (new Set(parents).size > 1) {
          ds.group.forEach(el=>{
            const node = document.querySelector<HTMLElement>(`.canvas-page [data-element-id="${el.id}"]`);
            let delta={x:dx,y:dy};
            if(node?.parentElement) {
              try { const plane=ds.groupPlanes![el.id],from=plane.toLocal(ds.startX,ds.startY),to=plane.toLocal(latest.x,latest.y);delta={x:to.x-from.x,y:to.y-from.y}; } catch {return;}
            }
            positionElement(el,Math.max(0,Math.min(el.maxX ?? Infinity,el.x+delta.x)),Math.max(0,Math.min(el.maxY ?? Infinity,el.y+delta.y)));
          });
          return;
        }
        const minX = Math.min(...ds.group.map((el) => el.x)),
          minY = Math.min(...ds.group.map((el) => el.y));
        const maxDx = Math.min(...ds.group.map((el) => el.maxX === undefined ? Infinity : el.maxX - el.x));
        const maxDy = Math.min(...ds.group.map((el) => el.maxY === undefined ? Infinity : el.maxY - el.y));
        const mx = Math.max(-minX, Math.min(maxDx, dx)),
          my = Math.max(-minY, Math.min(maxDy, dy));
        ds.group.forEach((el) =>
          positionElement(el, el.x + mx, el.y + my),
        );
        return;
      }
      if (ds.parentContainerId) {
        const parentEl = useEditorStore
          .getState()
          .getElement(ds.parentContainerId);
        if (!parentEl) {
          dragState.current = { ...ds, parentContainerId: null };
          return;
        }

        const moving = ds.group?.[0];
        if (!moving) return;
        const maxX = moving.maxX ?? Math.max(0, parentEl.layout.w - ds.startElW);
        const maxY = moving.maxY ?? Math.max(0, parentEl.layout.h - ds.startElH);
        const finalX = Math.min(maxX, Math.max(0, ds.startElX + dx));
        const finalY = Math.min(maxY, Math.max(0, ds.startElY + dy));
        const state = useEditorStore.getState();
        const siblings = parentEl.children
          .map((id) => state.getElement(id)!)
          .filter(
            (el): el is ElementNode => Boolean(el) && el.id !== ds.elementId,
          );
        const snap = getSnap(
          finalX,
          finalY,
          ds.startElW,
          ds.startElH,
          siblings,
        );
        let guideX = snap.guideX;
        let guideY = snap.guideY;
        if (snap.guideX.length > 0 || snap.guideY.length > 0) {
          const canvasNode = document.querySelector(
            ".canvas-page",
          ) as HTMLElement | null;
          const containerNode = document.querySelector(
            `[data-element-id="${ds.parentContainerId}"]`,
          ) as HTMLElement | null;
          if (canvasNode && containerNode) {
            const canvasRect = canvasNode.getBoundingClientRect();
            const containerRect = containerNode.getBoundingClientRect();
            const offsetX = (containerRect.left - canvasRect.left) / scale;
            const offsetY = (containerRect.top - canvasRect.top) / scale;
            guideX = snap.guideX.map((x) => x + offsetX);
            guideY = snap.guideY.map((y) => y + offsetY);
          }
        }
        if (coordinateNode && getComputedStyle(coordinateNode).transform !== "none") { guideX = []; guideY = []; }
        const x = Math.min(maxX, Math.max(0, snap.x));
        const y = Math.min(maxY, Math.max(0, snap.y));
        setSnapGuides({ x: x === snap.x ? guideX : [], y: y === snap.y ? guideY : [] });
        positionElement(moving, x, y);
        return;
      }

      const moving = ds.group?.[0];
      if (moving?.position === "relative") {
        setSnapGuides({ x: [], y: [] });
        positionElement(moving, ds.startElX + dx, ds.startElY + dy);
        return;
      }
      const newX = Math.max(0, ds.startElX + dx);
      const newY = Math.max(0, ds.startElY + dy);
      const state = useEditorStore.getState();
      const siblings = state.rootIds
        .map((id) => state.getElement(id)!)
        .filter((el) => el && el.id !== ds.elementId);
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

      flushSync(()=>{
        updateElementPosition(ds.elementId, newX, newY);
        updateElementSize(ds.elementId, newW, newH);
      });
      // Preserve the opposite projected edge/corner as size changes the origin.
      if(editedNode && ds.anchor && ds.parentPlane) {
        for(let attempt=0;attempt<6;attempt++) {
          try {
            const actual=screenPlane(editedNode).toScreen(ds.anchor.u*editedNode.offsetWidth,ds.anchor.v*editedNode.offsetHeight);
            if(Math.hypot(actual.x-ds.anchor.x,actual.y-ds.anchor.y)<.05) break;
            const parent=editedNode.parentElement ? screenPlane(editedNode.parentElement) : ds.parentPlane;
            const wanted=parent.toLocal(ds.anchor.x,ds.anchor.y),current=parent.toLocal(actual.x,actual.y);
            newX+=wanted.x-current.x;newY+=wanted.y-current.y;
            flushSync(()=>updateElementPosition(ds.elementId,newX,newY));
          } catch {break;}
        }
      }
      setSnapGuides({ x: [], y: [] });
      return;
    }

    if (ds.rotating) {
      let point={x:latest.x,y:latest.y};
      try {if(ds.plane) point=ds.plane.toLocal(latest.x,latest.y);} catch {return;}
      const angle = Math.atan2(point.y - ds.centerY, point.x - ds.centerX);
      let deg = ds.startRotation + ((angle - ds.startAngle) * 180) / Math.PI;
      if (latest.shiftKey) {
        deg = Math.round(deg / 15) * 15;
      }
      updateElementRotationLive(ds.elementId, deg);
      setSnapGuides({ x: [], y: [] });
    }
  }, [
    canvasHeight,
    canvasWidth,
    getSnap,
    updateElement,
    updateElementPosition,
    updateElementRotationLive,
    updateElementSize,
  ]);

  const scheduleDragUpdate = useCallback(() => {
    if (rafRef.current) return;
    rafRef.current = requestAnimationFrame(() => {
      rafRef.current = null;
      applyDragUpdate();
    });
  }, [applyDragUpdate]);

  const handlePointerMove = useCallback(
    (e: PointerEvent) => {
      if (selectionStart.current) {
        const start = selectionStart.current;
        const w = e.clientX - start.x;
        const h = e.clientY - start.y;
        const bounds = canvasPageRef.current?.getBoundingClientRect();
        if (!bounds) return;
        const scale = scaleRef.current;
        setSelectionBox({
          x: ((w < 0 ? e.clientX : start.x) - bounds.left) / scale,
          y: ((h < 0 ? e.clientY : start.y) - bounds.top) / scale,
          w: Math.abs(w) / scale,
          h: Math.abs(h) / scale,
        });
        return;
      }
      const ds = dragState.current;
      if (!ds || e.pointerId !== ds.pointerId) return;
      latestPointRef.current = {
        x: e.clientX,
        y: e.clientY,
        shiftKey: e.shiftKey,
      };
      scheduleDragUpdate();
    },
    [scheduleDragUpdate],
  );

  const finalizeDrag = useCallback(() => {
    useEditorStore.getState().endInteraction();
    if (rafRef.current) {
      cancelAnimationFrame(rafRef.current);
      rafRef.current = null;
    }
    window.removeEventListener("pointermove", handlePointerMove);
    const up = handlePointerUpRef.current;
    if (up) {
      window.removeEventListener("pointerup", up);
      window.removeEventListener("pointercancel", up);
    }
    latestPointRef.current = null;
    dragState.current = null;
    document.body.style.userSelect = "";
    document.body.style.cursor = "";
    setSnapGuides({ x: [], y: [] });
    selectionStart.current = null;
    setSelectionBox(null);
  }, [handlePointerMove]);

  const finalizeRef = useRef(finalizeDrag);
  useEffect(() => {
    finalizeRef.current = finalizeDrag;
  });
  useEffect(
    () => () => {
      finalizeRef.current();
    },
    [],
  );

  const handleContextMenu = useCallback(
    (e: React.MouseEvent) => {
      const target = e.target as HTMLElement;
      const elementWrapper = target.closest(
        "[data-element-id]",
      ) as HTMLElement | null;
      if (elementWrapper) {
        e.preventDefault();
        e.stopPropagation();
        const elId = elementWrapper.getAttribute("data-element-id")!;
        if (!useEditorStore.getState().selectedElementIds.includes(elId)) selectElement(elId);
        setCtxMenu({ x: e.clientX, y: e.clientY, elementId: elId });
      }
    },
    [selectElement],
  );

  const handleDragEnd = useCallback(
    (e?: { clientX: number; clientY: number }) => {
      const ds = dragState.current;
      if (!ds) return;
      if (!ds.moved) return;
      if (ds.group && ds.group.length > 1) return;

      if (ds.dragging) {
        const state = useEditorStore.getState();
        const draggedEl = state.getElement(ds.elementId);
        if (draggedEl) {
          // Moving a child edits its position, never its owning tree. Use Layers
          // for explicit reparenting, including moving a child back to the page.
          if (draggedEl.parentId) return;
          let targetContainerId: string | null = null;
          if (e) {
            const draggedNode = document.querySelector<HTMLElement>(
              `.canvas-page [data-element-id="${ds.elementId}"]`,
            );
            const targets = document.elementsFromPoint(
              e.clientX,
              e.clientY,
            );
            for (const target of targets) {
              if (draggedNode?.contains(target)) continue;
              const walkNode = target.closest<HTMLElement>(".canvas-page [data-element-id]");
              if (!walkNode) continue;
              const maybeId = walkNode.getAttribute("data-element-id");
              if (maybeId && maybeId !== ds.elementId) {
                const maybeEl = state.getElement(maybeId);
                if (maybeEl && canHaveChildren(maybeEl, state.customElements)) {
                  targetContainerId = maybeId;
                  break;
                }
              }
            }
          }

          if (targetContainerId) {
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
                const containerNode = document.querySelector(
                  `[data-element-id="${targetContainerId}"]`,
                ) as HTMLElement | null;
                const draggedNode = document.querySelector(
                  `[data-element-id="${ds.elementId}"]`,
                ) as HTMLElement | null;
                if (containerNode && draggedNode) {
                  const position = childPosition(draggedNode, containerNode);
                  nextX = Math.min(Math.max(0, containerNode.clientWidth-draggedNode.offsetWidth), Math.max(0,position.x));
                  nextY = Math.min(Math.max(0, containerNode.clientHeight-draggedNode.offsetHeight), Math.max(0,position.y));
                }

                const issue = moveElement(
                  ds.elementId,
                  targetContainerId,
                  targetContainer.children.length,
                );
                if (issue) return;
                const moved = useEditorStore.getState().elementsById[ds.elementId];
                if (moved.layout.position === "static" && moved.styles.position === "static") return;
                updateElement(ds.elementId, {
                  layout: { ...moved.layout, position: "absolute" },
                  styles: { position: "absolute" },
                });
                updateElementPosition(ds.elementId, nextX, nextY);
              }
            }
          }
        }
      }
    },
    [moveElement, updateElement, updateElementPosition],
  );

  const handlePointerUp = useCallback(
    (e: PointerEvent) => {
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
        const nodes = Array.from(
          document.querySelectorAll<HTMLElement>(
            ".canvas-page [data-element-id]",
          ),
        );
        const hits = nodes
          .filter((node) => {
            const r = node.getBoundingClientRect();
            return (
              r.right >= rect.left &&
              r.left <= rect.right &&
              r.bottom >= rect.top &&
              r.top <= rect.bottom
            );
          })
          .map((node) => node.getAttribute("data-element-id"))
          .filter((id): id is string => Boolean(id));
        selectElements(hits);
        suppressSelectionClick.current =
          rect.right - rect.left > 3 || rect.bottom - rect.top > 3;
        finalizeDrag();
        window.removeEventListener("pointermove", handlePointerMove);
        if (onPointerUp) {
          window.removeEventListener("pointerup", onPointerUp);
          window.removeEventListener("pointercancel", onPointerUp);
        }
        return;
      }
      if (!ds || e.pointerId !== ds.pointerId) return;
      if (e.type === "pointercancel" || (!latestPointRef.current && e.clientX === ds.startX && e.clientY === ds.startY))
        useEditorStore.getState().endInteraction(true);
      else {
        latestPointRef.current = {
          x: e.clientX,
          y: e.clientY,
          shiftKey: e.shiftKey,
        };
        applyDragUpdate();
        handleDragEnd({ clientX: e.clientX, clientY: e.clientY });
      }
      window.removeEventListener("pointermove", handlePointerMove);
      if (onPointerUp) {
        window.removeEventListener("pointerup", onPointerUp);
        window.removeEventListener("pointercancel", onPointerUp);
      }
      finalizeDrag();
    },
    [
      applyDragUpdate,
      finalizeDrag,
      handleDragEnd,
      handlePointerMove,
      selectElements,
    ],
  );

  useEffect(() => {
    handlePointerUpRef.current = handlePointerUp;
  }, [handlePointerUp]);

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

  const handleWorkspaceTouchStart = useCallback(
    (e: React.TouchEvent<HTMLDivElement>) => {
      if (e.touches.length !== 2 || useEditorUIStore.getState().viewportLocked)
        return;
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
    },
    [finalizeDrag],
  );

  const handleWorkspaceTouchMove = useCallback(
    (e: React.TouchEvent<HTMLDivElement>) => {
      if (e.touches.length !== 2 || !pinchState.current) return;
      e.preventDefault();
      const metrics = getTouchMetrics(e.touches);
      if (pinchState.current.startDistance <= 0) return;
      const nextZoom =
        pinchState.current.startZoom *
        (metrics.distance / pinchState.current.startDistance);
      zoomAtPoint(nextZoom, metrics.centerX, metrics.centerY);
    },
    [zoomAtPoint],
  );

  const handleWorkspaceTouchEnd = useCallback(
    (e: React.TouchEvent<HTMLDivElement>) => {
      if (e.touches.length < 2) {
        pinchState.current = null;
      }
    },
    [],
  );

  const handleCanvasHeightPointerDown = useCallback(
    (e: React.PointerEvent<HTMLDivElement>) => {
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
    },
    [canvasHeight, pendingHeight],
  );

  useEffect(() => {
    const openMenu = (event: KeyboardEvent) => {
      if (event.defaultPrevented || !(event.key === "ContextMenu" || (event.shiftKey && event.key === "F10"))) return;
      if ((event.target as HTMLElement)?.closest('input, textarea, select, [contenteditable="true"], dialog')) return;
      const state = useEditorStore.getState(), id = state.selectedElementId;
      const node = id ? canvasPageRef.current?.querySelector<HTMLElement>(`[data-element-id="${CSS.escape(id)}"]`) : null;
      if (!node || !id) return;
      event.preventDefault();
      const rect = node.getBoundingClientRect();
      setCtxMenu({ x: Math.max(8, rect.left + 12), y: Math.max(8, rect.top + 12), elementId: id });
    };
    window.addEventListener("keydown", openMenu);
    return () => window.removeEventListener("keydown", openMenu);
  }, []);

  const handlePointerDown = useCallback(
    (e: React.PointerEvent) => {
      if (e.button !== 0) return;
      if (e.pointerType === "touch") return;
      if (ctxMenu) setCtxMenu(null);

      const target = e.target as HTMLElement;
      const rotateHandle = target.closest(
        "[data-rotate-handle]",
      ) as HTMLElement | null;
      const resizeHandle = target.closest(
        "[data-resize-handle]",
      ) as HTMLElement | null;
      const elementWrapper = target.closest(
        "[data-element-id]",
      ) as HTMLElement | null;

      if (ui.tool === "marquee" || (!elementWrapper && target.classList.contains("canvas-page"))) {
        e.stopPropagation();
        selectionStart.current = { x: e.clientX, y: e.clientY };
        setSelectionBox({ x: 0, y: 0, w: 0, h: 0 });
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
        useEditorStore.getState().beginInteraction();
        const savedTransform=elementWrapper.style.transform;
        let plane;
        try {
          elementWrapper.style.transform=elementTransform({...el,layout:{...el.layout,rotation:0,skewX:0,skewY:0,scaleX:1,scaleY:1},styles:{...el.styles,transform:"none"}});
          plane=screenPlane(elementWrapper);
        } catch {useEditorStore.getState().endInteraction(true);return;}
        finally {elementWrapper.style.transform=savedTransform;}
        const centerX=elementWrapper.offsetWidth/2,centerY=elementWrapper.offsetHeight/2;
        const start=plane.toLocal(e.clientX,e.clientY);
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
          startAngle: Math.atan2(start.y - centerY, start.x - centerX),
          plane,
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
        let el = useEditorStore.getState().getElement(elId);
        if (!el || el.layout.locked) return;
        useEditorStore.getState().beginInteraction();

        if((el.styles.position || el.layout.position)==="static") {
          // Relative positioning keeps the child in flow while permitting an
          // anchored resize under its own transform and transformed ancestors.
          const current=el;
          flushSync(()=>updateElement(elId,{layout:{...current.layout,position:"relative",x:0,y:0},styles:{position:"relative"}}));
          el=useEditorStore.getState().getElement(elId)!;
        }

        dragState.current = {
          dragging: false,
          resizing: true,
          rotating: false,
          elementId: elId,
          startX: e.clientX,
          startY: e.clientY,
          startElX: el.layout.x,
          startElY: el.layout.y,
          startElW: elementWrapper.offsetWidth,
          startElH: elementWrapper.offsetHeight,
          handle,
          parentContainerId: null,
          pointerId: e.pointerId,
          startAngle: 0,
          startRotation: el.layout.rotation || 0,
          centerX: 0,
          centerY: 0,
        };
        try {
          const plane=screenPlane(elementWrapper),u=handle.includes("w")?1:handle.includes("e")?0:.5,v=handle.includes("n")?1:handle.includes("s")?0:.5;
          dragState.current.plane=plane;
          dragState.current.anchor={...plane.toScreen(u*elementWrapper.offsetWidth,v*elementWrapper.offsetHeight),u,v};
          if(elementWrapper.parentElement) dragState.current.parentPlane=screenPlane(elementWrapper.parentElement);
        } catch {dragState.current=null;useEditorStore.getState().endInteraction(true);return;}
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

        if (e.shiftKey) {
          toggleSelectElement(elId);
          return;
        }
        if (!useEditorStore.getState().selectedElementIds.includes(elId))
          selectElement(elId);
        const state = useEditorStore.getState();
        const wrapper = document.querySelector<HTMLElement>(`.canvas-page [data-element-id="${elId}"]`);
        if (el.parentId && state.getBreadcrumbPath(elId).some(node=>node.type === "form") && ["static", "relative"].includes(String(el.styles.position || el.layout.position || "static"))) return;
        const group = state.selectedElementIds
          .filter((id) => {
            let p = state.elementsById[id]?.parentId;
            while (p) {
              if (state.selectedElementIds.includes(p)) return false;
              p = state.elementsById[p]?.parentId;
            }
            return !state.elementsById[id]?.layout.locked;
          })
          .map((id) => dragElement(state.getElement(id)!));
        state.beginInteraction();
        const parentEl = el.parentId
          ? state.getElement(el.parentId)
          : undefined;
        const parentContainerId = parentEl ? el.parentId : null;
        const moving = group.find((item) => item.id === elId) ?? dragElement(el);

        dragState.current = {
          dragging: true,
          group,
          resizing: false,
          rotating: false,
          elementId: elId,
          startX: e.clientX,
          startY: e.clientY,
          startElX: moving.x,
          startElY: moving.y,
          startElW: moving.w,
          startElH: moving.h,
          handle: "",
          parentContainerId,
          pointerId: e.pointerId,
          startAngle: 0,
          startRotation: el.layout.rotation || 0,
          centerX: 0,
          centerY: 0,
        };
        try {
          if(wrapper?.parentElement) dragState.current.plane=screenPlane(wrapper.parentElement);
          dragState.current.groupPlanes=Object.fromEntries(group.map(element=> {
            const node=document.querySelector<HTMLElement>(`.canvas-page [data-element-id="${element.id}"]`);
            return [element.id,node?.parentElement ? screenPlane(node.parentElement) : dragState.current!.plane!];
          }));
        } catch {dragState.current=null;state.endInteraction(true);return;}
        document.body.style.userSelect = "none";
        document.body.style.cursor = "grabbing";
        window.addEventListener("pointermove", handlePointerMove);
        window.addEventListener("pointerup", handlePointerUp);
        window.addEventListener("pointercancel", handlePointerUp);
      }
    },
    [
      selectElement,
      toggleSelectElement,
      ctxMenu,
      handlePointerMove,
      handlePointerUp,
      ui.tool,
    ],
  );

  return (
    <div className="canvas-area">
      {/* Top bar */}
      <div className="canvas-topbar">
        <div className="canvas-url-bar">
          <span className="url-icon">
            <Layers size={14} />
          </span>
          <span className="url-text">
            {activePageTitle}{" "}
            <span className="canvas-route-label">{activePageRoute}</span>
          </span>
          <button
            className="url-action-btn"
            onClick={() =>
              window.dispatchEvent(
                new CustomEvent("levoks:panel", { detail: "ship" }),
              )
            }
            title="Export or deploy your website"
          >
            Local design
          </button>
        </div>
        <div className="canvas-topbar-right">
          <ResponsiveControls />
          <span className="page-label">
            {canvasWidth} × {canvasHeight}
          </span>
        </div>
      </div>

      {/* Workspace (viewport — overflow hidden, no native scroll) */}
      <div
        ref={workspaceRef}
        className={`canvas-workspace ${ui.gridVisible ? "show-grid" : ""}`}
        style={{ cursor }}
        aria-label="UI canvas"
        onClick={() => {
          if (suppressSelectionClick.current) {
            suppressSelectionClick.current = false;
            return;
          }
          selectElement(null);
          setCtxMenu(null);
        }}
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
              ...Object.fromEntries(Object.entries(tokens).map(([id, token]) => [`--lv-${id}`, token.value])),
              overflow: ui.hideOverflow ? "hidden" : "visible",
              width: `${canvasWidth}px`,
              maxWidth: `${canvasWidth}px`,
              minHeight: `${visibleCanvasHeight}px`,
              height: `${visibleCanvasHeight}px`,
              background: canvasBackground,
              backgroundColor: canvasHasGradient ? undefined : canvasBackground,
            }}
            onPointerDownCapture={ui.tool === "marquee" ? handlePointerDown : undefined}
            onPointerDown={ui.tool === "marquee" ? undefined : handlePointerDown}
          >
            {ui.tool === "pen" && <PenOverlay width={canvasWidth} height={visibleCanvasHeight} scale={zoomScale} />}
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
              <div
                className="canvas-empty-state"
                style={{ transform: `scale(${100 / zoom})`, width: emptyStateWidth, marginLeft: -emptyStateWidth / 2 }}
              >
                <div className="empty-icon">
                  <svg width="48" height="48" viewBox="0 0 48 48" fill="none">
                    <rect
                      x="6"
                      y="6"
                      width="36"
                      height="36"
                      rx="4"
                      stroke="#d1d5db"
                      strokeWidth="2"
                      strokeDasharray="4 4"
                    />
                    <path
                      d="M24 16v16M16 24h16"
                      stroke="#9ca3af"
                      strokeWidth="2"
                      strokeLinecap="round"
                    />
                  </svg>
                </div>
                <h3>Your next idea starts here.</h3>
                <p>
                  Drag an element onto the canvas, or start with a template.
                </p>
                <div className="canvas-empty-actions">
                  <button
                    onClick={(e) => {
                      e.stopPropagation();
                      useEditorStore.getState().setSidebarOpen("add");
                      useEditorUIStore.setState({ trayCollapsed: false });
                    }}
                  >
                    <Plus size={14} />
                    Add elements
                  </button>
                  <button
                    onClick={(e) => {
                      e.stopPropagation();
                      useEditorStore.getState().setSidebarOpen("templates");
                    }}
                  >
                    Browse templates
                  </button>
                </div>
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
          {pendingHeight !== null &&
            pendingHeight !== canvasHeight &&
            !isResizingHeight && (
              <div
                className="canvas-resize-prompt"
                style={{
                  left: `${canvasWidth / 2}px`,
                  top: `${pendingHeight + 16}px`,
                }}
              >
                <span className="canvas-resize-label">{pendingHeight}px</span>
                <button
                  className="canvas-resize-save"
                  onClick={() => {
                    updateCanvasSettings({ height: pendingHeight });
                    setPendingHeight(null);
                  }}
                >
                  Save
                </button>
                <button
                  className="canvas-resize-cancel"
                  onClick={() => setPendingHeight(null)}
                >
                  Cancel
                </button>
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
        <details
          className="screen-picker"
          onKeyDown={(event) => {
            if (event.key === "Escape") {
              event.preventDefault();
              event.currentTarget.removeAttribute("open");
              event.currentTarget.querySelector("summary")?.focus();
            }
          }}
        >
          <summary aria-label="Screen size" title="Choose screen dimensions">
            <PanelsTopLeft size={16} />
          </summary>
          <div
            className="screen-picker-options"
            role="group"
            aria-label="Screen dimensions"
          >
            <strong>Screen dimensions</strong>
            <span>Choose a screen to edit its layout. Tablet changes carry down to mobile. Switching screens keeps your changes.</span>
            {[
              ["Desktop HD", 1920, 1080],
              ["Laptop", 1366, 768],
              ["Desktop compact", 1280, 900],
              ["Tablet portrait", 768, 1024],
              ["Tablet landscape", 1024, 768],
              ["Phone small", 375, 812],
              ["Phone large", 430, 932],
            ].map(([label, width, height]) => (
              <button
                key={String(label)}
                aria-pressed={canvasWidth === width && canvasHeight === height}
                onClick={(event) => {
                  updateCanvasSettings({
                    width: Number(width),
                    height: Number(height),
                  });
                  event.currentTarget
                    .closest("details")
                    ?.removeAttribute("open");
                }}
              >
                <span>{label}</span>
                <small>
                  {width} x {height}
                </small>
              </button>
            ))}
            <span>Custom dimensions are available in Canvas settings.</span>
          </div>
        </details>
        <div className="canvas-tools" role="group" aria-label="Canvas tools">
          <button title={`Current: ${ui.tool === "pen" ? "pen" : ui.tool}. Click to cycle Select → Hand → Marquee. Shortcuts V / H / M.`} aria-label="Cycle pointer tool" data-tool={ui.tool} onClick={() => ui.setTool(ui.tool === "select" ? "hand" : ui.tool === "hand" ? "marquee" : "select")}>
            {ui.tool === "hand" ? <Hand size={16} /> : ui.tool === "marquee" ? <Scan size={16} /> : <MousePointer2 size={16} />}
          </button>
          <button title="Pen (P)" aria-label="Pen tool" aria-pressed={ui.tool === "pen"} onClick={() => ui.setTool("pen")}><PenTool size={16} /></button>
          <button title="Motion timeline" aria-label="Motion timeline" aria-pressed={ui.motionOpen} onClick={() => useEditorUIStore.setState({ motionOpen: !ui.motionOpen })}><Film size={16} /></button>
          <button title="Hide elements outside the screen" aria-label="Hide off-screen elements" aria-pressed={ui.hideOverflow} onClick={() => ui.toggle("hideOverflow")}><ScanEye size={16} /></button>
          <span className="dock-divider" />
          <button
            title="Snap to guides"
            aria-label="Snap to guides"
            aria-pressed={ui.snapEnabled}
            onClick={() => ui.toggle("snapEnabled")}
          >
            <Magnet size={16} />
          </button>
          <button
            title="Lock canvas navigation"
            aria-label="Lock canvas navigation"
            aria-pressed={ui.viewportLocked}
            onClick={() => ui.toggle("viewportLocked")}
          >
            {ui.viewportLocked ? <Lock size={15} /> : <Unlock size={15} />}
          </button>
        </div>
        <div className="zoom-controls">
          <button
            disabled={ui.viewportLocked}
            aria-label="Zoom out"
            title="Zoom out (−)"
            onClick={() => zoomAtWorkspaceCenter(zoom - ZOOM_STEP)}
            className="zoom-btn"
          >
            <Minus size={14} />
          </button>
          <select
            aria-label="Canvas zoom"
            disabled={ui.viewportLocked}
            value={zoom}
            onChange={(e) => zoomAtWorkspaceCenter(Number(e.target.value))}
            className="zoom-select"
          >
            {!ZOOM_LEVELS.includes(zoom) && (
              <option value={zoom}>{zoom}%</option>
            )}
            {ZOOM_LEVELS.map((z) => (
              <option key={z} value={z}>
                {z}%
              </option>
            ))}
          </select>
          <button
            disabled={ui.viewportLocked}
            aria-label="Zoom in"
            title="Zoom in (+)"
            onClick={() => zoomAtWorkspaceCenter(zoom + ZOOM_STEP)}
            className="zoom-btn"
          >
            <Plus size={14} />
          </button>
          <button
            onClick={() => {
              const ws = workspaceRef.current;
              if (ws) {
                const cx = (ws.clientWidth - canvasWidth) / 2;
                const cy = Math.max(
                  32,
                  (ws.clientHeight - visibleCanvasHeight) / 2,
                );
                applyView(cx, cy, 100);
              } else {
                applyView(0, 0, 100);
              }
            }}
            className={`zoom-btn zoom-reset-btn ${zoom === 100 ? "zoom-reset-active" : ""}`}
            disabled={ui.viewportLocked}
            aria-label="Reset zoom"
            title="Reset to 100% (Shift+0)"
          >
            <RotateCcw size={13} />
          </button>
          <button
            onClick={fitCanvasToView}
            className="zoom-btn zoom-fit-btn"
            disabled={ui.viewportLocked}
            aria-label="Fit canvas"
            title="Fit canvas (Shift+1)"
          >
            <Maximize2 size={13} />
          </button>
        </div>
      </div>
    </div>
  );
};

export default Canvas;
