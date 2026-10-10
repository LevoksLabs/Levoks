import { ElementNode, Page, DesignToken, DesignAsset } from "@/types";
import { nativeMarkup, nativeTree, nativeFieldStyles } from "@/lib/elements/native";
import { customIdentifier, type CustomDefinition } from "@/lib/elements/custom";
import { FlowGraph, Flow, ApiCallStep, NavigateStep } from "@/types/ir";
import { ElementWiring, EndpointTarget, PageTarget } from "./connectionResolver";
import { generateAnimationCSS, generateAnimationSetup, generateAnimationUseEffect } from "./animationCodegen";

import { assetElement, assetFonts } from "@/lib/design-assets";
import { SHAPE_PATHS } from "@/lib/shape-paths";
import { ICON_PATHS } from "@/lib/icon-paths";
import { widgetNumber, tabLabels, tabsCSS, choiceCSS } from "@/lib/widgets";
import { orderedStyles } from "@/lib/property-values";
import { embedAttributes } from "@/lib/elements/embed";
import { widgetRuntime } from "./widget-runtime";
import { resolveElement, vectorPath, motionFrames, fontFamily } from "@/lib/design";
import { liveDataRuntime, liveDataCSS } from "./live-data";
import type { ResolvedDataSource } from "@/lib/live-data";
import { formValueRuntime } from "./form-values";
import { conditionDefault } from "@/lib/form-conditions";
import { formConditionsCSS, formConditionsRuntime } from "./form-conditions";

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
    const entries = Object.entries(orderedStyles(styles))
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
    if (raw === undefined || raw === null) return fallback;
    return escapeMarkup(raw);
};

const classNameFor = (el: ElementNode) => `el-${el.id.replace(/[^a-zA-Z0-9_-]/g, "")}`;

// ─── Flow-based event handler generation ───

/**
 * Generate a multi-step event handler attribute from a Flow.
 * Produces chained async logic: api_call → check response → navigate.
 */
function flowHandler(
    el: ElementNode,
    flowMap: Map<string, Flow>,
    mode: "html" | "jsx"
): string {
    const flow = flowMap.get(el.id);
    if (!flow) return "";

    const steps = flow.steps;
    if (steps.length === 0) return "";

    // Build handler body from ordered steps
    const bodyLines: string[] = [];
    if (steps.some(step => step.type === "api_call")) bodyLines.push("let result;");
    if (el.type === "form" && steps.some(step => step.type === "api_call" && !step.requestMappings)) bodyLines.push(`const body = Object.fromEntries(new FormData(target).entries());
        for (const input of target.elements) {
            if (!input.name || input.disabled || input.matches?.(':disabled')) continue;
            if (input.type === 'checkbox' && input.closest?.('[data-checkbox-group]')) continue;
            const value = await formControlValue(input, target);
            if (value !== undefined) body[input.name] = value;
            else delete body[input.name];
        }`);

    for (let i = 0; i < steps.length; i++) {
        const step = steps[i];

        if (step.type === "api_call") {
            const apiStep = step as ApiCallStep;
            bodyLines.push(`failure = ${JSON.stringify(apiStep.failure || {})};`);
            if (apiStep.requestMappings) {
                bodyLines.push(`const values${i} = { body: {}, query: {}, path: {}, header: {} };
                  for (const mapping of ${JSON.stringify(apiStep.requestMappings)}) {
                    let value;
                    if (mapping.source.kind === "literal") value = mapping.source.value;
                    else if (mapping.source.kind === "response") value = result?.[mapping.responseName];
                    else {
                      const input = Array.from(target.elements || []).find(input => input.id === mapping.source.elementId || input.id === mapping.source.elementId + "-control");
                      if (input) {
                        value = await formControlValue(input, target);
                      }
                    }
                    if (value === undefined || value === null || value === "" || mapping.required && Array.isArray(value) && !value.length) {
                      if (mapping.required) throw new Error("Missing " + mapping.name);
                      continue;
                    }
                    if (mapping.type === "number") { value = Number(value); if (!Number.isFinite(value)) throw new Error("Invalid number: " + mapping.name); }
                    if (mapping.type === "boolean") { if (![true, false, "true", "false"].includes(value)) throw new Error("Invalid boolean: " + mapping.name); value = value === true || value === "true"; }
                    if (mapping.type === "string" || mapping.type === "objectId" || mapping.type === "date") value = String(value);
                    if (mapping.type === "array" && (!Array.isArray(value) || mapping.source.kind === "element" && value.length > 200)) throw new Error("Invalid array: " + mapping.name);
                    if (mapping.location === "header") {
                      value = String(value);
                      if (value.length > 4096 || /[^\\x20-\\x7e]/.test(value)) throw new Error("Invalid header: " + mapping.name);
                    }
                    values${i}[mapping.location][mapping.name] = value;
                  }
                  const path${i} = ${JSON.stringify(apiStep.endpoint)}.replace(/:([A-Za-z_][A-Za-z0-9_]*)/g, (_, key) => { const value = values${i}.path[key]; if (value === undefined) throw new Error("Missing " + key); return encodeURIComponent(String(value)); });
                  const query${i} = new URLSearchParams(values${i}.query).toString();
                  result = await apiFetch(path${i} + (query${i} ? "?" + query${i} : ""), {method: ${JSON.stringify(apiStep.method)}, headers: values${i}.header${apiStep.method === "GET" ? "" : `, body: JSON.stringify(values${i}.body)`}}, ${apiStep.servicePort});`);
            } else if (el.type === "form") {
                const isGet = apiStep.method === "GET";
                bodyLines.push(`const payload${i} = { ...body }; const path${i} = ${JSON.stringify(apiStep.endpoint)}.replace(/:([A-Za-z_][A-Za-z0-9_]*)/g, (_, key) => { const value = payload${i}[key]; if (value === undefined || value === "") throw new Error("Missing " + key); delete payload${i}[key]; return encodeURIComponent(String(value)); });`);
                const path = `path${i}` + (isGet ? ` + "?" + new URLSearchParams(payload${i}).toString()` : "");
                bodyLines.push(`result = await apiFetch(${path}, { method: ${JSON.stringify(apiStep.method)}${isGet ? "" : `, body: JSON.stringify(payload${i})`} }, ${apiStep.servicePort});`);
            } else {
                // Non-form click: send empty body or no body
                const bodyArg = apiStep.method === "GET" || apiStep.method === "DELETE"
                    ? "" : ", body: JSON.stringify({})";
                bodyLines.push(`result = await apiFetch(${JSON.stringify(apiStep.endpoint)}, { method: ${JSON.stringify(apiStep.method)}${bodyArg} }, ${apiStep.servicePort});`);
            }
            if (apiStep.responseMappings?.length) bodyLines.push(`setFlowValues(previous => { const next = {...previous}; for (const mapping of ${JSON.stringify(apiStep.responseMappings)}) { const value = result?.[mapping.name]; next[mapping.elementId] = value == null ? "" : typeof value === "object" ? JSON.stringify(value) : String(value); } return next; });`);
        } else if (step.type === "navigate") {
            const navStep = step as NavigateStep;
            // If there was a preceding API call, only navigate on success
            bodyLines.push(mode === "jsx"
                ? `window.location.href = ${JSON.stringify(navStep.pageRoute)};`
                : `window.parent.postMessage({ type: "levoks:preview:navigate", pageId: ${JSON.stringify(navStep.pageId)} }, "*");`);
        }
    }

    if (bodyLines.length === 0) return "";

    const handlerBody = (el.type === "form" ? `if (target.querySelector?.('[data-form-condition]')) { syncFormConditions(target); if (!target.reportValidity()) return; }` + formValueRuntime : "") + bodyLines.join(" ");

    return `async (e) => { e.preventDefault(); const target = e.currentTarget; if (target.dataset.busy || target.disabled || target.getAttribute?.("aria-disabled") === "true") return; target.dataset.busy = "true"; target.setAttribute("aria-busy", "true"); setStatus("Working…"); let failure = {}; try { ${handlerBody} ${el.type === "form" && el.props.resetOnSuccess ? "target.reset();" : ""} setStatus(${JSON.stringify(el.type === "form" ? String(el.props.successMessage || "Done") : "Done")}); } catch (err) { setStatus(failure.message || (err instanceof Error ? err.message : "Request failed. Please try again.")); ${mode === "jsx" ? "if (failure.pageRoute) window.location.href = failure.pageRoute;" : 'if (failure.pageId) window.parent.postMessage({type: "levoks:preview:navigate", pageId: failure.pageId}, "*");'} } finally { delete target.dataset.busy; target.removeAttribute("aria-busy"); } }`;
}

// Both preview and exported React handlers use the same generated flow body.
function wiringAttr(
    el: ElementNode,
    flowMap: Map<string, Flow>,
    mode: "html" | "jsx"
): string {
    if (mode === "html") return "";
    const handler = flowHandler(el, flowMap, mode);
    const event = el.type === "form" ? "onSubmit" : "onClick";
    const explicit = Object.entries(el.events || {}).filter(([key]) => !handler || key !== event).map(([key, action]) => ` ${key}={${semanticHandler(action)}}`).join("");
    return (handler ? ` ${event}={${handler}}` : "") + explicit;
}

function semanticHandler(action: NonNullable<ElementNode["events"]>[string]) {
    return `(e) => { e.preventDefault?.(); ${action.action === "navigate" ? `navigateToPage(${JSON.stringify(action.target)});` : `document.querySelector(${JSON.stringify(".el-" + action.target)})?.scrollIntoView({behavior: "smooth"});`} }`;
}

function elementStyles(el: ElementNode, isRoot: boolean): Record<string, string | number> {
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
        baseStyles.position = String(el.styles?.position || el.layout.position || "static");
        if (baseStyles.position !== "static") {
            baseStyles.left = `${el.layout.x}px`;
            baseStyles.top = `${el.layout.y}px`;
        }
        baseStyles.width = el.styles?.width || `${el.layout.w}px`;
        if (["static", "relative"].includes(String(baseStyles.position))) { baseStyles.maxWidth = "100%"; baseStyles.minWidth = "0"; baseStyles.flexShrink = "0"; }
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
    if (["form", "section", "container", "stack", "columns"].includes(el.type) && el.children.length) baseStyles.height = "auto";
    if (el.styles.height && !el.styles.minHeight) delete baseStyles.minHeight;
    return { ...baseStyles, ...(el.type === "image" ? { objectFit: String(el.props.objectFit || "cover"), objectPosition: String(el.props.objectPosition || "50% 50%") } : {}), ...(el.type === "button" && el.props.hoverBg ? { "--button-hover": String(el.props.hoverBg) } : {}), ...(el.styles || {}), ...nativeFieldStyles(el), ...(!el.layout.visible ? { display: "none" } : {}), opacity: el.layout.opacity, ...(el.layout.rotation ? { transform: `rotate(${el.layout.rotation}deg)` } : {}) };
}

const renderElementBody = (
    el: ElementNode,
    isRoot: boolean,
    cssOut: Set<string>,
    mode: "html" | "jsx",
    flowMap: Map<string, Flow> = new Map(),
    elementsById: Record<string, ElementNode> = {},
    sources: Record<string, ResolvedDataSource> = {},
    recordFields?: Record<string, string>
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

    const mergedStyles = elementStyles(el, isRoot);
    const css = cssFromStyles(mergedStyles);
    cssOut.add(`.${className} { ${css} }`);
    for (const breakpoint of ["tablet", "mobile"] as const) {
        if (!el.responsive?.[breakpoint]) continue;
        const current = elementStyles(resolveElement(el, breakpoint), isRoot);
        const inherited = elementStyles(resolveElement(el, breakpoint === "mobile" ? "tablet" : "base"), isRoot);
        const changed = new Set([...Object.keys(inherited), ...Object.keys(current)].filter(key => current[key] !== inherited[key]));
        // CSS shorthands reset their longhands. Reapply the resolved longhands
        // when a breakpoint changes a shorthand, even if those values inherit.
        for (const shorthand of ["background", "border", "padding", "margin", "font"]) {
            if (changed.has(shorthand)) Object.keys(current).filter(key => key.startsWith(shorthand)).forEach(key => changed.add(key));
        }
        const override = Object.fromEntries([...changed]
            .map(key => [key, current[key] === undefined || current[key] === "" ? "initial" : current[key]]));
        // Keep inherited styles in the cascade; changing X must not freeze font,
        // flow height, or the other desktop/tablet properties at this breakpoint.
        if (Object.keys(override).length) cssOut.add(`@media (max-width: ${breakpoint === "tablet" ? 1024 : 600}px) { .page .${className} { ${cssFromStyles(override)} } }`);
    }
    if (el.motion) {
        const keyframes = motionFrames(el.motion).map(frame => `${frame.offset * 100}% { opacity: ${frame.opacity}; transform: ${frame.transform}; }`).join(" ");
        cssOut.add(`@keyframes motion-${className} { ${keyframes} } .${className} { animation: motion-${className} ${el.motion.duration}s ${el.motion.easing} ${el.motion.delay}s ${el.motion.iterations} both; }`);
    }

    const children = (el.type === "tabs" ? [] : el.children || []).map((childId) => {
        const child = elementsById[childId];
        return child ? renderElement(child, false, cssOut, mode, flowMap, elementsById, sources, recordFields) : "";
    }).join("");
    const clsAttr = mode === "jsx" ? "className" : "class";

    if (["native", "button", "input"].includes(el.type)) { cssOut.add(choiceCSS); const native = nativeMarkup(nativeTree(el, conditionDefault(el, elementsById),elementsById), mode, children, ` ${clsAttr}="${className}"${wiringAttr(el, flowMap, mode)}`); return mode === "jsx" && recordFields ? native.replace(`id="${escapeMarkup(el.id)}"`, `id={record._id + ${JSON.stringify("-" + el.id)}}`) : native; }
    if (el.type === "custom") {
        if (mode === "html") return `<div ${clsAttr}="${className}">${escapeMarkup(el.label)} — custom source runs in the exported application.</div>`;
        return `<div className="${className}"><${customIdentifier(el.definitionId!)} {...${JSON.stringify(el.props)}}${wiringAttr(el, flowMap, mode)}>${children}</${customIdentifier(el.definitionId!)}></div>`;
    }

    switch (el.type) {
        case "title":
        case "text":
        case "paragraph":
            return `<${tag} ${clsAttr}="${className}">${mode === "jsx" && el.dataField && recordFields ? `{recordText(record, ${JSON.stringify(recordFields[el.dataField])})}` : mode === "jsx" ? `{flowValues[${JSON.stringify(el.id)}] ?? ${JSON.stringify(String(el.props.content ?? el.props.label ?? (el.type === "title" ? "Heading" : "Text"))).replace(/</g, "\\u003c")}}` : textContent(el, el.type === "title" ? "Heading" : "Text")}</${tag}>`;
        case "image":
            return `<img ${clsAttr}="${className}" src="${safeUrl(el.props?.src)}" alt="${escapeMarkup(el.props?.alt)}" />`;
        case "video":
            return `<video ${clsAttr}="${className}" src="${safeUrl(el.props?.src)}" poster="${safeUrl(el.props.poster)}" ${el.props?.autoplay ? (mode === "jsx" ? "autoPlay" : "autoplay") : ""} ${el.props?.loop ? "loop" : ""} ${el.props?.muted ? "muted" : ""} ${el.props.controls ? "controls" : ""}></video>`;
        case "menu": {
            const items = String(el.props?.items || "Home,About,Contact").split(",");
            const isVertical = el.props?.menuStyle === "vertical";
            const itemTag = flowMap.has(el.id) ? "button" : "span";
            const menuItems = items.map((i) => `<${itemTag}${itemTag === "button" ? ' type="button"' : ""} ${clsAttr}="${className}__item">${escapeMarkup(i.trim())}</${itemTag}>`).join("");
            cssOut.add(`.${className} { display: flex; gap: ${isVertical ? "0.5rem" : "1.5rem"}; flex-direction: ${isVertical ? "column" : "row"}; align-items: center; }`);
            cssOut.add(`.${className}__item { font-size: 0.9rem; cursor: pointer; border:0; background:none; color:inherit; }`);
            return `<nav ${clsAttr}="${className}">${menuItems}</nav>`;
        }
        case "divider":
            return `<hr ${clsAttr}="${className}" />`;
        case "frame":
            return nativeMarkup({ tag: "iframe", attrs: embedAttributes(el.props), children: [] }, mode, "", ` ${clsAttr}="${className}"`);
        case "socialbar": {
            const platforms = ["facebook", "twitter", "instagram", "linkedin", "youtube"].filter((p) => Boolean(el.props?.[p]));
            const iconTag = flowMap.has(el.id) ? "button" : "span";
            const icons = platforms.length > 0
                ? platforms.map((p) => `<${iconTag}${iconTag === "button" ? ' type="button"' : ""} aria-label="${p}" ${clsAttr}="${className}__icon">${p[0].toUpperCase()}</${iconTag}>`).join("")
                : `<span ${clsAttr}="${className}__empty">Add social links</span>`;
            cssOut.add(`.${className} { display: flex; gap: 0.75rem; align-items: center; }`);
            cssOut.add(`.${className}__icon { width: 32px; height: 32px; border-radius: 50%; display: inline-flex; align-items: center; justify-content: center; background: #1f2937; color: #fff; font-size: 0.8rem; }`);
            return `<div ${clsAttr}="${className}">${icons}</div>`;
        }
        case "accordion":
            return `<details ${clsAttr}="${className}"${el.props.expanded ? " open" : ""}><summary>${escapeMarkup(el.props?.headerText || "Accordion")}</summary><div>${children}</div></details>`;
        case "tabs": {
            const labels = tabLabels(el), active = widgetNumber(el.props.activeTab, 0, 0, labels.length - 1);
            cssOut.add(tabsCSS(`.${className}`));
            return `<div ${clsAttr}="${className}" data-levoks-tabs="true" data-active-tab="${active}"><div role="tablist" aria-label="${escapeMarkup(el.label || "Content tabs")}">${labels.map((label, index) => `<button type="button" role="tab" aria-selected="${index === active}" ${mode === "jsx" ? "tabIndex" : "tabindex"}="${index === active ? 0 : -1}">${escapeMarkup(label)}</button>`).join("")}</div>${labels.map((_, index) => `<div role="tabpanel" ${mode === "jsx" ? "tabIndex" : "tabindex"}="0" ${index !== active ? "hidden" : ""}>${el.children[index] && elementsById[el.children[index]] ? renderElement(elementsById[el.children[index]], false, cssOut, mode, flowMap, elementsById, sources, recordFields) : escapeMarkup(String(el.props.tabContents || "").split("\n")[index] || "")}</div>`).join("")}</div>`;
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
            const formHandler = "";
            // If form has a flow, the onSubmit prevents default and uses fetch
            if (flowMap.has(el.id)) {
                return `<form ${clsAttr}="${className}"${formHandler}>${children}</form>`;
            }
            return `<form ${clsAttr}="${className}" method="${htmlMethod}" data-request-method="${requestMethod}"${actionAttr}>${children}</form>`;
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

function renderElement(el: ElementNode, isRoot: boolean, cssOut: Set<string>, mode: "html" | "jsx", flowMap: Map<string, Flow> = new Map(), elementsById: Record<string, ElementNode> = {}, sources: Record<string, ResolvedDataSource> = {}, recordFields?: Record<string, string>): string {
    let markup = renderElementBody(el, isRoot, cssOut, mode, flowMap, elementsById, sources, recordFields);
    const attrs = (el.type === "custom" ? "" : wiringAttr(el, flowMap, mode)) + (mode === "jsx" && recordFields ? ` id={record._id + ${JSON.stringify("-" + el.id)}}` : ` id="${escapeMarkup(el.id)}"`) + (el.accessibility?.label ? ` aria-label="${escapeMarkup(el.accessibility.label)}"` : "") + (el.accessibility?.description ? ` aria-description="${escapeMarkup(el.accessibility.description)}"` : "") + (el.accessibility?.hidden ? ' aria-hidden="true"' : "");
    if (el.dataSource) {
        if (mode === "html") return `<div class="${classNameFor(el)}" role="status">Live records load in Local full-stack preview or the exported application.</div>`;
        const source = sources[el.id];
        if (!source) throw new Error("Live data source could not be resolved. Compile the complete project.");
        cssOut.add(liveDataCSS);
        // Record counts determine runtime height; the canvas height is only a minimum.
        cssOut.add(`.page .${classNameFor(el)} {height:auto !important; min-height:${el.layout.h}px;}`);
        if (el.definitionId === "collection") {
            const grid = (node: ElementNode) => cssFromStyles({display: "grid", gridTemplateColumns: node.styles.gridTemplateColumns || "repeat(auto-fit, minmax(min(220px, 100%), 1fr))", gap: node.styles.gap || "16px"});
            cssOut.add(`.${classNameFor(el)} {display:block !important;} .${classNameFor(el)}-items {${grid(el)}}`);
            for (const bp of ["tablet", "mobile"] as const) if (el.responsive?.[bp]) cssOut.add(`@media(max-width:${bp === "tablet" ? 1024 : 600}px){.${classNameFor(el)}-items {${grid(resolveElement(el, bp))}}}`);
        }
        const settings = JSON.stringify(source).replaceAll("<", "\\u003c");
        const content = el.definitionId === "table"
            ? `<div className="live-records-table" role="region" aria-label={${JSON.stringify(source.label).replaceAll("<", "\\u003c")}} tabIndex={0}><table><caption>${escapeMarkup(el.props.caption || source.label)}</caption><thead><tr>${source.columns.map(c => `<th scope="col">${escapeMarkup(c.label)}</th>`).join("")}</tr></thead><tbody>{records.map(record => <tr key={record._id}>${source.columns.map(c => `<td>{recordText(record, ${JSON.stringify(c.name)})}</td>`).join("")}</tr>)}</tbody></table></div>`
            : `<div className="live-records-items ${classNameFor(el)}-items"${el.props.direction === "row" ? ' style={{flexDirection:"row",flexWrap:"wrap"}}' : ""}>{records.map(record => <article key={record._id}>${el.children.map(id => elementsById[id] ? renderElement(elementsById[id], false, cssOut, mode, flowMap, elementsById, sources, source.fields) : "").join("")}</article>)}</div>`;
        return `<div${attrs} className="${classNameFor(el)}"><LiveRecords source={${settings}}>{records => (${content})}</LiveRecords></div>`;
    }
    if (["native", "button", "input"].includes(el.type)) return markup;
    if (el.accessibility?.label) markup = markup.replace(/^(<[^>]*?) aria-label="[^"]*"/, "$1");
    return markup.replace(/^<([a-z][a-z0-9]*)/, `<$1${attrs}`);
}

export function generateFrontendProject(
    elements: ElementNode[],
    globalElements: ElementNode[],
    canvasSettings: { backgroundColor: string; width: number; height: number },
    page?: Page,
    allPages?: Page[],
    wirings?: ElementWiring[],
    flowGraph?: FlowGraph,
    tokens: Record<string, DesignToken> = {},
    assets: Record<string, DesignAsset> = {},
    customElements: Record<string, CustomDefinition> = {},
    dataSources: Record<string, ResolvedDataSource> = {}
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
    const hasConditions = [...safeGlobal, ...allElements].some(element => element.formCondition);

    const htmlParts: string[] = [];
    const jsxParts: string[] = [];

    // Build elementsById lookup for codegen rendering
    const codegenElementsById: Record<string, ElementNode> = {};
    const addToLookup = (els: ElementNode[]) => { for (const e of els) codegenElementsById[e.id] = e; };
    addToLookup(safeGlobal);
    addToLookup(allElements);

    let expandedCount = 0;
    const countOutput = (element: ElementNode, copies: number, depth: number) => {
        expandedCount += copies * (element.dataSource && element.definitionId === "table" ? (dataSources[element.id]?.size || 100) * ((dataSources[element.id]?.columns.length || 32) + 1) : 1);
        if (expandedCount > 10000 || depth > 100) throw new Error("This page expands beyond 10,000 rendered elements or 100 nested levels. Reduce nested repeaters or split the page.");
        const next = copies * (element.dataSource ? (dataSources[element.id]?.size || 100) : element.type === "repeater" ? widgetNumber(element.props.repeatCount, 3, 1, 20) : 1);
        element.children.forEach(id => { if (codegenElementsById[id]) countOutput(codegenElementsById[id], next, depth + 1); });
    };
    [...safeGlobal, ...allElements].filter(el => !el.parentId).forEach(el => countOutput(el, 1, 0));

    safeGlobal.filter(el => !el.parentId).forEach((el) => {
        htmlParts.push(renderElement(el, false, cssParts, "html", flowMap, codegenElementsById));
        jsxParts.push(renderElement(el, false, cssParts, "jsx", flowMap, codegenElementsById, dataSources));
    });
    allElements.filter(el => !el.parentId).forEach((el) => {
        htmlParts.push(renderElement(el, true, cssParts, "html", flowMap, codegenElementsById));
        jsxParts.push(renderElement(el, true, cssParts, "jsx", flowMap, codegenElementsById, dataSources));
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
${hasResponsive ? "" : '@media (max-width: 640px) { .page { padding: 1rem; display: flex; flex-direction: column; gap: 1rem; } .page > [class^="el-"] { position: relative !important; left: auto !important; top: auto !important; max-width: 100%; flex-shrink: 0; } .page [class^="el-"] { max-width: 100%; overflow-wrap: anywhere; } .page p[class^="el-"], .page h1[class^="el-"], .page h2[class^="el-"], .page h3[class^="el-"], .page h4[class^="el-"], .page h5[class^="el-"], .page h6[class^="el-"] { height: auto; } }'}
@media (prefers-reduced-motion: reduce) { *, *::before, *::after { animation: none !important; transition: none !important; } }
`;

    const css = `${baseCss}\n${Array.from(cssParts).join("\n")}${animationCss}${hasConditions ? "\n" + formConditionsCSS : ""}`;

    const body = `<div class="page">${htmlParts.join("")}<div role="status" aria-live="polite" style="position:fixed;bottom:16px;right:16px;z-index:1000;background:#fff;color:#111"></div></div>`;
    const previewHandlers = [...flowMap.keys()].flatMap(id => {
        const el = codegenElementsById[id];
        if (!el) return [];
        return [`document.querySelectorAll(${JSON.stringify("." + classNameFor(el))}).forEach(el => el.addEventListener(${JSON.stringify(el.type === "form" ? "submit" : "click")}, ${flowHandler(el, flowMap, "html")}));`];
    }).join("\n");
    const pageRoutes = JSON.stringify(Object.fromEntries((allPages || []).map(p => [p.id, p.route])));
    const explicitHandlers = [...safeGlobal, ...allElements].flatMap(el => Object.entries(el.events || {}).filter(([event]) => !flowMap.has(el.id) || event !== (el.type === "form" ? "onSubmit" : "onClick")).map(([event, action]) => `document.querySelectorAll(${JSON.stringify("." + classNameFor(el))}).forEach(el => el.addEventListener(${JSON.stringify(event.slice(2).toLowerCase())}, ${semanticHandler(action)}));`)).join("\n");
    const previewScript = `${widgetRuntime}; setupWidgets(document);
${hasConditions ? formConditionsRuntime + "; setupFormConditions(document);" : ""}
const navigateToPage = pageId => window.parent.postMessage({type: "levoks:preview:navigate", pageId}, "*");
${explicitHandlers}
${generateAnimationSetup(animJsElements)}
setupAnimations(document);
const setFlowValues = update => { const values = update({}); for (const [id, value] of Object.entries(values)) { const element = document.querySelector(".el-" + id); if (element) element.textContent = value; } };
const setStatus = message => { document.querySelector('[role="status"]').textContent = message; };
const apiFetch = async () => { throw new Error("Backend requests need Local full-stack preview or the exported application runtime. No data was sent or saved."); };
${previewHandlers}
document.addEventListener("submit", e => { if (!e.defaultPrevented) { e.preventDefault(); setStatus("This form has no routing connection. Connect it to an endpoint or page."); } });`;

    const previewHtml = `<!doctype html>
<html>
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <title>${escapeMarkup(page?.title || "Preview")}</title>
    <style>${css}</style>
  </head>
  <body style="background:${bg};">${body}<script>${previewScript.replace(/<\/script/gi, "<\\/script")}</script></body>
</html>`;

    // Determine if we need the API client import
    const hasEndpointWirings = flowGraph
        ? flowGraph.flows.some((f) => f.steps.some((s) => s.type === "api_call"))
        : wirings && wirings.some((w) => w.target.kind === "endpoint");
    const hasLiveData = Object.keys(dataSources).length > 0;
    const apiImport = hasEndpointWirings || hasLiveData ? 'import { apiFetch } from "./api.js";\n' : "";
    // Generate animation useEffect code (inlined into App.jsx)
    const animUseEffect = generateAnimationUseEffect(animJsElements);

    const appJsx = `
import React from "react";
import "./styles.css";
${Object.keys(customElements).sort().map(id => `import ${customIdentifier(id)} from "./custom/${id}.jsx";`).join("\n")}
${apiImport}
${widgetRuntime}
${hasConditions ? formConditionsRuntime : ""}
${hasLiveData ? liveDataRuntime : ""}
const navigateToPage = pageId => { const route = ${pageRoutes}[pageId]; if (route) window.location.href = route; };
export default function App() {
  const [status, setStatus] = React.useState("");
  const [flowValues, setFlowValues] = React.useState({});
  const rootRef = React.useRef(null);
  React.useEffect(() => setupWidgets(rootRef.current), []);
${hasConditions ? "  React.useEffect(() => setupFormConditions(rootRef.current), []);" : ""}
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

    for (const [id, definition] of Object.entries(customElements)) files[`src/custom/${id}.jsx`] = definition.source;
    return { files, previewHtml };
}
