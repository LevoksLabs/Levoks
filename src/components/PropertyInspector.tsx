"use client";

import { useEditorStore } from "@/store/editorStore";
import { AnimationData, ActionData, CONTAINER_TYPES, ElementNode } from "@/types";
import {
    Eye, EyeOff, Lock, Unlock, Copy, Trash2, ChevronRight,
    AlignLeft, AlignCenter, AlignRight, AlignJustify, Sun,
} from "lucide-react";
import AnimationPanel from "./AnimationPanel";
import { useState, useRef, useEffect } from "react";
import ColorPicker from "react-best-gradient-color-picker";

const FONT_FAMILIES = [
    "Inter", "Roboto", "Playfair Display", "Montserrat", "Open Sans",
    "Lato", "Poppins", "Georgia", "Times New Roman", "Arial",
];

const ICON_OPTIONS = [
    "star", "heart", "home", "search", "mail", "phone",
    "settings", "check", "close", "arrow", "user", "cart",
];

const FORM_FIELD_TYPES = [
    "text",
    "email",
    "password",
    "number",
    "tel",
    "url",
    "date",
    "textarea",
] as const;

const FORM_REQUEST_METHODS = ["GET", "POST", "PUT", "PATCH", "DELETE"] as const;

// Collapsible section component
const Section: React.FC<{
    title: string;
    defaultOpen?: boolean;
    children: React.ReactNode;
}> = ({ title, defaultOpen = true, children }) => {
    const [open, setOpen] = useState(defaultOpen);
    return (
        <div className="insp-section">
            <button className="insp-section-header" onClick={() => setOpen(!open)}>
                <span>{title}</span>
                <ChevronRight size={12} className={`insp-chevron ${open ? "open" : ""}`} />
            </button>
            {open && <div className="insp-section-body">{children}</div>}
        </div>
    );
};

// Field row
const Field: React.FC<{
    label: string;
    children: React.ReactNode;
}> = ({ label, children }) => (
    <div className="insp-field">
        <label>{label}</label>
        <div className="insp-field-input">{children}</div>
    </div>
);

const parseNumericInput = (value: string): number | null => {
    const trimmed = value.trim();
    if (!trimmed) return null;
    const parsed = Number(trimmed);
    return Number.isFinite(parsed) ? parsed : null;
};

const clamp = (value: number, min: number, max: number): number => Math.min(max, Math.max(min, value));

const getElementDisplayName = (label: string | undefined, type: string): string => {
    const trimmed = String(label || "").trim();
    if (trimmed) return trimmed;
    return type.charAt(0).toUpperCase() + type.slice(1);
};

const isGradientColor = (value: string): boolean => /gradient\(/i.test(value || "");

const rgbaToHex = (r: number, g: number, b: number): string => {
    const toHex = (n: number) => clamp(Math.round(n), 0, 255).toString(16).padStart(2, "0");
    return `#${toHex(r)}${toHex(g)}${toHex(b)}`;
};

const toRgba = (hex: string, alpha: number): string => {
    const raw = hex.replace("#", "");
    const full = raw.length === 3
        ? raw.split("").map((c) => c + c).join("")
        : raw.slice(0, 6).padEnd(6, "0");
    const r = parseInt(full.slice(0, 2), 16);
    const g = parseInt(full.slice(2, 4), 16);
    const b = parseInt(full.slice(4, 6), 16);
    return `rgba(${r}, ${g}, ${b}, ${clamp(alpha, 0, 1).toFixed(2)})`;
};

const parseSolidColor = (value: string, fallback = "#ffffff"): { hex: string; alpha: number } => {
    const input = String(value || "").trim();
    if (!input || isGradientColor(input)) {
        return { hex: fallback, alpha: 1 };
    }

    if (input.startsWith("#")) {
        const raw = input.slice(1);
        if (raw.length === 3 || raw.length === 4) {
            const expanded = raw.split("").map((c) => c + c).join("");
            const rgb = expanded.slice(0, 6);
            const alphaHex = expanded.length === 8 ? expanded.slice(6, 8) : "ff";
            return { hex: `#${rgb}`, alpha: clamp(parseInt(alphaHex, 16) / 255, 0, 1) };
        }
        if (raw.length === 6 || raw.length === 8) {
            const rgb = raw.slice(0, 6);
            const alphaHex = raw.length === 8 ? raw.slice(6, 8) : "ff";
            return { hex: `#${rgb}`, alpha: clamp(parseInt(alphaHex, 16) / 255, 0, 1) };
        }
    }

    const rgbaMatch = input.match(
        /rgba?\(\s*(\d{1,3})\s*,\s*(\d{1,3})\s*,\s*(\d{1,3})(?:\s*,\s*([0-9]*\.?[0-9]+))?\s*\)/i
    );
    if (rgbaMatch) {
        const r = clamp(Number(rgbaMatch[1]), 0, 255);
        const g = clamp(Number(rgbaMatch[2]), 0, 255);
        const b = clamp(Number(rgbaMatch[3]), 0, 255);
        const a = rgbaMatch[4] !== undefined ? clamp(Number(rgbaMatch[4]), 0, 1) : 1;
        return { hex: rgbaToHex(r, g, b), alpha: a };
    }

    return { hex: fallback, alpha: 1 };
};

// Shared slider background helper: solid accent-color progress fill for WebKit
const sliderBg = (val: number, min: number, max: number): React.CSSProperties => {
    const pct = Math.max(0, Math.min(100, ((val - min) / (max - min)) * 100));
    return { background: `linear-gradient(to right, var(--accent, #116dff) ${pct}%, var(--bg-input, #2a2a35) ${pct}%)` };
};


//Color and gradient control function
const ColorControl: React.FC<{
    value: string;
    onChange: (value: string) => void;
    fallback?: string;
}> = ({ value, onChange, fallback = "#ffffff" }) => {
    const [isOpen, setIsOpen] = useState(false);
    const popoverRef = useRef<HTMLDivElement>(null);

    // Close popover when clicking outside
    useEffect(() => {
        const handleClickOutside = (event: MouseEvent) => {
            if (popoverRef.current && !popoverRef.current.contains(event.target as Node)) {
                setIsOpen(false);
            }
        };
        if (isOpen) document.addEventListener("mousedown", handleClickOutside);
        return () => document.removeEventListener("mousedown", handleClickOutside);
    }, [isOpen]);

    return (
        <div className="color-advanced" style={{ position: "relative" }}>
            {/* The Clean Sidebar Trigger */}
            <div className="color-row">
                <div
                    className="color-swatch-trigger"
                    style={{ background: value || fallback }}
                    onClick={() => setIsOpen(!isOpen)}
                />
                <input
                    type="text"
                    value={value || ""}
                    onChange={(e) => onChange(e.target.value)}
                    placeholder={fallback}
                />
            </div>

            {/* The Pro Popover Menu */}
            {isOpen && (
                <div className="color-popover" ref={popoverRef}>
                    <ColorPicker
                        value={value || fallback}
                        onChange={onChange}
                        hidePresets={true} // Hides the default ugly color squares
                        hideEyeDrop={true} // Optional: hide if you don't need native eyedropper yet
                        width={240}
                        height={140}
                    />
                </div>
            )}
        </div>
    );
};

// ─── Shadow Control (AE-style light angle + distance) ───

const SHADOW_ANGLE_PRESETS = [
    { label: "TL", value: 225 },
    { label: "T", value: 270 },
    { label: "TR", value: 315 },
    { label: "L", value: 180 },
    { label: "R", value: 0 },
    { label: "BL", value: 135 },
    { label: "B", value: 90 },
    { label: "BR", value: 45 },
];

const normalizeAngle = (value: number): number => ((Math.round(value) % 360) + 360) % 360;

function parseShadowValue(raw: string, isText = false): { enabled: boolean; angle: number; distance: number; blur: number; spread: number; color: string } {
    const defaults = { enabled: false, angle: 135, distance: 4, blur: 8, spread: 0, color: "rgba(0, 0, 0, 0.25)" };
    const val = String(raw || "").trim();
    if (!val || val === "none") return defaults;

    // Try to parse: <offsetX> <offsetY> <blur> [<spread>] <color>
    // or: <color> <offsetX> <offsetY> <blur> [<spread>]
    // standard: offsetX offsetY blur [spread] color
    const numRe = /-?\d+(?:\.\d+)?px/g;
    const nums: number[] = [];
    let match;
    while ((match = numRe.exec(val)) !== null) {
        nums.push(parseFloat(match[0]));
    }
    if (nums.length < 2) return { ...defaults, enabled: val !== "none" };

    const offsetX = nums[0];
    const offsetY = nums[1];
    const blur = nums[2] ?? 0;
    const spread = isText ? 0 : (nums[3] ?? 0);

    // Extract color — everything after the px values
    const colorMatch = val.match(/(rgba?\([^)]+\)|#[0-9a-fA-F]{3,8}|\b[a-z]+\b)(?:\s*$)/i);
    const color = colorMatch ? colorMatch[1] : defaults.color;

    // Compute angle and distance from offsets
    const distance = Math.round(Math.sqrt(offsetX * offsetX + offsetY * offsetY));
    const angle = Math.round(((Math.atan2(offsetY, offsetX) * 180) / Math.PI + 360) % 360);

    return { enabled: true, angle, distance, blur: Math.round(blur), spread: Math.round(spread), color };
}

function composeShadow(s: { enabled: boolean; angle: number; distance: number; blur: number; spread: number; color: string }, isText = false): string {
    if (!s.enabled) return "none";
    const rad = (s.angle * Math.PI) / 180;
    const x = Math.round(Math.cos(rad) * s.distance);
    const y = Math.round(Math.sin(rad) * s.distance);
    if (isText) {
        return `${x}px ${y}px ${s.blur}px ${s.color}`;
    }
    return `${x}px ${y}px ${s.blur}px ${s.spread}px ${s.color}`;
}

const ShadowControl: React.FC<{
    label: string;
    value: string;
    onChange: (value: string) => void;
    isTextShadow?: boolean;
}> = ({ label, value, onChange, isTextShadow = false }) => {
    const shadow = parseShadowValue(value, isTextShadow);

    const update = (patch: Partial<typeof shadow>) => {
        const next = { ...shadow, ...patch };
        onChange(composeShadow(next, isTextShadow));
    };

    const updateAngle = (value: number) => update({ angle: normalizeAngle(value) });

    const sliderBg = (val: number, min: number, max: number) => {
        const pct = ((val - min) / (max - min)) * 100;
        return { background: `linear-gradient(to right, var(--accent, #6366f1) ${pct}%, var(--bg-input, #2a2a35) ${pct}%)` };
    };

    // Extract hex for the color picker
    const colorParsed = parseSolidColor(shadow.color, "#000000");

    return (
        <div className="shadow-control">
            <div className="shadow-control-header">
                <span className="shadow-control-label">{label}</span>
                <label className="toggle-switch toggle-switch-sm">
                    <input
                        type="checkbox"
                        checked={shadow.enabled}
                        onChange={(e) => {
                            if (e.target.checked) {
                                update({ enabled: true });
                            } else {
                                onChange("none");
                            }
                        }}
                    />
                    <span className="toggle-slider" />
                </label>
            </div>

            {shadow.enabled && (
                <div className="shadow-control-body">
                    <div className="shadow-angle-row">
                        <div className="shadow-angle-panel">
                            <div className="shadow-angle-dial-wrap">
                                <button
                                    type="button"
                                    className="shadow-angle-dial"
                                    aria-label={`Shadow angle ${shadow.angle} degrees`}
                                    onPointerDown={(e) => {
                                        e.preventDefault();
                                        const rect = e.currentTarget.getBoundingClientRect();
                                        const cx = rect.left + rect.width / 2;
                                        const cy = rect.top + rect.height / 2;
                                        const calcAngle = (clientX: number, clientY: number) => {
                                            const deg = ((Math.atan2(clientY - cy, clientX - cx) * 180) / Math.PI + 360) % 360;
                                            updateAngle(deg);
                                        };
                                        calcAngle(e.clientX, e.clientY);
                                        const onMove = (ev: PointerEvent) => calcAngle(ev.clientX, ev.clientY);
                                        const onUp = () => {
                                            window.removeEventListener("pointermove", onMove);
                                            window.removeEventListener("pointerup", onUp);
                                        };
                                        window.addEventListener("pointermove", onMove);
                                        window.addEventListener("pointerup", onUp);
                                    }}
                                    onKeyDown={(e) => {
                                        if (e.key === "ArrowRight" || e.key === "ArrowUp") {
                                            e.preventDefault();
                                            updateAngle(shadow.angle + (e.shiftKey ? 15 : 1));
                                        }
                                        if (e.key === "ArrowLeft" || e.key === "ArrowDown") {
                                            e.preventDefault();
                                            updateAngle(shadow.angle - (e.shiftKey ? 15 : 1));
                                        }
                                    }}
                                >
                                    <span className="shadow-angle-axis shadow-angle-axis-horizontal" />
                                    <span className="shadow-angle-axis shadow-angle-axis-vertical" />
                                    <span
                                        className="shadow-angle-indicator"
                                        style={{ transform: `rotate(${shadow.angle}deg)` }}
                                    >
                                        <span className="shadow-angle-ray" />
                                        <span className="shadow-angle-dot">
                                            <Sun size={10} strokeWidth={2.4} />
                                        </span>
                                    </span>
                                </button>
                                <label className="shadow-angle-number">
                                    <span>Angle</span>
                                    <input
                                        type="number"
                                        min={0}
                                        max={359}
                                        step={1}
                                        value={shadow.angle}
                                        onChange={(e) => updateAngle(parseInt(e.target.value, 10) || 0)}
                                    />
                                </label>
                            </div>
                            <div className="shadow-angle-presets" aria-label="Shadow angle presets">
                                {SHADOW_ANGLE_PRESETS.map((preset) => (
                                    <button
                                        type="button"
                                        key={preset.label}
                                        className={`shadow-angle-preset shadow-preset-${preset.label.toLowerCase()} ${shadow.angle === preset.value ? "active" : ""}`}
                                        onClick={() => updateAngle(preset.value)}
                                        title={`${preset.label} ${preset.value} degrees`}
                                    >
                                        {preset.label}
                                    </button>
                                ))}
                            </div>
                        </div>
                        <div className="shadow-sliders">
                            <div className="shadow-slider-row">
                                <span className="shadow-slider-label">Distance</span>
                                <input type="range" min={0} max={50} step={1} value={shadow.distance} style={sliderBg(shadow.distance, 0, 50)} onChange={(e) => update({ distance: parseInt(e.target.value) })} className="editor-slider" />
                                <span className="shadow-slider-value">{shadow.distance}</span>
                            </div>
                            <div className="shadow-slider-row">
                                <span className="shadow-slider-label">Blur</span>
                                <input type="range" min={0} max={80} step={1} value={shadow.blur} style={sliderBg(shadow.blur, 0, 80)} onChange={(e) => update({ blur: parseInt(e.target.value) })} className="editor-slider" />
                                <span className="shadow-slider-value">{shadow.blur}</span>
                            </div>
                            {!isTextShadow && (
                                <div className="shadow-slider-row">
                                    <span className="shadow-slider-label">Spread</span>
                                    <input type="range" min={-20} max={30} step={1} value={shadow.spread} style={sliderBg(shadow.spread, -20, 30)} onChange={(e) => update({ spread: parseInt(e.target.value) })} className="editor-slider" />
                                    <span className="shadow-slider-value">{shadow.spread}</span>
                                </div>
                            )}
                        </div>
                    </div>
                    {/* Shadow Color */}
                    <div className="shadow-color-row">
                        <span className="shadow-slider-label">Color</span>
                        <input
                            type="color"
                            className="color-swatch"
                            value={colorParsed.hex}
                            onChange={(e) => update({ color: toRgba(e.target.value, colorParsed.alpha) })}
                        />
                        <input
                            type="range"
                            className="editor-slider"
                            min={0} max={100} step={1}
                            value={Math.round(colorParsed.alpha * 100)}
                            style={sliderBg(colorParsed.alpha * 100, 0, 100)}
                            onChange={(e) => update({ color: toRgba(colorParsed.hex, Number(e.target.value) / 100) })}
                        />
                        <span className="shadow-slider-value">{Math.round(colorParsed.alpha * 100)}%</span>
                    </div>
                </div>
            )}
        </div>
    );
};

const PropertyInspector: React.FC = () => {
    const {
        selectedElementId, getElement, updateElement, deleteElement, duplicateElement,
        updateElementOpacity, updateElementRotation, toggleVisibility, toggleLock,
        updateElementPosition, updateElementSize, canvasSettings, updateCanvasSettings,
        elementsById, addElement: storeAddElement,
    } = useEditorStore();
    const storeDeleteElement = deleteElement;
    const [activeTab, setActiveTab] = useState<"design" | "content" | "animate">("design");
    const [customCss, setCustomCss] = useState("");
    const [renamingElementId, setRenamingElementId] = useState<string | null>(null);
    const [elementNameDraft, setElementNameDraft] = useState("");

    const el = selectedElementId ? getElement(selectedElementId) : undefined;
    const displayName = el ? getElementDisplayName(el.label, el.type) : "";
    const isRenamingElement = Boolean(el && renamingElementId === el.id);

    if (!el) {
        return (
            <div className="inspector">
                <div className="insp-header">
                    <span className="insp-type-badge">Canvas</span>
                </div>
                <div className="insp-body">
                    <Section title="Canvas Settings">
                        <Field label="Background">
                            <ColorControl
                                value={String(canvasSettings.backgroundColor || "#ffffff")}
                                onChange={(value) => updateCanvasSettings({ backgroundColor: value })}
                                fallback="#ffffff"
                                allowGradient
                            />
                        </Field>
                        <div className="insp-row-2">
                            <Field label="Width">
                                <input
                                    type="number"
                                    value={canvasSettings.width}
                                    onChange={(e) => {
                                        const parsed = parseNumericInput(e.target.value);
                                        if (parsed === null) return;
                                        updateCanvasSettings({ width: Math.max(320, parsed) });
                                    }}
                                />
                            </Field>
                            <Field label="Height">
                                <input
                                    type="number"
                                    value={canvasSettings.height}
                                    onChange={(e) => {
                                        const parsed = parseNumericInput(e.target.value);
                                        if (parsed === null) return;
                                        updateCanvasSettings({ height: Math.max(200, parsed) });
                                    }}
                                />
                            </Field>
                        </div>
                    </Section>
                    <div className="inspector-hint">
                        <span>Select an element on the canvas to edit its properties</span>
                    </div>
                </div>
            </div>
        );
    }

    const setProp = (key: string, val: string | number | boolean) =>
        updateElement(el.id, { props: { ...el.props, [key]: val } });
    const setStyle = (key: string, val: string | number) =>
        updateElement(el.id, { styles: { ...el.styles, [key]: val } });
    const setBackgroundStyle = (value: string) => {
        const nextStyles: Record<string, string | number> = { ...el.styles };
        if (isGradientColor(value)) {
            nextStyles.background = value;
            nextStyles.backgroundColor = "transparent";
        } else {
            nextStyles.background = value;
            nextStyles.backgroundColor = value;
        }
        updateElement(el.id, { styles: nextStyles });
    };
    const setAnim = (anim: AnimationData) =>
        updateElement(el.id, { animation: anim });
    const setAction = (act: ActionData) =>
        updateElement(el.id, { actions: act });
    const startRenameElement = () => {
        setElementNameDraft(displayName);
        setRenamingElementId(el.id);
    };
    const cancelRenameElement = () => {
        setElementNameDraft(displayName);
        setRenamingElementId(null);
    };
    const commitRenameElement = () => {
        const nextName = elementNameDraft.trim();
        const currentName = String(el.label || "").trim();
        if (nextName && nextName !== currentName) {
            updateElement(el.id, { label: nextName });
        }
        setRenamingElementId(null);
    };
    const formFieldIds = el.type === "form"
        ? el.children.filter((childId) => { const c = elementsById[childId]; return c && c.type === "input"; })
        : [];
    const formFields = formFieldIds.map(id => elementsById[id]).filter(Boolean);
    const updateFormField = (fieldId: string, updates: Partial<ElementNode>) => {
        if (el.type !== "form") return;
        updateElement(fieldId, updates);
    };
    const addFormField = () => {
        if (el.type !== "form") return;
        const nextIndex = formFields.length + 1;
        storeAddElement({
            type: "input",
            label: `Field ${nextIndex}`,
            props: {
                name: `field_${nextIndex}`,
                placeholder: `Field ${nextIndex}`,
                inputType: "text",
                required: false,
            },
            styles: {
                padding: "10px 14px",
                border: "1px solid #d1d5db",
                borderRadius: "6px",
                fontSize: "14px",
                width: "100%",
                backgroundColor: "#ffffff",
            },
            layout: { w: 360, h: 40 },
        }, el.id);
    };
    const removeFormField = (fieldId: string) => {
        if (el.type !== "form") return;
        storeDeleteElement(fieldId);
    };
    const formRequestMethod = String(el.props.requestMethod || "POST").toUpperCase();

    const isTextElement = el.type === "text" || el.type === "title" || el.type === "paragraph";
    const isContainerType = CONTAINER_TYPES.includes(el.type);

    return (
        <div className="inspector">
            {/* Header */}
            <div className="insp-header">
                <div className="insp-header-main">
                    {isRenamingElement ? (
                        <input
                            className="insp-name-input"
                            type="text"
                            value={elementNameDraft}
                            onChange={(e) => setElementNameDraft(e.target.value)}
                            onBlur={commitRenameElement}
                            onKeyDown={(e) => {
                                if (e.key === "Enter") commitRenameElement();
                                if (e.key === "Escape") cancelRenameElement();
                            }}
                            autoFocus
                        />
                    ) : (
                        <span
                            className="insp-type-badge insp-type-badge-editable"
                            title="Double-click to rename"
                            onDoubleClick={startRenameElement}
                        >
                            {displayName}
                        </span>
                    )}
                </div>
                <div className="insp-header-actions">
                    <button
                        className={`insp-icon-btn ${!el.layout.visible ? "active-toggle" : ""}`}
                        onClick={() => toggleVisibility(el.id)}
                        title={el.layout.visible ? "Hide" : "Show"}
                    >
                        {el.layout.visible ? <Eye size={14} /> : <EyeOff size={14} />}
                    </button>
                    <button
                        className={`insp-icon-btn ${el.layout.locked ? "active-toggle" : ""}`}
                        onClick={() => toggleLock(el.id)}
                        title={el.layout.locked ? "Unlock" : "Lock"}
                    >
                        {el.layout.locked ? <Lock size={14} /> : <Unlock size={14} />}
                    </button>
                    <button className="insp-icon-btn" onClick={() => duplicateElement(el.id)} title="Duplicate"><Copy size={14} /></button>
                    <button className="insp-icon-btn danger" onClick={() => deleteElement(el.id)} title="Delete"><Trash2 size={14} /></button>
                </div>
            </div>

            {/* Tabs */}
            <div className="insp-tabs">
                {(["design", "content", "animate"] as const).map((tab) => (
                    <button
                        key={tab}
                        className={`insp-tab ${activeTab === tab ? "active" : ""}`}
                        onClick={() => setActiveTab(tab)}
                    >
                        {tab.charAt(0).toUpperCase() + tab.slice(1)}
                    </button>
                ))}
            </div>

            <div className="insp-body">
                {/* ─── DESIGN TAB ─── */}
                {activeTab === "design" && (
                    <>
                        {/* Position & Size */}
                        <Section title="Position & Size">
                            <div className="insp-row-2">
                                <Field label="X">
                                    <input
                                        type="number"
                                        value={Math.round(el.layout.x)}
                                        onChange={(e) => {
                                            const parsed = parseNumericInput(e.target.value);
                                            if (parsed === null) return;
                                            updateElementPosition(el.id, parsed, el.layout.y);
                                        }}
                                    />
                                </Field>
                                <Field label="Y">
                                    <input
                                        type="number"
                                        value={Math.round(el.layout.y)}
                                        onChange={(e) => {
                                            const parsed = parseNumericInput(e.target.value);
                                            if (parsed === null) return;
                                            updateElementPosition(el.id, el.layout.x, parsed);
                                        }}
                                    />
                                </Field>
                            </div>
                            <div className="insp-row-2">
                                <Field label="W">
                                    <input
                                        type="number"
                                        value={Math.round(el.layout.w)}
                                        onChange={(e) => {
                                            const parsed = parseNumericInput(e.target.value);
                                            if (parsed === null) return;
                                            updateElementSize(el.id, Math.max(40, parsed), el.layout.h);
                                        }}
                                    />
                                </Field>
                                <Field label="H">
                                    <input
                                        type="number"
                                        value={Math.round(el.layout.h)}
                                        onChange={(e) => {
                                            const parsed = parseNumericInput(e.target.value);
                                            if (parsed === null) return;
                                            updateElementSize(el.id, el.layout.w, Math.max(20, parsed));
                                        }}
                                    />
                                </Field>
                            </div>
                            <div className="insp-row-2">
                                <Field label="Rotation">
                                    <input
                                        type="number"
                                        value={el.layout.rotation || 0}
                                        onChange={(e) => {
                                            const parsed = parseNumericInput(e.target.value);
                                            if (parsed === null) return;
                                            updateElementRotation(el.id, parsed);
                                        }}
                                        min={0} max={360}
                                    />
                                </Field>
                                <Field label="Opacity">
                                    <div className="opacity-control">
                                        <input
                                            type="range"
                                            min={0} max={100} step={1}
                                            value={Math.round((el.layout.opacity ?? 1) * 100)}
                                            onChange={(e) => updateElementOpacity(el.id, Number(e.target.value) / 100)}
                                            className="editor-slider"
                                            style={sliderBg(Math.round((el.layout.opacity ?? 1) * 100), 0, 100)}
                                        />
                                        <span className="opacity-value">{Math.round((el.layout.opacity ?? 1) * 100)}%</span>
                                    </div>
                                </Field>
                            </div>
                        </Section>

                        {/* Fill color & opacity */}
                        <Section title="Fill Color">
                            <Field label="Background">
                                <ColorControl
                                    value={String(el.styles.background || el.styles.backgroundColor || "")}
                                    onChange={(value) => setBackgroundStyle(value)}
                                    fallback="#ffffff"
                                    allowGradient
                                />
                            </Field>
                            <Field label="Text color">
                                <ColorControl
                                    value={String(el.styles.color || "")}
                                    onChange={(value) => setStyle("color", value)}
                                    fallback="#000000"
                                />
                            </Field>
                        </Section>

                        {/* Text controls — only for text-like elements */}
                        {(isTextElement || el.type === "button") && (
                            <Section title="Typography">
                                <Field label="Font family">
                                    <select
                                        value={String(el.styles.fontFamily || "Inter")}
                                        onChange={(e) => setStyle("fontFamily", e.target.value)}
                                    >
                                        {FONT_FAMILIES.map((f) => (
                                            <option key={f} value={f}>{f}</option>
                                        ))}
                                    </select>
                                </Field>
                                <div className="insp-row-2">
                                    <Field label="Font size">
                                        <input
                                            type="text"
                                            value={String(el.styles.fontSize || "")}
                                            onChange={(e) => setStyle("fontSize", e.target.value)}
                                            placeholder="16px"
                                        />
                                    </Field>
                                    <Field label="Weight">
                                        <select
                                            value={String(el.styles.fontWeight || "400")}
                                            onChange={(e) => setStyle("fontWeight", e.target.value)}
                                        >
                                            <option value="300">Light</option>
                                            <option value="400">Regular</option>
                                            <option value="500">Medium</option>
                                            <option value="600">Semi Bold</option>
                                            <option value="700">Bold</option>
                                            <option value="800">Extra Bold</option>
                                        </select>
                                    </Field>
                                </div>
                                <Field label="Alignment">
                                    <div className="align-buttons">
                                        {(["left", "center", "right", "justify"] as const).map((a) => (
                                            <button
                                                key={a}
                                                className={`align-btn ${el.styles.textAlign === a ? "active" : ""}`}
                                                onClick={() => setStyle("textAlign", a)}
                                                title={a}
                                            >
                                                {a === "left" && <AlignLeft size={14} />}
                                                {a === "center" && <AlignCenter size={14} />}
                                                {a === "right" && <AlignRight size={14} />}
                                                {a === "justify" && <AlignJustify size={14} />}
                                            </button>
                                        ))}
                                    </div>
                                </Field>
                                <div className="insp-row-2">
                                    <Field label="Letter spacing">
                                        <input
                                            type="text"
                                            value={String(el.styles.letterSpacing || "")}
                                            onChange={(e) => setStyle("letterSpacing", e.target.value)}
                                            placeholder="normal"
                                        />
                                    </Field>
                                    <Field label="Line height">
                                        <input
                                            type="text"
                                            value={String(el.styles.lineHeight || "")}
                                            onChange={(e) => setStyle("lineHeight", e.target.value)}
                                            placeholder="1.5"
                                        />
                                    </Field>
                                </div>
                                <Field label="Text transform">
                                    <select
                                        value={String(el.styles.textTransform || "none")}
                                        onChange={(e) => setStyle("textTransform", e.target.value)}
                                    >
                                        <option value="none">None</option>
                                        <option value="uppercase">UPPERCASE</option>
                                        <option value="lowercase">lowercase</option>
                                        <option value="capitalize">Capitalize</option>
                                    </select>
                                </Field>
                                <Field label="Text decoration">
                                    <select
                                        value={String(el.styles.textDecoration || "none")}
                                        onChange={(e) => setStyle("textDecoration", e.target.value)}
                                    >
                                        <option value="none">None</option>
                                        <option value="underline">Underline</option>
                                        <option value="line-through">Strikethrough</option>
                                    </select>
                                </Field>
                            </Section>
                        )}

                        {/* Layout — for containers */}
                        {isContainerType && (
                            <Section title="Layout" defaultOpen={false}>
                                <Field label="Direction">
                                    <select
                                        value={String(el.styles.flexDirection || "column")}
                                        onChange={(e) => setStyle("flexDirection", e.target.value)}
                                    >
                                        <option value="row">Row</option>
                                        <option value="column">Column</option>
                                        <option value="row-reverse">Row Reverse</option>
                                        <option value="column-reverse">Column Reverse</option>
                                    </select>
                                </Field>
                                <Field label="Justify">
                                    <select
                                        value={String(el.styles.justifyContent || "flex-start")}
                                        onChange={(e) => setStyle("justifyContent", e.target.value)}
                                    >
                                        <option value="flex-start">Start</option>
                                        <option value="center">Center</option>
                                        <option value="flex-end">End</option>
                                        <option value="space-between">Space Between</option>
                                        <option value="space-around">Space Around</option>
                                        <option value="space-evenly">Space Evenly</option>
                                    </select>
                                </Field>
                                <Field label="Align">
                                    <select
                                        value={String(el.styles.alignItems || "stretch")}
                                        onChange={(e) => setStyle("alignItems", e.target.value)}
                                    >
                                        <option value="stretch">Stretch</option>
                                        <option value="flex-start">Start</option>
                                        <option value="center">Center</option>
                                        <option value="flex-end">End</option>
                                    </select>
                                </Field>
                                <Field label="Wrap">
                                    <select
                                        value={String(el.styles.flexWrap || "nowrap")}
                                        onChange={(e) => setStyle("flexWrap", e.target.value)}
                                    >
                                        <option value="nowrap">No Wrap</option>
                                        <option value="wrap">Wrap</option>
                                    </select>
                                </Field>
                            </Section>
                        )}

                        {/* Display & Overflow */}
                        <Section title="Display & Overflow" defaultOpen={false}>
                            <Field label="Display">
                                <select
                                    value={String(el.styles.display || "block")}
                                    onChange={(e) => setStyle("display", e.target.value)}
                                >
                                    {["block", "flex", "grid", "inline", "inline-block", "inline-flex", "none"].map((v) => (
                                        <option key={v} value={v}>{v}</option>
                                    ))}
                                </select>
                            </Field>
                            <Field label="Position">
                                <select
                                    value={String(el.styles.position || "absolute")}
                                    onChange={(e) => setStyle("position", e.target.value)}
                                >
                                    {["static", "relative", "absolute", "fixed", "sticky"].map((v) => (
                                        <option key={v} value={v}>{v}</option>
                                    ))}
                                </select>
                            </Field>
                            <Field label="Overflow">
                                <select
                                    value={String(el.styles.overflow || "visible")}
                                    onChange={(e) => setStyle("overflow", e.target.value)}
                                >
                                    {["visible", "hidden", "scroll", "auto"].map((v) => (
                                        <option key={v} value={v}>{v}</option>
                                    ))}
                                </select>
                            </Field>
                            <Field label="Visibility">
                                <select
                                    value={String(el.styles.visibility || "visible")}
                                    onChange={(e) => setStyle("visibility", e.target.value)}
                                >
                                    <option value="visible">Visible</option>
                                    <option value="hidden">Hidden</option>
                                </select>
                            </Field>
                            <Field label="Z-Index">
                                <input
                                    type="number"
                                    value={String(el.styles.zIndex || "")}
                                    onChange={(e) => setStyle("zIndex", e.target.value)}
                                    placeholder="auto"
                                />
                            </Field>
                        </Section>

                        {/* Sizing */}
                        <Section title="Sizing" defaultOpen={false}>
                            <div className="insp-row-2">
                                <Field label="Min W">
                                    <input
                                        type="text"
                                        value={String(el.styles.minWidth || "")}
                                        onChange={(e) => setStyle("minWidth", e.target.value)}
                                        placeholder="auto"
                                    />
                                </Field>
                                <Field label="Max W">
                                    <input
                                        type="text"
                                        value={String(el.styles.maxWidth || "")}
                                        onChange={(e) => setStyle("maxWidth", e.target.value)}
                                        placeholder="none"
                                    />
                                </Field>
                            </div>
                            <div className="insp-row-2">
                                <Field label="Min H">
                                    <input
                                        type="text"
                                        value={String(el.styles.minHeight || "")}
                                        onChange={(e) => setStyle("minHeight", e.target.value)}
                                        placeholder="auto"
                                    />
                                </Field>
                                <Field label="Max H">
                                    <input
                                        type="text"
                                        value={String(el.styles.maxHeight || "")}
                                        onChange={(e) => setStyle("maxHeight", e.target.value)}
                                        placeholder="none"
                                    />
                                </Field>
                            </div>
                            <Field label="Box Sizing">
                                <select
                                    value={String(el.styles.boxSizing || "border-box")}
                                    onChange={(e) => setStyle("boxSizing", e.target.value)}
                                >
                                    <option value="border-box">border-box</option>
                                    <option value="content-box">content-box</option>
                                </select>
                            </Field>
                        </Section>

                        {/* Border — expanded */}
                        <Section title="Border" defaultOpen={false}>
                            <div className="insp-row-2">
                                <Field label="Style">
                                    <select
                                        value={String(el.styles.borderStyle || "none")}
                                        onChange={(e) => setStyle("borderStyle", e.target.value)}
                                    >
                                        {["none", "solid", "dashed", "dotted", "double", "groove", "ridge"].map((v) => (
                                            <option key={v} value={v}>{v}</option>
                                        ))}
                                    </select>
                                </Field>
                                <Field label="Width">
                                    <input
                                        type="text"
                                        value={String(el.styles.borderWidth || "")}
                                        onChange={(e) => setStyle("borderWidth", e.target.value)}
                                        placeholder="0px"
                                    />
                                </Field>
                            </div>
                            <Field label="Color">
                                <ColorControl
                                    value={String(el.styles.borderColor || "")}
                                    onChange={(value) => setStyle("borderColor", value)}
                                    fallback="#000000"
                                />
                            </Field>
                            <Field label="Radius">
                                <input
                                    type="text"
                                    value={String(el.styles.borderRadius || "")}
                                    onChange={(e) => setStyle("borderRadius", e.target.value)}
                                    placeholder="0px"
                                />
                            </Field>
                        </Section>

                        {/* Shadow */}
                        <Section title="Shadow" defaultOpen={false}>
                            <ShadowControl
                                label="Box Shadow"
                                value={String(el.styles.boxShadow || "")}
                                onChange={(v) => setStyle("boxShadow", v)}
                            />
                            <ShadowControl
                                label="Text Shadow"
                                value={String(el.styles.textShadow || "")}
                                onChange={(v) => setStyle("textShadow", v)}
                                isTextShadow
                            />
                        </Section>

                        {/* Spacing */}
                        <Section title="Spacing">
                            <div className="insp-row-2">
                                <Field label="Padding">
                                    <input
                                        type="text"
                                        value={String(el.styles.padding || "")}
                                        onChange={(e) => setStyle("padding", e.target.value)}
                                        placeholder="0px"
                                    />
                                </Field>
                                <Field label="Margin">
                                    <input
                                        type="text"
                                        value={String(el.styles.margin || "")}
                                        onChange={(e) => setStyle("margin", e.target.value)}
                                        placeholder="0px"
                                    />
                                </Field>
                            </div>
                            <Field label="Gap">
                                <input
                                    type="text"
                                    value={String(el.styles.gap || "")}
                                    onChange={(e) => setStyle("gap", e.target.value)}
                                    placeholder="0px"
                                />
                            </Field>
                        </Section>

                        {/* Effects */}
                        <Section title="Effects" defaultOpen={false}>
                            <Field label="Cursor">
                                <select
                                    value={String(el.styles.cursor || "default")}
                                    onChange={(e) => setStyle("cursor", e.target.value)}
                                >
                                    {["default", "pointer", "grab", "move", "text", "wait", "crosshair", "not-allowed", "zoom-in", "zoom-out"].map((v) => (
                                        <option key={v} value={v}>{v}</option>
                                    ))}
                                </select>
                            </Field>
                            <Field label="Pointer Events">
                                <select
                                    value={String(el.styles.pointerEvents || "auto")}
                                    onChange={(e) => setStyle("pointerEvents", e.target.value)}
                                >
                                    <option value="auto">auto</option>
                                    <option value="none">none</option>
                                </select>
                            </Field>
                            <Field label="Mix Blend">
                                <select
                                    value={String(el.styles.mixBlendMode || "normal")}
                                    onChange={(e) => setStyle("mixBlendMode", e.target.value)}
                                >
                                    {["normal", "multiply", "screen", "overlay", "darken", "lighten", "color-dodge", "color-burn", "difference", "exclusion"].map((v) => (
                                        <option key={v} value={v}>{v}</option>
                                    ))}
                                </select>
                            </Field>
                            <Field label="Filter">
                                <input
                                    type="text"
                                    value={String(el.styles.filter || "")}
                                    onChange={(e) => setStyle("filter", e.target.value)}
                                    placeholder="none"
                                />
                            </Field>
                            <Field label="Backdrop Filter">
                                <input
                                    type="text"
                                    value={String(el.styles.backdropFilter || "")}
                                    onChange={(e) => setStyle("backdropFilter", e.target.value)}
                                    placeholder="none"
                                />
                            </Field>
                        </Section>

                        {/* Transitions */}
                        <Section title="Transitions" defaultOpen={false}>
                            <Field label="Transition">
                                <input
                                    type="text"
                                    value={String(el.styles.transition || "")}
                                    onChange={(e) => setStyle("transition", e.target.value)}
                                    placeholder="all 0.3s ease"
                                />
                            </Field>
                        </Section>

                        {/* Custom CSS */}
                        <Section title="Custom CSS" defaultOpen={false}>
                            <Field label="CSS">
                                <textarea
                                    rows={5}
                                    value={customCss}
                                    onChange={(e) => setCustomCss(e.target.value)}
                                    placeholder={`color: red;\nfont-size: 20px;`}
                                    className="custom-css-textarea"
                                />
                            </Field>
                            <button
                                className="apply-css-btn"
                                onClick={() => {
                                    const parsed: Record<string, string> = {};
                                    customCss.split(";").forEach((rule) => {
                                        const [prop, val] = rule.split(":").map((s) => s.trim());
                                        if (prop && val) {
                                            const camel = prop.replace(/-([a-z])/g, (_, c: string) => c.toUpperCase());
                                            parsed[camel] = val;
                                        }
                                    });
                                    if (Object.keys(parsed).length > 0) {
                                        updateElement(el.id, { styles: { ...el.styles, ...parsed } });
                                    }
                                }}
                            >
                                Apply CSS
                            </button>
                        </Section>
                    </>
                )}

                {/* ─── CONTENT TAB ─── */}
                {activeTab === "content" && (
                    <>
                        {/* Text elements */}
                        {isTextElement && (
                            <Section title="Text Content">
                                <Field label="Content">
                                    <textarea
                                        rows={4}
                                        value={String(el.props.content || "")}
                                        onChange={(e) => setProp("content", e.target.value)}
                                    />
                                </Field>
                                {el.type === "title" && (
                                    <Field label="Heading level">
                                        <select
                                            value={String(el.props.level || "2")}
                                            onChange={(e) => setProp("level", Number(e.target.value))}
                                        >
                                            {[1, 2, 3, 4, 5, 6].map((n) => (
                                                <option key={n} value={n}>H{n}</option>
                                            ))}
                                        </select>
                                    </Field>
                                )}
                            </Section>
                        )}

                        {/* Button */}
                        {el.type === "button" && (
                            <Section title="Button">
                                <Field label="Label">
                                    <input
                                        type="text"
                                        value={String(el.props.label || "")}
                                        onChange={(e) => setProp("label", e.target.value)}
                                    />
                                </Field>
                                <Field label="Hover bg color">
                                    <ColorControl
                                        value={String(el.props.hoverBg || "")}
                                        onChange={(value) => setProp("hoverBg", value)}
                                        fallback="#2563eb"
                                        allowGradient
                                    />
                                </Field>
                                <Field label="Click action">
                                    <select
                                        value={el.actions?.type || "none"}
                                        onChange={(e) =>
                                            setAction({
                                                type: e.target.value as ActionData["type"],
                                                target: el.actions?.target || "",
                                            })
                                        }
                                    >
                                        {["none", "redirect", "scroll", "api_call"].map((t) => (
                                            <option key={t} value={t}>{t}</option>
                                        ))}
                                    </select>
                                </Field>
                                {el.actions?.type === "redirect" && (
                                    <Field label="Redirect link">
                                        <input
                                            type="text"
                                            value={el.actions?.target || ""}
                                            onChange={(e) =>
                                                setAction({ type: "redirect", target: e.target.value })
                                            }
                                            placeholder="https://..."
                                        />
                                    </Field>
                                )}
                            </Section>
                        )}

                        {/* Image */}
                        {el.type === "image" && (
                            <Section title="Image">
                                <Field label="Image URL">
                                    <input
                                        type="text"
                                        value={String(el.props.src || "")}
                                        onChange={(e) => setProp("src", e.target.value)}
                                    />
                                </Field>
                                <Field label="Alt text">
                                    <input
                                        type="text"
                                        value={String(el.props.alt || "")}
                                        onChange={(e) => setProp("alt", e.target.value)}
                                    />
                                </Field>
                                <Field label="Object fit">
                                    <select
                                        value={String(el.props.objectFit || "cover")}
                                        onChange={(e) => setProp("objectFit", e.target.value)}
                                    >
                                        <option value="cover">Cover</option>
                                        <option value="contain">Contain</option>
                                        <option value="fill">Fill</option>
                                        <option value="none">None</option>
                                    </select>
                                </Field>
                                <Field label="Link URL">
                                    <input
                                        type="text"
                                        value={String(el.props.link || "")}
                                        onChange={(e) => setProp("link", e.target.value)}
                                        placeholder="https://..."
                                    />
                                </Field>
                            </Section>
                        )}

                        {/* Input */}
                        {el.type === "input" && (
                            <Section title="Input">
                                <Field label="Placeholder">
                                    <input
                                        type="text"
                                        value={String(el.props.placeholder || "")}
                                        onChange={(e) => setProp("placeholder", e.target.value)}
                                    />
                                </Field>
                                <Field label="Type">
                                    <select
                                        value={String(el.props.inputType || "text")}
                                        onChange={(e) => setProp("inputType", e.target.value)}
                                    >
                                        {["text", "email", "password", "number", "tel", "url", "textarea"].map((t) => (
                                            <option key={t} value={t}>{t}</option>
                                        ))}
                                    </select>
                                </Field>
                                <Field label="Required">
                                    <label className="toggle-switch">
                                        <input
                                            type="checkbox"
                                            checked={Boolean(el.props.required)}
                                            onChange={(e) => setProp("required", e.target.checked)}
                                        />
                                        <span className="toggle-slider" />
                                    </label>
                                </Field>
                                <Field label="Max length">
                                    <input
                                        type="number"
                                        value={String(el.props.maxLength || "")}
                                        onChange={(e) => setProp("maxLength", Number(e.target.value))}
                                        placeholder="None"
                                    />
                                </Field>
                            </Section>
                        )}

                        {/* Video */}
                        {el.type === "video" && (
                            <Section title="Video">
                                <Field label="Video URL">
                                    <input
                                        type="text"
                                        value={String(el.props.src || "")}
                                        onChange={(e) => setProp("src", e.target.value)}
                                    />
                                </Field>
                                <Field label="Autoplay">
                                    <label className="toggle-switch">
                                        <input type="checkbox" checked={Boolean(el.props.autoplay)} onChange={(e) => setProp("autoplay", e.target.checked)} />
                                        <span className="toggle-slider" />
                                    </label>
                                </Field>
                                <Field label="Loop">
                                    <label className="toggle-switch">
                                        <input type="checkbox" checked={Boolean(el.props.loop)} onChange={(e) => setProp("loop", e.target.checked)} />
                                        <span className="toggle-slider" />
                                    </label>
                                </Field>
                                <Field label="Muted">
                                    <label className="toggle-switch">
                                        <input type="checkbox" checked={Boolean(el.props.muted)} onChange={(e) => setProp("muted", e.target.checked)} />
                                        <span className="toggle-slider" />
                                    </label>
                                </Field>
                                <Field label="Poster URL">
                                    <input
                                        type="text"
                                        value={String(el.props.poster || "")}
                                        onChange={(e) => setProp("poster", e.target.value)}
                                        placeholder="https://..."
                                    />
                                </Field>
                            </Section>
                        )}

                        {/* Menu */}
                        {el.type === "menu" && (
                            <Section title="Menu">
                                <Field label="Items (comma-sep)">
                                    <input
                                        type="text"
                                        value={String(el.props.items || "")}
                                        onChange={(e) => setProp("items", e.target.value)}
                                    />
                                </Field>
                                <Field label="Style">
                                    <select
                                        value={String(el.props.menuStyle || "horizontal")}
                                        onChange={(e) => setProp("menuStyle", e.target.value)}
                                    >
                                        <option value="horizontal">Horizontal</option>
                                        <option value="vertical">Vertical</option>
                                    </select>
                                </Field>
                            </Section>
                        )}

                        {/* Shape */}
                        {el.type === "shape" && (
                            <Section title="Shape">
                                <Field label="Shape type">
                                    <select
                                        value={String(el.props.shapeType || "rectangle")}
                                        onChange={(e) => setProp("shapeType", e.target.value)}
                                    >
                                        {["rectangle", "circle", "triangle", "star", "hexagon", "heart"].map((s) => (
                                            <option key={s} value={s}>{s}</option>
                                        ))}
                                    </select>
                                </Field>
                            </Section>
                        )}

                        {/* Gallery */}
                        {el.type === "gallery" && (
                            <Section title="Gallery">
                                <Field label="Columns">
                                    <input
                                        type="number"
                                        min={1} max={8}
                                        value={Number(el.props.columns) || 3}
                                        onChange={(e) => setProp("columns", Number(e.target.value))}
                                    />
                                </Field>
                                <Field label="Gap (px)">
                                    <input
                                        type="number"
                                        min={0} max={32}
                                        value={Number(el.props.gap) || 8}
                                        onChange={(e) => setProp("gap", Number(e.target.value))}
                                    />
                                </Field>
                            </Section>
                        )}

                        {/* Columns */}
                        {el.type === "columns" && (
                            <Section title="Columns">
                                <Field label="Column count">
                                    <input
                                        type="number"
                                        min={1} max={6}
                                        value={Number(el.props.columnCount) || 2}
                                        onChange={(e) => setProp("columnCount", Number(e.target.value))}
                                    />
                                </Field>
                            </Section>
                        )}

                        {/* Repeater */}
                        {el.type === "repeater" && (
                            <Section title="Repeater">
                                <Field label="Repeat count">
                                    <input
                                        type="number"
                                        min={1} max={20}
                                        value={Number(el.props.repeatCount) || 3}
                                        onChange={(e) => setProp("repeatCount", Number(e.target.value))}
                                    />
                                </Field>
                                <Field label="Direction">
                                    <select
                                        value={String(el.props.direction || "column")}
                                        onChange={(e) => setProp("direction", e.target.value)}
                                    >
                                        <option value="column">Vertical</option>
                                        <option value="row">Horizontal</option>
                                    </select>
                                </Field>
                            </Section>
                        )}

                        {/* Frame */}
                        {el.type === "frame" && (
                            <Section title="Frame">
                                <Field label="URL">
                                    <input
                                        type="text"
                                        value={String(el.props.src || "")}
                                        onChange={(e) => setProp("src", e.target.value)}
                                    />
                                </Field>
                            </Section>
                        )}

                        {/* Icon */}
                        {el.type === "icon" && (
                            <Section title="Icon">
                                <Field label="Icon">
                                    <select
                                        value={String(el.props.icon || "star")}
                                        onChange={(e) => setProp("icon", e.target.value)}
                                    >
                                        {ICON_OPTIONS.map((ic) => (
                                            <option key={ic} value={ic}>{ic}</option>
                                        ))}
                                    </select>
                                </Field>
                                <Field label="Size">
                                    <input
                                        type="number"
                                        min={12} max={128}
                                        value={Number(el.props.iconSize) || 32}
                                        onChange={(e) => setProp("iconSize", Number(e.target.value))}
                                    />
                                </Field>
                                <Field label="Color">
                                    <ColorControl
                                        value={String(el.props.iconColor || "")}
                                        onChange={(value) => setProp("iconColor", value)}
                                        fallback="#374151"
                                    />
                                </Field>
                            </Section>
                        )}

                        {/* Spacer */}
                        {el.type === "spacer" && (
                            <Section title="Spacer">
                                <Field label="Height (px)">
                                    <input
                                        type="number"
                                        min={4} max={500}
                                        value={Number(el.props.spacerHeight) || 40}
                                        onChange={(e) => setProp("spacerHeight", Number(e.target.value))}
                                    />
                                </Field>
                            </Section>
                        )}

                        {/* Social Bar */}
                        {el.type === "socialbar" && (
                            <Section title="Social Bar">
                                {["facebook", "twitter", "instagram", "linkedin", "youtube"].map((p) => (
                                    <Field key={p} label={p.charAt(0).toUpperCase() + p.slice(1)}>
                                        <label className="toggle-switch">
                                            <input
                                                type="checkbox"
                                                checked={Boolean(el.props[p])}
                                                onChange={(e) => setProp(p, e.target.checked)}
                                            />
                                            <span className="toggle-slider" />
                                        </label>
                                    </Field>
                                ))}
                                <Field label="Icon size">
                                    <input
                                        type="number"
                                        min={16} max={64}
                                        value={Number(el.props.iconSize) || 24}
                                        onChange={(e) => setProp("iconSize", Number(e.target.value))}
                                    />
                                </Field>
                                <Field label="Style">
                                    <select
                                        value={String(el.props.iconStyle || "filled")}
                                        onChange={(e) => setProp("iconStyle", e.target.value)}
                                    >
                                        <option value="filled">Filled</option>
                                        <option value="outline">Outline</option>
                                    </select>
                                </Field>
                            </Section>
                        )}

                        {/* Accordion */}
                        {el.type === "accordion" && (
                            <Section title="Accordion">
                                <Field label="Header text">
                                    <input
                                        type="text"
                                        value={String(el.props.headerText || "")}
                                        onChange={(e) => setProp("headerText", e.target.value)}
                                    />
                                </Field>
                                <Field label="Expanded">
                                    <label className="toggle-switch">
                                        <input
                                            type="checkbox"
                                            checked={Boolean(el.props.expanded)}
                                            onChange={(e) => setProp("expanded", e.target.checked)}
                                        />
                                        <span className="toggle-slider" />
                                    </label>
                                </Field>
                            </Section>
                        )}

                        {/* Tabs */}
                        {el.type === "tabs" && (
                            <Section title="Tabs">
                                <Field label="Tab titles (comma-sep)">
                                    <input
                                        type="text"
                                        value={String(el.props.tabTitles || "")}
                                        onChange={(e) => setProp("tabTitles", e.target.value)}
                                    />
                                </Field>
                                <Field label="Active tab index">
                                    <input
                                        type="number"
                                        min={0}
                                        value={Number(el.props.activeTab) || 0}
                                        onChange={(e) => setProp("activeTab", Number(e.target.value))}
                                    />
                                </Field>
                            </Section>
                        )}

                        {el.type === "form" && (
                            <>
                                <Section title="Fields">
                                    <div className="insp-form-fields-header">
                                        <span>{formFields.length} field{formFields.length === 1 ? "" : "s"}</span>
                                        <button className="insp-form-add-btn" type="button" onClick={addFormField}>
                                            + Add Field
                                        </button>
                                    </div>

                                    {formFields.length === 0 ? (
                                        <div className="insp-form-empty">
                                            Add input fields for your form schema.
                                        </div>
                                    ) : (
                                        formFields.map((field, index) => {
                                            const fieldTypeRaw = String(field.props.inputType || "text");
                                            const fieldType = FORM_FIELD_TYPES.includes(
                                                fieldTypeRaw as (typeof FORM_FIELD_TYPES)[number]
                                            )
                                                ? fieldTypeRaw as (typeof FORM_FIELD_TYPES)[number]
                                                : "text";
                                            return (
                                                <div key={field.id} className="insp-form-field-card">
                                                    <div className="insp-form-field-card-head">
                                                        <span className="insp-form-field-index">Field {index + 1}</span>
                                                        <button
                                                            className="insp-form-remove-btn"
                                                            type="button"
                                                            title="Remove field"
                                                            onClick={() => removeFormField(field.id)}
                                                        >
                                                            ×
                                                        </button>
                                                    </div>

                                                    <div className="insp-row-2">
                                                        <Field label="Name">
                                                            <input
                                                                type="text"
                                                                value={String(field.props.name || "")}
                                                                onChange={(e) =>
                                                                    updateFormField(field.id, {
                                                                        props: { name: e.target.value },
                                                                    })
                                                                }
                                                                placeholder={`field_${index + 1}`}
                                                            />
                                                        </Field>
                                                        <Field label="Type">
                                                            <select
                                                                value={fieldType}
                                                                onChange={(e) => {
                                                                    const nextType = e.target.value as (typeof FORM_FIELD_TYPES)[number];
                                                                    updateFormField(field.id, {
                                                                        layout: {
                                                                            ...field.layout,
                                                                            h: nextType === "textarea" ? 96 : 40
                                                                        },
                                                                        props: {
                                                                            ...field.props,
                                                                            inputType: nextType
                                                                        },
                                                                    });
                                                                }}
                                                            >
                                                                {FORM_FIELD_TYPES.map((type) => (
                                                                    <option key={type} value={type}>{type}</option>
                                                                ))}
                                                            </select>
                                                        </Field>
                                                    </div>

                                                    <Field label="Label">
                                                        <input
                                                            type="text"
                                                            value={String(field.label || "")}
                                                            onChange={(e) => updateFormField(field.id, { label: e.target.value })}
                                                            placeholder={`Field ${index + 1}`}
                                                        />
                                                    </Field>

                                                    <Field label="Placeholder">
                                                        <input
                                                            type="text"
                                                            value={String(field.props.placeholder || "")}
                                                            onChange={(e) =>
                                                                updateFormField(field.id, {
                                                                    props: { placeholder: e.target.value },
                                                                })
                                                            }
                                                            placeholder="Enter value..."
                                                        />
                                                    </Field>

                                                    <div className="insp-row-2">
                                                        <Field label="Required">
                                                            <label className="toggle-switch">
                                                                <input
                                                                    type="checkbox"
                                                                    checked={Boolean(field.props.required)}
                                                                    onChange={(e) =>
                                                                        updateFormField(field.id, {
                                                                            props: { required: e.target.checked },
                                                                        })
                                                                    }
                                                                />
                                                                <span className="toggle-slider" />
                                                            </label>
                                                        </Field>
                                                        <Field label="Max Length">
                                                            <input
                                                                type="number"
                                                                min={1}
                                                                value={String(field.props.maxLength || "")}
                                                                onChange={(e) =>
                                                                    updateFormField(field.id, {
                                                                        props: {
                                                                            maxLength: e.target.value.trim()
                                                                                ? Number(e.target.value)
                                                                                : "",
                                                                        },
                                                                    })
                                                                }
                                                                placeholder="None"
                                                            />
                                                        </Field>
                                                    </div>
                                                </div>
                                            );
                                        })
                                    )}
                                </Section>

                                <Section title="Actions">
                                    <Field label="Action type">
                                        <select
                                            value={el.actions?.type || "none"}
                                            onChange={(e) => {
                                                const nextType = e.target.value as ActionData["type"];
                                                setAction({ type: nextType, target: el.actions?.target || "" });
                                                if ((nextType === "submit" || nextType === "api_call") && !String(el.props.requestMethod || "").trim()) {
                                                    setProp("requestMethod", "POST");
                                                }
                                            }}
                                        >
                                            {["none", "submit", "redirect", "api_call", "scroll"].map((t) => (
                                                <option key={t} value={t}>{t}</option>
                                            ))}
                                        </select>
                                    </Field>

                                    {(el.actions?.type === "submit" || el.actions?.type === "api_call") && (
                                        <>
                                            <Field label="Request Method">
                                                <select
                                                    value={FORM_REQUEST_METHODS.includes(formRequestMethod as (typeof FORM_REQUEST_METHODS)[number])
                                                        ? formRequestMethod
                                                        : "POST"}
                                                    onChange={(e) => setProp("requestMethod", e.target.value)}
                                                >
                                                    {FORM_REQUEST_METHODS.map((method) => (
                                                        <option key={method} value={method}>{method}</option>
                                                    ))}
                                                </select>
                                            </Field>
                                            <Field label="Request URL">
                                                <input
                                                    type="text"
                                                    value={String(el.props.requestUrl || "")}
                                                    onChange={(e) => {
                                                        setProp("requestUrl", e.target.value);
                                                        setAction({ type: el.actions?.type || "submit", target: e.target.value });
                                                    }}
                                                    placeholder="https://api.example.com/submit"
                                                />
                                            </Field>
                                        </>
                                    )}

                                    {(el.actions?.type === "redirect" || el.actions?.type === "scroll") && (
                                        <Field label="Target URL">
                                            <input
                                                type="text"
                                                value={el.actions?.target || ""}
                                                onChange={(e) =>
                                                    setAction({ type: el.actions?.type || "redirect", target: e.target.value })
                                                }
                                                placeholder="https://..."
                                            />
                                        </Field>
                                    )}
                                </Section>
                            </>
                        )}
                    </>
                )}

                {/* ─── ANIMATE TAB ─── */}
                {activeTab === "animate" && (
                    <AnimationPanel
                        elementId={el.id}
                        elementType={el.type}
                        animation={el.animation}
                        onUpdate={(anim) => setAnim(anim)}
                        onRemove={() => updateElement(el.id, { animation: { type: "none", trigger: "onLoad", duration: 0.3, delay: 0, easing: "ease-out", iterationCount: 1, direction: "normal", fillMode: "none" } })}
                        onPreview={() => {
                            const domEl = document.querySelector(`[data-element-id="${el.id}"]`) as HTMLElement | null;
                            if (domEl && el.animation && el.animation.type !== "none") {
                                const a = el.animation;
                                domEl.style.animation = "none";
                                void domEl.offsetHeight;
                                const iterCount = a.iterationCount === "infinite" ? "infinite" : String(a.iterationCount ?? 1);
                                domEl.style.animation = `${a.type} ${a.duration}s ${a.easing} ${a.delay}s ${iterCount} ${a.direction} ${a.fillMode}`;
                                setTimeout(() => { domEl.style.animation = ""; }, (a.duration + a.delay + 0.5) * 1000);
                            }
                        }}
                    />
                )}
            </div>
        </div>
    );
};

export default PropertyInspector;
