import { create } from "zustand";
import { ElementNode, Page, ElementType, CONTAINER_TYPES, DesignToken, ComponentDefinition, DesignAsset } from "@/types";
import { generateElementId, generatePageId, deepCloneSubtree, syncCounters } from "@/lib/idGenerator";
import { DEFAULT_LAYOUT, DEFAULT_STYLES, DEFAULT_PROPS } from "@/lib/defaults";
import type { TemplateElement } from "@/types/template";
import {
    collectDescendantIds, isAncestorOf, getBreadcrumbPath as getBreadcrumbPathHelper,
    findParentAndIndex, reorderSiblings, detachElement, attachElement,
} from "./editorHelpers";

import { useEditorUIStore } from "./editorUIStore";
import { patchElement, patchLayout, resolveElement } from "@/lib/design";
import { groupElements, ungroupElements } from "@/lib/grouping";
import { componentDefinition, componentInstance } from "@/lib/design-components";
import { projectHistory, withProjectHistory } from "./projectHistory";
type NewElement = Omit<ElementNode, "id" | "parentId" | "children" | "layout"> & { layout?: Partial<ElementNode["layout"]>; children?: NewElement[] };

interface EditorStore {
    assets: Record<string, DesignAsset>;
    tokens: Record<string, DesignToken>;
    components: Record<string, ComponentDefinition>;
    setAsset: (id: string, asset: DesignAsset | null) => void;
    setToken: (id: string, token: DesignToken | null) => void;
    saveComponent: (rootId: string, name: string) => void;
    insertComponent: (id: string) => void;
    detachComponent: (rootId: string) => void;
    removeComponent: (id: string) => void;
    groupSelection: () => void;
    ungroupSelection: () => void;
    resetBreakpoint: (id: string) => void;
    elementsById: Record<string, ElementNode>;
    rootIds: string[];
    globalRootIds: string[];
    pages: Page[];
    activePageId: string;
    pageElementMap: Record<string, string[]>;
    selectedElementId: string | null;
    selectedElementIds: string[];
    sidebarOpen: string | null;
    clipboard: { element: ElementNode; roots: string[]; subtree: Record<string, ElementNode> } | null;
    beginInteraction: () => void;
    endInteraction: (cancel?: boolean) => void;
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
    reorderElements: (parentId: string | null, oldIndex: number, newIndex: number, scope?: "page" | "global") => void;
    undo: () => void;
    redo: () => void;
    bringForward: (id: string) => void;
    sendBackward: (id: string) => void;
    bringToFront: (id: string) => void;
    sendToBack: (id: string) => void;
    copyElement: (id: string) => void;
    copyElements: (ids: string[]) => void;
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

function updateLayout(el: ElementNode, patch: Partial<ElementNode["layout"]>): ElementNode {
    return patchLayout(el, patch, useEditorUIStore.getState().breakpoint);
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

export const useEditorStore = create<EditorStore>(withProjectHistory("editor", ["assets", "tokens", "components", "elementsById", "rootIds", "globalRootIds", "pages", "activePageId", "pageElementMap", "canvasSettings"], (set, get) => ({
    elementsById: {},
    rootIds: [],
    globalRootIds: [],
    pages: [{ id: defaultPageId, title: "Home", route: "/" }],
    activePageId: defaultPageId,
    pageElementMap: { [defaultPageId]: [] },
    selectedElementId: null,
    selectedElementIds: [],
    beginInteraction: () => projectHistory.begin("editor"),
    endInteraction: (cancel = false) => projectHistory.end(cancel),
    assets: {}, tokens: {}, components: {},
    setAsset: (id, asset) => set(state => {
        const assets = { ...state.assets };
        if (asset) assets[id] = asset; else delete assets[id];
        const detach = (nodes: Record<string, ElementNode>) => Object.fromEntries(Object.entries(nodes).map(([key, node]) => [key, !asset && node.props.assetId === id ? { ...node, props: { ...node.props, src: node.props.src || state.assets[id]?.source || "", assetId: "" } } : node]));
        return {  assets, elementsById: detach(state.elementsById), components: Object.fromEntries(Object.entries(state.components).map(([key, definition]) => [key, { ...definition, nodes: detach(definition.nodes) }])) };
    }),
    setToken: (id, token) => set(state => {
        const tokens = { ...state.tokens };
        if (token) tokens[id] = token; else delete tokens[id];
        let elementsById = state.elementsById;
        let components = state.components;
        if (!token && state.tokens[id]) {
            const value = state.tokens[id].value;
            const styles = (input: ElementNode["styles"] = {}) => Object.fromEntries(Object.entries(input).map(([key, entry]) => [key, typeof entry === "string" ? entry.replaceAll(`var(--lv-${id})`, value) : entry]));
            const freeze = (nodes: Record<string, ElementNode>) => Object.fromEntries(Object.entries(nodes).map(([key, node]) => [key, { ...node, styles: styles(node.styles), ...(node.responsive ? { responsive: Object.fromEntries(Object.entries(node.responsive).map(([bp, override]) => [bp, { ...override, styles: styles(override.styles) }])) } : {}) }]));
            elementsById = freeze(elementsById);
            components = Object.fromEntries(Object.entries(components).map(([key, definition]) => [key, { ...definition, nodes: freeze(definition.nodes) }]));
        }
        return {  tokens, elementsById, components };
    }),
    resetBreakpoint: (id) => set(state => {
        const element = state.elementsById[id], breakpoint = useEditorUIStore.getState().breakpoint;
        if (!element || breakpoint === "base") return {};
        const responsive = { ...element.responsive }; delete responsive[breakpoint];
        return {  elementsById: { ...state.elementsById, [id]: { ...element, responsive } } };
    }),
    saveComponent: (rootId, name) => set(state => {
        const selected = state.elementsById[rootId]; if (!selected) return {};
        if (selected.component && selected.component.node !== state.components[selected.component.id]?.rootId) return {};
        const id = selected.component?.id || generateElementId("component");
        const definition = componentDefinition(rootId, state.elementsById, name, id);
        const elementsById = { ...state.elementsById };
        const roots = Object.values(elementsById).filter(node => node.component?.id === id && node.component.node === state.components[id]?.rootId).map(node => node.id);
        if (!roots.includes(rootId)) roots.push(rootId);
        for (const root of roots) {
            const result = componentInstance(definition, id, elementsById, root, root === rootId);
            result.removed.forEach(key => delete elementsById[key]); Object.assign(elementsById, result.nodes);
        }
        return {  components: { ...state.components, [id]: definition }, elementsById };
    }),
    insertComponent: (id) => set(state => {
        const definition = state.components[id]; if (!definition) return {};
        const result = componentInstance(definition, id, state.elementsById);
        result.nodes[result.rootId].layout.x += 24; result.nodes[result.rootId].layout.y += 24;
        return {  elementsById: { ...state.elementsById, ...result.nodes }, rootIds: [...state.rootIds, result.rootId], selectedElementId: result.rootId, selectedElementIds: [result.rootId] };
    }),
    detachComponent: (rootId) => set(state => {
        const elementsById = { ...state.elementsById };
        collectDescendantIds(elementsById, rootId).forEach(id => { const node = { ...elementsById[id] }; delete node.component; elementsById[id] = node; });
        return {  elementsById };
    }),
    removeComponent: (id) => set(state => {
        const components = { ...state.components }; delete components[id];
        const elementsById = Object.fromEntries(Object.entries(state.elementsById).map(([key, node]) => { const copy = { ...node }; if (copy.component?.id === id) delete copy.component; return [key, copy]; }));
        return {  elementsById, components };
    }),
    groupSelection: () => set(state => { const result = groupElements(state); return result ? {  ...result } : {}; }),
    ungroupSelection: () => set(state => { const result = ungroupElements(state); return result ? {  ...result } : {}; }),
    sidebarOpen: "add",
    clipboard: null,
    canUndo: false,
    canRedo: false,
    canvasSettings: { backgroundColor: "#ffffff", width: 1920, height: 1080 },
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
            responsive: elementData.responsive, vector: elementData.vector, motion: elementData.motion,
            animation: elementData.animation,
            actions: elementData.actions,
            id,
            parentId: parentId || null,
            layout: makeLayout(elementData.type, layoutOverrides),
            children: nested.rootIds,
        };
        set(state => {
            const validParent = parentId && state.elementsById[parentId] ? parentId : undefined;
            const next = { ...state.elementsById, ...nested.byId, [id]: { ...element, parentId: validParent || null } };
            let newRoots = state.rootIds;
            if (validParent && next[validParent]) {
                next[validParent] = { ...next[validParent], children: [...next[validParent].children, id] };
            } else {
                newRoots = [...state.rootIds, id];
            }
            return { elementsById: next, rootIds: newRoots, selectedElementId: id, selectedElementIds: [id] };
        });
        return id;
    },

    updateElement: (id, updates) => {
        set(state => {
            if (!state.elementsById[id]) return state;
            const el = state.elementsById[id];
            const next = { ...state.elementsById };
            next[id] = patchElement(el, updates, useEditorUIStore.getState().breakpoint);
            return { elementsById: next };
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
            return { elementsById: { ...state.elementsById, [id]: updateLayout(state.elementsById[id], { opacity }) } };
        });
    },

    updateElementRotation: (id, rotation) => {
        set(state => {
            if (!state.elementsById[id]) return state;
            return { elementsById: { ...state.elementsById, [id]: updateLayout(state.elementsById[id], { rotation }) } };
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
            return { elementsById: { ...state.elementsById, [id]: updateLayout(el, { visible: !el.layout.visible }) } };
        });
    },

    toggleLock: (id) => {
        set(state => {
            const el = state.elementsById[id];
            if (!el) return state;
            return { elementsById: { ...state.elementsById, [id]: updateLayout(el, { locked: !el.layout.locked }) } };
        });
    },

    deleteElement: (id) => {
        set(state => {
            if (!state.elementsById[id]) return state;
            const toDelete = collectDescendantIds(state.elementsById, id);
            const el = state.elementsById[id];
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
            return { elementsById: next, rootIds: newRoots, globalRootIds: newGlobalRoots, selectedElementId: clonedRootId, selectedElementIds:[clonedRootId] };
        });
    },

    moveElement: (id, targetParentId, index) => {
        set(state => {
            if (!state.elementsById[id]) return state;
            if (targetParentId && !state.elementsById[targetParentId]) return state;
            if (targetParentId && isAncestorOf(state.elementsById, id, targetParentId)) return state;
            if (targetParentId === id) return state;
            const d = detachElement(state.elementsById, state.rootIds, id);
            const a = attachElement(d.byId, d.rootIds, id, targetParentId, index);
            return { elementsById: a.byId, rootIds: a.rootIds };
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

    setSidebarOpen: (categoryId) => {
        if (categoryId && !["settings", "secrets", "code"].includes(categoryId)) useEditorUIStore.setState({ canvasMode: categoryId === "backend" ? "backend" : categoryId === "routes" ? "routes" : "ui" });
        set({ sidebarOpen: categoryId });
    },

    reorderElements: (parentId, oldIndex, newIndex, scope = "page") => {
        set(state => {
            if (oldIndex === newIndex) return state;
            if (!parentId) {
                const key = scope === "global" ? "globalRootIds" : "rootIds";
                const newRoots = reorderSiblings(state[key], oldIndex, newIndex);
                return newRoots === state[key] ? state : { [key]: newRoots };
            }
            const parent = state.elementsById[parentId];
            if (!parent) return state;
            const newChildren = reorderSiblings(parent.children, oldIndex, newIndex);
            return {
                elementsById: { ...state.elementsById, [parentId]: { ...parent, children: newChildren } },
                
            };
        });
    },

    undo: () => projectHistory.undo(),
    redo: () => projectHistory.redo(),

    getElement: (id) => { const node = get().elementsById[id]; return node ? resolveElement(node, useEditorUIStore.getState().breakpoint) : undefined; },
    getSelectedElement: () => {
        const { selectedElementId, elementsById } = get();
        return selectedElementId ? get().getElement(selectedElementId) : undefined;
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
        const scope = get().globalRootIds.includes(id) ? "global" : "page";
        const roots = scope === "global" ? get().globalRootIds : get().rootIds;
        const info = findParentAndIndex(get().elementsById, roots, id);
        if (!info) return;
        const siblings = info.parentId ? get().elementsById[info.parentId]?.children : roots;
        if (info.index >= siblings.length - 1) return;
        get().reorderElements(info.parentId, info.index, info.index + 1, scope);
    },
    sendBackward: (id) => {
        const scope = get().globalRootIds.includes(id) ? "global" : "page";
        const roots = scope === "global" ? get().globalRootIds : get().rootIds;
        const info = findParentAndIndex(get().elementsById, roots, id);
        if (!info || info.index <= 0) return;
        get().reorderElements(info.parentId, info.index, info.index - 1, scope);
    },
    bringToFront: (id) => {
        const scope = get().globalRootIds.includes(id) ? "global" : "page";
        const roots = scope === "global" ? get().globalRootIds : get().rootIds;
        const info = findParentAndIndex(get().elementsById, roots, id);
        if (!info) return;
        const siblings = info.parentId ? get().elementsById[info.parentId]?.children : roots;
        if (info.index >= siblings.length - 1) return;
        get().reorderElements(info.parentId, info.index, siblings.length - 1, scope);
    },
    sendToBack: (id) => {
        const scope = get().globalRootIds.includes(id) ? "global" : "page";
        const roots = scope === "global" ? get().globalRootIds : get().rootIds;
        const info = findParentAndIndex(get().elementsById, roots, id);
        if (!info || info.index <= 0) return;
        get().reorderElements(info.parentId, info.index, 0, scope);
    },

    copyElement: (id) => get().copyElements([id]),
    copyElements: (ids) => {
        const state = get();
        const roots = [...new Set(ids)].filter(id => {
            const element = state.elementsById[id];
            if (!element) return false;
            let parent = element.parentId;
            while (parent) {
                if (ids.includes(parent)) return false;
                parent = state.elementsById[parent]?.parentId;
            }
            return true;
        });
        if (!roots.length) return;
        const subtree: Record<string, ElementNode> = {};
        const stack = [...roots];
        while (stack.length) {
            const id = stack.pop()!;
            const element = state.elementsById[id];
            if (element) { subtree[id] = element; stack.push(...element.children); }
        }
        roots.forEach(id => {
            const element = subtree[id];
            let x = element.layout.x, y = element.layout.y, parent = element.parentId;
            while (parent && state.elementsById[parent]) {
                const ancestor = state.elementsById[parent];
                x += ancestor.layout.x; y += ancestor.layout.y; parent = ancestor.parentId;
            }
            subtree[id] = { ...updateLayout(element, { x, y }), parentId: null };
        });
        set({ clipboard: { element: subtree[roots[0]], roots, subtree } });
    },
    cutElement: (id) => {
        if (get().elementsById[id]?.layout.locked) return;
        get().copyElement(id);
        get().deleteElement(id);
    },
    pasteElement: () => {
        const { clipboard } = get();
        if (!clipboard) return;
        const roots: string[] = [];
        const elements: Record<string, ElementNode> = {};
        clipboard.roots.forEach(id => {
            const { clonedRootId, allCloned } = deepCloneSubtree(clipboard.subtree[id], clipboard.subtree, null);
            allCloned[clonedRootId] = updateLayout(allCloned[clonedRootId], {
                x: allCloned[clonedRootId].layout.x + 20,
                y: allCloned[clonedRootId].layout.y + 20,
            });
            roots.push(clonedRootId);
            Object.assign(elements, allCloned);
        });
        set(s => ({
            
            elementsById: { ...s.elementsById, ...elements },
            rootIds: [...s.rootIds, ...roots],
            selectedElementId: roots[0],
            selectedElementIds: roots,
        }));
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
        projectHistory.without(() => set({
            pageElementMap: { ...state.pageElementMap, [state.activePageId]: state.rootIds },
            activePageId: id,
            rootIds: state.pageElementMap[id] || [],
            selectedElementId: null, selectedElementIds: [],
        }));
    },

    addGlobalElement: (elementData) => {
        const id = generateElementId(elementData.type);
        const nested = buildTemplateElements(elementData.children || [], id);
        const element: ElementNode = {
            type: elementData.type, label: elementData.label,
            props: elementData.props || { ...(DEFAULT_PROPS[elementData.type] || {}) },
            styles: elementData.styles || { ...(DEFAULT_STYLES[elementData.type] || {}) },
            responsive: elementData.responsive, vector: elementData.vector, motion: elementData.motion,
            animation: elementData.animation, actions: elementData.actions,
            id, parentId: null,
            layout: makeLayout(elementData.type, elementData.layout),
            children: nested.rootIds,
        };
        set(s => ({
            
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
                
                elementsById: next,
                globalRootIds: state.globalRootIds.filter(r => !toDelete.has(r)),
                selectedElementId: toDelete.has(state.selectedElementId || "") ? null : state.selectedElementId,
                selectedElementIds: state.selectedElementIds.filter(s => !toDelete.has(s)),
            };
        });
    },

    loadTemplate: (templateElements) => {
        set(state => {
            const { byId, rootIds } = buildTemplateElements(templateElements, null);
            const retained = { ...state.elementsById };
            for (const root of state.rootIds) for (const id of collectDescendantIds(state.elementsById, root)) delete retained[id];
            return { elementsById: { ...retained, ...byId }, rootIds, selectedElementId: null, selectedElementIds: [] };
        });
    },

    updateCanvasSettings: (settings) => {
        set(state => ({ canvasSettings: { ...state.canvasSettings, ...settings } }));
    },
    setFrontendGeneratedCode: (code) => set({ frontendGeneratedCode: code }),
    setFrontendCodePreviewOpen: (open) => set({ frontendCodePreviewOpen: open }),
}), (state, snapshot) => ({
    selectedElementIds: state.activePageId === snapshot.activePageId ? state.selectedElementIds.filter(id => snapshot.elementsById?.[id]) : [],
    selectedElementId: state.activePageId === snapshot.activePageId && snapshot.elementsById?.[state.selectedElementId || ""] ? state.selectedElementId : null,
    frontendGeneratedCode: null,
})));
projectHistory.subscribe(scope => {
    useEditorStore.setState({ canUndo: projectHistory.canUndo, canRedo: projectHistory.canRedo });
    if (scope) useEditorUIStore.setState({ canvasMode: scope === "backend" ? "backend" : scope === "routing" ? "routes" : "ui" });
});
