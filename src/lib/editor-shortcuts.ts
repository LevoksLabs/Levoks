export function isEditingTarget(target: EventTarget | null) {
  return (
    target instanceof HTMLElement &&
    Boolean(
      target.closest(
        'input, textarea, select, [contenteditable="true"], dialog, [role="dialog"], [role="menu"], .screen-picker[open], .header-action-menu[open], .site-preview-overlay, .code-preview-overlay',
      ),
    )
  );
}

export const SHORTCUTS = [
  [
    "Navigation",
    [
      ["Zoom in / out", "+ / −"],
      ["Fit canvas", "Shift 1"],
      ["Fit selection", "Shift 2"],
      ["Reset zoom", "Shift 0"],
      ["Center selection", "Shift 3"],
      ["Temporary pan", "Hold Space + drag"],
      ["Select / hand / marquee / pen", "V / H / M / P"],
      ["Finish / cancel vector", "Enter / Escape"],
      ["Open selection menu", "Shift F10"],
      ["Toggle inspector", "Shift I"],
      ["Toggle sub-tray", "Shift T"],
    ],
  ],
  [
    "Edit UI elements",
    [
      ["Move selection", "Arrow keys"],
      ["Move 10 px", "Shift + Arrow"],
      ["Move 0.1 px", "Alt + Arrow"],
      ["Select all", "Ctrl/⌘ A"],
      ["Clear selection / cancel", "Escape"],
      ["Select parent / first child", "Alt ↑ / Alt ↓ (Ctrl/⌘ held)"],
      ["Edit selected text", "Enter"],
      ["Duplicate", "Ctrl/⌘ D"],
      ["Group / ungroup", "Ctrl/⌘ G / Shift G"],
      ["Copy / cut / paste", "Ctrl/⌘ C / X / V"],
      ["Delete", "Delete / Backspace"],
      ["Undo / redo", "Ctrl/⌘ Z / Shift Z"],
      ["Lock / unlock", "Ctrl/⌘ Shift L"],
      ["Align left / center / right", "Alt A / H / D"],
      ["Align top / middle / bottom", "Alt W / V / S"],
      ["Distribute horizontally / vertically", "Alt Shift H / V"],
      ["Bring forward / send backward", "] / ["],
      ["Bring to front / send to back", "Shift ] / ["],
    ],
  ],
  [
    "Workspace",
    [
      ["Elements / Pages / Assets", "Shift E / P / A"],
      ["Backend / Routing", "Shift B / R"],
      ["Code", "Shift C"],
      ["AI assistant", "Shift G"],
      ["Deploy", "Shift D"],
      ["Preview", "Shift Enter"],
      ["Save project", "Ctrl/⌘ S"],
      ["Keyboard help", "?"],
    ],
  ],
] as const;

export function canvasCommand(command: string) {
  window.dispatchEvent(new CustomEvent("levoks:canvas", { detail: command }));
}
