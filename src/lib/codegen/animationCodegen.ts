// ═══════════════════════════════════════════════════
// Animation Code Generator
// ═══════════════════════════════════════════════════
// Generates @keyframes CSS and useEffect JS for React components

import { AnimationData, AnimationType, ElementNode } from "@/types";

// ─── Keyframes Definitions ───

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

function resolveKeyframe(anim: AnimationData): string {
    const raw = KEYFRAMES[anim.type];
    if (!raw) return "";
    let result = raw;
    result = result.replace(/VAR_DIST/g, String(anim.translateDistance ?? 30));
    result = result.replace(/VAR_SCALE/g, String(anim.scaleFrom ?? 0));
    result = result.replace(/VAR_ANGLE/g, String(anim.rotateAngle ?? 360));
    result = result.replace(/VAR_INT/g, String(anim.intensity ?? 5));
    return result;
}

// ─── Generate CSS for an element's animation ───

export function generateAnimationCSS(
    el: ElementNode,
    className: string
): { keyframeCss: string; classCss: string; needsJsSetup: boolean } {
    const anim = el.animation;
    if (!anim || anim.type === "none") return { keyframeCss: "", classCss: "", needsJsSetup: false };

    const keyframeCss = resolveKeyframe(anim);
    const iterCount = anim.iterationCount === "infinite" ? "infinite" : String(anim.iterationCount ?? 1);
    const animProp = `${anim.type} ${anim.duration}s ${anim.easing} ${anim.delay}s ${iterCount} ${anim.direction} ${anim.fillMode}`;

    let classCss = "";
    const needsJsSetup = anim.trigger === "onScroll" || anim.trigger === "onClick" || anim.type === "typewriter";

    if (anim.type === "textGradientShift") {
        classCss += `.${className} { background: linear-gradient(90deg, #6366f1, #ec4899, #6366f1); background-size: 200% auto; -webkit-background-clip: text; -webkit-text-fill-color: transparent; background-clip: text; }\n`;
    }
    if (anim.type === "gradientFlow") {
        classCss += `.${className} { background-size: 200% 200% !important; }\n`;
    }

    switch (anim.trigger) {
        case "onLoad":
        case "continuous":
            classCss += `.${className} { animation: ${animProp}; }\n`;
            break;
        case "onHover":
            classCss += `.${className}:hover { animation: ${animProp}; }\n`;
            break;
        case "onScroll":
            classCss += `.${className} { opacity: 0; }\n`;
            classCss += `.${className}.animated { animation: ${animProp}; }\n`;
            break;
        case "onClick":
            classCss += `.${className}.animated { animation: ${animProp}; }\n`;
            break;
    }

    return { keyframeCss, classCss, needsJsSetup };
}

// Share lifecycle-aware animation setup between HTML preview and React exports.
export function generateAnimationSetup(elements: { className: string; anim: AnimationData }[]): string {
    const config = JSON.stringify(elements);
    return `function setupAnimations(root) {
  const cleanups = [];
  const reduced = window.matchMedia("(prefers-reduced-motion: reduce)");
  for (const {className, anim} of ${config}) {
    root.querySelectorAll("." + className).forEach(el => {
      if (reduced.matches) { el.style.opacity = "1"; return; }
      if (anim.trigger === "onScroll") {
        const observer = new IntersectionObserver(entries => {
          if (entries.some(entry => entry.isIntersecting)) { el.classList.add("animated"); observer.disconnect(); }
        }, {threshold: 0.2});
        observer.observe(el);
        cleanups.push(() => observer.disconnect());
      }
      if (anim.trigger === "onClick") {
        const click = () => { el.classList.remove("animated"); void el.offsetHeight; el.classList.add("animated"); };
        el.addEventListener("click", click);
        cleanups.push(() => el.removeEventListener("click", click));
      }
      if (anim.type === "typewriter") {
        const text = el.textContent || "";
        el.textContent = "";
        let i = 0;
        const timer = setInterval(() => {
          el.textContent = text.slice(0, ++i);
          if (i >= text.length) clearInterval(timer);
        }, Math.max(1, Math.round(1000 / (anim.textSpeed || 50))));
        cleanups.push(() => { clearInterval(timer); el.textContent = text; });
      }
    });
  }
  return () => cleanups.forEach(cleanup => cleanup());
}`;
}

export function generateAnimationUseEffect(elements: { className: string; anim: AnimationData }[]): string {
    if (!elements.length) return "";
    return `  React.useEffect(() => {
${generateAnimationSetup(elements)}
    return setupAnimations(rootRef.current);
  }, []);`;
}
