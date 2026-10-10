"use client";
import { createElement, useRef, useEffect, useCallback, type ReactNode } from "react";
import { setupNativeWidgets } from "@/lib/native-widget-runtime";
import type { ElementNode } from "@/types";
import { nativeTree, type SemanticTree } from "@/lib/elements/native";
import { useEditorStore } from "@/store/editorStore";
import { elementStyles } from "@/lib/element-styles";
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
  const elements = useEditorStore(s=>s.elementsById);
  const rootRef=useRef<HTMLElement>(null);
  const attachRoot=useCallback((node:HTMLElement | null)=>{rootRef.current=node;},[]);
  useEffect(()=>{if(!interactive || !rootRef.current) return;return setupNativeWidgets(rootRef.current,false);},[interactive,element.id,element.props]);
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
  return <SemanticRoot element={element} interactive={interactive} attachRoot={attachRoot} tree={nativeTree(element,undefined,elements)}>{children}</SemanticRoot>;
}
function SemanticRoot({element,interactive,attachRoot,tree,children}:{element:ElementNode;interactive:boolean;attachRoot:(node:HTMLElement | null)=>void;tree:SemanticTree;children:ReactNode}) {
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
            ref:attachRoot,
            onClick: interactive ? click : undefined,
            style: {
              color: "inherit",
              font: "inherit",
              ...semanticStyleParts(elementStyles(element,false)).surface,
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
  return render(tree,0,true);
}
