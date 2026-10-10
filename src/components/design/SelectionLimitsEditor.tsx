"use client";
import { useState } from "react";
import type { ElementNode } from "@/types";

export default function SelectionLimitsEditor({
  element,
  apply,
}: {
  element: ElementNode;
  apply: (limits: { minSelections: string; maxSelections: string }) => boolean;
}) {
  const [values, setValues] = useState({
    minSelections: String(element.props.minSelections ?? ""),
    maxSelections: String(element.props.maxSelections ?? ""),
  });
  return (
    <div>
      {(["minSelections", "maxSelections"] as const).map((bound) => (
        <label key={bound}>
          <span>
            {bound === "minSelections"
              ? "Minimum selections"
              : "Maximum selections"}
          </span>
          <input
            aria-label={
              bound === "minSelections"
                ? "Minimum selections"
                : "Maximum selections"
            }
            type="number"
            min={0}
            max={200}
            step={1}
            value={values[bound]}
            placeholder="Unset"
            onChange={(event) =>
              setValues({ ...values, [bound]: event.target.value })
            }
          />
        </label>
      ))}
      <button
        type="button"
        data-selection-limits-apply
        className="insp-form-add-btn"
        onClick={() => apply(values)}
      >
        Apply selection limits
      </button>
      <p className="panel-caption">
        Blank maximum allows all choices. A positive minimum requires a
        selection; Required sets a minimum of one. Add enough enabled choices to
        meet the minimum. Review connected backend rules after edits.
      </p>
    </div>
  );
}
