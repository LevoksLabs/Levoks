import type { AnimationData, AnimationKeyframe, ElementNode } from "@/types";

const KEYFRAMES: Record<string, string> = {
    fadeIn: `@keyframes fadeIn { from { opacity: 0; } to { opacity: 1; } }`,
    fadeInUp: `@keyframes fadeInUp { from { opacity: 0; transform: translateY(VAR_DISTpx); } to { opacity: 1; transform: translateY(0); } }`,
    fadeInDown: `@keyframes fadeInDown { from { opacity: 0; transform: translateY(-VAR_DISTpx); } to { opacity: 1; transform: translateY(0); } }`,
    fadeInLeft: `@keyframes fadeInLeft { from { opacity: 0; transform: translateX(-VAR_DISTpx); } to { opacity: 1; transform: translateX(0); } }`,
    fadeInRight: `@keyframes fadeInRight { from { opacity: 0; transform: translateX(VAR_DISTpx); } to { opacity: 1; transform: translateX(0); } }`,
    slideInUp: `@keyframes slideInUp { from { transform: translateY(VAR_DISTpx); opacity: 0; } to { transform: translateY(0); opacity: 1; } }`,
    slideInDown: `@keyframes slideInDown { from { transform: translateY(-VAR_DISTpx); opacity: 0; } to { transform: translateY(0); opacity: 1; } }`,
    slideInLeft: `@keyframes slideInLeft { from { transform: translateX(-VAR_DISTpx); opacity: 0; } to { transform: translateX(0); opacity: 1; } }`,
    slideInRight: `@keyframes slideInRight { from { transform: translateX(VAR_DISTpx); opacity: 0; } to { transform: translateX(0); opacity: 1; } }`,
    scaleIn: `@keyframes scaleIn { from { opacity: 0; transform: scale(VAR_SCALE); } to { opacity: 1; transform: scale(1); } }`,
    scaleInUp: `@keyframes scaleInUp { from { opacity: 0; transform: scale(VAR_SCALE) translateY(10px); } to { opacity: 1; transform: scale(1) translateY(0); } }`,
    scaleInDown: `@keyframes scaleInDown { from { opacity: 0; transform: scale(VAR_SCALE) translateY(-10px); } to { opacity: 1; transform: scale(1) translateY(0); } }`,
    bounceIn: `@keyframes bounceIn { 0% { opacity: 0; transform: scale(0.3); } 50% { opacity: 1; transform: scale(1.05); } 70% { transform: scale(0.9); } 100% { transform: scale(1); } }`,
    flipInX: `@keyframes flipInX { from { transform: perspective(400px) rotateX(90deg); opacity: 0; } 40% { transform: perspective(400px) rotateX(-10deg); } 70% { transform: perspective(400px) rotateX(10deg); } to { transform: perspective(400px) rotateX(0deg); opacity: 1; } }`,
    flipInY: `@keyframes flipInY { from { transform: perspective(400px) rotateY(90deg); opacity: 0; } 40% { transform: perspective(400px) rotateY(-10deg); } 70% { transform: perspective(400px) rotateY(10deg); } to { transform: perspective(400px) rotateY(0deg); opacity: 1; } }`,
    rotateIn: `@keyframes rotateIn { from { transform: rotate(-VAR_ANGLEdeg); opacity: 0; } to { transform: rotate(0deg); opacity: 1; } }`,
    zoomIn: `@keyframes zoomIn { from { opacity: 0; transform: scale(0.3); } 50% { opacity: 1; } to { transform: scale(1); } }`,
    pulse: `@keyframes pulse { 0%, 100% { transform: scale(1); } 50% { transform: scale(1.08); } }`,
    bounce: `@keyframes bounce { 0%, 20%, 50%, 80%, 100% { transform: translateY(0); } 40% { transform: translateY(-20px); } 60% { transform: translateY(-10px); } }`,
    shake: `@keyframes shake { 0%, 100% { transform: translateX(0); } 10%, 30%, 50%, 70%, 90% { transform: translateX(-VAR_INTpx); } 20%, 40%, 60%, 80% { transform: translateX(VAR_INTpx); } }`,
    wobble: `@keyframes wobble { 0% { transform: rotate(0deg); } 15% { transform: rotate(-5deg); } 30% { transform: rotate(3deg); } 45% { transform: rotate(-3deg); } 60% { transform: rotate(2deg); } 75% { transform: rotate(-1deg); } 100% { transform: rotate(0deg); } }`,
    swing: `@keyframes swing { 20% { transform: rotate(15deg); } 40% { transform: rotate(-10deg); } 60% { transform: rotate(5deg); } 80% { transform: rotate(-5deg); } 100% { transform: rotate(0deg); } }`,
    flash: `@keyframes flash { 0%, 50%, 100% { opacity: 1; } 25%, 75% { opacity: 0; } }`,
    heartbeat: `@keyframes heartbeat { 0%, 100% { transform: scale(1); } 14% { transform: scale(1.3); } 28% { transform: scale(1); } 42% { transform: scale(1.3); } 70% { transform: scale(1); } }`,
    rubberBand: `@keyframes rubberBand { 0% { transform: scaleX(1); } 30% { transform: scaleX(1.25) scaleY(0.75); } 40% { transform: scaleX(0.75) scaleY(1.25); } 50% { transform: scaleX(1.15) scaleY(0.85); } 65% { transform: scaleX(0.95) scaleY(1.05); } 75% { transform: scaleX(1.05) scaleY(0.95); } 100% { transform: scaleX(1); } }`,
    fadeOut: `@keyframes fadeOut { from { opacity: 1; } to { opacity: 0; } }`,
    fadeOutUp: `@keyframes fadeOutUp { from { opacity: 1; transform: translateY(0); } to { opacity: 0; transform: translateY(-VAR_DISTpx); } }`,
    fadeOutDown: `@keyframes fadeOutDown { from { opacity: 1; transform: translateY(0); } to { opacity: 0; transform: translateY(VAR_DISTpx); } }`,
    slideOutUp: `@keyframes slideOutUp { from { transform: translateY(0); } to { transform: translateY(-100%); } }`,
    slideOutDown: `@keyframes slideOutDown { from { transform: translateY(0); } to { transform: translateY(100%); } }`,
    scaleOut: `@keyframes scaleOut { from { opacity: 1; transform: scale(1); } to { opacity: 0; transform: scale(0.3); } }`,
    zoomOut: `@keyframes zoomOut { from { opacity: 1; transform: scale(1); } 50% { opacity: 0; transform: scale(0.3); } to { opacity: 0; } }`,
    textReveal: `@keyframes textReveal { from { clip-path: inset(0 100% 0 0); } to { clip-path: inset(0 0 0 0); } }`,
    textGlow: `@keyframes textGlow { 0%, 100% { text-shadow: 0 0 4px rgba(99,102,241,0.3); } 50% { text-shadow: 0 0 20px rgba(99,102,241,0.8), 0 0 40px rgba(99,102,241,0.4); } }`,
    textGradientShift: `@keyframes textGradientShift { 0% { background-position: 0% 50%; } 50% { background-position: 100% 50%; } 100% { background-position: 0% 50%; } }`,
    letterSpacing: `@keyframes letterSpacing { from { letter-spacing: -0.5em; opacity: 0; } to { letter-spacing: normal; opacity: 1; } }`,
    float: `@keyframes float { 0%, 100% { transform: translateY(0); } 50% { transform: translateY(-10px); } }`,
    spin: `@keyframes spin { from { transform: rotate(0deg); } to { transform: rotate(VAR_ANGLEdeg); } }`,
    morphShadow: `@keyframes morphShadow { 0%, 100% { box-shadow: 0 4px 12px rgba(0,0,0,0.1); } 50% { box-shadow: 0 12px 40px rgba(0,0,0,0.25); } }`,
    parallax: `@keyframes parallax { from { transform: translateY(20px); } to { transform: translateY(-20px); } }`,
    tilt3D: `@keyframes tilt3D { 0%, 100% { transform: perspective(500px) rotateY(0deg) rotateX(0deg); } 25% { transform: perspective(500px) rotateY(5deg) rotateX(3deg); } 75% { transform: perspective(500px) rotateY(-5deg) rotateX(-3deg); } }`,
    skewIn: `@keyframes skewIn { from { transform: skewX(-20deg) skewY(5deg); opacity: 0; } to { transform: skewX(0deg) skewY(0deg); opacity: 1; } }`,
    blurIn: `@keyframes blurIn { from { filter: blur(12px); opacity: 0; } to { filter: blur(0); opacity: 1; } }`,
    glitchEffect: `@keyframes glitchEffect { 0%, 100% { transform: translate(0); } 20% { transform: translate(-2px, 2px); } 40% { transform: translate(-2px, -2px); } 60% { transform: translate(2px, 2px); } 80% { transform: translate(2px, -2px); } }`,
    colorShift: `@keyframes colorShift { 0% { filter: hue-rotate(0deg); } 100% { filter: hue-rotate(360deg); } }`,
    gradientFlow: `@keyframes gradientFlow { 0% { background-position: 0% 50%; } 50% { background-position: 100% 50%; } 100% { background-position: 0% 50%; } }`,
    backgroundZoom: `@keyframes backgroundZoom { 0%, 100% { background-size: 100%; } 50% { background-size: 120%; } }`,
    borderDraw: `@keyframes borderDraw { from { clip-path: polygon(0 0, 0 0, 0 0, 0 0); } 25% { clip-path: polygon(0 0, 100% 0, 100% 0, 0 0); } 50% { clip-path: polygon(0 0, 100% 0, 100% 100%, 0 0); } 75% { clip-path: polygon(0 0, 100% 0, 100% 100%, 0 100%); } to { clip-path: polygon(0 0, 100% 0, 100% 100%, 0 100%); } }`,
    clipReveal: `@keyframes clipReveal { from { clip-path: inset(0 100% 0 0); } to { clip-path: inset(0 0 0 0); } }`,
    maskWipe: `@keyframes maskWipe { from { clip-path: inset(0 100% 0 0); } to { clip-path: inset(0 0 0 0); } }`,
};

export function resolveKeyframe(anim: AnimationData): string {
    const raw = KEYFRAMES[anim.type];
    if (!raw) return "";
    let result = raw;
    result = result.replace(/VAR_DIST/g, String(anim.translateDistance ?? 30));
    result = result.replace(/VAR_SCALE/g, String(anim.scaleFrom ?? 0));
    result = result.replace(/VAR_ANGLE/g, String(anim.rotateAngle ?? 360));
    result = result.replace(/VAR_INT/g, String(anim.intensity ?? 5));
    return result;
}

export function presetParameters(type: AnimationData["type"]): string[] {
    const source = KEYFRAMES[type] || "";
    return [["VAR_DIST", "distance"], ["VAR_ANGLE", "rotation"], ["VAR_SCALE", "scale"], ["VAR_INT", "intensity"]]
        .filter(([placeholder]) => source.includes(placeholder)).map(([, label]) => label);
}

export const neutralFrame: AnimationKeyframe = {
    time: 0, x: 0, y: 0, z: 0, scale: 1, rotation: 0, rotateX: 0, rotateY: 0,
    opacity: 1, blur: 0, clip: 0,
};

export function defaultAnimation(type: AnimationData["type"] = "custom", trigger: AnimationData["trigger"] = "onLoad"): AnimationData {
    return {
        id: crypto.randomUUID(), type, trigger, enabled: true,
        duration: 0.8, delay: 0, easing: "cubic-bezier(0.22, 1, 0.36, 1)",
        iterationCount: trigger === "continuous" ? "infinite" : 1,
        direction: "normal", fillMode: "both", hoverMode: "reverse",
        scrollMode: "reveal", scrollStart: 80, scrollEnd: 20,
        target: "self", stagger: 0.08,
        ...(type === "custom" ? { keyframes: [{ ...neutralFrame, y: 40, opacity: 0 }, { ...neutralFrame, time: 1 }] } : {}),
    };
}

export function animationTracks(animation?: AnimationData, motion?: ElementNode["motion"]): AnimationData[] {
    const tracks = animation && animation.type !== "none"
        ? [Object.fromEntries(Object.entries(animation).filter(([key]) => key !== "effects")) as AnimationData, ...(animation.effects || [])]
        : [];
    if (motion) {
        const frames = motion.frames.map(frame => ({ ...neutralFrame, ...frame })).sort((a, b) => a.time - b.time);
        if (frames[0].time !== 0) frames.unshift({ ...frames[0], time: 0 });
        if (frames[frames.length - 1].time !== 1) frames.push({ ...frames[frames.length - 1], time: 1 });
        tracks.unshift({
        type: "custom", name: "Timeline motion", trigger: "onLoad", duration: motion.duration,
        delay: motion.delay, easing: motion.easing, iterationCount: motion.iterations,
        direction: "normal", fillMode: "both",
        keyframes: frames,
    });
    }
    return tracks;
}

export function stackAnimations(tracks: AnimationData[]): AnimationData | undefined {
    if (!tracks.length) return undefined;
    return { ...tracks[0], effects: tracks.slice(1) };
}

export function usesAnimationRuntime(anim?: AnimationData): boolean {
    return !!anim && (anim.type === "custom" || !!anim.id || !!anim.effects?.length ||
        anim.trigger === "onPointerMove" || anim.scrollMode === "scrub" || !!anim.hoverMode || anim.target === "children");
}

/** Used by the canvas and generated runtime. Frame transforms add to the object's layout rotation. */
export function animationFrames(anim: AnimationData): Keyframe[] {
    if (anim.type === "custom") return [...(anim.keyframes || [])].sort((a, b) => a.time - b.time).map(frame => ({
        offset: frame.time,
        transform: anim.keyframes?.some(stop => stop.z !== 0 || stop.rotateX !== 0 || stop.rotateY !== 0)
            ? `perspective(800px) translate3d(${frame.x}px, ${frame.y}px, ${frame.z}px) rotateX(${frame.rotateX}deg) rotateY(${frame.rotateY}deg) rotate(${frame.rotation}deg) scale(${frame.scale})`
            : `translate(${frame.x}px, ${frame.y}px) rotate(${frame.rotation}deg) scale(${frame.scale})`,
        ...(anim.keyframes?.some(stop => stop.opacity !== 1) ? { opacity: frame.opacity } : {}),
        ...(anim.keyframes?.some(stop => stop.blur !== 0) ? { filter: `blur(${frame.blur}px)` } : {}),
        ...(anim.keyframes?.some(stop => stop.clip !== 0) ? { clipPath: `inset(0 ${frame.clip}% 0 0)` } : {}),
    }));
    const source = resolveKeyframe(anim);
    const frames: Keyframe[] = [];
    for (const match of source.matchAll(/(from|to|[\d.,%\s]+)\s*\{([^{}]*)\}/g)) {
        const values: Record<string, string> = {};
        for (const declaration of match[2].split(";")) {
            const colon = declaration.indexOf(":");
            if (colon < 0) continue;
            const key = declaration.slice(0, colon).trim().replace(/-([a-z])/g, (_, char: string) => char.toUpperCase());
            values[key] = declaration.slice(colon + 1).trim();
        }
        for (const offset of match[1].trim().split(",")) frames.push({
            ...values, offset: offset === "from" ? 0 : offset === "to" ? 1 : parseFloat(offset) / 100,
        });
    }
    return frames.sort((a, b) => Number(a.offset) - Number(b.offset));
}

export interface ResolvedAnimation {
    anim: AnimationData;
    frames: Keyframe[];
}

export function resolveAnimations(tracks: AnimationData[]): ResolvedAnimation[] {
    return tracks.filter(anim => anim.enabled !== false && anim.type !== "none").map(anim => ({ anim, frames: animationFrames(anim) }));
}

/** Insert in the largest gap and interpolate all channels so adding a frame doesn't change the path. */
export function insertKeyframe(frames: AnimationKeyframe[]): AnimationKeyframe[] {
    const ordered = [...frames].sort((a, b) => a.time - b.time);
    let gap = 0;
    for (let i = 1; i < ordered.length - 1; i++) {
        if (ordered[i + 1].time - ordered[i].time > ordered[gap + 1].time - ordered[gap].time) gap = i;
    }
    const left = ordered[gap], right = ordered[gap + 1];
    const frame = Object.fromEntries(Object.keys(neutralFrame).map(key => [key,
        Number(((left[key as keyof AnimationKeyframe] + right[key as keyof AnimationKeyframe]) / 2).toFixed(6)),
    ])) as unknown as AnimationKeyframe;
    return [...ordered, frame].sort((a, b) => a.time - b.time);
}

