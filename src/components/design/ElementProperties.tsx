"use client";
import type { ElementNode } from "@/types";
import { definitionFor, type PropertyField } from "@/lib/elements/registry";
import { useEditorStore } from "@/store/editorStore";
import { embedError } from "@/lib/elements/embed";
import { isTemporalKind, temporalConfigError } from "@/lib/backend/temporal";
import { isTextInput, textLimits, textConfigError, textFormats } from "@/lib/backend/text-validation";
import { ParameterControl } from "./ParameterControl";
import SelectOptionsEditor from "./SelectOptionsEditor";
import { fileLimits, fileConfigError } from "@/lib/backend/files";
import ChoiceGroupEditor from "./ChoiceGroupEditor";

export default function ElementProperties({
  element,
}: {
  element: ElementNode;
}) {
  const { customElements, pages, elementsById, updateElement } =
    useEditorStore();
  const custom = customElements[element.definitionId || ""];
  const definition = definitionFor(element);
  const fields: Record<string, PropertyField> =
    element.type === "custom"
      ? Object.fromEntries(
          Object.entries(custom?.props || {}).map(([key, value]) => [
            key,
            { type: value.type, label: key },
          ]),
        )
      : definition?.propsSchema || {};
  const events =
    element.type === "custom" ? custom?.events || [] : definition?.events || [];
  const isEmbed = definition?.generate === "iframe" || element.type === "frame";
  const inputType = String(element.props.type || element.props.inputType || definition?.tag || "");
  const temporalError = isTemporalKind(inputType) ? temporalConfigError(inputType, {
    min: String(element.props.min ?? ""), max: String(element.props.max ?? ""),
    step: String(element.props.step ?? ""), base: String(element.props.value ?? ""),
  }) : "";
  const textInput = element.type !== "custom" && isTextInput(inputType);
  const textError = textInput ? textConfigError(textLimits(element.props)) : "";
  const fileInput = element.type === "native" && inputType === "file";
  const fileError = fileInput ? fileConfigError(fileLimits(element.props)) : "";
  const set = (key: string, value: string | number | boolean) =>
    updateElement(element.id, {
      props: { [key]: value },
      ...(element.type === "button" && key === "href" ? {actions: {type: "none"}} : {}),
      ...(element.type === "button" && key === "variant"
        ? {
            styles:
              value === "outline"
                ? {
                    background: "transparent",
                    backgroundColor: "transparent",
                    border: "1px solid currentColor",
                    color: "#1f2937",
                  }
                : value === "ghost"
                  ? {
                      background: "transparent",
                      backgroundColor: "transparent",
                      border: "none",
                      color: "#1f2937",
                    }
                  : {
                      background: "#3b82f6",
                      backgroundColor: "#3b82f6",
                      color: "#ffffff",
                      border: "none",
                    },
          }
        : {}),
    });
  return (
    <div className="semantic-properties">
      {isEmbed && (
        <fieldset>
          <legend>Embed</legend>
          <label>
            <span>Embed type</span>
            <select
              aria-label="Embed type"
              value={String(element.props.embedType || "url")}
              onChange={(e) => set("embedType", e.target.value)}
            >
              <option value="html">HTML</option>
              <option value="code">Code</option>
              <option value="url">URL</option>
            </select>
          </label>
          <label>
            <span>Title</span>
            <input
              aria-label="Embed title"
              value={String(element.props.title || "")}
              onChange={(e) => set("title", e.target.value)}
            />
          </label>
          {element.props.embedType === "html" ||
          element.props.embedType === "code" ? (
            <label>
              <span>Source</span>
              <textarea
                className="embed-source"
                aria-label="Embed source"
                rows={8}
                spellCheck={false}
                value={String(element.props.source || "")}
                onChange={(e) => set("source", e.target.value)}
              />
            </label>
          ) : (
            <label>
              <span>Source URL</span>
              <input
                aria-label="Embed URL"
                type="url"
                value={String(element.props.src || "")}
                onChange={(e) => set("src", e.target.value)}
              />
            </label>
          )}
          {embedError(element.props) && (
            <p role="alert" className="property-error">
              {embedError(element.props)}
            </p>
          )}
          <p className="panel-caption">
            Preview updates on the canvas. Set width and height in Design. Some
            websites block embedding; use their embed URL.
          </p>
          <label>
            <input
              aria-label="Allow embed scripts"
              type="checkbox"
              checked={Boolean(element.props.allowScripts)}
              onChange={(e) => set("allowScripts", e.target.checked)}
            />
            <span>Allow scripts</span>
          </label>
          <label>
            <input
              aria-label="Allow embed forms"
              type="checkbox"
              checked={Boolean(element.props.allowForms)}
              onChange={(e) => set("allowForms", e.target.checked)}
            />
            <span>Allow forms</span>
          </label>
          <p className="panel-caption">
            Isolated from the editor. Same-origin access, popups and top-level
            navigation stay blocked.
          </p>
        </fieldset>
      )}
      {!isEmbed &&
        ["native", "custom", "button", "input"].includes(element.type) && (
          <fieldset>
            <legend>{custom?.name || definition?.name} properties</legend>
            {Object.entries(fields)
              .filter(
                ([key]) =>
                    (key !== "type" || element.type === "button") &&
                    !(["radioGroup", "checkboxGroup"].includes(definition?.id || "") && ["name", "legend", "required"].includes(key)) &&
                  !(fileInput && ["maxFileKB", "accept"].includes(key)) &&
                  !(element.type === "native" && definition?.tag === "select" && ["options", "optionLabels", "disabledValues", "optionGroups", "disabledGroups", "value", "selectedValues"].includes(key)) &&
                  !(textInput && ["pattern", "minLength", "maxLength"].includes(key)) &&
                  !(element.type === "native" && key === "pattern" && !textInput) &&
                  (element.type === "button"
                    ? !["label"].includes(key)
                    : element.type === "input"
                      ? !["inputType", "required", "placeholder"].includes(key)
                      : true),
              )
              .map(([key, field]) => (
                <label key={key}>
                  <span>{field.label}</span>
                  {field.type === "boolean" ? (
                    <input
                      aria-label={field.label}
                      type="checkbox"
                      checked={Boolean(element.props[key])}
                      onChange={(e) =>
                        updateElement(element.id, {
                          props: { [key]: e.target.checked },
                        })
                      }
                    />
                  ) : field.options ? (
                    <select
                      aria-label={field.label}
                      value={String(element.props[key] ?? "")}
                      onChange={(e) => set(key, e.target.value)}
                    >
                      {field.options.map((option) => (
                        <option key={option}>{option}</option>
                      ))}
                    </select>
                  ) : field.type === "number" ? (
                    <ParameterControl
                      label={field.label}
                      value={Number(element.props[key] ?? 0)}
                      onChange={(value) => set(key, value)}
                    />
                  ) : field.type === "string" &&
                    ["items", "options", "selectedValues", "rows", "content"].includes(key) ? (
                    <textarea
                      aria-label={field.label}
                      rows={3}
                      value={String(element.props[key] ?? "")}
                      onChange={(e) =>
                        updateElement(element.id, {
                          props: { [key]: e.target.value },
                        })
                      }
                    />
                  ) : (
                    <input
                      aria-label={field.label}
                      type={isTemporalKind(inputType) && ["min", "max", "value"].includes(key) ? inputType : "text"}
                      step={isTemporalKind(inputType) && ["min", "max", "value"].includes(key) ? "any" : undefined}
                      value={String(element.props[key] ?? "")}
                      onChange={(e) => set(key, e.target.value)}
                    />
                  )}
                </label>
              ))}
              {element.type === "native" && definition?.tag === "select" && <SelectOptionsEditor key={element.id} element={element}/>}
              {["radioGroup", "checkboxGroup"].includes(definition?.id || "") && <ChoiceGroupEditor key={element.id} element={element}/>}
            {fileInput && <>
              <label><span>Maximum file size (KiB)</span><input aria-label="Maximum file size (KiB)" type="number" min={1} max={256} step={1} value={Number(element.props.maxFileKB ?? 256)} onChange={e=>set("maxFileKB",Number(e.target.value))}/></label>
              <label><span>Allowed file extensions</span><input aria-label="Allowed file extensions" value={String(element.props.accept || "")} placeholder="Any, or .pdf, .png, .txt" onChange={e=>set("accept",e.target.value)}/></label>
              <p className="panel-caption">Guided submissions store one attachment per collection, up to 256 KiB. Turn off Multiple. Extensions restrict filenames; they do not inspect content. Download attachments from a private inbox. Review backend file rules after edits.</p>
              {fileError && <p role="alert" className="property-error">{fileError}</p>}
            </>}
            {textInput && <>
              {(["minLength", "maxLength"] as const).map(key => <label key={key}><span>{key === "minLength" ? "Minimum length" : "Maximum length"}</span>
                <input aria-label={key === "minLength" ? "Minimum length" : "Maximum length"} type="number" min={0} max={10000} step={1} value={String(element.props[key] ?? "")} onChange={e=>set(key,e.target.value === "" ? "" : String(Number(e.target.value)))} placeholder="Unset" />
              </label>)}
              {inputType !== "textarea" && <label><span>Text format</span>
                <select aria-label="Text format" value={String(element.props.pattern || "")} onChange={e=>set("pattern",e.target.value)}>
                  {textFormats.map(format=><option key={format.pattern} value={format.pattern}>{format.label}</option>)}
                  {!textFormats.some(format=>format.pattern===String(element.props.pattern || "")) && <option value={String(element.props.pattern)}>Custom pattern (review required)</option>}
                </select>
              </label>}
              <p className="panel-caption">Some emoji count as two characters. Blank optional fields are allowed. Guided storage copies these settings into backend rules and caps unset maximums at {Math.max(Number(element.props.minLength) || 0,inputType === "email" ? 320 : 2000)} characters. Review connected rules after edits.</p>
              {textError && <p className="property-error" role="alert">{textError}</p>}
            </>}
            {isTemporalKind(inputType) && <p className="panel-caption">Step is in {inputType === "date" ? "days" : "seconds"}. Use any to allow every value. Time limits can cross midnight. Creating a collection copies these limits into its backend rules.</p>}
            {temporalError && <p role="alert" className="property-error">{temporalError}</p>}
            {element.type === "custom" && (
              <p className="panel-caption">
                Source is included in export. It does not run inside this
                editor.
              </p>
            )}
          </fieldset>
        )}
      <fieldset>
        <legend>Accessibility</legend>
        <label>
          <span>Accessible label</span>
          <input
            aria-label="Accessible label"
            value={element.accessibility?.label || ""}
            onChange={(e) =>
              updateElement(element.id, {
                accessibility: {
                  ...element.accessibility,
                  label: e.target.value,
                },
              })
            }
          />
        </label>
      </fieldset>
      {events.length > 0 && (
        <fieldset>
          <legend>Events</legend>
          <p className="panel-caption">
            Navigate or scroll here. Connect API interactions in the Routing
            canvas.
          </p>
          {events.map((event) => (
            <label key={event}>
              <span>{event}</span>
              <select
                aria-label={`${event} action`}
                value={
                  element.events?.[event]
                    ? `${element.events[event].action}:${element.events[event].target}`
                    : ""
                }
                onChange={(e) => {
                  const next = { ...element.events };
                  if (!e.target.value) delete next[event];
                  else {
                    const [action, target] = e.target.value.split(":");
                    next[event] = {
                      action: action as "navigate" | "scroll",
                      target,
                    };
                  }
                  updateElement(element.id, { events: next });
                }}
              >
                <option value="">None</option>
                <optgroup label="Navigate to page">
                  {pages.map((page) => (
                    <option key={page.id} value={`navigate:${page.id}`}>
                      {page.title}
                    </option>
                  ))}
                </optgroup>
                <optgroup label="Scroll to element">
                  {Object.values(elementsById).map((node) => (
                    <option key={node.id} value={`scroll:${node.id}`}>
                      {node.label || node.type} ({node.id})
                    </option>
                  ))}
                </optgroup>
              </select>
            </label>
          ))}
        </fieldset>
      )}
    </div>
  );
}
