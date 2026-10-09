// ═══════════════════════════════════════════════════
// Animation Code Generator
// ═══════════════════════════════════════════════════
// Generates @keyframes CSS and useEffect JS for React components

import { AnimationData, ElementNode } from "@/types";

// ─── Keyframes Definitions ───

import { animationTracks, resolveAnimations, resolveKeyframe, usesAnimationRuntime } from "@/lib/animation";
import { mountAnimations } from "@/lib/animation-runtime";

// ─── Generate CSS for an element's animation ───

export function generateAnimationCSS(
    el: ElementNode,
    className: string
): { keyframeCss: string; classCss: string; needsJsSetup: boolean } {
    const anim = el.animation;
    if (!anim || anim.type === "none") return { keyframeCss: "", classCss: "", needsJsSetup: false };

    if (usesAnimationRuntime(anim)) {
        return { keyframeCss: "", classCss: "", needsJsSetup: true };
    }

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
    const config = JSON.stringify(elements.filter(item => !usesAnimationRuntime(item.anim)));
    const advanced = JSON.stringify(elements.filter(item => usesAnimationRuntime(item.anim)).map(item => ({
        className: item.className, effects: resolveAnimations(animationTracks(item.anim)),
    })));
    return `function setupAnimations(root) {
  if (!root) return () => {};
  const cleanups = [];
  ${elements.some(item => usesAnimationRuntime(item.anim)) ? `const __name = fn => fn;
  const mountAdvancedAnimations = ${mountAnimations.toString()};
  for (const {className, effects} of ${advanced}) {
    root.querySelectorAll("." + className).forEach(el => cleanups.push(mountAdvancedAnimations(el, effects)));
  }` : ""}
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
