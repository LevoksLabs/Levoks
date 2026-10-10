import type { ElementNode } from "@/types";
import { DEFAULT_LAYOUT } from "./defaults";
import { generateElementId } from "./idGenerator";
import { resolveElement, responsiveKeys, type Breakpoint } from "./design";
type Tree = {
  elementsById: Record<string, ElementNode>;
  rootIds: string[];
  globalRootIds: string[];
  selectedElementIds: string[];
};
export function canGroup(tree: Tree) {
  const nodes = tree.selectedElementIds
    .map((id) => tree.elementsById[id])
    .filter(Boolean);
  return (
    nodes.length > 1 &&
    nodes.every(
      (node) =>
        !node.layout.locked &&
        [
          "base",
          "tablet",
          "mobile",
          ...responsiveKeys(Object.values(tree.elementsById)),
        ].every((bp) => {
          const resolved = resolveElement(node, bp as Breakpoint);
          return (
            (resolved.styles.position ||
              (node.parentId ? resolved.layout.position : "absolute")) ===
            "absolute"
          );
        }) &&
        node.parentId === nodes[0].parentId &&
        (!!node.parentId ||
          tree.rootIds.includes(node.id) ===
            tree.rootIds.includes(nodes[0].id)),
    )
  );
}
export function groupElements(tree: Tree) {
  if (!canGroup(tree)) return null;
  const nodes = tree.selectedElementIds.map((id) => tree.elementsById[id]),
    parentId = nodes[0].parentId;
  const siblings = parentId
    ? tree.elementsById[parentId].children
    : tree.rootIds.includes(nodes[0].id)
      ? tree.rootIds
      : tree.globalRootIds;
  const children = siblings.filter((id) =>
      tree.selectedElementIds.includes(id),
    ),
    id = generateElementId("container");
  const elementsById = { ...tree.elementsById };
  const bounds = (bp: Breakpoint) => {
    const layouts = nodes.map((node) => resolveElement(node, bp).layout),
      x = Math.min(...layouts.map((layout) => layout.x)),
      y = Math.min(...layouts.map((layout) => layout.y));
    return {
      x,
      y,
      w: Math.max(...layouts.map((layout) => layout.x + layout.w)) - x,
      h: Math.max(...layouts.map((layout) => layout.y + layout.h)) - y,
    };
  };
  const base = bounds("base");
  const keys = [
    ...new Set(["tablet", "mobile", ...responsiveKeys(nodes)]),
  ] as Exclude<Breakpoint, "base">[];
  elementsById[id] = {
    id,
    type: "container",
    label: "Group",
    parentId,
    children,
    props: { isGroup: true },
    styles: {
      position: "absolute",
      backgroundColor: "transparent",
      padding: "0",
    },
    layout: { ...DEFAULT_LAYOUT.container, ...base, position: "absolute" },
    responsive: Object.fromEntries(
      keys.map((bp) => [bp, { layout: bounds(bp) }]),
    ),
  };
  for (const node of nodes) {
    elementsById[node.id] = {
      ...node,
      parentId: id,
      styles: { ...node.styles, position: "absolute" },
      layout: {
        ...node.layout,
        x: node.layout.x - base.x,
        y: node.layout.y - base.y,
        position: "absolute",
      },
      responsive: Object.fromEntries(
        keys.map((bp) => {
          const resolved = resolveElement(node, bp),
            box = bounds(bp);
          return [
            bp,
            {
              ...node.responsive?.[bp],
              layout: {
                ...node.responsive?.[bp]?.layout,
                x: resolved.layout.x - box.x,
                y: resolved.layout.y - box.y,
              },
            },
          ];
        }),
      ),
    };
  }
  const next = siblings.filter((item) => !children.includes(item));
  next.splice(siblings.indexOf(children[0]), 0, id);
  if (parentId)
    elementsById[parentId] = { ...elementsById[parentId], children: next };
  return {
    elementsById,
    rootIds: !parentId && siblings === tree.rootIds ? next : tree.rootIds,
    globalRootIds:
      !parentId && siblings === tree.globalRootIds ? next : tree.globalRootIds,
    selectedElementIds: [id],
    selectedElementId: id,
  };
}
export function canUngroup(tree: Tree) {
  if (tree.selectedElementIds.length !== 1) return false;
  const group = tree.elementsById[tree.selectedElementIds[0]];
  if (
    !group?.props.isGroup ||
    group.component ||
    group.motion ||
    group.animation
  )
    return false;
  // Flattening a styled/animated wrapper changes compositing. Keep it intact.
  return (
    [
      "base",
      "tablet",
      "mobile",
      ...responsiveKeys([
        group,
        ...group.children.map((id) => tree.elementsById[id]),
      ]),
    ] as Breakpoint[]
  ).every((bp) => {
    const resolved = resolveElement(group, bp),
      layout = resolved.layout;
    return (
      ![
        layout.rotateX,
        layout.rotateY,
        layout.depth,
        layout.perspective,
        layout.skewX,
        layout.skewY,
      ].some((value) => value) &&
      [layout.scaleX, layout.scaleY].every(
        (value) => value === undefined || value === 1,
      ) &&
      !layout.locked &&
      layout.visible &&
      layout.opacity === 1 &&
      Object.entries(resolved.styles).every(
        ([key, value]) =>
          (key === "position" && value === "absolute") ||
          (key === "backgroundColor" && value === "transparent") ||
          (key === "padding" && [0, "0", "0px"].includes(value)),
      ) &&
      group.children.every((id) => {
        const child = resolveElement(tree.elementsById[id], bp);
        return (
          !child.layout.locked &&
          !(layout.rotation && (child.layout.rotateX || child.layout.rotateY))
        );
      })
    );
  });
}
function flattenPosition(child: ElementNode, group: ElementNode) {
  const c = child.layout,
    g = group.layout,
    angle = (g.rotation * Math.PI) / 180;
  const dx = c.x + c.w / 2 - g.w / 2,
    dy = c.y + c.h / 2 - g.h / 2;
  return {
    x: g.x + g.w / 2 + dx * Math.cos(angle) - dy * Math.sin(angle) - c.w / 2,
    y: g.y + g.h / 2 + dx * Math.sin(angle) + dy * Math.cos(angle) - c.h / 2,
    rotation: c.rotation + g.rotation,
  };
}
export function ungroupElements(tree: Tree) {
  if (!canUngroup(tree)) return null;
  const group = tree.elementsById[tree.selectedElementIds[0]];
  const elementsById = { ...tree.elementsById },
    parentId = group.parentId;
  const siblings = parentId
    ? elementsById[parentId].children
    : tree.rootIds.includes(group.id)
      ? tree.rootIds
      : tree.globalRootIds;
  const keys = [
    ...new Set([
      "tablet",
      "mobile",
      ...responsiveKeys([
        group,
        ...group.children.map((id) => elementsById[id]),
      ]),
    ]),
  ] as Exclude<Breakpoint, "base">[];
  for (const id of group.children) {
    const node = elementsById[id];
    elementsById[id] = {
      ...node,
      parentId,
      layout: {
        ...node.layout,
        ...flattenPosition(node, group),
      },
      responsive: Object.fromEntries(
        keys.map((bp) => [
          bp,
          {
            ...node.responsive?.[bp],
            layout: {
              ...node.responsive?.[bp]?.layout,
              ...flattenPosition(
                resolveElement(node, bp),
                resolveElement(group, bp),
              ),
            },
          },
        ]),
      ),
    };
  }
  const next = siblings.flatMap((id) =>
    id === group.id ? group.children : [id],
  );
  delete elementsById[group.id];
  if (parentId)
    elementsById[parentId] = { ...elementsById[parentId], children: next };
  return {
    elementsById,
    rootIds: !parentId && siblings === tree.rootIds ? next : tree.rootIds,
    globalRootIds:
      !parentId && siblings === tree.globalRootIds ? next : tree.globalRootIds,
    selectedElementIds: group.children,
    selectedElementId: group.children[0] || null,
  };
}
