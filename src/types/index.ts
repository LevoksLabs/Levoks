// Type definitions for the serializable editor state

// ─── Animation System Types ───

export type AnimationTrigger =
    | "onLoad"
    | "onScroll"
    | "onHover"
    | "onClick"
    | "continuous";

export type AnimationEasing =
    | "linear"
    | "ease"
    | "ease-in"
    | "ease-out"
    | "ease-in-out"
    | "cubic-bezier(0.4, 0, 0.2, 1)"
    | "cubic-bezier(0.0, 0, 0.2, 1)"
    | "cubic-bezier(0.4, 0, 1, 1)"
    | "cubic-bezier(0.68, -0.55, 0.27, 1.55)"
    | "cubic-bezier(0.22, 1, 0.36, 1)"
    | string;

export type AnimationType =
    // Basic — Entrance
    | "fadeIn" | "fadeInUp" | "fadeInDown" | "fadeInLeft" | "fadeInRight"
    | "slideInUp" | "slideInDown" | "slideInLeft" | "slideInRight"
    | "scaleIn" | "scaleInUp" | "scaleInDown"
    | "bounceIn" | "flipInX" | "flipInY"
    | "rotateIn" | "zoomIn"
    // Basic — Attention
    | "pulse" | "bounce" | "shake" | "wobble" | "swing" | "flash" | "heartbeat" | "rubberBand"
    // Basic — Exit
    | "fadeOut" | "fadeOutUp" | "fadeOutDown"
    | "slideOutUp" | "slideOutDown"
    | "scaleOut" | "zoomOut"
    // Advanced — Text-specific
    | "typewriter" | "textReveal" | "textGlow" | "textGradientShift" | "letterSpacing"
    // Advanced — Transform
    | "float" | "spin" | "morphShadow" | "parallax" | "tilt3D"
    | "skewIn" | "blurIn" | "glitchEffect"
    // Advanced — Background/Color
    | "colorShift" | "gradientFlow" | "backgroundZoom"
    // Advanced — Border/Clip
    | "borderDraw" | "clipReveal" | "maskWipe"
    // None
    | "none";

export interface AnimationData {
    type: AnimationType;
    trigger: AnimationTrigger;
    duration: number;
    delay: number;
    easing: AnimationEasing;
    iterationCount: number | "infinite";
    direction: "normal" | "reverse" | "alternate" | "alternate-reverse";
    fillMode: "none" | "forwards" | "backwards" | "both";
    // Scroll-specific
    scrollOffset?: number;
    // Text-specific
    textSpeed?: number;
    textStagger?: number;
    // Transform
    translateDistance?: number;
    scaleFrom?: number;
    rotateAngle?: number;
    // Intensity (shake, wobble, etc.)
    intensity?: number;
}

export interface ActionData {
    type: "submit" | "redirect" | "api_call" | "scroll" | "none";
    target?: string;
}

export type ElementType =
    | "section"
    | "container"
    | "columns"
    | "stack"
    | "text"
    | "title"
    | "paragraph"
    | "button"
    | "image"
    | "video"
    | "gallery"
    | "form"
    | "input"
    | "shape"
    | "divider"
    | "menu"
    | "repeater"
    | "frame"
    | "icon"
    | "spacer"
    | "socialbar"
    | "accordion"
    | "tabs";

// Which element types can accept children
export const CONTAINER_TYPES: ElementType[] = [
    "section",
    "container",
    "columns",
    "stack",
    "form",
    "repeater",
    "frame",
    "accordion",
    "tabs",
];

export interface ElementLayout {
    x: number;
    y: number;
    w: number;
    h: number;
    position: "absolute" | "relative" | "static" | "fixed" | "sticky";
    opacity: number;
    rotation: number;
    visible: boolean;
    locked: boolean;
}

export interface ElementNode {
    id: string;
    type: ElementType;
    parentId: string | null;
    label?: string;
    props: Record<string, string | number | boolean>;
    styles: Record<string, string | number>;
    layout: ElementLayout;
    animation?: AnimationData;
    actions?: ActionData;
    children: string[]; // child element IDs
    responsive?: Partial<Record<"tablet" | "mobile", { layout?: Partial<ElementLayout>; styles?: Record<string, string | number> }>>;
    vector?: { points: { x: number; y: number; inX?: number; inY?: number; outX?: number; outY?: number }[]; closed: boolean; stroke: string; strokeWidth: number; fill: string };
    motion?: { duration: number; delay: number; iterations: number; easing: "linear" | "ease-in" | "ease-out" | "ease-in-out"; frames: { time: number; x: number; y: number; scale: number; rotation: number; opacity: number }[] };
    component?: { id: string; node: string; overrides: string[] };
}

export interface DesignToken { name: string; value: string; kind: "color" | "dimension" | "font"; }
export interface ComponentDefinition { name: string; rootId: string; nodes: Record<string, ElementNode>; }

export interface Page {
    id: string;
    title: string;
    route: string;
}

export interface EditorState {
    elementsById: Record<string, ElementNode>;
    rootIds: string[];
    selectedElementId: string | null;
}

export interface SidebarCategory {
    id: string;
    label: string;
    icon: string;
    items: { type: ElementType; label: string; icon: string }[];
}

export interface DesignAsset { name: string; mime: "image/png" | "image/jpeg" | "image/webp" | "image/gif" | "font/woff" | "font/woff2"; source: string; width?: number; height?: number; }
