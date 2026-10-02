"use client";
import { useEditorStore } from "@/store/editorStore";
import { useBackendStore } from "@/store/backendStore";
import { useRoutingStore } from "@/store/routingStore";
import {
  endpointFields,
  fieldIdentity,
  formOwner,
  isFormInput,
  isSubmitControl,
  type RequestMapping,
} from "@/lib/contracts";
import type { RoutingConnection } from "@/types/routing";
import type { EndpointConfig } from "@/types/backend";

export function ConnectionContract({
  connection,
}: {
  connection: RoutingConnection;
}) {
  const editor = useEditorStore();
  const { nodes, updateConnection } = useRoutingStore();
  const { services } = useBackendStore();
  const destination = nodes.find((node) => node.id === connection.toNodeId);
  const source = nodes.find((node) => node.id === connection.fromNodeId);
  const endpoint = services
    .find((service) => service.id === destination?.refId)
    ?.blocks.find(
      (block) => block.id === connection.toPortId.split(":").at(-1),
    );
  if (endpoint?.type !== "rest_endpoint") return null;
  const config = endpoint.config as EndpointConfig;
  const elements = Object.values(editor.elementsById);
  const trigger = elements.find(
    (el) => el.id === connection.fromPortId.split(":").at(-1),
  );
  const form =
    trigger && isSubmitControl(trigger)
      ? formOwner(trigger, elements)
      : trigger;
  const inputs = elements.filter(
    (el) => isFormInput(el) && formOwner(el, elements)?.id === form?.id,
  );
  const previous = services
    .find((service) => service.id === source?.refId)
    ?.blocks.find(
      (block) => block.id === connection.fromPortId.split(":").at(-1),
    );
  const responses =
    previous?.type === "rest_endpoint"
      ? (previous.config as EndpointConfig).responseBody
      : [];
  const update = (
    fieldId: string,
    location: RequestMapping["location"],
    value?: RequestMapping["source"],
  ) =>
    updateConnection(connection.id, {
      requestMappings: [
        ...(connection.requestMappings || []).filter(
          (item) => item.fieldId !== fieldId || item.location !== location,
        ),
        ...(value ? [{ fieldId, location, source: value }] : []),
      ],
    });
  return (
    <div className="routing-rp-field" style={{ display: "grid", gap: 10 }}>
      <strong>
        {config.method} {config.route}
      </strong>
      <label>
        Request mapping
        <select
          aria-label="Request mapping mode"
          value={connection.requestMappings ? "explicit" : "legacy"}
          onChange={(event) =>
            updateConnection(connection.id, {
              requestMappings:
                event.target.value === "explicit" ? [] : undefined,
            })
          }
        >
          <option value="legacy">Match input names (legacy)</option>
          <option value="explicit">Map fields by identity</option>
        </select>
      </label>
      {connection.requestMappings &&
        endpointFields(config).map((field) => {
          const fieldId = fieldIdentity(field);
          const mapping = connection.requestMappings?.find(
            (item) =>
              item.fieldId === fieldId && item.location === field.location,
          );
          const value =
            mapping?.source.kind === "element"
              ? `element:${mapping.source.elementId}`
              : mapping?.source.kind === "response"
                ? `response:${mapping.source.fieldId}`
                : mapping
                  ? "literal"
                  : "";
          return (
            <label key={`${field.location}:${fieldId}`}>
              {field.location}.{field.name}
              {field.required ? " *" : ""}
              <select
                aria-label={`Source for ${field.location}.${field.name}`}
                value={value}
                onChange={(event) => {
                  const [kind, id] = event.target.value.split(":");
                  update(
                    fieldId,
                    field.location,
                    kind === "element"
                      ? { kind, elementId: id }
                      : kind === "response"
                        ? { kind, fieldId: id }
                        : kind === "literal"
                          ? { kind, value: "" }
                          : undefined,
                  );
                }}
              >
                <option value="">Choose source</option>
                {inputs.map((el) => (
                  <option key={el.id} value={`element:${el.id}`}>
                    {el.label || "Input"} · {el.props.name || el.props.placeholder || el.id}
                  </option>
                ))}
                {responses.map((field) => (
                  <option
                    key={fieldIdentity(field)}
                    value={`response:${fieldIdentity(field)}`}
                  >
                    Previous response: {field.name}
                  </option>
                ))}
                <option value="literal">Constant</option>
              </select>
              {mapping?.source.kind === "literal" && (
                <input
                  aria-label={`Constant for ${field.name}`}
                  value={String(mapping.source.value ?? "")}
                  onChange={(event) =>
                    update(fieldId, field.location, {
                      kind: "literal",
                      value: event.target.value,
                    })
                  }
                />
              )}
            </label>
          );
        })}
      {config.responseBody.map((field) => (
        <label key={fieldIdentity(field)}>
          Display response: {field.name}
          <select
            aria-label={`Display ${field.name}`}
            value={
              connection.responseMappings?.find(
                (item) => item.fieldId === fieldIdentity(field),
              )?.elementId || ""
            }
            onChange={(event) =>
              updateConnection(connection.id, {
                responseMappings: [
                  ...(connection.responseMappings || []).filter(
                    (item) => item.fieldId !== fieldIdentity(field),
                  ),
                  ...(event.target.value
                    ? [
                        {
                          fieldId: fieldIdentity(field),
                          elementId: event.target.value,
                        },
                      ]
                    : []),
                ],
              })
            }
          >
            <option value="">No display binding</option>
            {elements
              .filter((el) => ["text", "title", "paragraph"].includes(el.type))
              .map((el) => (
                <option key={el.id} value={el.id}>
                  {el.label || "Text"} · {el.props.content || el.id}
                </option>
              ))}
          </select>
        </label>
      ))}
      <label>
        Failure message
        <input
          aria-label="Failure message"
          placeholder="Use backend error"
          value={connection.failure?.message || ""}
          onChange={(event) =>
            updateConnection(connection.id, {
              failure: { ...connection.failure, message: event.target.value },
            })
          }
        />
      </label>
      <label>
        On failure
        <select
          aria-label="Failure navigation"
          value={connection.failure?.pageId || ""}
          onChange={(event) =>
            updateConnection(connection.id, {
              failure: {
                ...connection.failure,
                pageId: event.target.value || undefined,
              },
            })
          }
        >
          <option value="">Stay and show error</option>
          {editor.pages.map((page) => (
            <option key={page.id} value={page.id}>
              {page.title}
            </option>
          ))}
        </select>
      </label>
      <small>
        Successful requests continue along the endpoint output connection.
        Submission errors never follow the success route.
      </small>
    </div>
  );
}
