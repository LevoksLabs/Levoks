import type { ElementNode } from "@/types";
import { definitionFor } from "./registry";

export type SemanticTree =
  | string
  | { slot: true }
  | {
      tag: string;
      attrs: Record<string, string | number | boolean>;
      children: SemanticTree[];
    };
const node = (
  tag: string,
  attrs: Record<string, string | number | boolean> = {},
  children: SemanticTree[] = [],
): SemanticTree => ({ tag, attrs, children });
export const escapeMarkup = (value: unknown) =>
  String(value ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;")
    .replace(/{/g, "&#123;")
    .replace(/}/g, "&#125;");
export function safeElementUrl(value: unknown) {
  const raw = String(value || "").trim();
  return /^(https?:\/\/|\/(?!\/)|#|data:image\/(png|jpeg|webp|gif);base64,)/i.test(
    raw,
  )
    ? raw
    : "";
}

/** An allowlisted tree, never raw HTML or executable project source. */
export function nativeTree(element: ElementNode): SemanticTree {
  const d = definitionFor(element);
  if (!d || d.render !== "native")
    throw new Error("Missing native element definition.");
  const p = element.props;
  const attrs: Record<string, string | number | boolean> = {};
  for (const key of [
    "name",
    "title",
    "alt",
    "type",
    "role",
    "placeholder",
    "required",
    "disabled",
    "multiple",
    "accept",
    "min",
    "max",
    "step",
    "rows",
    "controls",
    "loop",
    "muted",
    "htmlFor",
    "open",
  ]) {
    if (p[key] !== undefined) attrs[key] = p[key];
  }
  for (const key of ["src", "href"])
    if (p[key] !== undefined) attrs[key] = safeElementUrl(p[key]);
  attrs.id = element.id;
  if (p.ariaLabel) attrs["aria-label"] = String(p.ariaLabel);
  if (p.ariaBusy) attrs["aria-busy"] = "true";
  if (element.accessibility?.label)
    attrs["aria-label"] = element.accessibility.label;
  if (element.accessibility?.description)
    attrs["aria-description"] = element.accessibility.description;
  if (element.accessibility?.hidden) attrs["aria-hidden"] = "true";
  if (d.tag === "input" && p.type !== "file" && p.value !== undefined)
    attrs.defaultValue = p.value;
  if (d.tag === "textarea") attrs.defaultValue = String(p.value || "");
  if (d.tag === "input" && ["checkbox", "radio"].includes(String(p.type)))
    attrs.defaultChecked = Boolean(p.checked);
  if (d.generate === "iframe") {
    attrs.sandbox = "allow-scripts";
    attrs.referrerPolicy = "no-referrer";
  }
  const children: SemanticTree[] = [];
  if (d.generate === "dialog") {
    attrs["data-levoks-dialog"] = "true";
    children.push(
      node("button", { type: "button", "data-dialog-open": "true" }, [
        String(p.triggerText),
      ]),
    );
    children.push(
      node("dialog", { "aria-label": String(p.ariaLabel || "Dialog") }, [
        node("button", { type: "button", "data-dialog-close": "true" }, [
          "Close",
        ]),
        String(p.content || ""),
        { slot: true },
      ]),
    );
  } else if (d.generate === "carousel") {
    attrs["data-levoks-carousel"] = "true";
    children.push(
      node(
        "button",
        { type: "button", "data-slide": "-1", "aria-label": "Previous slide" },
        ["Previous"],
      ),
    );
    children.push(
      node(
        "div",
        { "aria-live": "polite" },
        String(p.items || "")
          .split("\n")
          .filter(Boolean)
          .map((item, index) =>
            node("div", { "data-slide-panel": "true", hidden: index > 0 }, [
              item,
            ]),
          ),
      ),
    );
    children.push(
      node(
        "button",
        { type: "button", "data-slide": "1", "aria-label": "Next slide" },
        ["Next"],
      ),
    );
  } else if (d.generate === "select") {
    children.push(
      ...String(p.options || "")
        .split("\n")
        .filter(Boolean)
        .map((option) => node("option", { value: option }, [option])),
    );
  } else if (d.generate === "list") {
    children.push(
      ...String(p.items || "")
        .split("\n")
        .filter(Boolean)
        .map((item) => node("li", {}, [item])),
    );
  } else if (d.generate === "table") {
    children.push(node("caption", {}, [String(p.caption || "Table")]));
    children.push(
      node("thead", {}, [
        node(
          "tr",
          {},
          String(p.columns || "")
            .split(",")
            .map((title) => node("th", { scope: "col" }, [title.trim()])),
        ),
      ]),
    );
    children.push(
      node(
        "tbody",
        {},
        String(p.rows || "")
          .split("\n")
          .filter(Boolean)
          .map((row) =>
            node(
              "tr",
              {},
              row.split(",").map((cell) => node("td", {}, [cell.trim()])),
            ),
          ),
      ),
    );
  } else if (d.generate === "progress") {
    attrs.value = Number(p.value);
    attrs.max = Number(p.max);
  } else {
    if (d.generate === "details")
      children.push(node("summary", {}, [String(p.summary || "Details")]));
    if (p.content !== undefined) children.push(String(p.content));
    if (d.children) children.push({ slot: true });
  }
  return node(d.tag!, attrs, children);
}
const voidTags = new Set(["input", "img", "hr", "br"]);
/** Both output syntaxes consume exactly the tree used by the editor renderer. */
export function nativeMarkup(
  tree: SemanticTree,
  mode: "html" | "jsx",
  slots = "",
  rootAttributes = "",
): string {
  if (typeof tree === "string") return escapeMarkup(tree);
  if ("slot" in tree) return slots;
  const attrs = Object.entries(tree.attrs)
    .filter(([, value]) => value !== false)
    .map(([key, value]) => {
      if (tree.tag === "textarea" && key === "defaultValue" && mode === "html")
        return "";
      const name =
        mode === "jsx"
          ? key
          : {
              defaultValue: "value",
              defaultChecked: "checked",
              htmlFor: "for",
              referrerPolicy: "referrerpolicy",
            }[key] || key.toLowerCase();
      return value === true ? ` ${name}` : ` ${name}="${escapeMarkup(value)}"`;
    })
    .join("");
  if (voidTags.has(tree.tag)) return `<${tree.tag}${attrs}${rootAttributes} />`;
  const content =
    tree.tag === "textarea" && mode === "html"
      ? escapeMarkup(tree.attrs.defaultValue)
      : tree.children.map((child) => nativeMarkup(child, mode, slots)).join("");
  return `<${tree.tag}${attrs}${rootAttributes}>${content}</${tree.tag}>`;
}
