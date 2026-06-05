// ═══════════════════════════════════════════════════
// Default Values Per Element Type
// ═══════════════════════════════════════════════════
//
// Used for:
//   1. Initializing new elements with sensible defaults
//   2. Stripping defaults during codegen (only emit non-default CSS)
//   3. Detecting user customizations
//

import type { ElementType, ElementLayout } from "@/types";

// ─── Default Layout ───

export const DEFAULT_LAYOUT: Record<ElementType, ElementLayout> = {
    section:   { x: 0, y: 0, w: 800, h: 200, position: "relative", opacity: 1, rotation: 0, visible: true, locked: false },
    container: { x: 0, y: 0, w: 400, h: 200, position: "relative", opacity: 1, rotation: 0, visible: true, locked: false },
    columns:   { x: 0, y: 0, w: 600, h: 200, position: "relative", opacity: 1, rotation: 0, visible: true, locked: false },
    stack:     { x: 0, y: 0, w: 400, h: 200, position: "relative", opacity: 1, rotation: 0, visible: true, locked: false },
    title:     { x: 0, y: 0, w: 400, h: 50,  position: "absolute", opacity: 1, rotation: 0, visible: true, locked: false },
    text:      { x: 0, y: 0, w: 300, h: 30,  position: "absolute", opacity: 1, rotation: 0, visible: true, locked: false },
    paragraph: { x: 0, y: 0, w: 500, h: 80,  position: "absolute", opacity: 1, rotation: 0, visible: true, locked: false },
    button:    { x: 0, y: 0, w: 160, h: 44,  position: "absolute", opacity: 1, rotation: 0, visible: true, locked: false },
    image:     { x: 0, y: 0, w: 400, h: 280, position: "absolute", opacity: 1, rotation: 0, visible: true, locked: false },
    video:     { x: 0, y: 0, w: 480, h: 300, position: "absolute", opacity: 1, rotation: 0, visible: true, locked: false },
    gallery:   { x: 0, y: 0, w: 500, h: 250, position: "absolute", opacity: 1, rotation: 0, visible: true, locked: false },
    form:      { x: 0, y: 0, w: 400, h: 300, position: "relative", opacity: 1, rotation: 0, visible: true, locked: false },
    input:     { x: 0, y: 0, w: 300, h: 44,  position: "absolute", opacity: 1, rotation: 0, visible: true, locked: false },
    shape:     { x: 0, y: 0, w: 120, h: 120, position: "absolute", opacity: 1, rotation: 0, visible: true, locked: false },
    divider:   { x: 0, y: 0, w: 500, h: 4,   position: "absolute", opacity: 1, rotation: 0, visible: true, locked: false },
    menu:      { x: 0, y: 0, w: 500, h: 44,  position: "absolute", opacity: 1, rotation: 0, visible: true, locked: false },
    repeater:  { x: 0, y: 0, w: 400, h: 200, position: "relative", opacity: 1, rotation: 0, visible: true, locked: false },
    frame:     { x: 0, y: 0, w: 500, h: 300, position: "absolute", opacity: 1, rotation: 0, visible: true, locked: false },
    icon:      { x: 0, y: 0, w: 48,  h: 48,  position: "absolute", opacity: 1, rotation: 0, visible: true, locked: false },
    spacer:    { x: 0, y: 0, w: 500, h: 40,  position: "absolute", opacity: 1, rotation: 0, visible: true, locked: false },
    socialbar: { x: 0, y: 0, w: 300, h: 48,  position: "absolute", opacity: 1, rotation: 0, visible: true, locked: false },
    accordion: { x: 0, y: 0, w: 500, h: 200, position: "relative", opacity: 1, rotation: 0, visible: true, locked: false },
    tabs:      { x: 0, y: 0, w: 600, h: 300, position: "relative", opacity: 1, rotation: 0, visible: true, locked: false },
};

// ─── Default Styles ───

export const DEFAULT_STYLES: Record<ElementType, Record<string, string | number>> = {
    section: {
        padding: "40px 20px",
        minHeight: "120px",
        backgroundColor: "rgba(241, 245, 249, 0.6)",
    },
    container: {
        padding: "20px",
        minHeight: "80px",
        backgroundColor: "rgba(226, 232, 240, 0.35)",
        borderRadius: "8px",
    },
    columns: {
        display: "flex",
        gap: "16px",
        padding: "20px",
        minHeight: "80px",
        backgroundColor: "rgba(226, 232, 240, 0.25)",
    },
    stack: {
        display: "flex",
        flexDirection: "column",
        gap: "12px",
        padding: "16px",
        minHeight: "60px",
        backgroundColor: "rgba(226, 232, 240, 0.25)",
    },
    title: {
        fontSize: "32px",
        fontWeight: "700",
        color: "#1a1a2e",
        margin: "0",
        lineHeight: "1.2",
        textAlign: "left",
        fontFamily: "Inter",
    },
    text: {
        fontSize: "16px",
        color: "#374151",
        lineHeight: "1.6",
        textAlign: "left",
        fontFamily: "Inter",
    },
    paragraph: {
        fontSize: "15px",
        color: "#4b5563",
        lineHeight: "1.7",
        maxWidth: "680px",
        textAlign: "left",
        fontFamily: "Inter",
    },
    button: {
        backgroundColor: "#3b82f6",
        color: "#ffffff",
        padding: "12px 28px",
        borderRadius: "6px",
        fontSize: "15px",
        fontWeight: "600",
        cursor: "pointer",
        border: "none",
        display: "inline-block",
        textAlign: "center",
        fontFamily: "Inter",
    },
    image: {
        maxWidth: "100%",
        borderRadius: "8px",
        display: "block",
    },
    video: {
        width: "100%",
        maxWidth: "640px",
        borderRadius: "8px",
    },
    gallery: {
        display: "grid",
        gridTemplateColumns: "repeat(3, 1fr)",
        gap: "8px",
        padding: "8px",
    },
    form: {
        padding: "24px",
        backgroundColor: "#ffffff",
        borderRadius: "12px",
        border: "1px solid #e5e7eb",
    },
    input: {
        padding: "12px 16px",
        border: "1px solid #d1d5db",
        borderRadius: "8px",
        fontSize: "14px",
        width: "100%",
        backgroundColor: "#ffffff",
    },
    shape: {
        width: "120px",
        height: "120px",
        backgroundColor: "#6366f1",
        borderRadius: "12px",
    },
    divider: {
        width: "100%",
        height: "1px",
        backgroundColor: "#e5e7eb",
        margin: "16px 0",
    },
    menu: {
        display: "flex",
        gap: "24px",
        padding: "12px 20px",
        backgroundColor: "#ffffff",
        borderRadius: "8px",
    },
    repeater: {
        display: "flex",
        flexDirection: "column",
        gap: "12px",
        padding: "16px",
        border: "1px dashed #a5b4fc",
        borderRadius: "8px",
    },
    frame: {
        width: "100%",
        height: "300px",
        border: "1px solid #d1d5db",
        borderRadius: "8px",
    },
    icon: {},
    spacer: {},
    socialbar: {
        display: "flex",
        gap: "12px",
        alignItems: "center",
    },
    accordion: {
        border: "1px solid #e5e7eb",
        borderRadius: "8px",
        overflow: "hidden",
    },
    tabs: {
        border: "1px solid #e5e7eb",
        borderRadius: "8px",
        overflow: "hidden",
    },
};

// ─── Default Props ───

export const DEFAULT_PROPS: Record<ElementType, Record<string, string | number | boolean>> = {
    section: {},
    container: {},
    columns: { columnCount: 2 },
    stack: { direction: "vertical" },
    title: { content: "Add a Title", level: 2 },
    text: { content: "Edit this text" },
    paragraph: { content: "This is a paragraph. Click to edit and add your own text. Customize the font, size, and color in the properties panel." },
    button: { label: "Click me" },
    image: { src: "https://images.unsplash.com/photo-1506905925346-21bda4d32df4?w=600&h=400&fit=crop", alt: "Placeholder image", objectFit: "cover" },
    video: { src: "https://www.w3schools.com/html/mov_bbb.mp4", autoplay: false, controls: true, loop: false, muted: false },
    gallery: { columns: 3, gap: 8 },
    form: { requestMethod: "POST", requestUrl: "/api/contact" },
    input: { placeholder: "Enter text...", inputType: "text", required: false },
    shape: { shapeType: "rectangle" },
    divider: {},
    menu: { items: "Home,About,Services,Contact", menuStyle: "horizontal" },
    repeater: { repeatCount: 3, direction: "column" },
    frame: { src: "https://example.com" },
    icon: { icon: "star", iconSize: 32, iconColor: "#374151" },
    spacer: { spacerHeight: 40 },
    socialbar: { facebook: true, twitter: true, instagram: true, linkedin: false, youtube: false, iconSize: 24, iconStyle: "filled" },
    accordion: { headerText: "Accordion Header", expanded: true },
    tabs: { tabTitles: "Tab 1,Tab 2,Tab 3", activeTab: 0 },
};

// ─── Utility: Strip Defaults for Codegen ───

/**
 * Returns only the styles/props that differ from the type's defaults.
 * Used by codegen to produce clean, minimal output.
 */
export function stripDefaultStyles(
    type: ElementType,
    styles: Record<string, string | number>
): Record<string, string | number> {
    const defaults = DEFAULT_STYLES[type] || {};
    const result: Record<string, string | number> = {};
    for (const [key, value] of Object.entries(styles)) {
        if (value === undefined || value === null) continue;
        if (String(value).trim() === "") continue;
        if (defaults[key] !== undefined && String(defaults[key]) === String(value)) continue;
        result[key] = value;
    }
    return result;
}

export function stripDefaultProps(
    type: ElementType,
    props: Record<string, string | number | boolean>
): Record<string, string | number | boolean> {
    const defaults = DEFAULT_PROPS[type] || {};
    const result: Record<string, string | number | boolean> = {};
    for (const [key, value] of Object.entries(props)) {
        if (value === undefined || value === null) continue;
        if (String(value).trim() === "") continue;
        if (defaults[key] !== undefined && String(defaults[key]) === String(value)) continue;
        result[key] = value;
    }
    return result;
}
