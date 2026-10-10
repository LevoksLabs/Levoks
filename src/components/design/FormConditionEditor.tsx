"use client";
import { useState } from "react";
import type { ElementNode, FormCondition, FormConditionRule } from "@/types";
import { useEditorStore } from "@/store/editorStore";
import {
  conditionSources,
  conditionRules,
  conditionKind,
  conditionChoices,
  conditionalGroups,
} from "@/lib/form-conditions";
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
    condition = element.formCondition;
  if (!condition && !formOwner(element, Object.values(nodes))) return null;
  const rules = condition ? conditionRules(condition) : [];
  const apply = (value?: FormCondition) => {
    try {
      editFormCondition(element.id, value);
      setError("");
    } catch (error) {
      setError((error as Error).message);
    }
  };
  const saveRules = (next: FormConditionRule[]) =>
    apply(
      next.length
        ? {
            ...next[0],
            ...(next.length > 1
              ? { rules: next.slice(1), match: condition?.match || "all" }
              : {}),
          }
        : undefined,
    );
  const replace = (index: number, rule: FormConditionRule) =>
    saveRules(
      rules.length
        ? rules.map((old, at) => (at === index ? rule : old))
        : [rule],
    );
  const initial = (sourceId: string): FormConditionRule => {
    const source = nodes[sourceId],
      kind = conditionKind(source);
    return {
      sourceId,
      checked: true,
      ...(kind !== "boolean"
        ? {
            operator: kind === "array" ? "includes" : "eq",
            value: conditionChoices(source, nodes)[0].value,
          }
        : {}),
    };
  };
  return (
    <fieldset className="select-options-editor">
      <legend>Show this section when</legend>
      {(rules.length ? rules : [undefined]).map((rule, index) => {
        const source = rule && nodes[rule.sourceId],
          kind = source ? conditionKind(source) : "boolean";
        const suffix = index ? ` ${index + 1}` : "";
        const choices = source ? conditionChoices(source, nodes) : [];
        return (
          <div key={index}>
            <label>
              <span>Form choice{suffix}</span>
              <select
                aria-label={`Section condition checkbox${suffix}`}
                value={rule?.sourceId || ""}
                onChange={(event) =>
                  event.target.value
                    ? replace(index, initial(event.target.value))
                    : saveRules(rules.filter((_, at) => at !== index))
                }
              >
                <option value="">
                  {index ? "Remove this rule" : "Always show"}
                </option>
                {rule && !sources.some((node) => node.id === rule.sourceId) && (
                  <option value={rule.sourceId}>
                    Unavailable field — choose again
                  </option>
                )}
                {sources.map((node) => (
                  <option key={node.id} value={node.id}>
                    {String(
                      node.props.legend ||
                        node.props.label ||
                        node.label ||
                        node.props.name,
                    )}
                  </option>
                ))}
              </select>
            </label>
            {rule &&
              (kind === "boolean" ? (
                <label>
                  <span>State</span>
                  <select
                    aria-label={`Section condition state${suffix}`}
                    value={String(rule.checked)}
                    onChange={(event) =>
                      replace(index, {
                        ...rule,
                        checked: event.target.value === "true",
                      })
                    }
                  >
                    <option value="true">Checked</option>
                    <option value="false">Unchecked</option>
                  </select>
                </label>
              ) : (
                <>
                  <label>
                    <span>Comparison</span>
                    <select
                      aria-label={`Section condition comparison${suffix}`}
                      value={rule.operator || ""}
                      onChange={(event) =>
                        replace(index, {
                          ...rule,
                          operator: event.target
                            .value as FormConditionRule["operator"],
                        })
                      }
                    >
                      {!rule.operator && (
                        <option value="">Choose a comparison</option>
                      )}
                      {kind === "array" ? (
                        <>
                          <option value="includes">Includes</option>
                          <option value="excludes">Does not include</option>
                        </>
                      ) : (
                        <>
                          <option value="eq">Is</option>
                          <option value="ne">Is not</option>
                        </>
                      )}
                    </select>
                  </label>
                  <label>
                    <span>Option</span>
                    <select
                      aria-label={`Section condition option${suffix}`}
                      value={rule.value || ""}
                      onChange={(event) =>
                        replace(index, { ...rule, value: event.target.value })
                      }
                    >
                      {!choices.some(
                        (choice) => choice.value === rule.value,
                      ) && (
                        <option value={rule.value || ""}>
                          Unavailable option — choose again
                        </option>
                      )}
                      {choices.map((choice) => (
                        <option key={choice.value} value={choice.value}>
                          {choice.label}
                        </option>
                      ))}
                    </select>
                  </label>
                </>
              ))}
            {rule && (
              <button
                type="button"
                onClick={() => saveRules(rules.filter((_, at) => at !== index))}
                aria-label={`Remove section condition ${index + 1}`}
              >
                Remove rule
              </button>
            )}
          </div>
        );
      })}
      {rules.length > 1 && (
        <label>
          <span>Show when</span>
          <select
            aria-label="Section condition matching"
            value={condition?.match || "all"}
            onChange={(event) =>
              apply({
                ...condition!,
                match: event.target.value as "all" | "any",
              })
            }
          >
            <option value="all">All rules match</option>
            <option value="any">Any rule matches</option>
          </select>
        </label>
      )}
      {!!rules.length && (
        <button
          type="button"
          disabled={!sources.length || rules.length >= 8}
          onClick={() => saveRules([...rules, initial(sources[0].id)])}
        >
          Add condition
        </button>
      )}
      {error && (
        <p role="alert" className="property-error">
          {error}
        </p>
      )}
      {!sources.length && !condition && (
        <p className="insp-form-caption">
          Add an enabled Checkbox, Switch, Select or choice group outside this
          section to control when it appears.
        </p>
      )}
      <p className="insp-form-caption">
        Sections stay visible while editing. Preview omits hidden values and
        applies parent conditions to nested sections. New submission collections
        include conditional validation; review existing backend rules after
        changing a condition.
      </p>
    </fieldset>
  );
}
