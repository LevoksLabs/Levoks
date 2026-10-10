import { projectivePlane } from "./projective-plane";

/** Measure the actual projected corners; CSS origins, ancestors and perspective
 * are resolved by the browser. Zero-size probes never participate in flow. */
export function screenPlane(node: HTMLElement) {
  const position = node.style.getPropertyValue("position"),
    priority = node.style.getPropertyPriority("position");
  const temporary = getComputedStyle(node).position === "static";
  if (temporary) node.style.setProperty("position", "relative", "important");
  const w = node.offsetWidth,
    h = node.offsetHeight;
  const probes = [
    [0, 0],
    [w, 0],
    [w, h],
    [0, h],
  ].map(([x, y]) => {
    const probe = document.createElement("span");
    probe.style.cssText = `position:absolute!important;left:${x - node.clientLeft + node.scrollLeft}px!important;top:${y - node.clientTop + node.scrollTop}px!important;width:0!important;height:0!important;min-width:0!important;min-height:0!important;margin:0!important;padding:0!important;border:0!important;transform:none!important;pointer-events:none!important;visibility:hidden!important;`;
    node.appendChild(probe);
    return probe;
  });
  try {
    return projectivePlane(
      probes.map((probe) => {
        const r = probe.getBoundingClientRect();
        return { x: r.left, y: r.top };
      }),
      w,
      h,
    );
  } finally {
    probes.forEach((probe) => probe.remove());
    if (temporary) {
      if (position) node.style.setProperty("position", position, priority);
      else node.style.removeProperty("position");
    }
  }
}

/** CSS translations and transform origins cancel for affine pointer deltas. */
export function screenMatrix(node: HTMLElement) {
  let matrix = new DOMMatrix();
  for (
    let current: HTMLElement | null = node;
    current;
    current = current.parentElement
  ) {
    const transform = getComputedStyle(current).transform;
    if (transform !== "none")
      matrix = new DOMMatrix(transform).multiply(matrix);
  }
  return new DOMMatrix([matrix.a, matrix.b, matrix.c, matrix.d, 0, 0]);
}

export function localDelta(node: HTMLElement, x: number, y: number) {
  return new DOMPoint(x, y).matrixTransform(screenMatrix(node).inverse());
}

/** Recover the transformed border-box origin from its four corners and AABB. */
export function localPoint(node: HTMLElement, x: number, y: number) {
  return screenPlane(node).toLocal(x, y);
}

export function childPosition(node: HTMLElement, parent: HTMLElement) {
  const css = getComputedStyle(node);
  const marginLeft = parseFloat(css.marginLeft) || 0,
    marginTop = parseFloat(css.marginTop) || 0;
  const transform = node.style.getPropertyValue("transform"),
    priority = node.style.getPropertyPriority("transform");
  // The layout origin is independent of the child's own transform/origin.
  // Temporarily neutralize it before projecting through the parent's plane.
  node.style.setProperty("transform", "none", "important");
  try {
    const origin = screenPlane(node).toScreen(0, 0),
      local = localPoint(parent, origin.x, origin.y);
    return {
      x: local.x - parent.clientLeft + parent.scrollLeft - marginLeft,
      y: local.y - parent.clientTop + parent.scrollTop - marginTop,
    };
  } finally {
    if (transform) node.style.setProperty("transform", transform, priority);
    else node.style.removeProperty("transform");
  }
}
