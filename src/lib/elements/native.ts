import type { ElementNode } from "@/types";
import { definitionFor } from "./registry";
import { embedAttributes } from "./embed";
import { ICON_PATHS } from "@/lib/icon-paths";
import { selectChoices } from "./select-options";

export type SemanticTree =
  | string
  | { slot: true }
  | {
      tag: string;
      attrs: Record<string, string | number | boolean | string[]>;
      children: SemanticTree[];
    };
const node = (
  tag: string,
  attrs: Record<string, string | number | boolean | string[]> = {},
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
/** Preserve saved redirect buttons through the shared canvas/HTML/React tree. */
export function buttonHref(element: ElementNode) {
  return safeElementUrl(element.props.href || (element.actions?.type === "redirect" ? element.actions.target : ""));
}

/** An allowlisted tree, never raw HTML or executable project source. */
export function nativeTree(element: ElementNode): SemanticTree {
  if (element.type === "button") {
    const p = element.props, disabled = Boolean(p.disabled || p.loading), href = buttonHref(element);
    const attrs: Record<string, string | number | boolean> = { id: element.id, "data-button": "true", "aria-busy": Boolean(p.loading) };
    if (p.hoverBg) attrs["data-button-hover"] = "true";
    if (element.accessibility?.label) attrs["aria-label"] = element.accessibility.label;
    if (href) { attrs.role = "link"; if (!disabled) attrs.href = href; else { attrs["aria-disabled"] = "true"; attrs.tabIndex = -1; } }
    else { attrs.type = String(p.type || "submit"); attrs.disabled = disabled; }
    const children: SemanticTree[] = [String(p.loading ? p.loadingLabel || "Loading…" : p.label || "Button")];
    if (p.icon && ICON_PATHS[String(p.icon)]) {
      const icon = node("svg", { viewBox: "0 0 24 24", width: 16, height: 16, fill: "currentColor", "aria-hidden": "true" }, [node("path", { d: ICON_PATHS[String(p.icon)] })]);
      if (p.iconPosition === "right") children.push(icon); else children.unshift(icon);
    }
    return node(href ? "a" : "button", attrs, children);
  }
  const legacyInput = element.type === "input";
  const d = legacyInput ? { ...definitionFor(element)!, render: "native", tag: element.props.inputType === "textarea" ? "textarea" : "input", generate: "tag", children: false } : definitionFor(element);
  if (!d || d.render !== "native")
    throw new Error("Missing native element definition.");
  const p = legacyInput ? { ...element.props, type: element.props.inputType || "text" } : element.props;
  const attrs: Record<string, string | number | boolean | string[]> = {};
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
    "readOnly",
    "pattern",
    "minLength",
    "maxLength",
  ]) {
    if (["pattern", "minLength", "maxLength"].includes(key) && p[key] === "") continue;
    if (p[key] !== undefined) attrs[key] = p[key];
  }
  for (const key of ["src", "href"])
    if (p[key] !== undefined && safeElementUrl(p[key])) attrs[key] = safeElementUrl(p[key]);
  attrs.id = element.id;
  if (d.tag === "input" && p.type === "file") attrs["data-levoks-file-max-bytes"] = Number(p.maxFileKB ?? 256) * 1024;
  if (p.ariaLabel) attrs["aria-label"] = String(p.ariaLabel);
  if (p.ariaBusy) attrs["aria-busy"] = "true";
  if (element.accessibility?.label)
    attrs["aria-label"] = element.accessibility.label;
  if (element.accessibility?.description)
    attrs["aria-description"] = element.accessibility.description;
  if (element.accessibility?.hidden) attrs["aria-hidden"] = "true";
  if (p.error) { attrs["aria-invalid"] = "true"; attrs["data-error-message"] = String(p.error); }
  if (p.error || p.helperText) attrs["aria-describedby"] = `${element.id}-help`;
  if (d.tag === "input" && p.type !== "file" && p.value !== undefined)
    attrs.defaultValue = p.value;
  if (d.tag === "textarea") attrs.defaultValue = String(p.value || "");
  if (d.tag === "input" && ["checkbox", "radio"].includes(String(p.type)))
    attrs.defaultChecked = Boolean(p.checked);
  if (d.generate === "iframe") {
    Object.assign(attrs, embedAttributes(p));
    if (attrs.srcDoc) delete attrs.src;
  }
  if (d.tag === "input" && ["checkbox", "radio"].includes(String(p.type))) {
    // The label is the styled element; the native control retains group semantics.
    const label = String(p.label ?? (p.type === "radio" ? "Option" : element.label || "Option"));
    if (!element.accessibility?.label && label) delete attrs["aria-label"];
    return node("label", { id: element.id, "data-choice": String(p.type) }, [
      node("input", { ...attrs, id: `${element.id}-control` }), node("span", {}, [label]),
    ]);
  }
  const children: SemanticTree[] = [];
  if (d.tag === "fieldset") {
    delete attrs.required;
    if (p.legend) {
      children.push(node("legend", {}, [String(p.legend)]));
      if (!element.accessibility?.label) delete attrs["aria-label"];
    }
  }
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
    if (p.placeholder) children.push(node("option", { value: "", disabled: true }, [String(p.placeholder)]));
    if (p.value !== undefined && !p.multiple) attrs.defaultValue = String(p.value);
    if (p.multiple) attrs.defaultValue = String(p.selectedValues || "").split("\n").filter(Boolean);
    children.push(
      ...selectChoices(p).map(choice => node("option", { value: choice.value, disabled: choice.disabled }, [choice.label])),
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
  if (["input", "textarea", "select"].includes(d.tag!) && (p.label || p.helperText || p.error)) {
    if (p.label && !element.accessibility?.label) delete attrs["aria-label"];
    return node("div", { id: element.id, "data-field": "true" }, [
      ...(p.label ? [node("label", { htmlFor: `${element.id}-control` }, [String(p.label)])] : []),
      node(d.tag!, { ...attrs, id: `${element.id}-control` }, children),
      ...(p.error || p.helperText ? [node("small", { id: `${element.id}-help`, ...(p.error ? { role: "alert" } : {}) }, [String(p.error || p.helperText)])] : []),
    ]);
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
      if (tree.tag === "select" && key === "defaultValue") return mode === "jsx" ? ` defaultValue={${JSON.stringify(value).replaceAll("<", "\\u003c")}}` : "";
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
  const selected = Array.isArray(tree.attrs.defaultValue) ? tree.attrs.defaultValue : [String(tree.attrs.defaultValue)];
  const children = tree.tag === "select" && mode === "html" && tree.attrs.defaultValue !== undefined ? tree.children.map(child => typeof child === "object" && "tag" in child && child.tag === "option" ? { ...child, attrs: { ...child.attrs, selected: selected.includes(String(child.attrs.value)) } } : child) : tree.children;
  const content =
    tree.tag === "textarea" && mode === "html"
      ? escapeMarkup(tree.attrs.defaultValue)
      : children.map((child) => nativeMarkup(child, mode, slots)).join("");
  return `<${tree.tag}${attrs}${rootAttributes}>${content}</${tree.tag}>`;
}
