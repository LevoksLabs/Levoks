"use client";
import { useEffect } from "react";
import { useEditorStore } from "@/store/editorStore";
import { useBackendStore } from "@/store/backendStore";
import { useRoutingStore } from "@/store/routingStore";
import { useEditorUIStore } from "@/store/editorUIStore";
import { isEditingTarget, canvasCommand } from "@/lib/editor-shortcuts";
import { alignSelection, type Alignment } from "@/lib/editor-selection";

export default function KeyboardShortcuts() {
  useEffect(() => {
    const handle = (event: KeyboardEvent) => {
      if (
        event.defaultPrevented ||
        isEditingTarget(event.target) ||
        document.querySelector(
          'dialog[open]:not([aria-modal="false"]), .site-preview-overlay',
        )
      )
        return;
      const editor = useEditorStore.getState(),
        ui = useEditorUIStore.getState();
      const key = event.key.toLowerCase(),
        mod = event.ctrlKey || event.metaKey;
      if (
        key === "enter" &&
        !event.shiftKey &&
        event.target instanceof HTMLElement &&
        event.target.closest("button, a, summary")
      )
        return;
      const action = (fn: () => void) => {
        event.preventDefault();
        fn();
      };
      if (key === "?")
        return action(() => useEditorUIStore.setState({ helpOpen: true }));
      if (!mod && event.shiftKey) {
        const panels: Record<string, string> = {
          e: "add",
          p: "pages",
          a: "assets",
          b: "backend",
          r: "routes",
          s: "settings",
        };
        if (panels[key])
          return action(() => {
            editor.setSidebarOpen(panels[key]);
            useEditorUIStore.setState({ trayCollapsed: false });
          });
        const workspace: Record<string, string> = {
          c: "source",
          g: "ai",
          d: "ship",
        };
        if (workspace[key])
          return action(() =>
            window.dispatchEvent(
              new CustomEvent("levoks:panel", { detail: workspace[key] }),
            ),
          );
        if (key === "enter")
          return action(() =>
            window.dispatchEvent(new Event("levoks:preview")),
          );
        if (key === "i") return action(() => ui.toggle("inspectorVisible"));
        if (key === "t") return action(() => ui.toggle("trayCollapsed"));
      }
      if (!mod && !event.altKey) {
        const view: Record<string, string> = {
          "+": "in",
          "=": "in",
          "-": "out",
          _: "out",
          "!": "fit",
          "@": "selection",
          ")": "reset",
          "#": "center",
        };
        const command =
          view[event.key] ||
          (event.shiftKey
            ? (
                {
                  "1": "fit",
                  "2": "selection",
                  "0": "reset",
                  "3": "center",
                } as Record<string, string>
              )[key]
            : undefined);
        if (command) return action(() => canvasCommand(command));
        if (!event.shiftKey && ["v", "h", "m", "p"].includes(key))
          return action(() => ui.setTool(key === "v" ? "select" : key === "h" ? "hand" : key === "m" ? "marquee" : "pen"));
      }
      if (mod && key === "z")
        return action(event.shiftKey ? editor.redo : editor.undo);
      if (mod && key === "y") return action(editor.redo);
      if (ui.canvasMode === "routes") {
        const routing = useRoutingStore.getState();
        if (key === "escape")
          return action(() => {
            routing.cancelConnecting();
            routing.selectNode(null);
            routing.selectConnection(null);
          });
        if (key === "delete" || key === "backspace")
          return action(() => {
            if (routing.selectedConnectionId)
              routing.removeConnection(routing.selectedConnectionId);
            else if (routing.selectedNodeId)
              routing.removeNode(routing.selectedNodeId);
          });
        const node = routing.nodes.find((n) => n.id === routing.selectedNodeId);
        if (node && key.startsWith("arrow"))
          return action(() => {
            const step = event.shiftKey ? 10 : 1;
            routing.moveNode(
              node.id,
              node.position.x +
                (key === "arrowleft" ? -step : key === "arrowright" ? step : 0),
              node.position.y +
                (key === "arrowup" ? -step : key === "arrowdown" ? step : 0),
            );
          });
        return;
      }
      if (ui.canvasMode === "backend") {
        const backend = useBackendStore.getState();
        if (key === "escape")
          return action(() => {
            backend.selectBlock(null);
            backend.selectService(null);
          });
        if (
          (key === "delete" || key === "backspace") &&
          backend.selectedBlockId &&
          backend.selectedServiceId
        )
          return action(() =>
            backend.removeBlock(
              backend.selectedServiceId!,
              backend.selectedBlockId!,
            ),
          );
        return;
      }
      const ids = editor.selectedElementIds.filter((id) => {
        let parent = editor.elementsById[id]?.parentId;
        while (parent) {
          if (editor.selectedElementIds.includes(parent)) return false;
          parent = editor.elementsById[parent]?.parentId;
        }
        return Boolean(editor.elementsById[id]);
      });
      const batch = (fn: () => void) => {
        editor.beginInteraction();
        try {
          fn();
        } finally {
          editor.endInteraction();
        }
      };
      if (event.altKey && !mod) {
        const alignments: Record<string, Alignment> = {
          a: "left",
          h: "center",
          d: "right",
          w: "top",
          v: "middle",
          s: "bottom",
        };
        if (event.shiftKey && ["h", "v"].includes(key))
          return action(() =>
            alignSelection(key === "h" ? "horizontal" : "vertical"),
          );
        if (alignments[key])
          return action(() => alignSelection(alignments[key]));
      }
      if (mod && key === "g") return action(event.shiftKey ? editor.ungroupSelection : editor.groupSelection);
      if (mod && key === "a")
        return action(() =>
          editor.selectElements(
            [...editor.rootIds, ...editor.globalRootIds].filter(
              (id) => editor.elementsById[id]?.layout.visible,
            ),
          ),
        );
      if (key === "escape")
        return action(() => {
          editor.selectElement(null);
          canvasCommand("cancel");
          ui.setTool("select");
        });
      if (mod && key === "d")
        return action(() =>
          batch(() => {
            const clones: string[] = [];
            ids.forEach((id) => {
              editor.duplicateElement(id);
              const selected = useEditorStore.getState().selectedElementId;
              if (selected) clones.push(selected);
            });
            editor.selectElements(clones);
          }),
        );
      if (mod && key === "v") return action(editor.pasteElement);
      if (mod && ["c", "x"].includes(key) && ids.length)
        return action(() => {
          const eligible =
            key === "x"
              ? ids.filter((id) => !editor.elementsById[id].layout.locked)
              : ids;
          editor.copyElements(eligible);
          if (key === "x") batch(() => eligible.forEach(editor.deleteElement));
        });
      if (mod && event.shiftKey && key === "l")
        return action(() => batch(() => ids.forEach(editor.toggleLock)));
      if (["delete", "backspace"].includes(key))
        return action(() =>
          batch(() =>
            ids
              .filter((id) => !editor.elementsById[id].layout.locked)
              .forEach(editor.deleteElement),
          ),
        );
      if (
        mod &&
        event.altKey &&
        editor.selectedElementId &&
        ["arrowup", "arrowdown"].includes(key)
      )
        return action(() => {
          const el = editor.elementsById[editor.selectedElementId!];
          editor.selectElement(
            key === "arrowup" ? el.parentId : el.children[0] || el.id,
          );
        });
      if (key.startsWith("arrow") && ids.length && !mod)
        return action(() =>
          batch(() => {
            const step = event.shiftKey ? 10 : event.altKey ? 0.1 : 1;
            ids.forEach((id) => {
              const el = editor.getElement(id)!;
              if (!el.layout.locked)
                editor.updateElementPosition(
                  id,
                  Math.max(
                    0,
                    el.layout.x +
                      (key === "arrowleft"
                        ? -step
                        : key === "arrowright"
                          ? step
                          : 0),
                  ),
                  Math.max(
                    0,
                    el.layout.y +
                      (key === "arrowup"
                        ? -step
                        : key === "arrowdown"
                          ? step
                          : 0),
                  ),
                );
            });
          }),
        );
      if (["[", "]", "{", "}"].includes(key) && !mod)
        return action(() =>
          batch(() =>
            ids.forEach((id) => {
              if (editor.elementsById[id].layout.locked) return;
              const forward = key === "]" || key === "}";
              (event.shiftKey
                ? forward
                  ? editor.bringToFront
                  : editor.sendToBack
                : forward
                  ? editor.bringForward
                  : editor.sendBackward)(id);
            }),
          ),
        );
      if (key === "enter" && !mod)
        return action(() =>
          window.dispatchEvent(new Event("levoks:edit-text")),
        );
    };
    window.addEventListener("keydown", handle);
    return () => window.removeEventListener("keydown", handle);
  }, []);
  return null;
}
