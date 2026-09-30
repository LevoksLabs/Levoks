"use client";

import React from "react";
import {
    DndContext,
    DragEndEvent,
    DragStartEvent,
    DragOverlay,
    pointerWithin,
    rectIntersection,
    closestCenter,
    CollisionDetection,
    UniqueIdentifier,
    MouseSensor,
    TouchSensor,
    useSensor,
    useSensors,
} from "@dnd-kit/core";
import { useEditorStore } from "@/store/editorStore";
import { templates } from "@/templates";
import { ElementNode, ElementType } from "@/types";
import { canHaveChildren } from "@/lib/elements/registry";

interface DndProviderProps {
    children: React.ReactNode;
}

const getActivatorPoint = (event: Event | null | undefined): { x: number; y: number } | null => {
    if (!event) return null;

    if ("clientX" in event && "clientY" in event) {
        const mouseEvent = event as MouseEvent;
        return { x: mouseEvent.clientX, y: mouseEvent.clientY };
    }

    if ("touches" in event) {
        const touchEvent = event as TouchEvent;
        const touch = touchEvent.touches[0] || touchEvent.changedTouches[0];
        if (touch) return { x: touch.clientX, y: touch.clientY };
    }

    return null;
};

const getDropClientPoint = (event: DragEndEvent): { x: number; y: number } | null => {
    const translated = event.active.rect.current.translated;
    if (translated) {
        return {
            x: translated.left + translated.width / 2,
            y: translated.top + translated.height / 2,
        };
    }

    const start = getActivatorPoint(event.activatorEvent);
    if (start) {
        return {
            x: start.x + event.delta.x,
            y: start.y + event.delta.y,
        };
    }

    return null;
};

const getElementScale = (el: HTMLElement): number => {
    // Derive effective scale from rendered vs natural dimensions.
    // This correctly accounts for ancestor transforms (canvas-transform-layer).
    const rect = el.getBoundingClientRect();
    const natural = el.offsetWidth;
    if (natural > 0 && rect.width > 0) {
        return rect.width / natural;
    }
    return 1;
};

const getContainerIdAtPoint = (
    x: number,
    y: number,
    getElement: (id: string) => ElementNode | undefined
): string | null => {
    const targetNode = document.elementFromPoint(x, y) as HTMLElement | null;
    let walkNode: HTMLElement | null = targetNode;
    while (walkNode) {
        const maybeId = walkNode.getAttribute("data-element-id");
        if (maybeId) {
            const maybeNode = getElement(maybeId);
            if (maybeNode && canHaveChildren(maybeNode, useEditorStore.getState().customElements)) {
                return maybeId;
            }
        }
        walkNode = walkNode.parentElement;
    }

    const candidates = Array.from(document.querySelectorAll<HTMLElement>("[data-element-id]"))
        .map((node) => {
            const id = node.getAttribute("data-element-id");
            if (!id) return null;
            const element = getElement(id);
            if (!element || !canHaveChildren(element, useEditorStore.getState().customElements)) return null;
            const rect = node.getBoundingClientRect();
            const containsPoint = x >= rect.left && x <= rect.right && y >= rect.top && y <= rect.bottom;
            if (!containsPoint) return null;
            return { id, area: rect.width * rect.height };
        })
        .filter((entry): entry is { id: string; area: number } => Boolean(entry))
        .sort((a, b) => a.area - b.area);

    return candidates[0]?.id || null;
};

const DndProvider: React.FC<DndProviderProps> = ({ children }) => {
    const { addElement, getElement } = useEditorStore();
    const [activeId, setActiveId] = React.useState<UniqueIdentifier | null>(null);
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const [activeData, setActiveData] = React.useState<any>(null);

    const mouseSensor = useSensor(MouseSensor, {
        activationConstraint: { distance: 8 },
    });
    const touchSensor = useSensor(TouchSensor, {
        activationConstraint: { delay: 200, tolerance: 5 },
    });
    const sensors = useSensors(mouseSensor, touchSensor);

    const collisionDetection: CollisionDetection = React.useCallback((args) => {
        const prioritizeContainers = (collisions: ReturnType<typeof pointerWithin>) => {
            const containerHits = collisions.filter((c) => c.id !== "canvas-root");
            return containerHits.length > 0 ? containerHits : collisions;
        };

        const pointer = pointerWithin(args);
        if (pointer.length > 0) return prioritizeContainers(pointer);
        const rect = rectIntersection(args);
        if (rect.length > 0) return prioritizeContainers(rect);
        return closestCenter(args);
    }, []);

    const handleDragStart = (event: DragStartEvent) => {
        setActiveId(event.active.id);
        setActiveData(event.active.data.current);
    };

    const handleDragEnd = (event: DragEndEvent) => {
        const { active, over } = event;
        setActiveId(null);
        setActiveData(null);
        if (!over) return;

        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const aData = active.data.current as any;
        const overData = over.data.current as { type?: string; parentId?: string | null } | undefined;

        // Only handle template drops from sidebar
        if (aData?.type === "template") {
            const tType = aData.templateType as ElementType;
            const tmpl = aData.template || templates[tType];
            if (!tmpl) return;
            const dropPoint = getDropClientPoint(event);

            const placeInsideContainer = (containerId: string) => {
                const containerNode = document.querySelector(`[data-element-id="${containerId}"]`) as HTMLElement | null;
                const canvasPage = document.querySelector(".canvas-page") as HTMLElement | null;
                const scale = canvasPage ? getElementScale(canvasPage) : 1;

                if (dropPoint && containerNode) {
                    const rect = containerNode.getBoundingClientRect();
                    const dropX = (dropPoint.x - rect.left) / scale;
                    const dropY = (dropPoint.y - rect.top) / scale;
                    addElement(
                        { ...tmpl },
                        containerId,
                        Math.max(0, dropX - 16),
                        Math.max(0, dropY - 12)
                    );
                } else {
                    addElement({ ...tmpl }, containerId);
                }
            };

            if (overData?.type === "container" && overData.parentId) {
                placeInsideContainer(overData.parentId);
                return;
            }

            if (dropPoint) {
                const hitContainerId = getContainerIdAtPoint(dropPoint.x, dropPoint.y, getElement);
                if (hitContainerId) {
                    placeInsideContainer(hitContainerId);
                    return;
                }
            }

            if (overData?.type !== "canvas") {
                return;
            }

            const canvasPage = document.querySelector(".canvas-page") as HTMLElement | null;
            if (!canvasPage || !dropPoint) {
                addElement({ ...tmpl });
                return;
            }

            const rect = canvasPage.getBoundingClientRect();
            const scale = getElementScale(canvasPage);
            const dropX = (dropPoint.x - rect.left) / scale;
            const dropY = (dropPoint.y - rect.top) / scale;
            addElement({ ...tmpl }, undefined, Math.max(0, dropX), Math.max(0, dropY));
        }
    };

    return (
        <DndContext
            sensors={sensors}
            collisionDetection={collisionDetection}
            onDragStart={handleDragStart}
            onDragEnd={handleDragEnd}
        >
            {children}
            <DragOverlay dropAnimation={null}>
                {activeId && activeData && (
                    <div className="drag-overlay-box">
                        <span className="drag-overlay-label">
                            {activeData.type === "template"
                                ? activeData.templateType
                                : "Element"}
                        </span>
                    </div>
                )}
            </DragOverlay>
        </DndContext>
    );
};

export default DndProvider;
