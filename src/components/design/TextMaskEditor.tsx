"use client";
import { useState } from "react";
import type { ElementNode } from "@/types";
import { useEditorStore } from "@/store/editorStore";
import { maskPattern } from "@/lib/backend/text-mask";

export default function TextMaskEditor({ element }: { element: ElementNode }) {
  const [draft, setDraft] = useState(String(element.props.formatMask || ""));
  const [error, setError] = useState("");
  return (
    <fieldset className="select-options-editor">
      <legend>Custom text format</legend>
      <label>
        <span>Format mask</span>
        <input
          aria-label="Custom format mask"
          value={draft}
          maxLength={120}
          onChange={(event) => setDraft(event.target.value)}
        />
      </label>
      <p className="insp-form-caption">
        0 = digit, A = uppercase, a = lowercase, X = letter or digit, L = any
        language letter, N = any language digit. Other characters are literal;
        use a backslash to make a token literal. AA-0000 accepts AB-1234. Counts
        such as 0&#123;2,6&#125; allow 2–6 digits.
      </p>
      <button
        type="button"
        data-mask-apply
        onClick={() => {
          try {
            maskPattern(draft);
            useEditorStore
              .getState()
              .updateElement(element.id, {
                props: { pattern: "", formatMask: draft },
              });
            setError("");
            requestAnimationFrame(() =>
              document
                .querySelector<HTMLButtonElement>("[data-mask-apply]")
                ?.focus(),
            );
          } catch (error) {
            setError((error as Error).message);
          }
        }}
      >
        Apply custom format
      </button>
      {error && (
        <p role="alert" className="property-error">
          {error}
        </p>
      )}
    </fieldset>
  );
}
