import type { ElementNode, ElementLayout } from "@/types";
export type Breakpoint = "base" | "tablet" | "mobile" | `custom_${number}`;
export type CustomBreakpoint = { name: string; width: number };
export const BREAKPOINTS = { base: 1920, tablet: 1024, mobile: 600 } as const;
export const breakpointWidth = (key: Breakpoint) => key.startsWith("custom_") ? Number(key.slice(7)) : BREAKPOINTS[key as keyof typeof BREAKPOINTS];
export function responsiveKeys(nodes: ElementNode[]): Exclude<Breakpoint, "base">[] {
  return [...new Set(nodes.flatMap(node => Object.keys(node.responsive || {})))].sort((a,b) => breakpointWidth(b as Breakpoint)-breakpointWidth(a as Breakpoint)) as Exclude<Breakpoint,"base">[];
}
export function breakpointForWidth(width: number, custom: CustomBreakpoint[] = []): Breakpoint {
  return (["tablet", "mobile", ...custom.map(bp => `custom_${bp.width}`)] as Breakpoint[])
    .sort((a,b) => breakpointWidth(a)-breakpointWidth(b)).find(key => width <= breakpointWidth(key)) || "base";
}
export function canvasSize(base: { width: number; height: number }, breakpoint: Breakpoint, viewport: { width: number; height: number } | null) {
  return viewport ?? { width: breakpoint.startsWith("custom_") ? breakpointWidth(breakpoint) : breakpoint === "mobile" ? 390 : breakpoint === "tablet" ? 820 : Math.max(320,base.width || 1920), height: Math.max(200,base.height || 900) };
}
export function resolveElement(element: ElementNode, breakpoint: Breakpoint): ElementNode {
  if (breakpoint === "base" || !element.responsive) return element;
  const overrides = responsiveKeys([element]).filter(key => breakpointWidth(key) >= breakpointWidth(breakpoint)).map(key => element.responsive![key]!);
  return { ...element, layout: Object.assign({},element.layout,...overrides.map(o=>o.layout)), styles: Object.assign({},element.styles,...overrides.map(o=>o.styles)) };
}
export function patchElement(
  element: ElementNode,
  updates: Partial<ElementNode>,
  breakpoint: Breakpoint,
): ElementNode {
  const result = {
    ...element,
    ...updates,
    layout: { ...element.layout, ...updates.layout },
    styles: { ...element.styles, ...updates.styles },
    props: { ...element.props, ...updates.props },
    id: element.id,
    parentId: element.parentId,
  };
  if (breakpoint !== "base" && (updates.layout || updates.styles)) {
    const current = element.responsive?.[breakpoint] || {};
    const resolved = resolveElement(element, breakpoint);
    const changedStyles = Object.fromEntries(
      Object.entries(updates.styles || {}).filter(
        ([key, value]) => value !== resolved.styles[key],
      ),
    );
    const changedLayout = Object.fromEntries(
      Object.entries(updates.layout || {}).filter(
        ([key, value]) => value !== resolved.layout[key as keyof ElementLayout],
      ),
    );
    result.layout = element.layout;
    result.styles = element.styles;
    result.responsive = {
      ...element.responsive,
      [breakpoint]: {
        layout: { ...current.layout, ...changedLayout },
        styles: { ...current.styles, ...changedStyles },
      },
    };
  }
  if (element.component && !updates.component) {
    const changed: string[] = [];
    for (const key of ["props", "styles", "layout"] as const)
      for (const [field, value] of Object.entries(updates[key] || {})) {
        if (
          (breakpoint === "base" || key === "props") &&
          value !== element[key][field as keyof (typeof element)[typeof key]]
        )
          changed.push(`${key}.${field}`);
      }
    for (const key of ["vector", "motion", "animation", "responsive", "formCondition"] as const)
      if (key in updates) changed.push(key);
    result.component = {
      ...element.component,
      overrides: [
        ...new Set([
          ...element.component.overrides,
          ...changed,
          ...(breakpoint !== "base" ? ["responsive"] : []),
        ]),
      ],
    };
  }
  return result;
}
export function patchLayout(
  element: ElementNode,
  layout: Partial<ElementLayout>,
  breakpoint: Breakpoint,
) {
  return patchElement(element, { layout: layout as ElementLayout }, breakpoint);
}
export function elementTransform(element: Pick<ElementNode,"layout" | "styles">) {
  const l = element.layout;
  return [l.perspective ? `perspective(${l.perspective}px)` : "", l.depth ? `translateZ(${l.depth}px)` : "", l.rotateX ? `rotateX(${l.rotateX}deg)` : "", l.rotateY ? `rotateY(${l.rotateY}deg)` : "", l.rotation ? `rotate(${l.rotation}deg)` : "", l.skewX || l.skewY ? `skew(${l.skewX || 0}deg,${l.skewY || 0}deg)` : "", l.scaleX !== undefined || l.scaleY !== undefined ? `scale(${l.scaleX ?? 1},${l.scaleY ?? 1})` : "", element.styles.transform === "none" ? "" : element.styles.transform || ""].filter(Boolean).join(" ") || "none";
}
export function vectorPath(vector: NonNullable<ElementNode["vector"]>) {
  const points = vector.points;
  if (!points.length) return "";
  let path = `M ${points[0].x} ${points[0].y}`;
  const segment = (
    from: (typeof points)[number],
    to: (typeof points)[number],
  ) =>
    from.outX !== undefined || to.inX !== undefined
      ? ` C ${from.outX ?? from.x} ${from.outY ?? from.y} ${to.inX ?? to.x} ${to.inY ?? to.y} ${to.x} ${to.y}`
      : ` L ${to.x} ${to.y}`;
  for (let i = 1; i < points.length; i++)
    path += segment(points[i - 1], points[i]);
  if (vector.closed)
    path += segment(points[points.length - 1], points[0]) + " Z";
  return path;
}
export function motionFrames(motion: NonNullable<ElementNode["motion"]>) {
  return [...motion.frames]
    .sort((a, b) => a.time - b.time)
    .map((frame) => ({
      offset: frame.time,
      opacity: frame.opacity,
      transform: `translate(${frame.x}px, ${frame.y}px) rotate(${frame.rotation}deg) scale(${frame.scale})`,
    }));
}

export function fontFamily(value: unknown) {
  const font = String(value || "inherit");
  return /,|\(|^(inherit|initial|unset|serif|sans-serif|monospace|system-ui)$/.test(font) ? font : `${font}, system-ui, sans-serif`;
}
