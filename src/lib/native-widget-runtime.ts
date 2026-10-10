/** Shared by the editor, generated HTML and React; no captured dependencies. */
export function setupNativeWidgets(
  root: HTMLElement | Document,
  descendants = true,
) {
  const cleanup: (() => void)[] = [];
  [
    ...("matches" in root && root.matches("[data-floating-widget]")
      ? [root]
      : []),
    ...(descendants
      ? root.querySelectorAll<HTMLElement>("[data-floating-widget]")
      : []),
  ].forEach((widget) => {
    const trigger = widget.querySelector<HTMLButtonElement>(
        "[data-floating-trigger]",
      )!,
      panel = widget.querySelector<HTMLElement>("[data-floating-panel]")!;
    if (!trigger || !panel || !panel.showPopover) return;
    const tooltip = widget.dataset.floatingWidget === "tooltip";
    let timer: ReturnType<typeof setTimeout> | undefined;
    const position = () => {
      if (!panel.matches(":popover-open")) return;
      const r = trigger.getBoundingClientRect(),
        p = panel.getBoundingClientRect(),
        side = widget.dataset.placement;
      const left =
        side === "left"
          ? r.left - p.width - 8
          : side === "right"
            ? r.right + 8
            : r.left + (r.width - p.width) / 2;
      const top =
        side === "top"
          ? r.top - p.height - 8
          : side === "bottom"
            ? r.bottom + 8
            : r.top + (r.height - p.height) / 2;
      panel.style.left = `${Math.max(8, Math.min(innerWidth - p.width - 8, left))}px`;
      panel.style.top = `${Math.max(8, Math.min(innerHeight - p.height - 8, top))}px`;
    };
    const show = () => {
      clearTimeout(timer);
      if (!panel.matches(":popover-open")) panel.showPopover();
      position();
    };
    const hide = () => {
      clearTimeout(timer);
      if (panel.matches(":popover-open")) panel.hidePopover();
    };
    const leave = () => {
      timer = setTimeout(hide, 100);
    };
    const enter = () => {
      clearTimeout(timer);
    };
    const click = () => (panel.matches(":popover-open") ? hide() : show());
    const key = (e: KeyboardEvent) => {
      if (
        e.key === "Escape" &&
        !e.defaultPrevented &&
        panel.matches(":popover-open")
      ) {
        if (panel.querySelector("[data-floating-panel]:popover-open")) return;
        e.preventDefault();
        const restore = !tooltip && panel.contains(document.activeElement);
        hide();
        if (restore) trigger.focus();
      }
    };
    const focusout = (e: FocusEvent) => {
      if (tooltip && !widget.contains(e.relatedTarget as Node | null)) hide();
    };
    const toggle = () => {
      if (!tooltip)
        trigger.setAttribute(
          "aria-expanded",
          String(panel.matches(":popover-open")),
        );
    };
    trigger.addEventListener("click", click);
    panel.addEventListener("toggle", toggle);
    widget.addEventListener("focusout", focusout);
    if (tooltip) {
      trigger.addEventListener("pointerenter", show);
      trigger.addEventListener("pointerleave", leave);
      trigger.addEventListener("focus", show);
      panel.addEventListener("pointerenter", enter);
      panel.addEventListener("pointerleave", leave);
    }
    document.addEventListener("keydown", key);
    window.addEventListener("resize", position);
    document.addEventListener("scroll", position, true);
    cleanup.push(() => {
      clearTimeout(timer);
      hide();
      trigger.removeEventListener("click", click);
      panel.removeEventListener("toggle", toggle);
      widget.removeEventListener("focusout", focusout);
      trigger.removeEventListener("pointerenter", show);
      trigger.removeEventListener("pointerleave", leave);
      trigger.removeEventListener("focus", show);
      panel.removeEventListener("pointerenter", enter);
      panel.removeEventListener("pointerleave", leave);
      document.removeEventListener("keydown", key);
      window.removeEventListener("resize", position);
      document.removeEventListener("scroll", position, true);
    });
  });
  [
    ...("matches" in root && root.matches("[data-toast]") ? [root] : []),
    ...(descendants ? root.querySelectorAll<HTMLElement>("[data-toast]") : []),
  ].forEach((toast) => {
    const button = toast.querySelector<HTMLButtonElement>(
      "[data-toast-dismiss]",
    );
    const timed = Number(toast.dataset.duration) > 0;
    let remaining = Number(toast.dataset.duration),
      started = 0,
      timer: ReturnType<typeof setTimeout> | undefined;
    const dismiss = () => {
      toast.hidden = true;
      clearTimeout(timer);
    };
    const pause = () => {
      clearTimeout(timer);
      if (started) {
        remaining = Math.max(0, remaining - (Date.now() - started));
        started = 0;
      }
    };
    const resume = () => {
      clearTimeout(timer);
      if (toast.matches(":hover") || toast.contains(document.activeElement))
        return;
      if (timed && remaining <= 0) {
        dismiss();
        return;
      }
      if (remaining > 0 && !toast.hidden) {
        started = Date.now();
        timer = setTimeout(dismiss, remaining);
      }
    };
    button?.addEventListener("click", dismiss);
    toast.addEventListener("pointerenter", pause);
    toast.addEventListener("pointerleave", resume);
    toast.addEventListener("focusin", pause);
    toast.addEventListener("focusout", resume);
    resume();
    cleanup.push(() => {
      clearTimeout(timer);
      button?.removeEventListener("click", dismiss);
      toast.removeEventListener("pointerenter", pause);
      toast.removeEventListener("pointerleave", resume);
      toast.removeEventListener("focusin", pause);
      toast.removeEventListener("focusout", resume);
    });
  });
  return () => cleanup.forEach((remove) => remove());
}
export const nativeWidgetCSS = `
[data-menu] { display:flex; flex-wrap:wrap; align-items:center; gap:inherit; } [data-menu=vertical] { flex-direction:column; align-items:stretch; } [data-menu] a { color:inherit; text-decoration:none; }
[data-socialbar] { display:flex; flex-wrap:wrap; gap:inherit; align-items:center; }
[data-social-icon] { display:inline-flex; align-items:center; justify-content:center; width:calc(var(--lv-social-size,24px) + 12px); height:calc(var(--lv-social-size,24px) + 12px); font-size:var(--lv-social-size,24px); font-weight:700; text-decoration:none; border-radius:50%; color:#666; }
[data-social-icon][data-icon-style=filled] { background:var(--lv-brand-color,#666); color:white; } [data-social-icon][data-icon-style=outline] { border:2px solid var(--lv-brand-color,#666); }
[data-social-icon=facebook] { --lv-brand-color:#1877f2; } [data-social-icon=twitter] { --lv-brand-color:#202028; } [data-social-icon=instagram] { --lv-brand-color:#e4405f; } [data-social-icon=linkedin] { --lv-brand-color:#0a66c2; } [data-social-icon=youtube] { --lv-brand-color:#ff0000; }
[data-floating-panel] { position:fixed; margin:0; max-width: min(360px,calc(100vw - 16px)); max-height:calc(100vh - 16px); overflow:auto; border:1px solid #c9c9ce; border-radius:6px; padding:12px; background:white; color:#202028; font:14px/1.5 system-ui; overflow-wrap:anywhere; }
[data-drawer] { position:fixed; margin:0; max-width:100vw; max-height:100dvh; padding:24px; overflow:auto; border:0; background:white; color:#202028; }
[data-drawer=right] { left:auto; right:0; top:0; bottom:0; width:min(420px,100vw); height:100dvh; }
[data-drawer=left] { left:0; right:auto; top:0; bottom:0; width:min(420px,100vw); height:100dvh; }
[data-drawer=top] { left:0; right:0; top:0; bottom:auto; width:100vw; max-height:80dvh; }
[data-drawer=bottom] { left:0; right:0; top:auto; bottom:0; width:100vw; max-height:80dvh; }
[data-drawer]::backdrop { background:rgb(0 0 0 / .45); }
[data-toast] { display:flex; gap:12px; align-items:center; overflow-wrap:anywhere; }
[data-toast][hidden] { display:none!important; }
[data-toast] button { margin-left:auto; color:inherit; background:transparent; border:1px solid currentColor; padding:4px 8px; border-radius:4px; }
[data-rich-text] p { margin:0 0 .6em; } [data-rich-text] ul { padding-left:1.5em; } [data-rich-text] blockquote { border-left:3px solid currentColor; padding-left:1em; }
[data-timeline] { padding-left:24px; } [data-timeline]>li { padding:0 0 16px 8px; border-left:2px solid currentColor; } [data-timeline]>li>span { display:block; font-size:.85em; opacity:.8; }
`;
