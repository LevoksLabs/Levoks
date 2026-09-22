import type { DesignAsset, ElementNode } from "@/types";
export function assetElement(element: ElementNode, assets: Record<string, DesignAsset> = {}): ElementNode {
  const asset = assets[String(element.props.assetId || "")];
  return asset && !element.props.src ? { ...element, props: { ...element.props, src: asset.source } } : element;
}
export function assetFonts(assets: Record<string, DesignAsset> = {}) {
  return Object.entries(assets).filter(([, asset]) => asset.mime.startsWith("font/")).map(([id, asset]) => `@font-face { font-family: "LevoksFont-${id}"; src: url("${asset.source}") format("${asset.mime.slice(5)}"); font-display: swap; }`).join("\n");
}
