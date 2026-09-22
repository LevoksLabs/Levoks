import { ElementNode, Page, DesignToken, DesignAsset } from "@/types";
import { FlowGraph, Flow, ApiCallStep, NavigateStep } from "@/types/ir";
import { ElementWiring, EndpointTarget, PageTarget } from "./connectionResolver";
import { generateAnimationCSS, generateAnimationUseEffect } from "./animationCodegen";

import { assetElement, assetFonts } from "@/lib/design-assets";
import { SHAPE_PATHS } from "@/lib/shape-paths";
import { ICON_PATHS } from "@/lib/icon-paths";
import { widgetNumber, tabLabels } from "@/lib/widgets";
import { widgetRuntime } from "./widget-runtime";
import { resolveElement, vectorPath, motionFrames, fontFamily } from "@/lib/design";

type FrontendCodeResult = {
    files: Record<string, string>;
    previewHtml: string;
};

const escapeMarkup = (value: unknown) => String(value ?? "").replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;").replace(/'/g, "&#39;").replace(/{/g, "&#123;").replace(/}/g, "&#125;");
const safeUrl = (value: unknown) => {
    const raw = String(value || "").trim();
    return /^(https?:\/\/|\/(?!\/)|#|data:image\/(png|jpeg|webp|gif);base64,)/i.test(raw) ? escapeMarkup(raw) : "";
};

const SAFE_UNIT = (value: string | number | undefined, fallback?: string): string | undefined => {
    if (value === undefined || value === null) return fallback;
    if (typeof value === "number") return `${(value / 16).toFixed(3)}rem`;
    const raw = String(value).trim();
    if (!raw) return fallback;
    if (/^\d+(\.\d+)?px$/.test(raw)) {
        const num = Number(raw.replace("px", ""));
        return `${(num / 16).toFixed(3)}rem`;
    }
    return raw;
};

const cssFromStyles = (styles: Record<string, string | number>): string => {
    const entries = Object.entries(styles)
        .filter(([_, v]) => v !== undefined && v !== null && String(v).trim() !== "")
        .map(([k, v]) => {
            const prop = k.replace(/[A-Z]/g, (m) => `-${m.toLowerCase()}`);
            if (!/^[a-zA-Z-]+$/.test(k) || /[<>;{}]/.test(String(v))) return "";
            const val = typeof v === "number" && ["opacity", "zIndex", "fontWeight", "lineHeight", "flexGrow", "flexShrink", "order"].includes(k) ? String(v) : SAFE_UNIT(v, String(v));
            return `${prop}: ${k === "fontFamily" ? fontFamily(val) : val};`;
        });
    return entries.join(" ");
};

const textContent = (el: ElementNode, fallback: string): string => {
    const raw = el.props?.content ?? el.props?.label;
    if (raw === undefined || raw === null || String(raw).trim() === "") return fallback;
    return escapeMarkup(raw);
};

const classNameFor = (el: ElementNode) => `el-${el.id.replace(/[^a-zA-Z0-9_-]/g, "")}`;

// ─── Flow-based event handler generation ───

/**
 * Generate a multi-step event handler attribute from a Flow.
 * Produces chained async logic: api_call → check response → navigate.
 */
function flowHandlerAttr(
    el: ElementNode,
    flowMap: Map<string, Flow>,
    mode: "html" | "jsx"
): string {
    const flow = flowMap.get(el.id);
    if (!flow || mode === "html") return "";

    const steps = flow.steps;
    if (steps.length === 0) return "";

    // Build handler body from ordered steps
    const bodyLines: string[] = [];
    if (el.type === "form") bodyLines.push(`const body = Object.fromEntries(new FormData(target).entries());
        for (const input of target.elements) {
            if (!input.name || input.disabled) continue;
            if (input.type === "number" || input.type === "range") {
                if (input.value === "") delete body[input.name];
                else if (!Number.isFinite(input.valueAsNumber)) throw new Error("Enter a valid number for " + input.name);
                else body[input.name] = input.valueAsNumber;
            }
            if (input.type === "checkbox") body[input.name] = input.checked;
            if (input.type === "file" && input.files?.length) throw new Error("File uploads require a storage endpoint.");
        }`);

    for (let i = 0; i < steps.length; i++) {
        const step = steps[i];

        if (step.type === "api_call") {
            const apiStep = step as ApiCallStep;
            if (el.type === "form") {
                const isGet = apiStep.method === "GET";
                bodyLines.push(`const payload${i} = { ...body }; const path${i} = ${JSON.stringify(apiStep.endpoint)}.replace(/:([A-Za-z_][A-Za-z0-9_]*)/g, (_, key) => { const value = payload${i}[key]; if (value === undefined || value === "") throw new Error("Missing " + key); delete payload${i}[key]; return encodeURIComponent(String(value)); });`);
                const path = `path${i}` + (isGet ? ` + "?" + new URLSearchParams(payload${i}).toString()` : "");
                bodyLines.push(`await apiFetch(${path}, { method: ${JSON.stringify(apiStep.method)}${isGet ? "" : `, body: JSON.stringify(payload${i})`} }, ${apiStep.servicePort});`);
            } else {
                // Non-form click: send empty body or no body
                const bodyArg = apiStep.method === "GET" || apiStep.method === "DELETE"
                    ? "" : ", body: JSON.stringify({})";
                bodyLines.push(`await apiFetch(${JSON.stringify(apiStep.endpoint)}, { method: ${JSON.stringify(apiStep.method)}${bodyArg} }, ${apiStep.servicePort});`);
            }
        } else if (step.type === "navigate") {
            const navStep = step as NavigateStep;
            // If there was a preceding API call, only navigate on success
            bodyLines.push(`window.location.href = ${JSON.stringify(navStep.pageRoute)};`);
        }
    }

    if (bodyLines.length === 0) return "";

    const eventName = flow.trigger.event === "submit" ? "onSubmit" : "onClick";
    const handlerBody = bodyLines.join(" ");

    return ` ${eventName}={async (e) => { e.preventDefault(); const target = e.currentTarget; if (target.dataset.busy) return; target.dataset.busy = "true"; target.setAttribute("aria-busy", "true"); setStatus("Working…"); try { ${handlerBody} setStatus("Done"); } catch (err) { setStatus(err instanceof Error ? err.message : "Request failed. Please try again."); } finally { delete target.dataset.busy; target.removeAttribute("aria-busy"); } }}`;
}

// ─── Legacy wiringAttr (used only for preview HTML mode, kept for compat) ───
function wiringAttr(
    el: ElementNode,
    flowMap: Map<string, Flow>,
    mode: "html" | "jsx"
): string {
    return flowHandlerAttr(el, flowMap, mode);
}

const renderElement = (
    el: ElementNode,
    isRoot: boolean,
    cssOut: Set<string>,
    mode: "html" | "jsx",
    flowMap: Map<string, Flow> = new Map(),
    elementsById: Record<string, ElementNode> = {}
): string => {

    const className = classNameFor(el);
    const tag = (() => {
        if (el.type === "section") return "section";
        if (el.type === "container" || el.type === "stack" || el.type === "columns") return "div";
        if (el.type === "form") return "form";
        if (el.type === "title") {
            const lvl = Math.min(Math.max(Number(el.props?.level) || 2, 1), 6);
            return `h${lvl}`;
        }
        if (el.type === "text" || el.type === "paragraph") return "p";
        if (el.type === "button") return "button";
        if (el.type === "image") return "img";
        if (el.type === "video") return "video";
        if (el.type === "menu") return "nav";
        if (el.type === "divider") return "hr";
        if (el.type === "frame") return "iframe";
        return "div";
    })();

    const baseStyles: Record<string, string | number> = {
        boxSizing: "border-box",
    };

    if (isRoot) {
        baseStyles.position = "absolute";
        baseStyles.left = `${el.layout.x}px`;
        baseStyles.top = `${el.layout.y}px`;
        baseStyles.width = `min(100%, ${el.layout.w}px)`;
        baseStyles.minHeight = `${el.layout.h}px`;
    } else if ((el.styles?.position || el.layout.position) === "absolute") {
        baseStyles.position = "absolute";
        baseStyles.left = `${el.layout.x}px`;
        baseStyles.top = `${el.layout.y}px`;
        baseStyles.width = `min(100%, ${el.layout.w}px)`;
        baseStyles.minHeight = `${el.layout.h}px`;
    }

    if (el.type === "stack") {
        baseStyles.display = "flex";
        baseStyles.flexDirection = "column";
        baseStyles.gap = SAFE_UNIT(el.styles?.gap ?? "16px", "1rem") || "1rem";
    }
    if (el.type === "columns") {
        const count = Number(el.props?.columnCount) || 2;
        baseStyles.display = "grid";
        baseStyles.gridTemplateColumns = `repeat(${count}, minmax(0, 1fr))`;
        baseStyles.gap = SAFE_UNIT(el.styles?.gap ?? "16px", "1rem") || "1rem";
    }
    if (el.type === "container" || el.type === "section") {
        baseStyles.display = baseStyles.display || "flex";
        baseStyles.flexDirection = baseStyles.flexDirection || "column";
        baseStyles.gap = baseStyles.gap || SAFE_UNIT(el.styles?.gap ?? "12px", "0.75rem") || "0.75rem";
    }
    if (el.type === "form") {
        baseStyles.display = "flex";
        baseStyles.flexDirection = "column";
        baseStyles.gap = SAFE_UNIT(el.styles?.gap ?? "8px", "0.5rem") || "0.5rem";
    }
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

    if (!["title", "text", "paragraph"].includes(el.type)) baseStyles.height = `${el.layout.h}px`;
    const mergedStyles = { ...baseStyles, ...(el.styles || {}), ...(!el.layout.visible ? { display: "none" } : {}), opacity: el.layout.opacity, ...(el.layout.rotation ? { transform: `rotate(${el.layout.rotation}deg)` } : {}) };
    const css = cssFromStyles(mergedStyles);
    cssOut.add(`.${className} { ${css} }`);
    for (const breakpoint of ["tablet", "mobile"] as const) {
        if (!el.responsive?.[breakpoint]) continue;
        const resolved = resolveElement(el, breakpoint), layout = resolved.layout;
        const override = { ...resolved.styles, left: `${layout.x}px`, top: `${layout.y}px`, width: `${layout.w}px`, minHeight: `${layout.h}px`, ...(!["title", "text", "paragraph"].includes(el.type) ? { height: `${layout.h}px` } : {}), opacity: layout.opacity, transform: `rotate(${layout.rotation}deg)`, display: layout.visible ? String(resolved.styles.display || baseStyles.display || "block") : "none" };
        cssOut.add(`@media (max-width: ${breakpoint === "tablet" ? 1024 : 600}px) { .page .${className} { ${cssFromStyles(override)} } }`);
    }
    if (el.motion) {
        const keyframes = motionFrames(el.motion).map(frame => `${frame.offset * 100}% { opacity: ${frame.opacity}; transform: ${frame.transform}; }`).join(" ");
        cssOut.add(`@keyframes motion-${className} { ${keyframes} } .${className} { animation: motion-${className} ${el.motion.duration}s ${el.motion.easing} ${el.motion.delay}s ${el.motion.iterations} both; }`);
    }

    const children = (el.type === "tabs" ? [] : el.children || []).map((childId) => {
        const child = elementsById[childId];
        return child ? renderElement(child, false, cssOut, mode, flowMap, elementsById) : "";
    }).join("");
    const clsAttr = mode === "jsx" ? "className" : "class";

    switch (el.type) {
        case "title":
        case "text":
        case "paragraph":
            return `<${tag} ${clsAttr}="${className}"${wiringAttr(el, flowMap, mode)}>${textContent(el, el.type === "title" ? "Heading" : "Text")}</${tag}>`;
        case "button":
            return `<button ${clsAttr}="${className}"${wiringAttr(el, flowMap, mode)}>${textContent(el, "Button")}</button>`;
        case "image":
            return `<img ${clsAttr}="${className}" src="${safeUrl(el.props?.src)}" alt="${escapeMarkup(el.props?.alt)}"${wiringAttr(el, flowMap, mode)} />`;
        case "video":
            return `<video ${clsAttr}="${className}" src="${safeUrl(el.props?.src)}" ${el.props?.autoplay ? (mode === "jsx" ? "autoPlay" : "autoplay") : ""} ${el.props?.loop ? "loop" : ""} ${el.props?.muted ? "muted" : ""} controls></video>`;
        case "menu": {
            const items = String(el.props?.items || "Home,About,Contact").split(",");
            const isVertical = el.props?.menuStyle === "vertical";
            const menuItems = items.map((i) => `<span ${clsAttr}="${className}__item">${escapeMarkup(i.trim())}</span>`).join("");
            cssOut.add(`.${className} { display: flex; gap: ${isVertical ? "0.5rem" : "1.5rem"}; flex-direction: ${isVertical ? "column" : "row"}; align-items: center; }`);
            cssOut.add(`.${className}__item { font-size: 0.9rem; cursor: pointer; }`);
            return `<nav ${clsAttr}="${className}">${menuItems}</nav>`;
        }
        case "divider":
            return `<hr ${clsAttr}="${className}" />`;
        case "frame":
            return `<iframe ${clsAttr}="${className}" src="${safeUrl(el.props?.src)}" sandbox="allow-scripts" title="Embed Frame"></iframe>`;
        case "socialbar": {
            const platforms = ["facebook", "twitter", "instagram", "linkedin", "youtube"].filter((p) => Boolean(el.props?.[p]));
            const icons = platforms.length > 0
                ? platforms.map((p) => `<span ${clsAttr}="${className}__icon">${p[0].toUpperCase()}</span>`).join("")
                : `<span ${clsAttr}="${className}__empty">Add social links</span>`;
            cssOut.add(`.${className} { display: flex; gap: 0.75rem; align-items: center; }`);
            cssOut.add(`.${className}__icon { width: 32px; height: 32px; border-radius: 50%; display: inline-flex; align-items: center; justify-content: center; background: #1f2937; color: #fff; font-size: 0.8rem; }`);
            return `<div ${clsAttr}="${className}">${icons}</div>`;
        }
        case "accordion":
            return `<details ${clsAttr}="${className}"><summary>${escapeMarkup(el.props?.headerText || "Accordion")}</summary><div>${children || "Accordion content"}</div></details>`;
        case "tabs": {
            const labels = tabLabels(el), active = widgetNumber(el.props.activeTab, 0, 0, labels.length - 1);
            cssOut.add(`.${className} > [role="tablist"] { display:flex; gap:4px; border-bottom:1px solid #d1d5db; } .${className} > [role="tablist"] button { border:0; padding:12px 16px; background:transparent; color:inherit; } .${className} [role="tab"][aria-selected="true"] { box-shadow: inset 0 -2px currentColor; font-weight:600; } .${className} > [role="tabpanel"] { position:relative; padding:16px; min-height:120px; } .${className} > [hidden] { display:none !important; }`);
            return `<div ${clsAttr}="${className}" data-levoks-tabs="true" data-active-tab="${active}"><div role="tablist" aria-label="${escapeMarkup(el.label || "Content tabs")}">${labels.map((label, index) => `<button type="button" role="tab" aria-selected="${index === active}" ${mode === "jsx" ? "tabIndex" : "tabindex"}="${index === active ? 0 : -1}">${escapeMarkup(label)}</button>`).join("")}</div>${labels.map((_, index) => `<div role="tabpanel" ${index !== active ? "hidden" : ""}>${el.children[index] && elementsById[el.children[index]] ? renderElement(elementsById[el.children[index]], false, cssOut, mode, flowMap, elementsById) : ""}</div>`).join("")}</div>`;
        }
        case "gallery":
            cssOut.add(`.${className} { display:grid; grid-template-columns:repeat(${widgetNumber(el.props.columns, 3, 1, 8)}, minmax(0, 1fr)); gap:${widgetNumber(el.props.gap, 8, 0, 100)}px; } .${className} > * { position:relative !important; left:auto !important; top:auto !important; width:100%; max-width:100%; }`);
            return `<div ${clsAttr}="${className}">${children}</div>`;
        case "repeater":
            cssOut.add(`.${className} { display:flex; flex-direction:${el.props.direction === "row" ? "row" : "column"}; } .${className} > .repeat-item { position:relative; flex:1; min-width:0; } .${className} > .repeat-item > * { position:relative !important; left:auto !important; top:auto !important; max-width:100%; }`);
            return `<div ${clsAttr}="${className}">${Array.from({ length: widgetNumber(el.props.repeatCount, 3, 1, 20) }, () => `<div ${clsAttr}="repeat-item">${children}</div>`).join("")}</div>`;
        case "form": {
            const requestMethod = String(el.props?.requestMethod || "POST").toUpperCase();
            const htmlMethod = requestMethod === "GET" ? "get" : "post";
            const requestUrl = String(el.props?.requestUrl || "").trim();
            const actionAttr = requestUrl ? ` action="${safeUrl(requestUrl)}"` : "";
            const formHandler = wiringAttr(el, flowMap, mode);
            // If form has a flow, the onSubmit prevents default and uses fetch
            if (formHandler) {
                return `<form ${clsAttr}="${className}"${formHandler}>${children}</form>`;
            }
            return `<form ${clsAttr}="${className}" method="${htmlMethod}" data-request-method="${requestMethod}"${actionAttr}>${children}</form>`;
        }
        case "input": {
            const inputType = escapeMarkup(el.props?.inputType || "text");
            const placeholder = escapeMarkup(el.props?.placeholder || "");
            const name = escapeMarkup(el.props?.name || "").trim();
            const nameAttr = name ? ` name="${name}"` : "";
            const requiredAttr = el.props?.required ? " required" : "";
            const maxLength = Number(el.props?.maxLength);
            const maxLengthAttr = Number.isFinite(maxLength) && maxLength > 0 ? ` ${mode === "jsx" ? "maxLength" : "maxlength"}="${maxLength}"` : "";
            if (inputType === "textarea") {
                return `<textarea ${clsAttr}="${className}"${nameAttr} placeholder="${placeholder}"${requiredAttr}${maxLengthAttr}></textarea>`;
            }
            return `<input ${clsAttr}="${className}" type="${inputType}"${nameAttr} placeholder="${placeholder}"${requiredAttr}${maxLengthAttr} />`;
        }
        case "shape":
            if (el.vector) return `<svg ${clsAttr}="${className}" viewBox="0 0 100 100" preserveAspectRatio="none" role="img" aria-label="${escapeMarkup(el.label || "Vector shape")}"><path d="${vectorPath(el.vector)}" fill="${el.vector.closed ? el.vector.fill : "none"}" stroke="${el.vector.stroke}" ${mode === "jsx" ? "strokeWidth" : "stroke-width"}="${el.vector.strokeWidth}" ${mode === "jsx" ? "vectorEffect" : "vector-effect"}="non-scaling-stroke" /></svg>`;
            if (SHAPE_PATHS[String(el.props.shapeType)]) {
                cssOut.add(`.${className} { background-color: transparent !important; } .${className} path { ${cssFromStyles({ fill: el.styles.backgroundColor || "#6366f1" })} }`);
                for (const bp of ["tablet", "mobile"] as const) if (el.responsive?.[bp]) cssOut.add(`@media (max-width: ${bp === "tablet" ? 1024 : 600}px) { .${className} path { ${cssFromStyles({ fill: resolveElement(el, bp).styles.backgroundColor || "#6366f1" })} } }`);
                return `<div ${clsAttr}="${className}"><svg viewBox="0 0 100 100" width="100%" height="100%" role="img" aria-label="${escapeMarkup(el.label || "Shape")}"><path d="${SHAPE_PATHS[String(el.props.shapeType)]}" /></svg></div>`;
            }
            return `<div ${clsAttr}="${className}"></div>`;
        case "icon":
            cssOut.add(`.${className} { display:flex; align-items:center; justify-content:center; }`);
            return `<div ${clsAttr}="${className}"><svg viewBox="0 0 24 24" width="${widgetNumber(el.props.iconSize, 32, 8, 256)}" height="${widgetNumber(el.props.iconSize, 32, 8, 256)}" fill="${escapeMarkup(el.props.iconColor || "#374151")}" role="img" aria-label="${escapeMarkup(el.label || el.props.icon || "Icon")}"><path d="${ICON_PATHS[String(el.props.icon || "star")] || ICON_PATHS.star}" /></svg></div>`;
        case "spacer":
            return `<div ${clsAttr}="${className}"></div>`;
        default:
            return `<${tag} ${clsAttr}="${className}">${children}</${tag}>`;
    }
};

export function generateFrontendProject(
    elements: ElementNode[],
    globalElements: ElementNode[],
    canvasSettings: { backgroundColor: string; width: number; height: number },
    page?: Page,
    allPages?: Page[],
    wirings?: ElementWiring[],
    flowGraph?: FlowGraph,
    tokens: Record<string, DesignToken> = {},
    assets: Record<string, DesignAsset> = {}
): FrontendCodeResult {
    // Build flow map keyed by trigger elementId (IR-first)
    const flowMap = new Map<string, Flow>();
    if (flowGraph) {
        for (const flow of flowGraph.flows) {
            if (!page || flow.trigger.pageId === page.id) flowMap.set(flow.trigger.elementId, flow);
        }
    } else if (wirings) {
        // Legacy fallback: convert wirings to single-step flows
        for (const w of wirings) {
            const steps: import("@/types/ir").FlowStep[] = [];
            if (w.target.kind === "endpoint") {
                const ep = w.target as EndpointTarget;
                steps.push({
                    type: "api_call",
                    method: ep.method,
                    endpoint: ep.route,
                    serviceName: ep.serviceName,
                    servicePort: ep.servicePort,
                    serviceId: "",
                    blockId: "",
                    authRequired: false,
                });
            } else if (w.target.kind === "page") {
                const pt = w.target as PageTarget;
                steps.push({
                    type: "navigate",
                    pageId: "",
                    pageRoute: pt.pageRoute,
                    pageTitle: pt.pageTitle,
                });
            }
            flowMap.set(w.elementId, {
                id: `compat_${w.elementId}`,
                trigger: {
                    elementId: w.elementId,
                    elementType: w.elementType,
                    pageId: "",
                    pageRoute: "",
                    event: w.elementType === "form" ? "submit" : "click",
                },
                steps,
            });
        }
    }
    const cssParts = new Set<string>();

    const safeGlobal = Array.isArray(globalElements) ? globalElements.map(el => assetElement(el, assets)) : [];

    // In the flat-map model, all elements are passed in the `elements` array
    // Page-specific elements are managed by the caller
    let allElements: ElementNode[] = [];
    const safeElements = Array.isArray(elements) ? elements.map(el => assetElement(el, assets)) : [];
    allElements = [...safeElements];

    const htmlParts: string[] = [];
    const jsxParts: string[] = [];

    // Build elementsById lookup for codegen rendering
    const codegenElementsById: Record<string, ElementNode> = {};
    const addToLookup = (els: ElementNode[]) => { for (const e of els) codegenElementsById[e.id] = e; };
    addToLookup(safeGlobal);
    addToLookup(allElements);

    let expandedCount = 0;
    const countOutput = (element: ElementNode, copies: number, depth: number) => {
        expandedCount += copies;
        if (expandedCount > 10000 || depth > 100) throw new Error("This page expands beyond 10,000 rendered elements or 100 nested levels. Reduce nested repeaters or split the page.");
        const next = copies * (element.type === "repeater" ? widgetNumber(element.props.repeatCount, 3, 1, 20) : 1);
        element.children.forEach(id => { if (codegenElementsById[id]) countOutput(codegenElementsById[id], next, depth + 1); });
    };
    [...safeGlobal, ...allElements].filter(el => !el.parentId).forEach(el => countOutput(el, 1, 0));

    safeGlobal.filter(el => !el.parentId).forEach((el) => {
        htmlParts.push(renderElement(el, false, cssParts, "html", flowMap, codegenElementsById));
        jsxParts.push(renderElement(el, false, cssParts, "jsx", flowMap, codegenElementsById));
    });
    allElements.filter(el => !el.parentId).forEach((el) => {
        htmlParts.push(renderElement(el, true, cssParts, "html", flowMap, codegenElementsById));
        jsxParts.push(renderElement(el, true, cssParts, "jsx", flowMap, codegenElementsById));
    });

    // ─── Animation CSS Generation ───
    const animKeyframes = new Set<string>();
    const animClassRules: string[] = [];
    const animJsElements: { className: string; anim: import("@/types").AnimationData }[] = [];

    const collectAnimations = (els: ElementNode[]) => {
        for (const el of els) {
            if (!el.motion && el.animation && el.animation.type !== "none") {
                const cn = classNameFor(el);
                const { keyframeCss, classCss, needsJsSetup: needsJs } = generateAnimationCSS(el, cn);
                if (keyframeCss) animKeyframes.add(keyframeCss);
                if (classCss) animClassRules.push(classCss);
                if (needsJs) animJsElements.push({ className: cn, anim: el.animation });
            }
            // Recurse into children
            for (const childId of (el.children || [])) {
                const child = codegenElementsById[childId];
                if (child) collectAnimations([child]);
            }
        }
    };
    collectAnimations([...safeGlobal, ...allElements].filter(el => !el.parentId));

    const animationCss = animKeyframes.size > 0 || animClassRules.length > 0
        ? `\n/* ═══ Animations ═══ */\n${Array.from(animKeyframes).join("\n")}\n${animClassRules.join("\n")}`
        : "";

    const canvasWidth = Math.max(320, Number(canvasSettings.width) || 1280);
    const canvasHeight = Math.max(200, Number(canvasSettings.height) || 900);
    const bg = String(canvasSettings.backgroundColor || "#ffffff").replace(/[<>;{}]/g, "");

    const hasResponsive = [...safeGlobal, ...allElements].some(element => element.responsive && Object.keys(element.responsive).length);
    const baseCss = `
@import url('https://fonts.googleapis.com/css2?family=Inter:wght@300;400;500;600;700&display=swap');
${assetFonts(assets)}
:root { ${Object.entries(tokens).map(([id, token]) => `--lv-${id}: ${token.value};`).join(" ")} }
* { box-sizing: border-box; margin: 0; padding: 0; }
body { margin: 0; font-family: Inter, system-ui, -apple-system, sans-serif; background: ${bg}; color: #0f172a; }
.page { position: relative; width: min(100%, ${canvasWidth}px); min-height: ${canvasHeight}px; margin: 0 auto; padding: 2rem; background: ${bg}; overflow: hidden; }
img { max-width: 100%; height: auto; display: block; }
button { cursor: pointer; font-family: inherit; }
input, textarea, select { font-family: inherit; }
input:focus, textarea:focus { outline: 2px solid #6366f1; outline-offset: -1px; }
hr { border: none; }
${hasResponsive ? "" : '@media (max-width: 640px) { .page { padding: 1rem; display: flex; flex-direction: column; gap: 1rem; } .page > [class^="el-"] { position: relative !important; left: auto !important; top: auto !important; max-width: 100%; } }'}
@media (prefers-reduced-motion: reduce) { *, *::before, *::after { animation: none !important; transition: none !important; } }
`;

    const css = `${baseCss}\n${Array.from(cssParts).join("\n")}${animationCss}`;

    const body = `<div class="page">${htmlParts.join("")}</div>`;
    const previewHtml = `<!doctype html>
<html>
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <title>${escapeMarkup(page?.title || "Preview")}</title>
    <style>${css}</style>
  </head>
  <body style="background:${bg};">${body}<script>${widgetRuntime}; setupWidgets(document);</script></body>
</html>`;

    // Determine if we need the API client import
    const hasEndpointWirings = flowGraph
        ? flowGraph.flows.some((f) => f.steps.some((s) => s.type === "api_call"))
        : wirings && wirings.some((w) => w.target.kind === "endpoint");
    const apiImport = hasEndpointWirings ? 'import { apiFetch } from "./api.js";\n' : "";
    // Generate animation useEffect code (inlined into App.jsx)
    const animUseEffect = generateAnimationUseEffect(animJsElements);
    const needsReactImport = animUseEffect.length > 0;

    const appJsx = `
import React from "react";
import "./styles.css";
${apiImport}
${widgetRuntime}
export default function App() {
  const [status, setStatus] = React.useState("");
  const rootRef = React.useRef(null);
  React.useEffect(() => setupWidgets(rootRef.current), []);
${animUseEffect}
  return (
    <div className="page" ref={rootRef}>
      ${jsxParts.join("\n      ")}
      <div role="status" aria-live="polite" style={{ position: "fixed", bottom: 16, right: 16, zIndex: 1000, background: "#fff", color: "#111" }}>{status}</div>
    </div>
  );
}
`.trim();

    const files: Record<string, string> = {
        "package.json": JSON.stringify({
            name: "frontend-project",
            private: true,
            version: "0.0.1",
            type: "module",
            scripts: {
                dev: "vite",
                build: "vite build",
                preview: "vite preview",
            },
            dependencies: {
                react: "^18.2.0",
                "react-dom": "^18.2.0",
            },
            devDependencies: {
                vite: "^5.0.0",
                "@vitejs/plugin-react": "^4.2.0",
            },
        }, null, 2),
        "vite.config.js": `import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

export default defineConfig({
  plugins: [react()],
});`,
        "index.html": `<!doctype html>
<html>
  <head>
    <meta charset="UTF-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0" />
    <title>${escapeMarkup(page?.title || "Frontend Project")}</title>
  </head>
  <body>
    <div id="root"></div>
    <script type="module" src="/src/main.jsx"></script>
  </body>
</html>`,
        "src/main.jsx": `import React from "react";
import ReactDOM from "react-dom/client";
import App from "./App.jsx";

ReactDOM.createRoot(document.getElementById("root")).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>
);`,
        "src/App.jsx": appJsx,
        "src/styles.css": css,
        "README.md": `# Frontend Project\n\nGenerated from the visual editor.\n\n## Getting Started\n\n\`\`\`bash\nnpm install\nnpm run dev\n\`\`\`\n`,
    };

    // Generate API client helper if any endpoint wirings exist
    if (hasEndpointWirings) {
        // Collect unique service base URLs
        const servicePorts = new Set<number>();
        if (flowGraph) {
            for (const flow of flowGraph.flows) {
                for (const step of flow.steps) {
                    if (step.type === "api_call") {
                        servicePorts.add((step as ApiCallStep).servicePort);
                    }
                }
            }
        } else if (wirings) {
            for (const w of wirings) {
                if (w.target.kind === "endpoint") {
                    servicePorts.add((w.target as EndpointTarget).servicePort);
                }
            }
        }
        const defaultPort = servicePorts.values().next().value || 3001;

        files["src/api.js"] = `// ═══════════════════════════════════════
// API Client — Auto-generated from routing
// ═══════════════════════════════════════

const API_BASE = import.meta.env.VITE_API_URL || "http://localhost:${defaultPort}";

/**
 * Make an API request to the backend.
 * @param {string} path - API path, e.g. "/api/users"
 * @param {RequestInit} options - fetch options (method, body, headers, etc.)
 * @returns {Promise<any>} parsed JSON response
 */
export async function apiFetch(path, options = {}) {
  const url = \`\${API_BASE}\${path}\`;
  const res = await fetch(url, {
    headers: {
      "Content-Type": "application/json",
      ...options.headers,
    },
    ...options,
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({ error: res.statusText }));
    throw new Error(err.error || err.message || \`Request failed: \${res.status}\`);
  }
  return res.json();
}
`;
    }

    return { files, previewHtml };
}
