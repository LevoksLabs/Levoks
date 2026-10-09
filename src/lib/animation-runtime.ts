import type { ResolvedAnimation } from "./animation";

/** Self-contained so the exact same runtime can be embedded in HTML and React exports. */
export function mountAnimations(element: HTMLElement, effects: ResolvedAnimation[]): () => void {
    const cleanups: (() => void)[] = [];
    const reduced = window.matchMedia("(prefers-reduced-motion: reduce)");
    let disposeEffects: (() => void) | undefined;
    const mount = () => {
        disposeEffects?.();
        const disposers: (() => void)[] = [];
        const opacities = new Map<HTMLElement, number>();
        [element, ...Array.from(element.children).filter((child): child is HTMLElement => child instanceof HTMLElement)].forEach(target => {
            opacities.set(target, Number.parseFloat(getComputedStyle(target).opacity));
        });
        if (!reduced.matches) effects.forEach(({ anim, frames }) => {
            const targets = anim.target === "children" ? Array.from(element.children).filter((child): child is HTMLElement => child instanceof HTMLElement) : [element];
            targets.forEach((target, index) => {
                if (anim.type === "textGradientShift" || anim.type === "gradientFlow") {
                    const keys = ["background", "backgroundSize", "backgroundClip", "webkitBackgroundClip", "webkitTextFillColor"] as const;
                    const original = keys.map(key => target.style[key]);
                    if (anim.type === "textGradientShift") Object.assign(target.style, {
                        background: "linear-gradient(90deg, #6366f1, #ec4899, #6366f1)", backgroundSize: "200% auto",
                        backgroundClip: "text", webkitBackgroundClip: "text", webkitTextFillColor: "transparent",
                    });
                    else target.style.backgroundSize = "200% 200%";
                    disposers.push(() => { keys.forEach((key, i) => { target.style[key] = original[i]; }); });
                }
                const delay = Math.max(0, anim.delay + (anim.target === "children" ? index * (anim.stagger ?? 0.08) : 0)) * 1000;
                const duration = Math.max(50, anim.duration * 1000);
                const options: KeyframeAnimationOptions = {
                    duration, delay, easing: CSS.supports("animation-timing-function", anim.easing) ? anim.easing : "linear",
                    fill: anim.scrollMode === "scrub" && anim.trigger === "onScroll" ? "both" : anim.fillMode,
                    iterations: anim.scrollMode === "scrub" && anim.trigger === "onScroll" ? 1 : anim.iterationCount === "infinite" ? Infinity : Math.max(1, anim.iterationCount),
                    direction: anim.direction,
                };
                const players: Animation[] = [];
                // Separate additive transforms from replacement channels, so hover, scroll,
                // and load transforms compose without erasing the object's base rotation.
                if (frames.some(frame => frame.transform)) {
                    players.push(target.animate(frames.map(frame => ({ offset: frame.offset, transform: frame.transform })), { ...options, composite: "add" }));
                }
                const opacity = opacities.get(target) ?? 1;
                const channels = frames.map(frame => {
                    const channels = { ...frame }; delete channels.transform;
                    if (channels.opacity !== undefined) channels.opacity = Number(channels.opacity) * opacity;
                    return channels;
                });
                if (channels.some(frame => Object.keys(frame).length > 1)) players.push(target.animate(channels, options));
                // Keep completed layers available when a newer effect temporarily
                // replaces a channel. Otherwise the browser can remove them forever.
                players.forEach(player => player.persist());
                const listen = (node: EventTarget, event: string, handler: EventListener) => {
                    node.addEventListener(event, handler);
                    disposers.push(() => node.removeEventListener(event, handler));
                };
                const reset = () => players.forEach(player => { player.cancel(); });
                const play = () => players.forEach(player => {
                    player.cancel(); player.playbackRate = 1; player.play();
                });
                let timer: ReturnType<typeof setInterval> | undefined;
                let textTarget: HTMLElement | undefined;
                let original = "";
                if (anim.type === "typewriter") {
                    // Never replace a container's DOM or flatten React-managed children.
                    textTarget = target.querySelector<HTMLElement>(".el-text-inner, .el-title-inner, .el-paragraph-inner") || (target.children.length ? undefined : target);
                    original = textTarget?.textContent || "";
                }
                const type = () => {
                    if (!textTarget) return;
                    clearInterval(timer);
                    const began = performance.now() + delay;
                    const text = Array.from(original);
                    timer = setInterval(() => {
                        const count = Math.max(0, Math.floor((performance.now() - began) / Math.max(10, anim.textSpeed ?? 50)));
                        textTarget!.textContent = text.slice(0, count).join("");
                        if (count >= text.length) clearInterval(timer);
                    }, 16);
                };
                const start = () => { play(); type(); };
                const stop = () => {
                    reset(); clearInterval(timer);
                    if (textTarget) textTarget.textContent = original;
                };
                disposers.push(stop);
                if (anim.trigger === "onLoad" || anim.trigger === "continuous") { type(); return; }
                reset();
                if (anim.trigger === "onHover") {
                    let hovering = false, focused = false;
                    const leave = () => {
                        if (hovering || focused) return;
                        if ((anim.hoverMode ?? "reverse") === "reset") stop();
                        else if ((anim.hoverMode ?? "reverse") === "reverse") {
                            clearInterval(timer);
                            if (textTarget) textTarget.textContent = original;
                            players.forEach(player => {
                                if (player.currentTime !== null) {
                                    player.currentTime = Math.min(Number(player.currentTime), delay + duration);
                                    player.reverse();
                                    player.onfinish = () => player.cancel();
                                }
                            });
                        }
                    };
                    const enter = () => { players.forEach(player => { player.onfinish = null; }); start(); };
                    listen(element, "pointerenter", () => { hovering = true; enter(); });
                    listen(element, "pointerleave", () => { hovering = false; leave(); });
                    listen(element, "focusin", () => { focused = true; enter(); });
                    listen(element, "focusout", event => {
                        if (!element.contains((event as FocusEvent).relatedTarget as Node | null)) { focused = false; leave(); }
                    });
                } else if (anim.trigger === "onClick") {
                    listen(element, "click", start);
                } else if (anim.trigger === "onPointerMove") {
                    let pending = 0;
                    listen(element, "pointermove", event => {
                        const pointer = event as PointerEvent;
                        if (pointer.pointerType === "touch") return;
                        cancelAnimationFrame(pending);
                        pending = requestAnimationFrame(() => {
                            const box = element.getBoundingClientRect();
                            const x = Math.max(-1, Math.min(1, (pointer.clientX - box.left) / Math.max(1, box.width) * 2 - 1));
                            const y = Math.max(-1, Math.min(1, (pointer.clientY - box.top) / Math.max(1, box.height) * 2 - 1));
                            const amount = anim.intensity ?? 12;
                            const transform = anim.pointerMode === "follow"
                                ? `translate(${x * amount}px, ${y * amount}px)`
                                : `perspective(800px) rotateX(${-y * amount}deg) rotateY(${x * amount}deg)`;
                            players.forEach(player => {
                                if ((player.effect as KeyframeEffect).getKeyframes().some(frame => frame.transform)) {
                                    (player.effect as KeyframeEffect).setKeyframes([{ transform }, { transform }]);
                                    player.pause(); player.currentTime = delay;
                                }
                            });
                        });
                    });
                    listen(element, "pointerleave", () => { cancelAnimationFrame(pending); stop(); });
                    disposers.push(() => cancelAnimationFrame(pending));
                } else if (anim.trigger === "onScroll" && anim.scrollMode === "scrub") {
                    let scroller: HTMLElement | null = element.parentElement;
                    while (scroller && !/(auto|scroll)/.test(getComputedStyle(scroller).overflowY)) scroller = scroller.parentElement;
                    const scrollRoot: EventTarget = scroller || window;
                    const scrollTop = () => scroller ? scroller.scrollTop : window.scrollY;
                    const viewportTop = () => scroller ? scroller.getBoundingClientRect().top : 0;
                    const viewportHeight = () => scroller ? scroller.clientHeight : window.innerHeight;
                    // Measure with effects removed; reading the animated bounding box on
                    // each scroll would feed animated translation back into progress.
                    let top = 0, height = 0, pending = 0;
                    const measure = () => {
                        const times = players.map(player => player.currentTime);
                        reset();
                        const box = (anim.target === "children" ? element : target).getBoundingClientRect();
                        top = box.top - viewportTop() + scrollTop(); height = box.height;
                        players.forEach((player, i) => { player.pause(); player.currentTime = times[i] ?? 0; });
                    };
                    const update = () => {
                        const view = viewportHeight();
                        const distance = height + view * ((anim.scrollStart ?? 80) - (anim.scrollEnd ?? 20)) / 100;
                        const progress = Math.max(0, Math.min(1, (view * (anim.scrollStart ?? 80) / 100 - (top - scrollTop())) / Math.max(1, distance)));
                        const totalDuration = duration + (anim.target === "children" ? Math.max(0, targets.length - 1) * (anim.stagger ?? 0.08) * 1000 : 0);
                        players.forEach(player => { player.pause(); player.currentTime = anim.delay * 1000 + progress * totalDuration; });
                    };
                    const schedule = () => {
                        if (pending) return;
                        pending = requestAnimationFrame(() => { pending = 0; update(); });
                    };
                    measure(); update();
                    listen(scrollRoot, "scroll", schedule);
                    listen(window, "resize", () => { measure(); schedule(); });
                    const observer = new ResizeObserver(() => { measure(); schedule(); });
                    observer.observe(target);
                    disposers.push(() => { observer.disconnect(); cancelAnimationFrame(pending); });
                } else if (anim.trigger === "onScroll") {
                    let started = false;
                    const threshold = Math.max(0, Math.min(1, (anim.scrollOffset ?? 20) / 100));
                    const observer = new IntersectionObserver(entries => {
                        entries.forEach(entry => {
                            if (entry.isIntersecting && entry.intersectionRatio >= threshold && (!started || anim.scrollReplay)) {
                                start(); started = true;
                                if (!anim.scrollReplay) observer.disconnect();
                            } else if ((!entry.isIntersecting || entry.intersectionRatio < threshold) && anim.scrollReplay) stop();
                        });
                    }, { threshold });
                    observer.observe(target);
                    disposers.push(() => observer.disconnect());
                }
            });
        });
        disposeEffects = () => disposers.slice().reverse().forEach(dispose => dispose());
    };
    mount();
    reduced.addEventListener("change", mount);
    cleanups.push(() => reduced.removeEventListener("change", mount));
    const preview = (event: Event) => {
        if ((event as CustomEvent<boolean>).detail) disposeEffects?.();
        else mount();
    };
    element.addEventListener("levoks:animation-preview", preview);
    cleanups.push(() => element.removeEventListener("levoks:animation-preview", preview));
    return () => { disposeEffects?.(); cleanups.forEach(dispose => dispose()); };
}
