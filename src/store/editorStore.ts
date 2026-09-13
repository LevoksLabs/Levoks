import { create } from "zustand";
import { ElementNode, Page, ElementType, CONTAINER_TYPES } from "@/types";
import { generateElementId, generatePageId, deepCloneSubtree, syncCounters } from "@/lib/idGenerator";
import { DEFAULT_LAYOUT, DEFAULT_STYLES, DEFAULT_PROPS } from "@/lib/defaults";
import type { TemplateElement } from "@/types/template";
import {
    collectDescendantIds, isAncestorOf, getBreadcrumbPath as getBreadcrumbPathHelper,
    findParentAndIndex, reorderSiblings, detachElement, attachElement,
} from "./editorHelpers";

const MAX_HISTORY = 50;
type NewElement = Omit<ElementNode, "id" | "parentId" | "children" | "layout"> & { layout?: Partial<ElementNode["layout"]>; children?: NewElement[] };

interface HistorySnapshot {
    elementsById: Record<string, ElementNode>;
    rootIds: string[];
    globalRootIds: string[];
}

interface EditorStore {
    elementsById: Record<string, ElementNode>;
    rootIds: string[];
    globalRootIds: string[];
    pages: Page[];
    activePageId: string;
    pageElementMap: Record<string, string[]>;
    selectedElementId: string | null;
    selectedElementIds: string[];
    sidebarOpen: string | null;
    clipboard: { element: ElementNode; subtree: Record<string, ElementNode> } | null;
    past: HistorySnapshot[];
    future: HistorySnapshot[];
    canUndo: boolean;
    canRedo: boolean;
    canvasSettings: { backgroundColor: string; width: number; height: number };
    frontendGeneratedCode: Record<string, string> | null;
    frontendCodePreviewOpen: boolean;

    addElement: (elementData: NewElement, parentId?: string, x?: number, y?: number) => string;
    updateElement: (id: string, updates: Partial<ElementNode>) => void;
    updateElementPosition: (id: string, x: number, y: number) => void;
    updateElementSize: (id: string, w: number, h: number) => void;
    updateElementOpacity: (id: string, opacity: number) => void;
    updateElementRotation: (id: string, rotation: number) => void;
    updateElementRotationLive: (id: string, rotation: number) => void;
    toggleVisibility: (id: string) => void;
    toggleLock: (id: string) => void;
    deleteElement: (id: string) => void;
    duplicateElement: (id: string) => void;
    moveElement: (id: string, targetParentId: string | null, index: number) => void;
    selectElement: (id: string | null) => void;
    selectElements: (ids: string[]) => void;
    toggleSelectElement: (id: string) => void;
    setSidebarOpen: (categoryId: string | null) => void;
    reorderElements: (parentId: string | null, oldIndex: number, newIndex: number) => void;
    undo: () => void;
    redo: () => void;
    bringForward: (id: string) => void;
    sendBackward: (id: string) => void;
    bringToFront: (id: string) => void;
    sendToBack: (id: string) => void;
    copyElement: (id: string) => void;
    cutElement: (id: string) => void;
    pasteElement: () => void;
    addPage: (title?: string) => string;
    deletePage: (id: string) => void;
    renamePage: (id: string, title: string) => void;
    updatePageRoute: (id: string, route: string) => void;
    switchPage: (id: string) => void;
    addGlobalElement: (elementData: NewElement) => string;
    deleteGlobalElement: (id: string) => void;
    loadTemplate: (elements: TemplateElement[]) => void;
    getElement: (id: string) => ElementNode | undefined;
    getSelectedElement: () => ElementNode | undefined;
    getBreadcrumbPath: (id: string) => { id: string; type: string; label?: string }[];
    getRootElements: () => ElementNode[];
    getGlobalRootElements: () => ElementNode[];
    getChildElements: (parentId: string) => ElementNode[];
    updateCanvasSettings: (settings: Partial<{ backgroundColor: string; width: number; height: number }>) => void;
    setFrontendGeneratedCode: (code: Record<string, string> | null) => void;
    setFrontendCodePreviewOpen: (open: boolean) => void;
}

function makeLayout(type: ElementType, overrides?: Partial<ElementNode["layout"]>, x?: number, y?: number): ElementNode["layout"] {
    const def = DEFAULT_LAYOUT[type] || DEFAULT_LAYOUT.container;
    return {
        ...def,
        ...(overrides || {}),
        x: x ?? overrides?.x ?? def.x,
        y: y ?? overrides?.y ?? def.y,
        w: overrides?.w ?? def.w,
        h: overrides?.h ?? def.h,
    };
}

function pushHistory(state: EditorStore): Partial<EditorStore> {
    const snap: HistorySnapshot = {
        elementsById: state.elementsById,
        rootIds: state.rootIds,
        globalRootIds: state.globalRootIds,
    };
    return {
        past: [...state.past, snap].slice(-MAX_HISTORY),
        future: [],
        canUndo: true,
        canRedo: false,
    };
}

function updateLayout(el: ElementNode, patch: Partial<ElementNode["layout"]>): ElementNode {
    return { ...el, layout: { ...el.layout, ...patch } };
}

// Build nested elements from template data (old format with nested children objects)
function buildTemplateElements(
    items: TemplateElement[],
    parentId: string | null
): { byId: Record<string, ElementNode>; rootIds: string[] } {
    const byId: Record<string, ElementNode> = {};
    const rootIds: string[] = [];
    for (const item of items) {
        const id = generateElementId(item.type);
        const childResult = item.children?.length
            ? buildTemplateElements(item.children, id)
            : { byId: {}, rootIds: [] };
        // Merge old-format top-level layout fields with explicit layout object
        const layoutOverrides: Partial<ElementNode["layout"]> = {
            ...(item.layout || {}),
        };
        if (item.x !== undefined) layoutOverrides.x = item.x;
        if (item.y !== undefined) layoutOverrides.y = item.y;
        if (item.w !== undefined) layoutOverrides.w = item.w;
        if (item.h !== undefined) layoutOverrides.h = item.h;
        if (item.opacity !== undefined) layoutOverrides.opacity = item.opacity;
        if (item.rotation !== undefined) layoutOverrides.rotation = item.rotation;
        if (item.visible !== undefined) layoutOverrides.visible = item.visible;
        if (item.locked !== undefined) layoutOverrides.locked = item.locked;

        // Strip old-format fields from the spread
        const { x: _x, y: _y, w: _w, h: _h, opacity: _o, rotation: _r, visible: _v, locked: _l, layout: _layout, children: _children, ...rest } = item;
        byId[id] = {
            ...rest,
            id,
            parentId,
            layout: makeLayout(item.type, layoutOverrides),
            children: childResult.rootIds,
        } as ElementNode;
        Object.assign(byId, childResult.byId);
        rootIds.push(id);
    }
    return { byId, rootIds };
}

const defaultPageId = generatePageId();

export const useEditorStore = create<EditorStore>((set, get) => ({
    elementsById: {},
    rootIds: [],
    globalRootIds: [],
    pages: [{ id: defaultPageId, title: "Home", route: "/" }],
    activePageId: defaultPageId,
    pageElementMap: { [defaultPageId]: [] },
    selectedElementId: null,
    selectedElementIds: [],
    sidebarOpen: "add",
    clipboard: null,
    past: [],
    future: [],
    canUndo: false,
    canRedo: false,
    canvasSettings: { backgroundColor: "#ffffff", width: 1280, height: 900 },
    frontendGeneratedCode: null,
    frontendCodePreviewOpen: false,

    addElement: (elementData, parentId, dropX, dropY) => {
        const id = generateElementId(elementData.type);
        const nested = buildTemplateElements(elementData.children || [], id);
        const isInContainer = parentId ? CONTAINER_TYPES.includes(get().elementsById[parentId]?.type) : false;
        const existingCount = Object.keys(get().elementsById).length;
        const posX = dropX ?? (parentId ? 0 : 100 + (existingCount % 5) * 30);
        const posY = dropY ?? (parentId ? 0 : 100 + (existingCount % 5) * 30);
        const layoutOverrides: Partial<ElementNode["layout"]> = {
            ...elementData.layout,
            x: posX,
            y: posY,
            position: isInContainer ? (elementData.layout?.position || "absolute") : (elementData.layout?.position || DEFAULT_LAYOUT[elementData.type]?.position || "absolute"),
        };
        const element: ElementNode = {
            type: elementData.type,
            label: elementData.label,
            props: elementData.props || { ...(DEFAULT_PROPS[elementData.type] || {}) },
            styles: elementData.styles || { ...(DEFAULT_STYLES[elementData.type] || {}) },
            animation: elementData.animation,
            actions: elementData.actions,
            id,
            parentId: parentId || null,
            layout: makeLayout(elementData.type, layoutOverrides),
            children: nested.rootIds,
        };
        set(state => {
            const validParent = parentId && state.elementsById[parentId] ? parentId : undefined;
            const hist = pushHistory(state);
            const next = { ...state.elementsById, ...nested.byId, [id]: { ...element, parentId: validParent || null } };
            let newRoots = state.rootIds;
            if (validParent && next[validParent]) {
                next[validParent] = { ...next[validParent], children: [...next[validParent].children, id] };
            } else {
                newRoots = [...state.rootIds, id];
            }
            return { elementsById: next, rootIds: newRoots, selectedElementId: id, selectedElementIds: [id], ...hist };
        });
        return id;
    },

    updateElement: (id, updates) => {
        set(state => {
            if (!state.elementsById[id]) return state;
            const hist = pushHistory(state);
            const el = state.elementsById[id];
            const next = { ...state.elementsById };
            next[id] = {
                ...el,
                ...updates,
                layout: updates.layout ? { ...el.layout, ...updates.layout } : el.layout,
                props: updates.props ? { ...el.props, ...updates.props } : el.props,
                styles: updates.styles ? { ...el.styles, ...updates.styles } : el.styles,
                children: updates.children ?? el.children,
                id: el.id, parentId: el.parentId,
            };
            return { elementsById: next, ...hist };
        });
    },

    updateElementPosition: (id, x, y) => {
        set(state => {
            if (!state.elementsById[id]) return state;
            return { elementsById: { ...state.elementsById, [id]: updateLayout(state.elementsById[id], { x, y }) } };
        });
    },

    updateElementSize: (id, w, h) => {
        set(state => {
            if (!state.elementsById[id]) return state;
            return { elementsById: { ...state.elementsById, [id]: updateLayout(state.elementsById[id], { w, h }) } };
        });
    },

    updateElementOpacity: (id, opacity) => {
        set(state => {
            if (!state.elementsById[id]) return state;
            const hist = pushHistory(state);
            return { elementsById: { ...state.elementsById, [id]: updateLayout(state.elementsById[id], { opacity }) }, ...hist };
        });
    },

    updateElementRotation: (id, rotation) => {
        set(state => {
            if (!state.elementsById[id]) return state;
            const hist = pushHistory(state);
            return { elementsById: { ...state.elementsById, [id]: updateLayout(state.elementsById[id], { rotation }) }, ...hist };
        });
    },

    updateElementRotationLive: (id, rotation) => {
        set(state => {
            if (!state.elementsById[id]) return state;
            return { elementsById: { ...state.elementsById, [id]: updateLayout(state.elementsById[id], { rotation }) } };
        });
    },

    toggleVisibility: (id) => {
        set(state => {
            const el = state.elementsById[id];
            if (!el) return state;
            const hist = pushHistory(state);
            return { elementsById: { ...state.elementsById, [id]: updateLayout(el, { visible: !el.layout.visible }) }, ...hist };
        });
    },

    toggleLock: (id) => {
        set(state => {
            const el = state.elementsById[id];
            if (!el) return state;
            const hist = pushHistory(state);
            return { elementsById: { ...state.elementsById, [id]: updateLayout(el, { locked: !el.layout.locked }) }, ...hist };
        });
    },

    deleteElement: (id) => {
        set(state => {
            if (!state.elementsById[id]) return state;
            const toDelete = collectDescendantIds(state.elementsById, id);
            const el = state.elementsById[id];
            const hist = pushHistory(state);
            const next = { ...state.elementsById };
            if (el.parentId && next[el.parentId]) {
                next[el.parentId] = { ...next[el.parentId], children: next[el.parentId].children.filter(c => !toDelete.has(c)) };
            }
            for (const did of toDelete) delete next[did];
            return {
                elementsById: next,
                rootIds: state.rootIds.filter(r => !toDelete.has(r)),
                globalRootIds: state.globalRootIds.filter(r => !toDelete.has(r)),
                selectedElementId: toDelete.has(state.selectedElementId || "") ? null : state.selectedElementId,
                selectedElementIds: state.selectedElementIds.filter(s => !toDelete.has(s)),
                ...hist,
            };
        });
    },

    duplicateElement: (id) => {
        const state = get();
        const el = state.elementsById[id];
        if (!el) return;
        const { clonedRootId, allCloned } = deepCloneSubtree(el, state.elementsById, el.parentId);
        allCloned[clonedRootId] = updateLayout(allCloned[clonedRootId], {
            x: allCloned[clonedRootId].layout.x + 20,
            y: allCloned[clonedRootId].layout.y + 20,
        });
        set(s => {
            const hist = pushHistory(s);
            const next = { ...s.elementsById, ...allCloned };
            let newRoots = s.rootIds;
            let newGlobalRoots = s.globalRootIds;
            if (el.parentId && next[el.parentId]) {
                next[el.parentId] = { ...next[el.parentId], children: [...next[el.parentId].children, clonedRootId] };
            } else if (s.globalRootIds.includes(id)) {
                newGlobalRoots = [...s.globalRootIds, clonedRootId];
            } else {
                newRoots = [...s.rootIds, clonedRootId];
            }
            return { elementsById: next, rootIds: newRoots, globalRootIds: newGlobalRoots, selectedElementId: clonedRootId, ...hist };
        });
    },

    moveElement: (id, targetParentId, index) => {
        set(state => {
            if (!state.elementsById[id]) return state;
            if (targetParentId && !state.elementsById[targetParentId]) return state;
            if (targetParentId && isAncestorOf(state.elementsById, id, targetParentId)) return state;
            if (targetParentId === id) return state;
            const hist = pushHistory(state);
            const d = detachElement(state.elementsById, state.rootIds, id);
            const a = attachElement(d.byId, d.rootIds, id, targetParentId, index);
            return { elementsById: a.byId, rootIds: a.rootIds, ...hist };
        });
    },

    selectElement: (id) => set({ selectedElementId: id, selectedElementIds: id ? [id] : [] }),

    selectElements: (ids) => {
        const u = Array.from(new Set(ids));
        set({ selectedElementIds: u, selectedElementId: u.length > 0 ? u[u.length - 1] : null });
    },

    toggleSelectElement: (id) => {
        set(state => {
            const exists = state.selectedElementIds.includes(id);
            const next = exists ? state.selectedElementIds.filter(s => s !== id) : [...state.selectedElementIds, id];
            return { selectedElementIds: next, selectedElementId: next.length > 0 ? next[next.length - 1] : null };
        });
    },

    setSidebarOpen: (categoryId) => set({ sidebarOpen: categoryId }),

    reorderElements: (parentId, oldIndex, newIndex) => {
        set(state => {
            if (oldIndex === newIndex) return state;
            const hist = pushHistory(state);
            if (!parentId) {
                const newRoots = reorderSiblings(state.rootIds, oldIndex, newIndex);
                return newRoots === state.rootIds ? state : { rootIds: newRoots, ...hist };
            }
            const parent = state.elementsById[parentId];
            if (!parent) return state;
            const newChildren = reorderSiblings(parent.children, oldIndex, newIndex);
            return {
                elementsById: { ...state.elementsById, [parentId]: { ...parent, children: newChildren } },
                ...hist,
            };
        });
    },

    undo: () => {
        set(state => {
            if (state.past.length === 0) return state;
            const newPast = [...state.past];
            const prev = newPast.pop()!;
            return {
                past: newPast,
                elementsById: prev.elementsById,
                rootIds: prev.rootIds,
                globalRootIds: prev.globalRootIds,
                future: [{ elementsById: state.elementsById, rootIds: state.rootIds, globalRootIds: state.globalRootIds }, ...state.future],
                canUndo: newPast.length > 0,
                canRedo: true,
            };
        });
    },

    redo: () => {
        set(state => {
            if (state.future.length === 0) return state;
            const newFuture = [...state.future];
            const next = newFuture.shift()!;
            return {
                future: newFuture,
                elementsById: next.elementsById,
                rootIds: next.rootIds,
                globalRootIds: next.globalRootIds,
                past: [...state.past, { elementsById: state.elementsById, rootIds: state.rootIds, globalRootIds: state.globalRootIds }],
                canUndo: true,
                canRedo: newFuture.length > 0,
            };
        });
    },

    getElement: (id) => get().elementsById[id],
    getSelectedElement: () => {
        const { selectedElementId, elementsById } = get();
        return selectedElementId ? elementsById[selectedElementId] : undefined;
    },
    getBreadcrumbPath: (id) => getBreadcrumbPathHelper(get().elementsById, id),

    getRootElements: () => {
        const { rootIds, elementsById } = get();
        return rootIds.map(id => elementsById[id]).filter(Boolean);
    },
    getGlobalRootElements: () => {
        const { globalRootIds, elementsById } = get();
        return globalRootIds.map(id => elementsById[id]).filter(Boolean);
    },
    getChildElements: (parentId) => {
        const { elementsById } = get();
        const parent = elementsById[parentId];
        if (!parent) return [];
        return parent.children.map(id => elementsById[id]).filter(Boolean);
    },

    bringForward: (id) => {
        const info = findParentAndIndex(get().elementsById, get().rootIds, id);
        if (!info) return;
        const siblings = info.parentId ? get().elementsById[info.parentId]?.children : get().rootIds;
        if (info.index >= siblings.length - 1) return;
        get().reorderElements(info.parentId, info.index, info.index + 1);
    },
    sendBackward: (id) => {
        const info = findParentAndIndex(get().elementsById, get().rootIds, id);
        if (!info || info.index <= 0) return;
        get().reorderElements(info.parentId, info.index, info.index - 1);
    },
    bringToFront: (id) => {
        const info = findParentAndIndex(get().elementsById, get().rootIds, id);
        if (!info) return;
        const siblings = info.parentId ? get().elementsById[info.parentId]?.children : get().rootIds;
        if (info.index >= siblings.length - 1) return;
        get().reorderElements(info.parentId, info.index, siblings.length - 1);
    },
    sendToBack: (id) => {
        const info = findParentAndIndex(get().elementsById, get().rootIds, id);
        if (!info || info.index <= 0) return;
        get().reorderElements(info.parentId, info.index, 0);
    },

    copyElement: (id) => {
        const s = get();
        const el = s.elementsById[id];
        if (!el) return;
        const subtree: Record<string, ElementNode> = {};
        const stack = [id];
        while (stack.length) {
            const cur = stack.pop()!;
            const e = s.elementsById[cur];
            if (e) { subtree[cur] = e; stack.push(...e.children); }
        }
        set({ clipboard: { element: el, subtree } });
    },

    cutElement: (id) => {
        get().copyElement(id);
        get().deleteElement(id);
    },

    pasteElement: () => {
        const { clipboard } = get();
        if (!clipboard) return;
        const { clonedRootId, allCloned } = deepCloneSubtree(clipboard.element, clipboard.subtree, null);
        allCloned[clonedRootId] = updateLayout(allCloned[clonedRootId], {
            x: allCloned[clonedRootId].layout.x + 20,
            y: allCloned[clonedRootId].layout.y + 20,
        });
        set(s => {
            const hist = pushHistory(s);
            return {
                elementsById: { ...s.elementsById, ...allCloned },
                rootIds: [...s.rootIds, clonedRootId],
                selectedElementId: clonedRootId,
                ...hist,
            };
        });
    },

    addPage: (title) => {
        const state = get();
        const id = generatePageId();
        const pageCount = state.pages.length;
        const newPage: Page = { id, title: title || `Page ${pageCount + 1}`, route: `/page-${pageCount + 1}` };
        set(s => ({
            pages: [...s.pages, newPage],
            pageElementMap: { ...s.pageElementMap, [s.activePageId]: s.rootIds, [id]: [] },
            activePageId: id,
            rootIds: [],
            selectedElementId: null,
            selectedElementIds: [],
            past: [], future: [], canUndo: false, canRedo: false,
        }));
        return id;
    },

    deletePage: (id) => {
        const state = get();
        if (state.pages.length <= 1) return;
        const remaining = state.pages.filter(p => p.id !== id);
        if (!remaining.some(p => p.route === "/")) remaining[0] = { ...remaining[0], route: "/" };
        const switchTo = id === state.activePageId ? remaining[0] : remaining.find(p => p.id === state.activePageId) || remaining[0];
        const pageRoots = id === state.activePageId ? state.rootIds : state.pageElementMap[id] || [];
        const toDelete = new Set<string>();
        for (const rid of pageRoots) {
            for (const did of collectDescendantIds(state.elementsById, rid)) toDelete.add(did);
        }
        const next = { ...state.elementsById };
        for (const did of toDelete) delete next[did];
        const newMap = { ...state.pageElementMap, [state.activePageId]: state.rootIds };
        delete newMap[id];
        set({
            pages: remaining,
            activePageId: switchTo.id,
            rootIds: newMap[switchTo.id] || [],
            elementsById: next,
            pageElementMap: newMap,
            selectedElementId: null, selectedElementIds: [],
            past: [], future: [], canUndo: false, canRedo: false,
        });
    },

    renamePage: (id, title) => {
        set(state => ({ pages: state.pages.map(p => p.id === id ? { ...p, title } : p) }));
    },
    updatePageRoute: (id, route) => {
        const state = get();
        if (!/^\/(?:[a-zA-Z0-9_-]+(?:\/[a-zA-Z0-9_-]+)*)?$/.test(route)) throw new Error("Use a path such as /about or /products/new.");
        if (state.pages.some(p => p.id !== id && p.route === route)) throw new Error("Another page already uses this route.");
        if (state.pages.find(p => p.id === id)?.route === "/" && route !== "/") throw new Error("The home page must keep the / route.");
        set({ pages: state.pages.map(p => p.id === id ? { ...p, route } : p) });
    },

    switchPage: (id) => {
        const state = get();
        if (id === state.activePageId) return;
        if (!state.pages.find(p => p.id === id)) return;
        set({
            pageElementMap: { ...state.pageElementMap, [state.activePageId]: state.rootIds },
            activePageId: id,
            rootIds: state.pageElementMap[id] || [],
            selectedElementId: null, selectedElementIds: [],
            past: [], future: [], canUndo: false, canRedo: false,
        });
    },

    addGlobalElement: (elementData) => {
        const id = generateElementId(elementData.type);
        const nested = buildTemplateElements(elementData.children || [], id);
        const element: ElementNode = {
            type: elementData.type, label: elementData.label,
            props: elementData.props || { ...(DEFAULT_PROPS[elementData.type] || {}) },
            styles: elementData.styles || { ...(DEFAULT_STYLES[elementData.type] || {}) },
            animation: elementData.animation, actions: elementData.actions,
            id, parentId: null,
            layout: makeLayout(elementData.type, elementData.layout),
            children: nested.rootIds,
        };
        set(s => ({
            ...pushHistory(s),
            elementsById: { ...s.elementsById, ...nested.byId, [id]: element },
            globalRootIds: [...s.globalRootIds, id],
            selectedElementId: id,
        }));
        return id;
    },

    deleteGlobalElement: (id) => {
        set(state => {
            if (!state.elementsById[id]) return state;
            const toDelete = collectDescendantIds(state.elementsById, id);
            const next = { ...state.elementsById };
            for (const did of toDelete) delete next[did];
            return {
                ...pushHistory(state),
                elementsById: next,
                globalRootIds: state.globalRootIds.filter(r => !toDelete.has(r)),
                selectedElementId: toDelete.has(state.selectedElementId || "") ? null : state.selectedElementId,
                selectedElementIds: state.selectedElementIds.filter(s => !toDelete.has(s)),
            };
        });
    },

    loadTemplate: (templateElements) => {
        set(state => {
            const hist = pushHistory(state);
            const { byId, rootIds } = buildTemplateElements(templateElements, null);
            const retained = { ...state.elementsById };
            for (const root of state.rootIds) for (const id of collectDescendantIds(state.elementsById, root)) delete retained[id];
            return { elementsById: { ...retained, ...byId }, rootIds, selectedElementId: null, selectedElementIds: [], ...hist };
        });
    },

    updateCanvasSettings: (settings) => {
        set(state => ({ canvasSettings: { ...state.canvasSettings, ...settings } }));
    },
    setFrontendGeneratedCode: (code) => set({ frontendGeneratedCode: code }),
    setFrontendCodePreviewOpen: (open) => set({ frontendCodePreviewOpen: open }),
}));
