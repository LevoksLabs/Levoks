"use client";
import type { ElementNode } from "@/types";
import { useEditorStore } from "@/store/editorStore";
import { useEditorUIStore } from "@/store/editorUIStore";

export default function DesignInspector({ element }: { element: ElementNode }) {
  const store = useEditorStore(),
    ui = useEditorUIStore();
  const vector = element.vector;
  const editPoint = (index: number, field: string, value: number) => {
    if (!vector || !Number.isFinite(value) || Math.abs(value) > 10000) return;
    store.updateElement(element.id, {
      vector: {
        ...vector,
        points: vector.points.map((point, i) =>
          i === index ? { ...point, [field]: value } : point,
        ),
      },
    });
  };
  return (
    <div className="design-inspector">
      {ui.breakpoint !== "base" && (
        <div className="design-notice">
          <strong>
            {ui.breakpoint === "mobile" ? "Mobile" : "Tablet"} overrides
          </strong>
          <span>
            Layout and style changes affect this breakpoint and smaller screens.
          </span>
          <button
            disabled={
              !store.elementsById[element.id]?.responsive?.[ui.breakpoint]
            }
            onClick={() => store.resetBreakpoint(element.id)}
          >
            Reset breakpoint overrides
          </button>
        </div>
      )}
      {element.component && (
        <details open>
          <summary>Component instance</summary>
          <span>
            {store.components[element.component.id]?.name} ·{" "}
            {element.component.overrides.length} local overrides
          </span>
          <div className="design-button-row">
            <button
              disabled={
                element.component.node !==
                store.components[element.component.id]?.rootId
              }
              onClick={() =>
                store.saveComponent(
                  element.id,
                  store.components[element.component!.id].name,
                )
              }
            >
              Publish to instances
            </button>
            <button onClick={() => store.detachComponent(element.id)}>
              Detach instance
            </button>
          </div>
        </details>
      )}
      <details>
        <summary>Design token bindings</summary>
        <p>Choose a shared value. Edit tokens in the Library.</p>
        {[
          ["Text color", "color"],
          ["Fill", "backgroundColor"],
          ["Font", "fontFamily"],
          ["Corner radius", "borderRadius"],
          ["Spacing", "gap"],
        ].map(([label, property]) => (
          <label key={property}>
            {label}
            <select
              aria-label={`${label} token`}
              value={
                String(element.styles[property] || "").match(
                  /^var\(--lv-(.+)\)$/,
                )?.[1] || ""
              }
              onChange={(event) => {
                const old = String(element.styles[property] || "").match(
                  /^var\(--lv-(.+)\)$/,
                )?.[1];
                store.updateElement(element.id, {
                  styles: {
                    [property]: event.target.value
                      ? `var(--lv-${event.target.value})`
                      : store.tokens[old || ""]?.value || "inherit",
                  },
                });
              }}
            >
              <option value="">Local value</option>
              {Object.entries(store.tokens).map(([id, token]) => (
                <option key={id} value={id}>
                  {token.name}
                </option>
              ))}
            </select>
          </label>
        ))}
      </details>
      {vector && (
        <details open>
          <summary>Vector path · {vector.points.length} points</summary>
          <label>
            <input
              type="checkbox"
              checked={vector.closed}
              onChange={(event) =>
                store.updateElement(element.id, {
                  vector: { ...vector, closed: event.target.checked },
                })
              }
            />
            Closed path
          </label>
          <label>
            Fill
            <input
              aria-label="Vector fill"
              type="color"
              value={vector.fill === "none" ? "#ad91ff" : vector.fill}
              onChange={(event) =>
                store.updateElement(element.id, {
                  vector: { ...vector, fill: event.target.value },
                })
              }
            />
          </label>
          <label>
            Stroke
            <input
              aria-label="Vector stroke"
              type="color"
              value={vector.stroke === "none" ? "#1c1236" : vector.stroke}
              onChange={(event) =>
                store.updateElement(element.id, {
                  vector: { ...vector, stroke: event.target.value },
                })
              }
            />
          </label>
          <label>
            Stroke width
            <input
              aria-label="Vector stroke width"
              type="number"
              min="0"
              max="100"
              value={vector.strokeWidth}
              onChange={(event) =>
                store.updateElement(element.id, {
                  vector: {
                    ...vector,
                    strokeWidth: Math.max(
                      0,
                      Math.min(100, Number(event.target.value)),
                    ),
                  },
                })
              }
            />
          </label>
          <p>
            Drag the anchors and curve handles on the selected path. Coordinates
            below use its 100 × 100 view box.
          </p>
          {vector.points.map((point, index) => (
            <div className="vector-point-row" key={index}>
              <strong>Point {index + 1}</strong>
              <div className="design-field-row">
                {["x", "y"].map((field) => (
                  <label key={field}>
                    {field.toUpperCase()}
                    <input
                      aria-label={`Point ${index + 1} ${field}`}
                      type="number"
                      value={Number(point[field as "x" | "y"].toFixed(2))}
                      onChange={(event) =>
                        editPoint(index, field, Number(event.target.value))
                      }
                    />
                  </label>
                ))}
              </div>
              <div className="design-button-row">
                <button
                  onClick={() =>
                    store.updateElement(element.id, {
                      vector: {
                        ...vector,
                        points: vector.points.map((p, i) =>
                          i === index
                            ? p.inX === undefined
                              ? {
                                  ...p,
                                  inX: p.x - 10,
                                  inY: p.y,
                                  outX: p.x + 10,
                                  outY: p.y,
                                }
                              : { x: p.x, y: p.y }
                            : p,
                        ),
                      },
                    })
                  }
                >
                  {point.inX === undefined ? "Curve point" : "Straight point"}
                </button>
                <button
                  disabled={vector.points.length <= 2}
                  onClick={() =>
                    store.updateElement(element.id, {
                      vector: {
                        ...vector,
                        points: vector.points.filter((_, i) => i !== index),
                      },
                    })
                  }
                >
                  Remove point {index + 1}
                </button>
              </div>
            </div>
          ))}
        </details>
      )}
    </div>
  );
}
