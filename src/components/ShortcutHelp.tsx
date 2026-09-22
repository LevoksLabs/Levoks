"use client";
import { useEffect, useRef } from "react";
import { Keyboard, X } from "lucide-react";
import { useEditorUIStore } from "@/store/editorUIStore";
import { SHORTCUTS } from "@/lib/editor-shortcuts";

export default function ShortcutHelp() {
  const open = useEditorUIStore((s) => s.helpOpen);
  const dialog = useRef<HTMLDialogElement>(null);
  useEffect(() => {
    if (open) dialog.current?.showModal();
    else dialog.current?.close();
  }, [open]);
  return (
    <dialog
      ref={dialog}
      className="shortcut-dialog"
      aria-labelledby="shortcut-heading"
      onClose={() => useEditorUIStore.setState({ helpOpen: false })}
    >
      <header>
        <div>
          <Keyboard size={18} />
          <h2 id="shortcut-heading">Keyboard shortcuts</h2>
        </div>
        <button
          aria-label="Close keyboard shortcuts"
          onClick={() => dialog.current?.close()}
        >
          <X size={18} />
        </button>
      </header>
      <p>
        Stay in flow. Shortcuts pause while you type in fields or review a
        dialog.
      </p>
      <div className="shortcut-columns">
        {SHORTCUTS.map(([section, commands]) => (
          <section key={section}>
            <h3>{section}</h3>
            <dl>
              {commands.map(([name, keys]) => (
                <div key={name}>
                  <dt>{name}</dt>
                  <dd>
                    <kbd>{keys}</kbd>
                  </dd>
                </div>
              ))}
            </dl>
          </section>
        ))}
      </div>
      <footer>
        Element editing and undo apply to the UI canvas. Backend and Routing use
        their own selection and navigation.
      </footer>
    </dialog>
  );
}
