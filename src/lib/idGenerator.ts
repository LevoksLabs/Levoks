// ═══════════════════════════════════════════════════
// Semantic ID Generator
// ═══════════════════════════════════════════════════
//
// Generates human-readable, stable, unique IDs per element type.
//   button_1, button_2, section_1, input_3, ...
//
// Rules:
//   - Monotonic increment per type — never decrements
//   - Deletion does NOT free IDs
//   - Copy/paste generates new IDs for entire subtree
//   - Undo/redo restores original IDs (no regeneration)
//   - Session restore syncs counters to max existing value
//

import type { ElementNode } from "@/types";

const counters: Record<string, number> = {};

/**
 * Generate a unique semantic element ID.
 * Format: `{type}_{incrementingNumber}`
 */
export function generateElementId(type: string): string {
    if (!counters[type]) counters[type] = 0;
    counters[type]++;
    return `${type}_${counters[type]}`;
}

/**
 * Generate a unique page ID.
 */
export function generatePageId(): string {
    if (!counters["page"]) counters["page"] = 0;
    counters["page"]++;
    return `page_${counters["page"]}`;
}

/**
 * Sync counters to resume from the highest existing ID.
 * Call this on session restore / project load.
 */
export function syncCounters(existingIds: string[]): void {
    for (const id of existingIds) {
        const match = id.match(/^(.+)_(\d+)$/);
        if (match) {
            const [, type, numStr] = match;
            const num = parseInt(numStr, 10);
            if (!Number.isFinite(num)) continue;
            counters[type] = Math.max(counters[type] || 0, num);
        }
    }
}

/**
 * Reset all counters. Use only in tests.
 */
export function resetCounters(): void {
    for (const key of Object.keys(counters)) {
        delete counters[key];
    }
}

/**
 * Deep clone an element tree, generating fresh semantic IDs for every node.
 * Used for: copy/paste, duplicate, template loading.
 */
export function deepCloneWithSemanticIds(
    element: ElementNode,
    newParentId: string | null = null
): ElementNode {
    const newId = generateElementId(element.type);
    const clonedChildren: string[] = [];
    // We need to return the cloned element AND all the elements for the flat map.
    // This function is used alongside collectClonedElements.
    return {
        ...element,
        id: newId,
        parentId: newParentId,
        children: clonedChildren, // Will be filled by collectClonedElements
    };
}

/**
 * Deep clone an entire subtree into a flat map of new elements.
 * Returns: { clonedRoot, allCloned: Record<id, ElementNode> }
 */
export function deepCloneSubtree(
    rootElement: ElementNode,
    elementsById: Record<string, ElementNode>,
    newParentId: string | null = null
): { clonedRootId: string; allCloned: Record<string, ElementNode> } {
    const allCloned: Record<string, ElementNode> = {};
    const clonedIds = new Map<string, string>();

    function cloneRecursive(el: ElementNode, parentId: string | null): string {
        const newId = generateElementId(el.type);
        clonedIds.set(el.id, newId);
        const newChildIds: string[] = [];

        for (const childId of el.children) {
            const childEl = elementsById[childId];
            if (childEl) {
                const clonedChildId = cloneRecursive(childEl, newId);
                newChildIds.push(clonedChildId);
            }
        }

        allCloned[newId] = {
            ...el,
            id: newId,
            parentId,
            children: newChildIds,
        };
        if (["radioGroup", "checkboxGroup"].includes(el.definitionId || "") && el.props.name) {
            const name = `choice_${newId}`;
            allCloned[newId].props = {...el.props, name};
            for (const childId of newChildIds) if (allCloned[childId].definitionId === (el.definitionId === "radioGroup" ? "radioButton" : "checkbox"))
                allCloned[childId].props = {...allCloned[childId].props, name};
        }

        return newId;
    }

    const clonedRootId = cloneRecursive(rootElement, newParentId);
    for (const node of Object.values(allCloned)) if (node.formCondition)
        node.formCondition = { ...node.formCondition, sourceId: clonedIds.get(node.formCondition.sourceId) || node.formCondition.sourceId };
    return { clonedRootId, allCloned };
}
