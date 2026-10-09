"use client";

import { ParameterControl } from "./design/ParameterControl";
import { useState, useRef, useEffect } from "react";
import { Plus, Trash2, Pause, Diamond, MousePointer2, SlidersHorizontal } from "lucide-react";
import { animationTracks, animationFrames, defaultAnimation, insertKeyframe, neutralFrame, presetParameters, stackAnimations } from "@/lib/animation";
import { useEditorUIStore } from "@/store/editorUIStore";
import type { AnimationKeyframe, ElementNode } from "@/types";
import styles from "./AnimationPanel.module.css";
import { AnimationData, AnimationType, AnimationTrigger, AnimationEasing, ElementType } from "@/types";
import { Play, Eye, RotateCcw, Scroll, Repeat, CircleDot, Move, Sparkles } from "lucide-react";

// ─── Animation Catalog ───

interface AnimDef {
    type: AnimationType;
    label: string;
    group: "entrance" | "attention" | "exit" | "text" | "transform" | "color" | "clip";
    allowedElements?: ElementType[];
    excludedElements?: ElementType[];
}

const TEXT_TYPES: ElementType[] = ["text", "title", "paragraph"];
const VISUAL_TYPES: ElementType[] = ["image", "video", "container", "section", "columns", "stack", "frame"];

const ANIMATIONS: AnimDef[] = [
    // Basic — Entrance
    { type: "fadeIn", label: "Fade In", group: "entrance" },
    { type: "fadeInUp", label: "Fade Up", group: "entrance" },
    { type: "fadeInDown", label: "Fade Down", group: "entrance" },
    { type: "fadeInLeft", label: "Fade Left", group: "entrance" },
    { type: "fadeInRight", label: "Fade Right", group: "entrance" },
    { type: "slideInUp", label: "Slide Up", group: "entrance" },
    { type: "slideInDown", label: "Slide Down", group: "entrance" },
    { type: "slideInLeft", label: "Slide Left", group: "entrance" },
    { type: "slideInRight", label: "Slide Right", group: "entrance" },
    { type: "scaleIn", label: "Scale In", group: "entrance", excludedElements: ["divider"] },
    { type: "bounceIn", label: "Bounce In", group: "entrance", excludedElements: ["divider", "video"] },
    { type: "flipInX", label: "Flip X", group: "entrance", excludedElements: ["divider", "video"] },
    { type: "flipInY", label: "Flip Y", group: "entrance", excludedElements: ["divider", "video"] },
    { type: "rotateIn", label: "Rotate In", group: "entrance", excludedElements: ["divider"] },
    { type: "zoomIn", label: "Zoom In", group: "entrance" },
    // Basic — Attention
    { type: "pulse", label: "Pulse", group: "attention", excludedElements: ["divider"] },
    { type: "bounce", label: "Bounce", group: "attention", excludedElements: ["divider"] },
    { type: "shake", label: "Shake", group: "attention", excludedElements: ["divider"] },
    { type: "wobble", label: "Wobble", group: "attention", excludedElements: ["divider"] },
    { type: "swing", label: "Swing", group: "attention", excludedElements: ["divider"] },
    { type: "flash", label: "Flash", group: "attention" },
    { type: "heartbeat", label: "Heartbeat", group: "attention", excludedElements: ["divider"] },
    { type: "rubberBand", label: "Rubber", group: "attention", excludedElements: ["divider"] },
    // Basic — Exit
    { type: "fadeOut", label: "Fade Out", group: "exit" },
    { type: "fadeOutUp", label: "Out Up", group: "exit" },
    { type: "fadeOutDown", label: "Out Down", group: "exit" },
    { type: "slideOutUp", label: "Slide Out ↑", group: "exit" },
    { type: "slideOutDown", label: "Slide Out ↓", group: "exit" },
    { type: "scaleOut", label: "Scale Out", group: "exit" },
    { type: "zoomOut", label: "Zoom Out", group: "exit" },
    // Advanced — Text
    { type: "typewriter", label: "Typewriter", group: "text", allowedElements: TEXT_TYPES },
    { type: "textReveal", label: "Text Reveal", group: "text", allowedElements: TEXT_TYPES },
    { type: "textGlow", label: "Text Glow", group: "text", allowedElements: [...TEXT_TYPES, "button"] },
    { type: "textGradientShift", label: "Gradient Text", group: "text", allowedElements: [...TEXT_TYPES, "button"] },
    { type: "letterSpacing", label: "Spacing", group: "text", allowedElements: TEXT_TYPES },
    // Advanced — Transform
    { type: "float", label: "Float", group: "transform", excludedElements: ["divider"] },
    { type: "spin", label: "Spin", group: "transform", excludedElements: ["divider", "video"] },
    { type: "morphShadow", label: "Shadow", group: "transform", excludedElements: ["divider"] },
    { type: "parallax", label: "Parallax", group: "transform", allowedElements: [...VISUAL_TYPES] },
    { type: "tilt3D", label: "3D Tilt", group: "transform", excludedElements: ["divider", "spacer"] },
    { type: "skewIn", label: "Skew In", group: "transform", excludedElements: ["divider"] },
    { type: "blurIn", label: "Blur In", group: "transform" },
    { type: "glitchEffect", label: "Glitch", group: "transform", excludedElements: ["divider", "spacer", "video"] },
    // Advanced — Color
    { type: "colorShift", label: "Color Shift", group: "color", excludedElements: ["image", "video", "divider", "spacer"] },
    { type: "gradientFlow", label: "Gradient Flow", group: "color", excludedElements: ["image", "video", "divider", "spacer"] },
    { type: "backgroundZoom", label: "BG Zoom", group: "color", excludedElements: ["divider", "spacer"] },
    // Advanced — Clip
    { type: "borderDraw", label: "Border Draw", group: "clip", excludedElements: ["spacer"] },
    { type: "clipReveal", label: "Clip Reveal", group: "clip", excludedElements: ["spacer"] },
    { type: "maskWipe", label: "Mask Wipe", group: "clip", excludedElements: ["spacer"] },
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

const TRIGGERS: { value: AnimationTrigger; label: string; icon: React.ReactNode }[] = [
    { value: "onLoad", label: "Page load", icon: <Play size={13} /> },
    { value: "onHover", label: "Hover", icon: <MousePointer2 size={13} /> },
    { value: "onScroll", label: "Scroll", icon: <Scroll size={13} /> },
    { value: "onClick", label: "Click", icon: <CircleDot size={13} /> },
    { value: "onPointerMove", label: "Pointer", icon: <Move size={13} /> },
    { value: "continuous", label: "Loop", icon: <Repeat size={13} /> },
];
const GROUPS: Record<string, string> = {
    entrance: "Entrances", attention: "Emphasis", exit: "Exits", text: "Text",
    transform: "Transforms", color: "Color & background", clip: "Reveals",
};
const FRAME_FIELDS: { key: Exclude<keyof AnimationKeyframe, "time">; label: string; unit: string; min: number; max: number; step: number }[] = [
    { key: "x", label: "Move X", unit: "px", min: -10000, max: 10000, step: 1 },
    { key: "y", label: "Move Y", unit: "px", min: -10000, max: 10000, step: 1 },
    { key: "z", label: "Move Z", unit: "px", min: -10000, max: 10000, step: 1 },
    { key: "scale", label: "Scale", unit: "×", min: 0.01, max: 20, step: 0.01 },
    { key: "rotation", label: "Rotate Z", unit: "°", min: -3600, max: 3600, step: 1 },
    { key: "rotateX", label: "Rotate X", unit: "°", min: -3600, max: 3600, step: 1 },
    { key: "rotateY", label: "Rotate Y", unit: "°", min: -3600, max: 3600, step: 1 },
    { key: "opacity", label: "Opacity", unit: "", min: 0, max: 1, step: 0.01 },
    { key: "blur", label: "Blur", unit: "px", min: 0, max: 100, step: 1 },
    { key: "clip", label: "Clip right", unit: "%", min: 0, max: 100, step: 1 },
];

function starter(label: string): AnimationData {
    const animation = defaultAnimation();
    animation.name = label;
    if (label === "Hover lift") Object.assign(animation, {
        trigger: "onHover", duration: 0.3,
        keyframes: [{ ...neutralFrame }, { ...neutralFrame, time: 1, y: -8, scale: 1.04 }],
    });
    if (label === "Scroll reveal") Object.assign(animation, { trigger: "onScroll" });
    if (label === "Parallax") Object.assign(animation, {
        trigger: "onScroll", scrollMode: "scrub", easing: "linear",
        keyframes: [{ ...neutralFrame, y: 80 }, { ...neutralFrame, time: 1, y: -80 }],
    });
    if (label === "Pointer tilt") Object.assign(animation, { type: "tilt3D", trigger: "onPointerMove", intensity: 12 });
    if (label === "Cinematic reveal") Object.assign(animation, {
        duration: 1.2, keyframes: [{ ...neutralFrame, y: 32, rotateX: 12, blur: 12, clip: 100, opacity: 0 }, { ...neutralFrame, time: 1 }],
    });
    if (label === "Float") Object.assign(animation, {
        trigger: "continuous", duration: 3, iterationCount: "infinite", easing: "ease-in-out",
        keyframes: [{ ...neutralFrame }, { ...neutralFrame, time: 0.5, y: -16 }, { ...neutralFrame, time: 1 }],
    });
    return animation;
}

interface AnimationPanelProps {
    elementId: string;
    elementType: ElementType;
    animation?: AnimationData;
    motion?: ElementNode["motion"];
    onUpdate: (anim: AnimationData | undefined) => void;
}

export default function AnimationPanel({ elementId, elementType, animation, motion, onUpdate }: AnimationPanelProps) {
    const tracks = animationTracks(animation, motion);
    const [selected, setSelected] = useState(0);
    const [selectedFrame, setSelectedFrame] = useState(0);
    const [position, setPosition] = useState(0);
    const [playing, setPlaying] = useState(false);
    const previews = useRef<Animation[]>([]);
    const previewDuration = useRef(1);
    const clock = useRef(0);
    const restore = useRef<(() => void) | null>(null);
    const index = Math.min(selected, Math.max(0, tracks.length - 1));
    const anim = tracks[index];
    const frames = anim?.keyframes ? [...anim.keyframes].sort((a, b) => a.time - b.time) : [];
    const frameIndex = Math.min(selectedFrame, Math.max(0, frames.length - 1));
    const frame = frames[frameIndex];
    const catalog = ANIMATIONS.filter(item => (!item.allowedElements || item.allowedElements.includes(elementType)) && (!item.excludedElements || !item.excludedElements.includes(elementType)));

    const cancelPreview = () => {
        cancelAnimationFrame(clock.current);
        previews.current.forEach(player => player.cancel());
        previews.current = [];
        restore.current?.(); restore.current = null;
    };
    useEffect(() => () => {
        cancelAnimationFrame(clock.current);
        previews.current.forEach(player => player.cancel());
        previews.current = [];
        restore.current?.(); restore.current = null;
    }, [animation, motion, elementId]);

    const save = (next: AnimationData[]) => {
        cancelPreview(); setPlaying(false);
        onUpdate(stackAnimations(next.map(track => ({ ...track, id: track.id || crypto.randomUUID() }))));
    };
    const patch = (change: Partial<AnimationData>) => save(tracks.map((track, i) => i === index ? { ...track, ...change } : track));
    const add = (effect: AnimationData) => {
        save([...tracks, effect]); setSelected(tracks.length); setSelectedFrame(0); setPosition(0);
    };
    const makePreview = () => {
        if (!anim) return;
        cancelPreview();
        const target = document.querySelector<HTMLElement>(`.canvas-page [data-element-id="${CSS.escape(elementId)}"]`);
        if (!target) return;
        target.dispatchEvent(new CustomEvent("levoks:animation-preview", { detail: true }));
        const original = target.style.animation;
        target.style.animation = "none";
        restore.current = () => {
            target.style.animation = original;
            target.dispatchEvent(new CustomEvent("levoks:animation-preview", { detail: false }));
        };
        const targets = anim.target === "children" ? Array.from(target.children) : [target];
        previewDuration.current = anim.duration * 1000 + (anim.target === "children" ? Math.max(0, targets.length - 1) * (anim.stagger ?? 0.08) * 1000 : 0);
        const keyframes = animationFrames(anim);
        targets.forEach((node, i) => {
            const options: KeyframeAnimationOptions = {
                duration: anim.duration * 1000, fill: "both", iterations: 1, direction: anim.direction,
                delay: anim.target === "children" ? i * (anim.stagger ?? 0.08) * 1000 : 0,
                easing: CSS.supports("animation-timing-function", anim.easing) ? anim.easing : "linear",
            };
            if (keyframes.some(keyframe => keyframe.transform)) previews.current.push(node.animate(keyframes.map(keyframe => ({ offset: keyframe.offset, transform: keyframe.transform })), { ...options, composite: "add" }));
            const opacity = Number.parseFloat(getComputedStyle(node).opacity);
            const channels = keyframes.map(keyframe => {
                const channels = { ...keyframe }; delete channels.transform;
                if (channels.opacity !== undefined) channels.opacity = Number(channels.opacity) * opacity;
                return channels;
            });
            if (channels.some(keyframe => Object.keys(keyframe).length > 1)) previews.current.push(node.animate(channels, options));
        });
        previews.current.forEach(player => player.pause());
    };
    const scrub = (value: number) => {
        if (!previews.current.length) makePreview();
        cancelAnimationFrame(clock.current); setPlaying(false); setPosition(value);
        previews.current.forEach(player => { player.pause(); player.currentTime = value / 100 * previewDuration.current; });
    };
    const play = () => {
        if (playing) { cancelAnimationFrame(clock.current); previews.current.forEach(player => player.pause()); setPlaying(false); return; }
        makePreview(); setPlaying(true); setPosition(0);
        previews.current.forEach(player => { player.currentTime = 0; player.play(); });
        const tick = () => {
            const time = Number(previews.current[0]?.currentTime ?? 0);
            const progress = Math.min(100, time / Math.max(50, previewDuration.current) * 100);
            setPosition(progress);
            if (previews.current.length && previews.current.some(player => player.playState === "running")) clock.current = requestAnimationFrame(tick);
            else { setPlaying(false); cancelPreview(); }
        };
        clock.current = requestAnimationFrame(tick);
    };

    return <section className={styles.panel} aria-label="Animation editor">
        <div className={styles.heading}><strong>Animations</strong><span>{tracks.length} / 8 effects</span></div>
        <p className={styles.intro}>Build motion in layers. Each effect has its own trigger and timing.</p>
        {!tracks.length && <div className={styles.starters}>
            {["Scroll reveal", "Hover lift", "Parallax", "Pointer tilt", "Cinematic reveal", "Float"].map(label => <button key={label} onClick={() => add(starter(label))}>
                {label === "Pointer tilt" ? <MousePointer2 size={14} /> : label === "Parallax" || label === "Scroll reveal" ? <Scroll size={14} /> : <Sparkles size={14} />}<span>{label}</span>
            </button>)}
        </div>}
        <div className={styles.tracks}>
            {tracks.map((track, i) => <div key={track.id || i} className={`${styles.track} ${i === index ? styles.selected : ""}`}>
                <button className={styles.trackSelect} aria-pressed={i === index} onClick={() => { cancelPreview(); setPlaying(false); setSelected(i); setSelectedFrame(0); setPosition(0); }}>
                    <Diamond size={14} /><span><strong>{track.name || (track.type === "custom" ? "Custom keyframes" : ANIMATIONS.find(item => item.type === track.type)?.label || track.type)}</strong><small>{TRIGGERS.find(trigger => trigger.value === track.trigger)?.label}{track.scrollMode === "scrub" && track.trigger === "onScroll" ? " · Scrub" : ""} · {track.duration}s</small></span>
                </button>
                <button className={styles.iconButton} aria-label={`${track.enabled === false ? "Enable" : "Disable"} effect ${i + 1}`} aria-pressed={track.enabled !== false} onClick={() => save(tracks.map((item, j) => j === i ? { ...item, enabled: item.enabled === false } : item))}><Eye size={14} /></button>
                <button className={styles.iconButton} aria-label={`Remove effect ${i + 1}`} onClick={() => { save(tracks.filter((_, j) => j !== i)); setSelected(Math.max(0, i - 1)); }}><Trash2 size={14} /></button>
            </div>)}
        </div>
        <button className={styles.add} disabled={tracks.length >= 8} onClick={() => add(defaultAnimation())}><Plus size={14} />Add effect</button>
        {anim && <>
            <div className={styles.section}>
                <label className={styles.field}><span>Effect name</span><input aria-label="Effect name" value={anim.name || ""} placeholder="e.g. Product reveal" maxLength={100} onChange={event => patch({ name: event.target.value })} /></label>
                <h3>Trigger</h3>
                <div className={styles.triggers}>{TRIGGERS.map(trigger => <button key={trigger.value} aria-pressed={anim.trigger === trigger.value} onClick={() => patch({
                    trigger: trigger.value,
                    iterationCount: trigger.value === "continuous" ? "infinite" : 1,
                    ...(trigger.value === "onPointerMove" ? { type: "tilt3D", intensity: 12 } : {}),
                })}>{trigger.icon}{trigger.label}</button>)}</div>
                {anim.trigger === "onHover" && <label className={styles.field}><span>On pointer leave</span><select aria-label="Hover leave behavior" value={anim.hoverMode || "reverse"} onChange={event => patch({ hoverMode: event.target.value as AnimationData["hoverMode"] })}><option value="reverse">Reverse to initial state</option><option value="reset">Reset immediately</option><option value="complete">Finish the animation</option></select></label>}
                {anim.trigger === "onScroll" && <div className={styles.triggerSettings}>
                    <div className={styles.segmented}>{(["reveal", "scrub"] as const).map(mode => <button key={mode} disabled={mode === "scrub" && anim.type === "typewriter"} aria-pressed={(anim.scrollMode || "reveal") === mode} onClick={() => patch({ scrollMode: mode, ...(mode === "scrub" ? { easing: "linear", iterationCount: 1 } : {}) })}>{mode === "reveal" ? "Reveal in view" : "Scrub with scroll"}</button>)}</div>
                    {anim.scrollMode === "scrub" ? <>
                        <p className={styles.hint}>Starts when the top reaches Start; finishes when the bottom reaches End. Scrolling back reverses it.</p>
                        <div className={styles.fields}>
                            <label className={styles.field}><span>Start · viewport</span><ParameterControl label="Scroll start" value={anim.scrollStart ?? 80} unit="%" min={(anim.scrollEnd ?? 20) + 1} max={100} onChange={value => patch({ scrollStart: value })} /></label>
                            <label className={styles.field}><span>End · viewport</span><ParameterControl label="Scroll end" value={anim.scrollEnd ?? 20} unit="%" min={0} max={(anim.scrollStart ?? 80) - 1} onChange={value => patch({ scrollEnd: value })} /></label>
                        </div>
                    </> : <>
                        <label className={styles.field}><span>Visible amount</span><ParameterControl label="Scroll visibility threshold" value={anim.scrollOffset ?? 20} min={0} max={100} unit="%" onChange={value => patch({ scrollOffset: value })} /></label>
                        <label className={styles.checkbox}><input type="checkbox" checked={anim.scrollReplay || false} onChange={event => patch({ scrollReplay: event.target.checked })} />Replay on re-entry</label>
                    </>}
                </div>}
                {anim.trigger === "onPointerMove" && <div className={styles.triggerSettings}>
                    <label className={styles.field}><span>Pointer response</span><select aria-label="Pointer response" value={anim.pointerMode || "tilt"} onChange={event => patch({ pointerMode: event.target.value as AnimationData["pointerMode"] })}><option value="tilt">3D tilt</option><option value="follow">Follow pointer</option></select></label>
                    <label className={styles.field}><span>Intensity</span><ParameterControl label="Pointer intensity" value={anim.intensity ?? 12} unit={anim.pointerMode === "follow" ? "px" : "°"} min={0} max={100} onChange={value => patch({ intensity: value })} /></label>
                    <p className={styles.hint}>Follows the pointer in both axes and resets on leave. Touch devices keep the resting state.</p>
                </div>}
            </div>
            {anim.trigger !== "onPointerMove" && <div className={styles.section}>
                <label className={styles.field}><span>Motion</span><select aria-label="Animation motion" value={anim.type} onChange={event => {
                    const type = event.target.value as AnimationType;
                    patch({ type, ...(type === "custom" && !anim.keyframes ? { keyframes: defaultAnimation().keyframes } : {}), ...(type === "typewriter" ? { scrollMode: "reveal" } : {}) }); setSelectedFrame(0);
                }}><option value="custom">Custom keyframes</option>{Object.entries(GROUPS).map(([group, label]) => <optgroup key={group} label={label}>{catalog.filter(item => item.group === group).map(item => <option value={item.type} key={item.type}>{item.label}</option>)}</optgroup>)}</select></label>
                {anim.type === "custom" && frame && <>
                    <div className={styles.subheading}><h3>Keyframes</h3><button className={styles.iconButton} aria-label="Add keyframe" disabled={frames.length >= 100} onClick={() => {
                        const next = insertKeyframe(frames); const inserted = next.find(item => !frames.some(existing => existing.time === item.time))!;
                        patch({ keyframes: next }); setSelectedFrame(next.indexOf(inserted));
                    }}><Plus size={14} /></button></div>
                    <div className={styles.timeline} aria-label="Keyframe stops">
                        <div className={styles.timelineLine} />
                        {frames.map((item, i) => <button key={item.time} className={styles.stop} style={{ left: `${item.time * 100}%` }} aria-label={`Select keyframe at ${Number((item.time * 100).toFixed(2))}%`} aria-pressed={i === frameIndex} title={`${Number((item.time * 100).toFixed(2))}%`} onClick={() => { setSelectedFrame(i); scrub(item.time * 100); }}><Diamond size={14} fill={i === frameIndex ? "currentColor" : "var(--bg-panel)"} /></button>)}
                        <span className={styles.timelineStart}>0%</span><span className={styles.timelineEnd}>100%</span>
                    </div>
                    <div className={styles.subheading}><span>Stop {frameIndex + 1} of {frames.length}</span><button className={styles.iconButton} aria-label="Delete selected keyframe" disabled={frame.time === 0 || frame.time === 1} onClick={() => { patch({ keyframes: frames.filter((_, i) => i !== frameIndex) }); setSelectedFrame(Math.max(0, frameIndex - 1)); }}><Trash2 size={13} /></button></div>
                    <label className={styles.field}><span>Position in animation</span>{frame.time === 0 || frame.time === 1 ? <output className={styles.endpoint}>{frame.time * 100}% · Endpoint</output> : <ParameterControl label="Keyframe position" value={frame.time * 100} min={0.01} max={99.99} unit="%" step={1} onChange={value => {
                        const time = Number((value / 100).toFixed(6));
                        if (frames.some((other, i) => i !== frameIndex && other.time === time)) return;
                        const next = frames.map((other, i) => i === frameIndex ? { ...other, time } : other).sort((a, b) => a.time - b.time);
                        patch({ keyframes: next }); setSelectedFrame(next.findIndex(item => item.time === time));
                    }} />}</label>
                    <div className={styles.fields}>{FRAME_FIELDS.map(field => <label className={styles.field} key={field.key}><span>{field.label}</span><ParameterControl label={`Keyframe ${field.label}`} value={frame[field.key]} unit={field.unit} min={field.min} max={field.max} step={field.step} sensitivity={field.step < 1 ? 0.005 : 0.5} onChange={value => patch({ keyframes: frames.map((item, i) => i === frameIndex ? { ...item, [field.key]: value } : item) })} /></label>)}</div>
                </>}
                {anim.type === "typewriter" && <label className={styles.field}><span>Character interval</span><ParameterControl label="Character interval" value={anim.textSpeed ?? 50} min={10} max={1000} unit="ms" onChange={value => patch({ textSpeed: value })} /></label>}
                {anim.type !== "custom" && anim.type !== "typewriter" && <div className={styles.fields}>
                    {presetParameters(anim.type).includes("distance") && <label className={styles.field}><span>Distance</span><ParameterControl label="Animation distance" value={anim.translateDistance ?? 30} unit="px" min={-10000} max={10000} onChange={value => patch({ translateDistance: value })} /></label>}
                    {presetParameters(anim.type).includes("rotation") && <label className={styles.field}><span>Rotation</span><ParameterControl label="Animation rotation" value={anim.rotateAngle ?? 360} unit="°" min={-3600} max={3600} onChange={value => patch({ rotateAngle: value })} /></label>}
                    {presetParameters(anim.type).includes("scale") && <label className={styles.field}><span>Scale from</span><ParameterControl label="Animation scale from" value={anim.scaleFrom ?? 0} unit="×" min={0} max={20} step={0.01} sensitivity={0.005} onChange={value => patch({ scaleFrom: value })} /></label>}
                    {presetParameters(anim.type).includes("intensity") && <label className={styles.field}><span>Intensity</span><ParameterControl label="Animation intensity" value={anim.intensity ?? 5} min={0} max={100} onChange={value => patch({ intensity: value })} /></label>}
                </div>}
            </div>}
            {anim.trigger !== "onPointerMove" && <div className={styles.section}>
                <h3>Timing & sequence</h3>
                <div className={styles.fields}>
                    <label className={styles.field}><span>Duration</span><ParameterControl label="Animation duration" value={anim.duration} min={0.05} max={120} step={0.05} sensitivity={0.005} unit="s" onChange={value => patch({ duration: value })} /></label>
                    {!(anim.trigger === "onScroll" && anim.scrollMode === "scrub") && <label className={styles.field}><span>Delay</span><ParameterControl label="Animation delay" value={anim.delay} min={0} max={120} step={0.05} sensitivity={0.005} unit="s" onChange={value => patch({ delay: value })} /></label>}
                </div>
                <label className={styles.field}><span>Easing</span><select aria-label="Animation easing" value={EASING_OPTIONS.some(option => option.value === anim.easing) ? anim.easing : "custom"} onChange={event => patch({ easing: event.target.value === "custom" ? "cubic-bezier(0.25, 0.1, 0.25, 1)" : event.target.value })}>{EASING_OPTIONS.map(option => <option value={option.value} key={option.value}>{option.label}</option>)}<option value="custom">Custom cubic Bézier</option></select></label>
                {anim.easing.startsWith("cubic-bezier(") && <div className={styles.fields}>{["X1", "Y1", "X2", "Y2"].map((label, i) => {
                    const curve = anim.easing.slice(13, -1).split(",").map(Number);
                    return <label key={label} className={styles.field}><span>{label}</span><ParameterControl label={`Easing ${label}`} value={curve[i]} min={i % 2 === 0 ? 0 : -3} max={i % 2 === 0 ? 1 : 3} step={0.01} sensitivity={0.005} onChange={value => { curve[i] = value; patch({ easing: `cubic-bezier(${curve.join(", ")})` }); }} /></label>;
                })}</div>}
                {anim.trigger !== "onScroll" || anim.scrollMode !== "scrub" ? <div className={styles.fields}>
                    <label className={styles.field}><span>Repeat</span><select aria-label="Animation repeat" value={anim.iterationCount === "infinite" ? "infinite" : "count"} onChange={event => patch({ iterationCount: event.target.value === "infinite" ? "infinite" : 1 })}><option value="count">Fixed count</option><option value="infinite">Forever</option></select></label>
                    {anim.iterationCount !== "infinite" && <label className={styles.field}><span>Iterations</span><ParameterControl label="Animation iterations" value={anim.iterationCount} min={1} max={100} precision={0} onChange={value => patch({ iterationCount: value })} /></label>}
                </div> : null}
                <div className={styles.fields}>
                    <label className={styles.field}><span>Direction</span><select aria-label="Animation direction" value={anim.direction} onChange={event => patch({ direction: event.target.value as AnimationData["direction"] })}>{["normal", "reverse", "alternate", "alternate-reverse"].map(value => <option key={value}>{value}</option>)}</select></label>
                    {!(anim.trigger === "onScroll" && anim.scrollMode === "scrub") && <label className={styles.field}><span>After playback</span><select aria-label="Animation fill mode" value={anim.fillMode} onChange={event => patch({ fillMode: event.target.value as AnimationData["fillMode"] })}><option value="both">Keep both states</option><option value="forwards">Keep final state</option><option value="backwards">Keep initial state</option><option value="none">Restore original</option></select></label>}
                </div>
                <label className={styles.field}><span>Animate</span><select aria-label="Animation target" value={anim.target || "self"} onChange={event => patch({ target: event.target.value as AnimationData["target"] })}><option value="self">This element</option><option value="children">Direct children · stagger</option></select></label>
                {anim.target === "children" && <label className={styles.field}><span>Between children</span><ParameterControl label="Child stagger" value={anim.stagger ?? 0.08} min={0} max={10} unit="s" step={0.01} sensitivity={0.005} onChange={value => patch({ stagger: value })} /></label>}
            </div>}
            {anim.type !== "typewriter" && anim.trigger !== "onPointerMove" && <div className={styles.preview}>
                <div className={styles.subheading}><strong>Preview effect</strong><output>{position.toFixed(0)}%</output></div>
                <div className={styles.playback}><button className={styles.iconButton} aria-label={playing ? "Pause effect preview" : "Play effect preview"} onClick={play}>{playing ? <Pause size={15} /> : <Play size={15} />}</button><input type="range" aria-label="Animation preview progress" min={0} max={100} step={0.1} value={position} onChange={event => scrub(Number(event.target.value))} /><button className={styles.iconButton} aria-label="Reset effect preview" onClick={() => { cancelPreview(); setPosition(0); setPlaying(false); }}><RotateCcw size={14} /></button></div>
                <p className={styles.hint}>Scrub this effect on the canvas. Open site Preview to test all triggers together.</p>
            </div>}
        </>}
        <button className={styles.timelineLink} onClick={() => useEditorUIStore.setState({ motionOpen: true })}><SlidersHorizontal size={14} />Open page motion timeline</button>
        <p className={styles.footnote}>Published animations respect reduced-motion preferences.</p>
    </section>;
}
