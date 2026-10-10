"use client";
import type { ElementNode } from "@/types";
import { useEditorStore } from "@/store/editorStore";
import { useEditorUIStore } from "@/store/editorUIStore";
import {componentRoot} from "@/lib/design-components";
import { ParameterControl } from "./ParameterControl";

export default function DesignInspector({ element }: { element: ElementNode }) {
  const store = useEditorStore(),
    ui = useEditorUIStore();
  const vector = element.vector;
  const instanceRoot = componentRoot(element.id, store.elementsById, store.components);
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
            {ui.breakpoint.startsWith("custom_") ? store.canvasSettings.breakpoints?.find(bp=>`custom_${bp.width}`===ui.breakpoint)?.name || "Custom" : ui.breakpoint === "mobile" ? "Mobile" : "Tablet"} overrides
          </strong>
          <span>
            Layout and style changes affect this breakpoint and smaller screens.
            {" "}Content and element structure are shared across all screens.
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
      {instanceRoot && (
        <details open>
          <summary>Component instance</summary>
          <span>
            {store.components[instanceRoot.component!.id]?.name} ·{" "}
            {element.component?.overrides.length || 0} local overrides
          </span>
          <div className="design-button-row">
            <button
              disabled={
                element.id !== instanceRoot.id
              }
              onClick={() =>
                store.saveComponent(
                  element.id,
                  store.components[instanceRoot.component!.id].name,
                )
              }
            >
              Publish to instances
            </button>
            <button onClick={() => store.detachComponent(instanceRoot.id)}>
              Detach instance
            </button>
            {instanceRoot.component!.overrides.includes("structure") && <button onClick={() => store.resetComponentStructure(instanceRoot.id)}>Restore shared structure</button>}
          </div>
          <p>Structure changes stay local until published. Restore shared structure removes local additions and restores shared children; Undo recovers the local version. Content and style overrides remain.</p>
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
                    ...(property === "backgroundColor" ? { background: "" } : {}),
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
      <details>
        <summary>Transform and perspective</summary>
        <p>Transforms apply to this element and its children. Perspective is measured in pixels; 0 disables it.</p>
        {([
          ["rotateX","Tilt X",0,-3600,3600,"°"], ["rotateY","Tilt Y",0,-3600,3600,"°"],
          ["depth","Depth",0,-10000,10000,"px"], ["perspective","Perspective",800,0,20000,"px"],
          ["scaleX","Scale X",1,.01,100,""], ["scaleY","Scale Y",1,.01,100,""],
          ["skewX","Skew X",0,-85,85,"°"], ["skewY","Skew Y",0,-85,85,"°"],
        ] as const).map(([key,label,fallback,min,max,unit])=><label key={key}>{label}<ParameterControl label={label} value={element.layout[key] ?? fallback} min={min} max={max} step={key.startsWith("scale") ? .01 : 1} unit={unit} onChange={value=>store.updateElement(element.id,{layout:{...element.layout,[key]:value}})} /></label>)}
        <label>Transform origin<input aria-label="Transform origin" value={String(element.styles.transformOrigin || "50% 50%")} onChange={event=>store.updateElement(element.id,{styles:{transformOrigin:event.target.value}})} /></label>
        <button onClick={()=>store.updateElement(element.id,{layout:{...element.layout,rotation:0,perspective:0,rotateX:0,rotateY:0,depth:0,scaleX:1,scaleY:1,skewX:0,skewY:0},styles:{transformOrigin:"50% 50%",transform:"none"}})}>Reset transform</button>
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
