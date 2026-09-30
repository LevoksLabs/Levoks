"use client";
import type { ElementNode } from "@/types";
import { definitionFor, type PropertyField } from "@/lib/elements/registry";
import { useEditorStore } from "@/store/editorStore";
import { embedError } from "@/lib/elements/embed";
import { ParameterControl } from "./ParameterControl";

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
  const set = (key: string, value: string | number | boolean) =>
    updateElement(element.id, {
      props: { [key]: value },
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
                    ["items", "options", "rows", "content"].includes(key) ? (
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
                      type="text"
                      value={String(element.props[key] ?? "")}
                      onChange={(e) => set(key, e.target.value)}
                    />
                  )}
                </label>
              ))}
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
