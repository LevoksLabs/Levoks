import { ElementNode } from "@/types";

// Collect all descendant IDs from flat map
export function collectDescendantIds(
    byId: Record<string, ElementNode>, id: string
): Set<string> {
    const result = new Set<string>();
    const stack = [id];
    while (stack.length) {
        const cur = stack.pop()!;
        result.add(cur);
        const el = byId[cur];
        if (el) for (const cid of el.children) stack.push(cid);
    }
    return result;
}

// Check if `ancestorId` is an ancestor of `targetId`
export function isAncestorOf(
    byId: Record<string, ElementNode>, ancestorId: string, targetId: string
): boolean {
    let cur = byId[targetId]?.parentId;
    while (cur) {
        if (cur === ancestorId) return true;
        cur = byId[cur]?.parentId ?? null;
    }
    return false;
}

// Get breadcrumb path from root to element
export function getBreadcrumbPath(
    byId: Record<string, ElementNode>, id: string
): { id: string; type: string; label?: string }[] {
    const path: { id: string; type: string; label?: string }[] = [];
    let cur = id;
    while (cur && byId[cur]) {
        const el = byId[cur];
        path.unshift({ id: el.id, type: el.type, label: el.label });
        cur = el.parentId!;
    }
    return path;
}

// Find parent info for z-order operations
export function findParentAndIndex(
    byId: Record<string, ElementNode>,
    rootIds: string[],
    id: string
): { parentId: string | null; index: number } | null {
    const el = byId[id];
    if (!el) return null;
    if (!el.parentId) {
        const idx = rootIds.indexOf(id);
        return idx >= 0 ? { parentId: null, index: idx } : null;
    }
    const parent = byId[el.parentId];
    if (!parent) return null;
    const idx = parent.children.indexOf(id);
    return idx >= 0 ? { parentId: el.parentId, index: idx } : null;
}

/** A nested element keeps the root list it belongs to when it changes parent. */
export function elementRoot(
    byId: Record<string, ElementNode>, id: string
): string | undefined {
    const seen = new Set<string>();
    let node = byId[id];
    while (node?.parentId) {
        if (seen.has(node.id)) return;
        seen.add(node.id);
        node = byId[node.parentId];
    }
    return node?.id;
}

// Reorder within siblings
export function reorderSiblings(
    arr: string[], oldIdx: number, newIdx: number
): string[] {
    if (oldIdx === newIdx || oldIdx < 0 || newIdx < 0 ||
        oldIdx >= arr.length || newIdx >= arr.length) return arr;
    const next = [...arr];
    const [item] = next.splice(oldIdx, 1);
    next.splice(newIdx, 0, item);
    return next;
}

// Remove element from its current parent/root and return updated state pieces
export function detachElement(
    byId: Record<string, ElementNode>,
    rootIds: string[],
    id: string
): { byId: Record<string, ElementNode>; rootIds: string[] } {
    const el = byId[id];
    if (!el) return { byId, rootIds };
    const next = { ...byId };
    if (el.parentId && next[el.parentId]) {
        next[el.parentId] = {
            ...next[el.parentId],
            children: next[el.parentId].children.filter(c => c !== id),
        };
    }
    const newRoots = rootIds.filter(r => r !== id);
    return { byId: next, rootIds: newRoots };
}

// Attach element to a new parent at index
export function attachElement(
    byId: Record<string, ElementNode>,
    rootIds: string[],
    id: string,
    targetParentId: string | null,
    index: number
): { byId: Record<string, ElementNode>; rootIds: string[] } {
    const next = { ...byId };
    next[id] = { ...next[id], parentId: targetParentId };
    if (targetParentId && next[targetParentId]) {
        const children = [...next[targetParentId].children];
        children.splice(Math.min(index, children.length), 0, id);
        next[targetParentId] = { ...next[targetParentId], children };
        return { byId: next, rootIds };
    }
    const newRoots = [...rootIds];
    newRoots.splice(Math.min(index, newRoots.length), 0, id);
    return { byId: next, rootIds: newRoots };
}
