"use client";
import { createElement, type ReactNode } from "react";
import type { ElementNode } from "@/types";
import { nativeTree, type SemanticTree } from "@/lib/elements/native";
import { useEditorStore } from "@/store/editorStore";
import { semanticStyleParts } from "@/lib/property-values";

export default function SemanticElement({
  element,
  children,
  interactive = false,
}: {
  element: ElementNode;
  children: ReactNode;
  interactive?: boolean;
}) {
  const definition = useEditorStore(
    (s) => s.customElements[element.definitionId || ""],
  );
  if (element.type === "custom")
    return (
      <div className="semantic-boundary">
        <strong>{definition?.name || "Custom element"}</strong>
        <p>Source runs in the exported application.</p>
        {Object.entries(element.props).map(([key, value]) => (
          <div key={key}>
            {key}: {String(value)}
          </div>
        ))}
        {children}
      </div>
    );
  const render = (tree: SemanticTree, key: number, root = false): ReactNode => {
    if (typeof tree === "string") return tree;
    if ("slot" in tree) return children;
    const click = (event: React.MouseEvent<HTMLElement>) => {
      const target = event.target as HTMLElement;
      if (target.closest("[data-dialog-open]"))
        event.currentTarget.querySelector("dialog")?.showModal();
      if (target.closest("[data-dialog-close]"))
        event.currentTarget.querySelector("dialog")?.close();
      const slide = target.closest<HTMLElement>("[data-slide]");
      if (slide) {
        const panels = Array.from(
          event.currentTarget.querySelectorAll<HTMLElement>(
            "[data-slide-panel]",
          ),
        );
        const active = panels.findIndex((p) => !p.hidden);
        const next =
          (active + Number(slide.dataset.slide) + panels.length) %
          panels.length;
        panels.forEach((panel, index) => (panel.hidden = index !== next));
      }
      if (target.closest("a")) event.preventDefault();
    };
    const props = {
      ...tree.attrs,
      key,
      ...(!interactive && tree.tag === "input" && tree.attrs.defaultChecked !== undefined
        ? { checked: Boolean(tree.attrs.defaultChecked), defaultChecked: undefined, readOnly: true } : {}),
      ...(tree.tag === "iframe" && !interactive ? { tabIndex: -1 } : {}),
      ...(!interactive && ["input", "textarea", "select", "button", "a", "summary"].includes(tree.tag)
        ? { inert: true }
        : {}),
      ...(root
        ? {
            onClick: interactive ? click : undefined,
            style: {
              color: "inherit",
              font: "inherit",
              ...semanticStyleParts(element.styles).surface,
              ...(element.type === "button" && element.props.hoverBg ? { "--button-hover": String(element.props.hoverBg) } : {}),
              width: "100%",
              height: "100%",
              minWidth: 0,
              boxSizing: "border-box",
              ...(tree.tag === "iframe" && !interactive ? { pointerEvents: "none" } : {}),
            },
          }
        : {}),
    };
    return ["input", "img", "hr"].includes(tree.tag)
      ? createElement(tree.tag, props)
      : createElement(
          tree.tag,
          props,
          ...tree.children.map((child, index) => render(child, index)),
        );
  };
  return render(nativeTree(element), 0, true);
}
