"use client";
import { useState } from "react";
import { Link, Unlink } from "lucide-react";
import { DimensionControl, LENGTH_UNITS } from "./ParameterControl";

export default function SpacingControl({
  label,
  property,
  styles,
  onChange,
}: {
  label: string;
  property: "padding" | "margin" | "borderRadius";
  styles: Record<string, string | number>;
  onChange: (styles: Record<string, string | number>) => void;
}) {
  const radius = property === "borderRadius";
  const sides = radius
    ? ["TopLeft", "TopRight", "BottomRight", "BottomLeft"]
    : ["Top", "Right", "Bottom", "Left"];
  const names = radius
    ? ["Top left", "Top right", "Bottom right", "Bottom left"]
    : sides;
  const raw = String(styles[property] || "0px")
    .trim()
    .split(/\s+(?![^()]*\))/);
  const shorthand = [
    raw[0],
    raw[1] ?? raw[0],
    raw[2] ?? raw[0],
    raw[3] ?? raw[1] ?? raw[0],
  ];
  const keys = sides.map((side) =>
    radius ? `border${side}Radius` : `${property}${side}`,
  );
  const values = keys.map((key, i) => String(styles[key] || shorthand[i]));
  const [linked, setLinked] = useState(values.every((v) => v === values[0]));
  return (
    <fieldset className="spacing-control">
      <legend>{label}</legend>
      <button
        type="button"
        className="spacing-link"
        aria-label={`Link ${label.toLowerCase()} values`}
        aria-pressed={linked}
        title={linked ? "Unlink sides" : "Link sides"}
        onClick={() => setLinked(!linked)}
      >
        {linked ? <Link size={14} /> : <Unlink size={14} />}
      </button>
      <div className="spacing-grid">
        {(linked ? [0] : [0, 1, 2, 3]).map((i) => (
          <label key={i}>
            <span>{linked ? "All sides" : names[i]}</span>
            <DimensionControl
              label={linked ? label : `${label} ${names[i].toLowerCase()}`}
              value={values[i]}
              min={property === "margin" ? -Infinity : 0}
              units={
                property === "margin" ? [...LENGTH_UNITS, "auto"] : LENGTH_UNITS
              }
              onChange={(value) =>
                onChange({
                  [property]: "",
                  ...Object.fromEntries(
                    keys.map((key, j) => [
                      key,
                      linked || j === i ? value : values[j],
                    ]),
                  ),
                })
              }
            />
          </label>
        ))}
      </div>
    </fieldset>
  );
}
