"use client";
import { useRef, useState } from "react";
import { useEditorStore } from "@/store/editorStore";
import type { ElementNode } from "@/types";
import {
  richDocument,
  richDocumentSchema,
  formatSpans,
  replaceRichText,
  timelineEvents,
  timelineSchema,
} from "@/lib/elements/rich-content";
import { projectHistory } from "@/store/projectHistory";

export default function RichContentEditor({
  element,
}: {
  element: ElementNode;
}) {
  const selection = useRef({ index: 0, start: 0, end: 0 });
  const [error, setError] = useState("");
  const [url, setUrl] = useState("");
  const rich = element.definitionId === "richText";
  const blocks = rich ? richDocument(element.props) : [];
  const events = rich ? [] : timelineEvents(element.props);
  const save = (value: unknown) => {
    try {
      const parsed = (rich ? richDocumentSchema : timelineSchema).parse(value);
      useEditorStore
        .getState()
        .updateElement(element.id, {
          props: {
            [rich ? "richDocument" : "timelineEvents"]: JSON.stringify(parsed),
          },
        });
      setError("");
    } catch {
      setError(
        "Keep content within 200 blocks/events. Links must be an HTTP address, page path or section link.",
      );
    }
  };
  const reorder = (index: number, delta: number) => {
    const next = rich ? [...blocks] : [...events];
    [next[index], next[index + delta]] = [next[index + delta], next[index]];
    save(next);
  };
  return (
    <fieldset>
      <legend>{rich ? "Formatted content" : "Timeline events"}</legend>
      {rich && (
        <>
          <p>Select text, then apply formatting.</p>
          <div className="design-button-row">
            {(["bold", "italic", "underline"] as const).map((mark) => (
              <button
                key={mark}
                onClick={() => {
                  const { index, start, end } = selection.current;
                  if (end <= start) {
                    setError("Select text to format.");
                    return;
                  }
                  save(
                    blocks.map((block, i) =>
                      i === index
                        ? {
                            ...block,
                            spans: formatSpans(block.spans, start, end, {
                              [mark]: true,
                            }),
                          }
                        : block,
                    ),
                  );
                }}
              >
                {mark}
              </button>
            ))}
            <button
              onClick={() => {
                const { index, start, end } = selection.current;
                save(
                  blocks.map((block, i) =>
                    i === index
                      ? {
                          ...block,
                          spans: formatSpans(block.spans, start, end, {
                            bold: false,
                            italic: false,
                            underline: false,
                            href: undefined,
                          }),
                        }
                      : block,
                  ),
                );
              }}
            >
              Clear formatting
            </button>
          </div>
          <label>
            Link URL
            <input
              aria-label="Rich text link URL"
              value={url}
              onChange={(e) => setUrl(e.target.value)}
            />
          </label>
          <button
            onClick={() => {
              const { index, start, end } = selection.current;
              if (end <= start) {
                setError("Select link text first.");
                return;
              }
              save(
                blocks.map((block, i) =>
                  i === index
                    ? {
                        ...block,
                        spans: formatSpans(block.spans, start, end, {
                          href: url,
                        }),
                      }
                    : block,
                ),
              );
            }}
          >
            Apply link
          </button>
        </>
      )}
      {(rich ? blocks : events).map((_, index) => (
        <div key={index} className="rich-block-editor">
          <strong>
            {rich ? "Block" : "Event"} {index + 1}
          </strong>
          {rich ? (
            <>
              <select
                aria-label={`Block ${index + 1} type`}
                value={blocks[index].kind}
                onChange={(e) =>
                  save(
                    blocks.map((b, i) =>
                      i === index ? { ...b, kind: e.target.value } : b,
                    ),
                  )
                }
              >
                {["p", "h2", "h3", "li", "blockquote"].map((kind) => (
                  <option key={kind} value={kind}>
                    {
                      {
                        p: "Paragraph",
                        h2: "Heading 2",
                        h3: "Heading 3",
                        li: "List item",
                        blockquote: "Quote",
                      }[kind]
                    }
                  </option>
                ))}
              </select>
              <textarea
                aria-label={`Block ${index + 1} text`}
                value={blocks[index].spans.map((s) => s.text).join("")}
                onFocus={() => projectHistory.begin()}
                onBlur={() => projectHistory.end()}
                onSelect={(e) => {
                  const input = e.currentTarget;
                  selection.current = {
                    index,
                    start: input.selectionStart,
                    end: input.selectionEnd,
                  };
                }}
                onChange={(e) =>
                  save(
                    blocks.map((b, i) =>
                      i === index
                        ? {
                            ...b,
                            spans: replaceRichText(b.spans, e.target.value),
                          }
                        : b,
                    ),
                  )
                }
              />
            </>
          ) : (
            <>
              {(["title", "date", "description"] as const).map((key) => (
                <label key={key}>
                  {key}
                  <input
                    aria-label={`Event ${index + 1} ${key}`}
                    value={events[index][key]}
                    onFocus={() => projectHistory.begin()}
                    onBlur={() => projectHistory.end()}
                    onChange={(e) =>
                      save(
                        events.map((event, i) =>
                          i === index
                            ? { ...event, [key]: e.target.value }
                            : event,
                        ),
                      )
                    }
                  />
                </label>
              ))}
            </>
          )}
          <div className="design-button-row">
            <button disabled={!index} onClick={() => reorder(index, -1)}>
              Move {index + 1} up
            </button>
            <button
              disabled={index === (rich ? blocks.length : events.length) - 1}
              onClick={() => reorder(index, 1)}
            >
              Move {index + 1} down
            </button>
            <button
              disabled={(rich ? blocks.length : events.length) <= 1}
              onClick={() =>
                save((rich ? blocks : events).filter((_, i) => i !== index))
              }
            >
              Remove {index + 1}
            </button>
          </div>
        </div>
      ))}
      <button
        disabled={(rich ? blocks.length : events.length) >= 200}
        onClick={() =>
          save(
            rich
              ? [...blocks, { kind: "p", spans: [{ text: "New paragraph" }] }]
              : [...events, { title: "New event", date: "", description: "" }],
          )
        }
      >
        {rich ? "Add text block" : "Add timeline event"}
      </button>
      {error && <p role="alert">{error}</p>}
    </fieldset>
  );
}
