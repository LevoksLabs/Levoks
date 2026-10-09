"use client";
import { useState } from "react";
import type { ElementNode } from "@/types";
import { useEditorStore } from "@/store/editorStore";
import { conditionSources, conditionalGroups } from "@/lib/form-conditions";
import { editFormCondition } from "@/lib/edit-form-condition";
import { formOwner } from "@/lib/contracts";

export default function FormConditionEditor({
  element,
}: {
  element: ElementNode;
}) {
  const nodes = useEditorStore((state) => state.elementsById);
  const [error, setError] = useState("");
  if (!conditionalGroups.includes(element.definitionId || "")) return null;
  const sources = conditionSources(element, nodes),
    rule = element.formCondition;
  if (!rule && !formOwner(element, Object.values(nodes))) return null;
  const apply = (condition?: ElementNode["formCondition"]) => {
    try {
      editFormCondition(element.id, condition);
      setError("");
    } catch (error) {
      setError((error as Error).message);
    }
  };
  return (
    <fieldset className="select-options-editor">
      <legend>Show this section when</legend>
      <label>
        <span>Checkbox or Switch</span>
        <select
          aria-label="Section condition checkbox"
          value={rule?.sourceId || ""}
          onChange={(e) =>
            apply(
              e.target.value
                ? { sourceId: e.target.value, checked: rule?.checked ?? true }
                : undefined,
            )
          }
        >
          <option value="">Always show</option>
          {rule && !sources.some((node) => node.id === rule.sourceId) && (
            <option value={rule.sourceId}>
              Unavailable checkbox — choose again
            </option>
          )}
          {sources.map((node) => (
            <option key={node.id} value={node.id}>
              {String(node.props.label || node.label || node.props.name)}
            </option>
          ))}
        </select>
      </label>
      {rule && (
        <label>
          <span>State</span>
          <select
            aria-label="Section condition state"
            value={String(rule.checked)}
            onChange={(e) =>
              apply({ ...rule, checked: e.target.value === "true" })
            }
          >
            <option value="true">Checked</option>
            <option value="false">Unchecked</option>
          </select>
        </label>
      )}
      {error && (
        <p role="alert" className="property-error">
          {error}
        </p>
      )}
      {!sources.length && !rule && (
        <p className="insp-form-caption">
          Add an enabled Checkbox or Switch outside this section to control when
          it appears.
        </p>
      )}
      <p className="insp-form-caption">
        Sections stay visible while editing. Preview applies the condition and
        omits hidden values. New submission collections include conditional
        validation; review existing backend rules after changing a condition.
      </p>
    </fieldset>
  );
}
