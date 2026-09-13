import { ElementType, SidebarCategory, ElementLayout, AnimationData } from "@/types";
import { DEFAULT_STYLES, DEFAULT_PROPS } from "@/lib/defaults";

// Template type: what addElement/addGlobalElement expect (no id/parentId/children/layout required)
type ElementTemplate = {
    type: ElementType;
    label?: string;
    props: Record<string, string | number | boolean>;
    styles: Record<string, string | number>;
    layout?: Partial<ElementLayout>;
    animation?: AnimationData;
    actions?: { type: "submit" | "redirect" | "api_call" | "scroll" | "none"; target?: string };
    children?: ElementTemplate[];
};

export const templates: Record<ElementType, ElementTemplate> = {
    section: { type: "section", label: "Section", props: { ...DEFAULT_PROPS.section }, styles: { ...DEFAULT_STYLES.section } },
    container: { type: "container", label: "Container", props: { ...DEFAULT_PROPS.container }, styles: { ...DEFAULT_STYLES.container } },
    columns: { type: "columns", label: "Columns", props: { ...DEFAULT_PROPS.columns }, styles: { ...DEFAULT_STYLES.columns } },
    stack: { type: "stack", label: "Stack", props: { ...DEFAULT_PROPS.stack }, styles: { ...DEFAULT_STYLES.stack } },
    title: { type: "title", label: "Title", props: { ...DEFAULT_PROPS.title }, styles: { ...DEFAULT_STYLES.title } },
    text: { type: "text", label: "Text", props: { ...DEFAULT_PROPS.text }, styles: { ...DEFAULT_STYLES.text } },
    paragraph: { type: "paragraph", label: "Paragraph", props: { ...DEFAULT_PROPS.paragraph }, styles: { ...DEFAULT_STYLES.paragraph } },
    button: {
        type: "button", label: "Button",
        props: { ...DEFAULT_PROPS.button }, styles: { ...DEFAULT_STYLES.button },
        actions: { type: "none" },
    },
    image: { type: "image", label: "Image", props: { ...DEFAULT_PROPS.image }, styles: { ...DEFAULT_STYLES.image } },
    video: { type: "video", label: "Video", props: { ...DEFAULT_PROPS.video }, styles: { ...DEFAULT_STYLES.video } },
    gallery: { type: "gallery", label: "Gallery", props: { ...DEFAULT_PROPS.gallery }, styles: { ...DEFAULT_STYLES.gallery } },
    form: {
        type: "form", label: "Form",
        props: { ...DEFAULT_PROPS.form }, styles: { ...DEFAULT_STYLES.form },
        actions: { type: "submit" },
        children: [
            {
                type: "text", label: "Form Label",
                props: { content: "Contact Us" },
                styles: { fontSize: "20px", fontWeight: "600", color: "#1a1a2e", marginBottom: "12px" },
            },
            {
                type: "input", label: "Name Input",
                props: { name: "name", placeholder: "Your name", inputType: "text", required: true },
                styles: { padding: "10px 14px", border: "1px solid #d1d5db", borderRadius: "6px", fontSize: "14px", width: "100%", backgroundColor: "#fff", marginBottom: "10px" },
                layout: { w: 360, h: 40 },
            },
            {
                type: "input", label: "Email Input",
                props: { name: "email", placeholder: "Your email", inputType: "email", required: true },
                styles: { padding: "10px 14px", border: "1px solid #d1d5db", borderRadius: "6px", fontSize: "14px", width: "100%", backgroundColor: "#fff", marginBottom: "10px" },
                layout: { w: 360, h: 40 },
            },
            {
                type: "button", label: "Submit",
                props: { label: "Submit" },
                styles: { backgroundColor: "#3b82f6", color: "#fff", padding: "10px 24px", borderRadius: "6px", fontSize: "14px", fontWeight: "600", border: "none", cursor: "pointer" },
                layout: { w: 120, h: 40 },
            },
        ],
    },
    input: { type: "input", label: "Input", props: { ...DEFAULT_PROPS.input }, styles: { ...DEFAULT_STYLES.input } },
    shape: { type: "shape", label: "Shape", props: { ...DEFAULT_PROPS.shape }, styles: { ...DEFAULT_STYLES.shape } },
    divider: { type: "divider", label: "Divider", props: { ...DEFAULT_PROPS.divider }, styles: { ...DEFAULT_STYLES.divider } },
    menu: { type: "menu", label: "Menu", props: { ...DEFAULT_PROPS.menu }, styles: { ...DEFAULT_STYLES.menu } },
    repeater: { type: "repeater", label: "Repeater", props: { ...DEFAULT_PROPS.repeater }, styles: { ...DEFAULT_STYLES.repeater } },
    frame: { type: "frame", label: "Frame", props: { ...DEFAULT_PROPS.frame }, styles: { ...DEFAULT_STYLES.frame } },
    icon: { type: "icon", label: "Icon", props: { ...DEFAULT_PROPS.icon }, styles: { ...DEFAULT_STYLES.icon } },
    spacer: { type: "spacer", label: "Spacer", props: { ...DEFAULT_PROPS.spacer }, styles: { ...DEFAULT_STYLES.spacer } },
    socialbar: { type: "socialbar", label: "Social Bar", props: { ...DEFAULT_PROPS.socialbar }, styles: { ...DEFAULT_STYLES.socialbar } },
    accordion: { type: "accordion", label: "Accordion", props: { ...DEFAULT_PROPS.accordion }, styles: { ...DEFAULT_STYLES.accordion } },
    tabs: { type: "tabs", label: "Tabs", props: { ...DEFAULT_PROPS.tabs }, styles: { ...DEFAULT_STYLES.tabs } },
};

export const sidebarCategories: SidebarCategory[] = [
    { id: "sections", label: "Sections", icon: "section", items: [{ type: "section", label: "Section", icon: "section" }] },
    { id: "containers", label: "Containers", icon: "container", items: [
        { type: "container", label: "Container", icon: "container" },
        { type: "columns", label: "Columns", icon: "columns" },
        { type: "stack", label: "Stack", icon: "stack" },
    ]},
    { id: "layout", label: "Layout Tools", icon: "spacer", items: [
        { type: "spacer", label: "Spacer", icon: "spacer" },
        { type: "divider", label: "Divider", icon: "divider" },
    ]},
    { id: "text", label: "Text", icon: "title", items: [
        { type: "title", label: "Title", icon: "title" },
        { type: "text", label: "Text", icon: "text" },
        { type: "paragraph", label: "Paragraph", icon: "paragraph" },
    ]},
    { id: "buttons", label: "Buttons", icon: "button", items: [{ type: "button", label: "Button", icon: "button" }] },
    { id: "media", label: "Media", icon: "image", items: [
        { type: "image", label: "Image", icon: "image" },
        { type: "video", label: "Video", icon: "video" },
        { type: "gallery", label: "Gallery", icon: "gallery" },
    ]},
    { id: "menu", label: "Menu & Search", icon: "menu", items: [{ type: "menu", label: "Menu", icon: "menu" }] },
    { id: "decorative", label: "Decorative", icon: "shape", items: [
        { type: "shape", label: "Shape", icon: "shape" },
        { type: "icon", label: "Icon", icon: "icon" },
        { type: "divider", label: "Line", icon: "divider" },
    ]},
    { id: "forms", label: "Contact & Forms", icon: "form", items: [
        { type: "form", label: "Form", icon: "form" },
        { type: "input", label: "Input", icon: "input" },
    ]},
    { id: "embed", label: "Embed & Social", icon: "socialbar", items: [
        { type: "socialbar", label: "Social Bar", icon: "socialbar" },
        { type: "frame", label: "Embed Code", icon: "frame" },
    ]},
    { id: "advanced", label: "Advanced", icon: "repeater", items: [
        { type: "repeater", label: "Repeater", icon: "repeater" },
        { type: "accordion", label: "Accordion", icon: "accordion" },
        { type: "tabs", label: "Tabs", icon: "tabs" },
    ]},
];
