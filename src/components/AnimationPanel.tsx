"use client";

import { useState, useCallback } from "react";
import { AnimationData, AnimationType, AnimationTrigger, AnimationEasing, ElementType } from "@/types";
import {
    Play, X, Eye, ArrowUp, ArrowDown, ArrowLeft, ArrowRight,
    ZoomIn, ZoomOut, RotateCcw, FlipHorizontal, FlipVertical,
    Maximize2, Minimize2, Heart, Zap, Bell, Link2,
    Type, Sparkles, Wind, RefreshCw, Loader, Move,
    Layers, Box, Square, Scissors, Paintbrush, Waves,
    ChevronUp, ChevronDown, MousePointer, Scroll, Repeat,
    Activity, CircleDot, AlignCenter, Minus, Ghost,
} from "lucide-react";

// ─── Animation Catalog ───

interface AnimDef {
    type: AnimationType;
    label: string;
    icon: React.ReactNode;
    category: "basic" | "advanced";
    group: "entrance" | "attention" | "exit" | "text" | "transform" | "color" | "clip";
    allowedElements?: ElementType[];
    excludedElements?: ElementType[];
}

const TEXT_TYPES: ElementType[] = ["text", "title", "paragraph"];
const VISUAL_TYPES: ElementType[] = ["image", "video", "container", "section", "columns", "stack", "frame"];

const S = 14; // icon size

const ANIMATIONS: AnimDef[] = [
    // Basic — Entrance
    { type: "fadeIn", label: "Fade In", icon: <Eye size={S} />, category: "basic", group: "entrance" },
    { type: "fadeInUp", label: "Fade Up", icon: <ChevronUp size={S} />, category: "basic", group: "entrance" },
    { type: "fadeInDown", label: "Fade Down", icon: <ChevronDown size={S} />, category: "basic", group: "entrance" },
    { type: "fadeInLeft", label: "Fade Left", icon: <ArrowLeft size={S} />, category: "basic", group: "entrance" },
    { type: "fadeInRight", label: "Fade Right", icon: <ArrowRight size={S} />, category: "basic", group: "entrance" },
    { type: "slideInUp", label: "Slide Up", icon: <ArrowUp size={S} />, category: "basic", group: "entrance" },
    { type: "slideInDown", label: "Slide Down", icon: <ArrowDown size={S} />, category: "basic", group: "entrance" },
    { type: "slideInLeft", label: "Slide Left", icon: <Minus size={S} style={{ transform: "rotate(90deg)" }} />, category: "basic", group: "entrance" },
    { type: "slideInRight", label: "Slide Right", icon: <Minus size={S} style={{ transform: "rotate(-90deg)" }} />, category: "basic", group: "entrance" },
    { type: "scaleIn", label: "Scale In", icon: <Maximize2 size={S} />, category: "basic", group: "entrance", excludedElements: ["divider"] },
    { type: "bounceIn", label: "Bounce In", icon: <Activity size={S} />, category: "basic", group: "entrance", excludedElements: ["divider", "video"] },
    { type: "flipInX", label: "Flip X", icon: <FlipVertical size={S} />, category: "basic", group: "entrance", excludedElements: ["divider", "video"] },
    { type: "flipInY", label: "Flip Y", icon: <FlipHorizontal size={S} />, category: "basic", group: "entrance", excludedElements: ["divider", "video"] },
    { type: "rotateIn", label: "Rotate In", icon: <RotateCcw size={S} />, category: "basic", group: "entrance", excludedElements: ["divider"] },
    { type: "zoomIn", label: "Zoom In", icon: <ZoomIn size={S} />, category: "basic", group: "entrance" },
    // Basic — Attention
    { type: "pulse", label: "Pulse", icon: <Heart size={S} />, category: "basic", group: "attention", excludedElements: ["divider"] },
    { type: "bounce", label: "Bounce", icon: <CircleDot size={S} />, category: "basic", group: "attention", excludedElements: ["divider"] },
    { type: "shake", label: "Shake", icon: <Move size={S} />, category: "basic", group: "attention", excludedElements: ["divider"] },
    { type: "wobble", label: "Wobble", icon: <Wind size={S} />, category: "basic", group: "attention", excludedElements: ["divider"] },
    { type: "swing", label: "Swing", icon: <Bell size={S} />, category: "basic", group: "attention", excludedElements: ["divider"] },
    { type: "flash", label: "Flash", icon: <Zap size={S} />, category: "basic", group: "attention" },
    { type: "heartbeat", label: "Heartbeat", icon: <Activity size={S} />, category: "basic", group: "attention", excludedElements: ["divider"] },
    { type: "rubberBand", label: "Rubber", icon: <Link2 size={S} />, category: "basic", group: "attention", excludedElements: ["divider"] },
    // Basic — Exit
    { type: "fadeOut", label: "Fade Out", icon: <Eye size={S} style={{ opacity: 0.4 }} />, category: "basic", group: "exit" },
    { type: "fadeOutUp", label: "Out Up", icon: <ArrowUp size={S} style={{ opacity: 0.5 }} />, category: "basic", group: "exit" },
    { type: "fadeOutDown", label: "Out Down", icon: <ArrowDown size={S} style={{ opacity: 0.5 }} />, category: "basic", group: "exit" },
    { type: "slideOutUp", label: "Slide Out ↑", icon: <ChevronUp size={S} style={{ opacity: 0.5 }} />, category: "basic", group: "exit" },
    { type: "slideOutDown", label: "Slide Out ↓", icon: <ChevronDown size={S} style={{ opacity: 0.5 }} />, category: "basic", group: "exit" },
    { type: "scaleOut", label: "Scale Out", icon: <Minimize2 size={S} />, category: "basic", group: "exit" },
    { type: "zoomOut", label: "Zoom Out", icon: <ZoomOut size={S} />, category: "basic", group: "exit" },
    // Advanced — Text
    { type: "typewriter", label: "Typewriter", icon: <Type size={S} />, category: "advanced", group: "text", allowedElements: TEXT_TYPES },
    { type: "textReveal", label: "Text Reveal", icon: <AlignCenter size={S} />, category: "advanced", group: "text", allowedElements: TEXT_TYPES },
    { type: "textGlow", label: "Text Glow", icon: <Sparkles size={S} />, category: "advanced", group: "text", allowedElements: [...TEXT_TYPES, "button"] },
    { type: "textGradientShift", label: "Gradient Text", icon: <Paintbrush size={S} />, category: "advanced", group: "text", allowedElements: [...TEXT_TYPES, "button"] },
    { type: "letterSpacing", label: "Spacing", icon: <Type size={S} />, category: "advanced", group: "text", allowedElements: TEXT_TYPES },
    // Advanced — Transform
    { type: "float", label: "Float", icon: <Wind size={S} />, category: "advanced", group: "transform", excludedElements: ["divider"] },
    { type: "spin", label: "Spin", icon: <RefreshCw size={S} />, category: "advanced", group: "transform", excludedElements: ["divider", "video"] },
    { type: "morphShadow", label: "Shadow", icon: <Box size={S} />, category: "advanced", group: "transform", excludedElements: ["divider"] },
    { type: "parallax", label: "Parallax", icon: <Layers size={S} />, category: "advanced", group: "transform", allowedElements: [...VISUAL_TYPES] },
    { type: "tilt3D", label: "3D Tilt", icon: <Square size={S} />, category: "advanced", group: "transform", excludedElements: ["divider", "spacer"] },
    { type: "skewIn", label: "Skew In", icon: <Move size={S} />, category: "advanced", group: "transform", excludedElements: ["divider"] },
    { type: "blurIn", label: "Blur In", icon: <Loader size={S} />, category: "advanced", group: "transform" },
    { type: "glitchEffect", label: "Glitch", icon: <Ghost size={S} />, category: "advanced", group: "transform", excludedElements: ["divider", "spacer", "video"] },
    // Advanced — Color
    { type: "colorShift", label: "Color Shift", icon: <Paintbrush size={S} />, category: "advanced", group: "color", excludedElements: ["image", "video", "divider", "spacer"] },
    { type: "gradientFlow", label: "Gradient Flow", icon: <Waves size={S} />, category: "advanced", group: "color", excludedElements: ["image", "video", "divider", "spacer"] },
    { type: "backgroundZoom", label: "BG Zoom", icon: <ZoomIn size={S} />, category: "advanced", group: "color", excludedElements: ["divider", "spacer"] },
    // Advanced — Clip
    { type: "borderDraw", label: "Border Draw", icon: <Square size={S} />, category: "advanced", group: "clip", excludedElements: ["spacer"] },
    { type: "clipReveal", label: "Clip Reveal", icon: <Scissors size={S} />, category: "advanced", group: "clip", excludedElements: ["spacer"] },
    { type: "maskWipe", label: "Mask Wipe", icon: <Layers size={S} />, category: "advanced", group: "clip", excludedElements: ["spacer"] },
];

const EASING_OPTIONS: { value: AnimationEasing; label: string }[] = [
    { value: "ease", label: "Ease (Default)" },
    { value: "ease-out", label: "Ease Out — Decelerate" },
    { value: "ease-in", label: "Ease In — Accelerate" },
    { value: "ease-in-out", label: "Ease In-Out — Smooth" },
    { value: "linear", label: "Linear — Constant" },
    { value: "cubic-bezier(0.4, 0, 0.2, 1)", label: "Material Standard" },
    { value: "cubic-bezier(0.0, 0, 0.2, 1)", label: "Material Decelerate" },
    { value: "cubic-bezier(0.68, -0.55, 0.27, 1.55)", label: "Back — Overshoot" },
    { value: "cubic-bezier(0.22, 1, 0.36, 1)", label: "Expo Out — Snappy" },
];

const TRIGGER_OPTIONS: { value: AnimationTrigger; icon: React.ReactNode; label: string }[] = [
    { value: "onLoad", icon: <Eye size={12} />, label: "Load" },
    { value: "onScroll", icon: <Scroll size={12} />, label: "Scroll" },
    { value: "onHover", icon: <MousePointer size={12} />, label: "Hover" },
    { value: "onClick", icon: <CircleDot size={12} />, label: "Click" },
    { value: "continuous", icon: <Repeat size={12} />, label: "Loop" },
];

const GROUP_LABELS: Record<string, string> = {
    entrance: "Entrance", attention: "Attention Seekers", exit: "Exit",
    text: "Text Effects", transform: "Transform", color: "Color & BG", clip: "Reveal & Clip",
};

function defaultAnimData(type: AnimationType): AnimationData {
    const isContinuous = ["pulse", "bounce", "shake", "wobble", "swing", "flash", "heartbeat", "rubberBand", "float", "spin", "colorShift", "gradientFlow"].includes(type);
    return {
        type,
        trigger: isContinuous ? "continuous" : "onLoad",
        duration: type === "typewriter" ? 2 : 0.6,
        delay: 0,
        easing: "ease-out",
        iterationCount: isContinuous ? "infinite" : 1,
        direction: "normal",
        fillMode: "both",
    };
}

function getFilteredAnims(elementType: ElementType, category: "basic" | "advanced"): AnimDef[] {
    return ANIMATIONS.filter(a => {
        if (a.category !== category) return false;
        if (a.allowedElements && !a.allowedElements.includes(elementType)) return false;
        if (a.excludedElements && a.excludedElements.includes(elementType)) return false;
        return true;
    });
}

// ─── Component ───

interface AnimationPanelProps {
    elementId: string;
    elementType: ElementType;
    animation: AnimationData | undefined;
    onUpdate: (anim: AnimationData) => void;
    onRemove: () => void;
    onPreview: () => void;
}

const AnimationPanel: React.FC<AnimationPanelProps> = ({
    elementType, animation, onUpdate, onRemove, onPreview,
}) => {
    const [category, setCategory] = useState<"basic" | "advanced">("basic");

    const anim = animation && animation.type !== "none" ? animation : null;
    const filteredAnims = getFilteredAnims(elementType, category);

    const grouped = filteredAnims.reduce<Record<string, AnimDef[]>>((acc, a) => {
        (acc[a.group] = acc[a.group] || []).push(a);
        return acc;
    }, {});

    const selectAnim = useCallback((type: AnimationType) => {
        if (anim?.type === type) return;
        onUpdate({ ...defaultAnimData(type), ...(anim ? { delay: anim.delay } : {}) });
    }, [anim, onUpdate]);

    const patchAnim = useCallback((patch: Partial<AnimationData>) => {
        if (!anim) return;
        onUpdate({ ...anim, ...patch } as AnimationData);
    }, [anim, onUpdate]);

    const isTextAnim = anim && ["typewriter", "textReveal", "textGlow", "textGradientShift", "letterSpacing"].includes(anim.type);
    const isSlideAnim = anim && (anim.type.startsWith("slide") || anim.type.startsWith("fadeIn"));
    const isShakeAnim = anim && ["shake", "wobble", "glitchEffect"].includes(anim.type);
    const isScaleAnim = anim && ["scaleIn", "scaleInUp", "scaleInDown", "scaleOut", "zoomIn", "zoomOut"].includes(anim.type);
    const isRotateAnim = anim && ["rotateIn", "spin"].includes(anim.type);
    const hasSpecificOpts = isTextAnim || isSlideAnim || isShakeAnim || isScaleAnim || isRotateAnim;

    // Compute slider background gradient for progress fill (WebKit)
    const sliderBg = useCallback((value: number, min: number, max: number) => {
        const pct = ((value - min) / (max - min)) * 100;
        return { background: `linear-gradient(to right, var(--accent, #6366f1) ${pct}%, var(--bg-input, #2a2a35) ${pct}%)` };
    }, []);

    return (
        <div style={{ padding: "4px 14px 14px" }}>
            {anim && (
                <div className="anim-active-badge">
                    <span className="anim-active-dot" />
                    {ANIMATIONS.find(a => a.type === anim.type)?.label || anim.type}
                </div>
            )}

            <div className="anim-category-tabs">
                <button className={`anim-category-tab ${category === "basic" ? "active" : ""}`} onClick={() => setCategory("basic")}>Basic</button>
                <button className={`anim-category-tab ${category === "advanced" ? "active" : ""}`} onClick={() => setCategory("advanced")}>Advanced</button>
            </div>

            {Object.entries(grouped).map(([group, anims]) => (
                <div key={group}>
                    <div style={{ fontSize: 10, color: "var(--text-3)", fontWeight: 600, textTransform: "uppercase", letterSpacing: "0.4px", marginBottom: 6, marginTop: 8 }}>
                        {GROUP_LABELS[group] || group}
                    </div>
                    <div className="anim-grid">
                        {anims.map(a => (
                            <button key={a.type} className={`anim-card ${anim?.type === a.type ? "active" : ""}`} onClick={() => selectAnim(a.type)} title={a.label}>
                                <span className="anim-card-icon">{a.icon}</span>
                                <span className="anim-card-label">{a.label}</span>
                            </button>
                        ))}
                    </div>
                </div>
            ))}

            {filteredAnims.length === 0 && (
                <div className="anim-empty-state">
                    <span className="anim-empty-icon"><Ghost size={28} /></span>
                    <span className="anim-empty-title">No {category} animations</span>
                    <span className="anim-empty-desc">This element type doesn&apos;t support {category} animations. Try the other category.</span>
                </div>
            )}

            {anim && (
                <>
                    <div className="anim-divider" />

                    <div style={{ fontSize: 10, color: "var(--text-3)", fontWeight: 600, textTransform: "uppercase", letterSpacing: "0.4px", marginBottom: 6 }}>Trigger</div>
                    <div className="anim-trigger-group">
                        {TRIGGER_OPTIONS.map(t => (
                            <button key={t.value} className={`anim-trigger-btn ${anim.trigger === t.value ? "active" : ""}`} onClick={() => patchAnim({
                                trigger: t.value,
                                iterationCount: t.value === "continuous" ? "infinite" : (anim.iterationCount === "infinite" ? 1 : anim.iterationCount),
                            })}>
                                <span className="anim-trigger-icon">{t.icon}</span>
                                <span className="anim-trigger-label">{t.label}</span>
                            </button>
                        ))}
                    </div>

                    <div style={{ fontSize: 10, color: "var(--text-3)", fontWeight: 600, textTransform: "uppercase", letterSpacing: "0.4px", marginBottom: 6 }}>Timing</div>

                    <div className="anim-timing-row">
                        <span className="anim-timing-label">Duration</span>
                        <input type="range" className="anim-timing-slider" min={0.1} max={5} step={0.1} value={anim.duration} style={sliderBg(anim.duration, 0.1, 5)} onChange={e => patchAnim({ duration: parseFloat(e.target.value) })} />
                        <span className="anim-timing-value">{anim.duration.toFixed(1)}s</span>
                    </div>

                    <div className="anim-timing-row">
                        <span className="anim-timing-label">Delay</span>
                        <input type="range" className="anim-timing-slider" min={0} max={5} step={0.1} value={anim.delay} style={sliderBg(anim.delay, 0, 5)} onChange={e => patchAnim({ delay: parseFloat(e.target.value) })} />
                        <span className="anim-timing-value">{anim.delay.toFixed(1)}s</span>
                    </div>

                    <div style={{ marginBottom: 10 }}>
                        <div style={{ fontSize: 10, color: "var(--text-3)", fontWeight: 500, marginBottom: 3 }}>Easing</div>
                        <select className="anim-easing-select" value={anim.easing} onChange={e => patchAnim({ easing: e.target.value })}>
                            {EASING_OPTIONS.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
                        </select>
                    </div>

                    <div className="anim-options-grid">
                        <div className="anim-option-field">
                            <span className="anim-option-label">Repeat</span>
                            <div style={{ display: "flex", gap: 4 }}>
                                <input type="number" className="anim-option-input" min={1} max={100} value={anim.iterationCount === "infinite" ? "" : anim.iterationCount} placeholder="∞" disabled={anim.iterationCount === "infinite"}
                                    onChange={e => patchAnim({ iterationCount: parseInt(e.target.value) || 1 })} style={{ flex: 1 }} />
                                <button className={`anim-inf-toggle ${anim.iterationCount === "infinite" ? "active" : ""}`}
                                    onClick={() => patchAnim({ iterationCount: anim.iterationCount === "infinite" ? 1 : "infinite" })}>∞</button>
                            </div>
                        </div>
                        <div className="anim-option-field">
                            <span className="anim-option-label">Direction</span>
                            <select className="anim-option-select" value={anim.direction} onChange={e => patchAnim({ direction: e.target.value as AnimationData["direction"] })}>
                                <option value="normal">Normal</option>
                                <option value="reverse">Reverse</option>
                                <option value="alternate">Alternate</option>
                                <option value="alternate-reverse">Alt-Reverse</option>
                            </select>
                        </div>
                        <div className="anim-option-field">
                            <span className="anim-option-label">Fill Mode</span>
                            <select className="anim-option-select" value={anim.fillMode} onChange={e => patchAnim({ fillMode: e.target.value as AnimationData["fillMode"] })}>
                                <option value="none">None</option>
                                <option value="forwards">Forwards</option>
                                <option value="backwards">Backwards</option>
                                <option value="both">Both</option>
                            </select>
                        </div>
                    </div>

                    {anim.trigger === "onScroll" && (
                        <div className="anim-scroll-opts">
                            <div className="anim-scroll-opts-title">Scroll Options</div>
                            <div className="anim-timing-row">
                                <span className="anim-timing-label">Offset</span>
                                <input type="range" className="anim-timing-slider" min={0} max={100} step={5} value={anim.scrollOffset ?? 20} style={sliderBg(anim.scrollOffset ?? 20, 0, 100)} onChange={e => patchAnim({ scrollOffset: parseInt(e.target.value) })} />
                                <span className="anim-timing-value">{anim.scrollOffset ?? 20}%</span>
                            </div>
                        </div>
                    )}

                    {hasSpecificOpts && (
                        <div className="anim-specific-opts">
                            <div className="anim-specific-opts-title">Animation Options</div>
                            {isTextAnim && anim.type === "typewriter" && (
                                <div className="anim-timing-row">
                                    <span className="anim-timing-label">Speed</span>
                                    <input type="range" className="anim-timing-slider" min={10} max={200} step={5} value={anim.textSpeed ?? 50} style={sliderBg(anim.textSpeed ?? 50, 10, 200)} onChange={e => patchAnim({ textSpeed: parseInt(e.target.value) })} />
                                    <span className="anim-timing-value">{anim.textSpeed ?? 50}</span>
                                </div>
                            )}
                            {isTextAnim && anim.type !== "typewriter" && (
                                <div className="anim-timing-row">
                                    <span className="anim-timing-label">Stagger</span>
                                    <input type="range" className="anim-timing-slider" min={0} max={200} step={10} value={anim.textStagger ?? 50} style={sliderBg(anim.textStagger ?? 50, 0, 200)} onChange={e => patchAnim({ textStagger: parseInt(e.target.value) })} />
                                    <span className="anim-timing-value">{anim.textStagger ?? 50}ms</span>
                                </div>
                            )}
                            {isSlideAnim && (
                                <div className="anim-timing-row">
                                    <span className="anim-timing-label">Distance</span>
                                    <input type="range" className="anim-timing-slider" min={10} max={200} step={5} value={anim.translateDistance ?? 30} style={sliderBg(anim.translateDistance ?? 30, 10, 200)} onChange={e => patchAnim({ translateDistance: parseInt(e.target.value) })} />
                                    <span className="anim-timing-value">{anim.translateDistance ?? 30}px</span>
                                </div>
                            )}
                            {isShakeAnim && (
                                <div className="anim-timing-row">
                                    <span className="anim-timing-label">Intensity</span>
                                    <input type="range" className="anim-timing-slider" min={1} max={10} step={1} value={anim.intensity ?? 5} style={sliderBg(anim.intensity ?? 5, 1, 10)} onChange={e => patchAnim({ intensity: parseInt(e.target.value) })} />
                                    <span className="anim-timing-value">{anim.intensity ?? 5}</span>
                                </div>
                            )}
                            {isScaleAnim && (
                                <div className="anim-timing-row">
                                    <span className="anim-timing-label">From</span>
                                    <input type="range" className="anim-timing-slider" min={0} max={2} step={0.1} value={anim.scaleFrom ?? 0} style={sliderBg(anim.scaleFrom ?? 0, 0, 2)} onChange={e => patchAnim({ scaleFrom: parseFloat(e.target.value) })} />
                                    <span className="anim-timing-value">{(anim.scaleFrom ?? 0).toFixed(1)}x</span>
                                </div>
                            )}
                            {isRotateAnim && (
                                <div className="anim-timing-row">
                                    <span className="anim-timing-label">Angle</span>
                                    <input type="range" className="anim-timing-slider" min={0} max={720} step={15} value={anim.rotateAngle ?? 360} style={sliderBg(anim.rotateAngle ?? 360, 0, 720)} onChange={e => patchAnim({ rotateAngle: parseInt(e.target.value) })} />
                                    <span className="anim-timing-value">{anim.rotateAngle ?? 360}°</span>
                                </div>
                            )}
                        </div>
                    )}

                    <div className="anim-actions-row">
                        <button className="anim-preview-btn" onClick={onPreview}><Play size={14} /> Preview</button>
                        <button className="anim-remove-btn" onClick={onRemove} title="Remove animation"><X size={14} /></button>
                    </div>
                </>
            )}
        </div>
    );
};

export default AnimationPanel;
