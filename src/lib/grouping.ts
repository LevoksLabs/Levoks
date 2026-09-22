import type { ElementNode } from "@/types";
import { DEFAULT_LAYOUT } from "./defaults";
import { generateElementId } from "./idGenerator";
import { resolveElement, type Breakpoint } from "./design";
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
        (!node.parentId ||
          ["base", "tablet", "mobile"].every((bp) => {
            const resolved = resolveElement(node, bp as Breakpoint);
            return (
              (resolved.styles.position || resolved.layout.position) ===
              "absolute"
            );
          })) &&
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
  const base = bounds("base"),
    tablet = bounds("tablet"),
    mobile = bounds("mobile");
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
    responsive: { tablet: { layout: tablet }, mobile: { layout: mobile } },
  };
  for (const node of nodes) {
    const t = resolveElement(node, "tablet"),
      m = resolveElement(node, "mobile");
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
      responsive: {
        tablet: {
          ...node.responsive?.tablet,
          layout: {
            ...node.responsive?.tablet?.layout,
            x: t.layout.x - tablet.x,
            y: t.layout.y - tablet.y,
          },
        },
        mobile: {
          ...node.responsive?.mobile,
          layout: {
            ...node.responsive?.mobile?.layout,
            x: m.layout.x - mobile.x,
            y: m.layout.y - mobile.y,
          },
        },
      },
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
  return (["base", "tablet", "mobile"] as const).every((bp) => {
    const resolved = resolveElement(group, bp),
      layout = resolved.layout;
    return (
      !layout.locked &&
      layout.visible &&
      layout.opacity === 1 &&
      layout.rotation === 0 &&
      Object.entries(resolved.styles).every(
        ([key, value]) =>
          (key === "position" && value === "absolute") ||
          (key === "backgroundColor" && value === "transparent") ||
          (key === "padding" && [0, "0", "0px"].includes(value)),
      ) &&
      group.children.every(
        (id) => !resolveElement(tree.elementsById[id], bp).layout.locked,
      )
    );
  });
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
  const t = resolveElement(group, "tablet"),
    m = resolveElement(group, "mobile");
  for (const id of group.children) {
    const node = elementsById[id],
      nt = resolveElement(node, "tablet"),
      nm = resolveElement(node, "mobile");
    elementsById[id] = {
      ...node,
      parentId,
      layout: {
        ...node.layout,
        x: node.layout.x + group.layout.x,
        y: node.layout.y + group.layout.y,
      },
      responsive: {
        tablet: {
          ...node.responsive?.tablet,
          layout: {
            ...node.responsive?.tablet?.layout,
            x: nt.layout.x + t.layout.x,
            y: nt.layout.y + t.layout.y,
          },
        },
        mobile: {
          ...node.responsive?.mobile,
          layout: {
            ...node.responsive?.mobile?.layout,
            x: nm.layout.x + m.layout.x,
            y: nm.layout.y + m.layout.y,
          },
        },
      },
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
