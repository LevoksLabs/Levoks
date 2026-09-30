"use client";
import type { ElementNode } from "@/types";
import { definitionFor, type PropertyField } from "@/lib/elements/registry";
import { useEditorStore } from "@/store/editorStore";

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
  return (
    <div className="semantic-properties">
      {(element.type === "native" || element.type === "custom") && (
        <fieldset>
          <legend>{custom?.name || definition?.name} properties</legend>
          {Object.entries(fields)
            .filter(([key]) => key !== "type")
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
                    type={field.type === "number" ? "number" : "text"}
                    value={String(element.props[key] ?? "")}
                    onChange={(e) => {
                      if (field.type !== "number" || e.target.value !== "")
                        updateElement(element.id, {
                          props: {
                            [key]:
                              field.type === "number"
                                ? Number(e.target.value)
                                : e.target.value,
                          },
                        });
                    }}
                  />
                )}
              </label>
            ))}
          {element.type === "custom" && (
            <p className="panel-caption">
              Source is included in export. It does not run inside this editor.
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
