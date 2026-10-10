import type { ElementNode } from "@/types";
import { elementTransform, fontFamily } from "./design";
import { widgetNumber } from "./widgets";
import { nativeFieldStyles } from "./elements/native";
export function elementStyles(
  el: ElementNode,
  isRoot: boolean,
): Record<string, string | number> {
  const baseStyles: Record<string, string | number> = {
    boxSizing: "border-box",
  };

  if (isRoot) {
    baseStyles.position = "absolute";
    baseStyles.left = `${el.layout.x}px`;
    baseStyles.top = `${el.layout.y}px`;
    baseStyles.width = `${el.layout.w}px`;
    baseStyles.minHeight = `${el.layout.h}px`;
  } else {
    baseStyles.position = String(
      el.styles?.position || el.layout.position || "static",
    );
    if (baseStyles.position !== "static") {
      baseStyles.left = `${el.layout.x}px`;
      baseStyles.top = `${el.layout.y}px`;
    }
    baseStyles.width = el.styles?.width || `${el.layout.w}px`;
    if (["static", "relative"].includes(String(baseStyles.position))) {
      baseStyles.maxWidth = "100%";
      baseStyles.minWidth = "0";
      baseStyles.flexShrink = "0";
    }
    baseStyles.minHeight = `${el.layout.h}px`;
  }

  if (el.type === "stack") {
    baseStyles.display = "flex";
    baseStyles.flexDirection = "column";
    baseStyles.gap = el.styles?.gap ?? "16px";
  }
  if (el.type === "columns") {
    const count = Number(el.props?.columnCount) || 2;
    baseStyles.display = "grid";
    baseStyles.gridTemplateColumns = `repeat(${count}, minmax(0, 1fr))`;
    baseStyles.gap = el.styles?.gap ?? "16px";
  }
  if (el.type === "container" || el.type === "section") {
    baseStyles.display = baseStyles.display || "flex";
    baseStyles.flexDirection = baseStyles.flexDirection || "column";
    baseStyles.gap = baseStyles.gap || el.styles?.gap || "12px";
  }
  if (el.type === "form") {
    baseStyles.display = "flex";
    baseStyles.flexDirection = "column";
    baseStyles.gap = el.styles?.gap ?? "8px";
  }
  if (el.type === "gallery") {
    baseStyles.display = "grid";
    baseStyles.gridTemplateColumns = `repeat(${widgetNumber(el.props.columns, 3, 1, 8)}, minmax(0, 1fr))`;
    baseStyles.gap = `${widgetNumber(el.props.gap, 8, 0, 100)}px`;
  }
  if (el.type === "repeater") {
    baseStyles.display = "flex";
    baseStyles.flexDirection = el.props.direction === "row" ? "row" : "column";
    baseStyles.gap = "12px";
  }
  if (el.type === "menu")
    baseStyles.flexDirection =
      el.props.menuStyle === "vertical" ? "column" : "row";
  if (el.type === "socialbar")
    baseStyles["--lv-social-size"] =
      `${Math.max(8, Math.min(128, Number(el.props.iconSize) || 24))}px`;
  if (el.type === "input") {
    baseStyles.width = baseStyles.width || "100%";
    baseStyles.padding = el.styles?.padding || "12px 16px";
    baseStyles.border = el.styles?.border || "1px solid #d1d5db";
    baseStyles.borderRadius = el.styles?.borderRadius || "8px";
    baseStyles.fontSize = el.styles?.fontSize || "14px";
    baseStyles.backgroundColor = el.styles?.backgroundColor || "#ffffff";
    baseStyles.color = "#1a1a2e";
  }
  if (el.type === "button") {
    baseStyles.display = "inline-flex";
    baseStyles.alignItems = "center";
    baseStyles.justifyContent = "center";
    baseStyles.border = el.styles?.border || "none";
    baseStyles.padding = el.styles?.padding || "12px 24px";
    baseStyles.borderRadius = el.styles?.borderRadius || "6px";
    baseStyles.fontSize = el.styles?.fontSize || "14px";
    baseStyles.fontWeight = el.styles?.fontWeight || "500";
  }

  if (!["title", "text", "paragraph"].includes(el.type))
    baseStyles.height = `${el.layout.h}px`;
  if (
    ["form", "section", "container", "stack", "columns"].includes(el.type) &&
    el.children.length
  )
    baseStyles.height = "auto";
  if (el.type === "spacer") {
    baseStyles.height = `${widgetNumber(el.props.spacerHeight, 40, 4, 500)}px`;
    delete baseStyles.minHeight;
  }
  if (el.styles.height && !el.styles.minHeight) delete baseStyles.minHeight;
  return {
    ...baseStyles,
    fontFamily: fontFamily(el.styles.fontFamily),
    ...(el.type === "image"
      ? {
          objectFit: String(el.props.objectFit || "cover"),
          objectPosition: String(el.props.objectPosition || "50% 50%"),
        }
      : {}),
    ...(el.type === "button" && el.props.hoverBg
      ? { "--button-hover": String(el.props.hoverBg) }
      : {}),
    ...(el.styles || {}),
    ...nativeFieldStyles(el),
    ...(!el.layout.visible ? { display: "none" } : {}),
    opacity: el.layout.opacity,
    transform: elementTransform(el),
    "--lv-base-transform":
      elementTransform(el) === "none"
        ? "translate(0px, 0px)"
        : elementTransform(el),
  };
}
