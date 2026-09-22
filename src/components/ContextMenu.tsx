"use client";
import { useEditorUIStore } from "@/store/editorUIStore";
import { canGroup, canUngroup } from "@/lib/grouping";
import { useEditorStore } from "@/store/editorStore";
import { useLayoutEffect, useRef } from "react";
import {
  ArrowDown,
  ArrowDownToLine,
  ArrowUp,
  ArrowUpToLine,
  ClipboardPaste,
  Copy,
  CopyPlus,
  Eye,
  EyeOff,
  Lock,
  Scissors,
  Trash2,
  Unlock,
} from "lucide-react";
interface ContextMenuProps {
  x: number;
  y: number;
  elementId: string;
  onClose: () => void;
}
export default function ContextMenu({
  x,
  y,
  elementId,
  onClose,
}: ContextMenuProps) {
  const store = useEditorStore();
  const menuRef = useRef<HTMLDivElement>(null);
  const closeRef = useRef(onClose);
  useLayoutEffect(() => {
    closeRef.current = onClose;
  }, [onClose]);
  useEditorUIStore(state => state.breakpoint);
  const el = store.getElement(elementId);
  useLayoutEffect(() => {
    const menu = menuRef.current;
    if (!menu) return;
    const previousFocus = document.activeElement;
    const bounds = menu.getBoundingClientRect();
    menu.style.left = `${Math.max(8, Math.min(x, window.innerWidth - bounds.width - 8))}px`;
    menu.style.top = `${Math.max(8, Math.min(y, window.innerHeight - bounds.height - 8))}px`;
    menu.querySelector<HTMLButtonElement>("button:not(:disabled)")?.focus();
    const outside = (event: PointerEvent) => {
      if (!menu.contains(event.target as Node)) closeRef.current();
    };
    document.addEventListener("pointerdown", outside);
    return () => {
      document.removeEventListener("pointerdown", outside);
      if (
        menu.contains(document.activeElement) &&
        previousFocus instanceof HTMLElement &&
        previousFocus.isConnected
      )
        previousFocus.focus();
    };
  }, [x, y]);
  if (!el) return null;
  const action = (fn: () => void) => {
    fn();
    onClose();
  };
  const ids = (store.selectedElementIds.includes(elementId) ? store.selectedElementIds : [elementId]).filter(id => { let parent = store.elementsById[id]?.parentId; while (parent) { if (store.selectedElementIds.includes(parent)) return false; parent = store.elementsById[parent]?.parentId; } return true; });
  const locked = ids.some(id => store.getElement(id)?.layout.locked);
  const batch = (fn: (id: string) => void) => { store.beginInteraction(); try { ids.forEach(fn); } finally { store.endInteraction(); } };
  const items = [
    { label: "Group selection", icon: CopyPlus, shortcut: "Ctrl/⌘ G", disabled: !canGroup(store), run: store.groupSelection },
    { label: "Ungroup", icon: CopyPlus, shortcut: "Ctrl/⌘ Shift G", disabled: !canUngroup({ ...store, selectedElementIds: ids }), run: store.ungroupSelection },
    {
      label: "Cut",
      icon: Scissors,
      shortcut: "Ctrl/⌘ X",
      disabled: locked,
      run: () => { store.copyElements(ids); batch(store.deleteElement); },
    },
    {
      label: "Copy",
      icon: Copy,
      shortcut: "Ctrl/⌘ C",
      run: () => store.copyElements(ids),
    },
    {
      label: "Paste",
      icon: ClipboardPaste,
      shortcut: "Ctrl/⌘ V",
      disabled: !store.clipboard,
      run: () => store.pasteElement(),
    },
    {
      label: "Duplicate",
      icon: CopyPlus,
      shortcut: "Ctrl/⌘ D",
      divider: true,
      run: () => { const clones: string[] = []; batch(id => { store.duplicateElement(id); const clone = useEditorStore.getState().selectedElementId; if (clone) clones.push(clone); }); store.selectElements(clones); },
    },
    {
      label: "Bring to front",
      icon: ArrowUpToLine,
      divider: true,
      disabled: locked,
      run: () => batch(store.bringToFront),
    },
    {
      label: "Bring forward",
      icon: ArrowUp,
      disabled: locked,
      run: () => batch(store.bringForward),
    },
    {
      label: "Send backward",
      icon: ArrowDown,
      disabled: locked,
      run: () => batch(store.sendBackward),
    },
    {
      label: "Send to back",
      icon: ArrowDownToLine,
      disabled: locked,
      run: () => batch(store.sendToBack),
    },
    {
      label: el.layout.visible ? "Hide" : "Show",
      icon: el.layout.visible ? EyeOff : Eye,
      divider: true,
      run: () => batch(store.toggleVisibility),
    },
    {
      label: el.layout.locked ? "Unlock" : "Lock",
      icon: el.layout.locked ? Unlock : Lock,
      run: () => batch(store.toggleLock),
    },
    {
      label: "Delete",
      icon: Trash2,
      shortcut: "Delete",
      divider: true,
      danger: true,
      disabled: locked,
      run: () => batch(store.deleteElement),
    },
  ];
  return (
    <div
      ref={menuRef}
      className="ctx-menu"
      role="menu"
      aria-label={ids.length > 1 ? `Actions for ${ids.length} elements` : `Actions for ${el.label || el.type}`}
      style={{ left: x, top: y }}
      onKeyDown={(event) => {
        if (["Escape", "Tab"].includes(event.key)) {
          event.preventDefault();
          onClose();
          return;
        }
        if (!["ArrowDown", "ArrowUp", "Home", "End"].includes(event.key))
          return;
        event.preventDefault();
        const buttons = Array.from(
          menuRef.current!.querySelectorAll<HTMLButtonElement>(
            "button:not(:disabled)",
          ),
        );
        const index = buttons.indexOf(
          document.activeElement as HTMLButtonElement,
        );
        const next =
          event.key === "Home"
            ? 0
            : event.key === "End"
              ? buttons.length - 1
              : (index +
                  (event.key === "ArrowDown" ? 1 : -1) +
                  buttons.length) %
                buttons.length;
        buttons[next]?.focus();
      }}
    >
      {items.map((item) => (
        <div key={item.label} role="none">
          {item.divider && <div className="ctx-divider" role="separator" />}
          <button
            role="menuitem"
            tabIndex={-1}
            className={`ctx-item${item.danger ? " ctx-danger" : ""}`}
            disabled={item.disabled}
            onClick={() => action(item.run)}
          >
            <item.icon size={15} className="ctx-icon" />
            <span>{item.label}</span>
            <span className="ctx-shortcut">{item.shortcut}</span>
          </button>
        </div>
      ))}
    </div>
  );
}
