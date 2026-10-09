"use client";
import type { ElementNode } from "@/types";
import { useEditorStore } from "@/store/editorStore";
import { useBackendStore } from "@/store/backendStore";
import { projectHistory } from "@/store/projectHistory";
import { fieldIdentity } from "@/lib/contracts";
import {
  dataOwner,
  isDataContainer,
  isDataText,
  listEndpoint,
  resolveDataSource,
} from "@/lib/live-data";

export default function DataBinding({ element }: { element: ElementNode }) {
  const services = useBackendStore((s) => s.services),
    elements = useEditorStore((s) => s.elementsById),
    update = useEditorStore((s) => s.updateElement);
  if (!isDataContainer(element) && !isDataText(element)) return null;
  const owner = dataOwner(element, elements);
  if (!isDataContainer(element) && !owner && !element.dataField) return null;
  let fields: ReturnType<typeof listEndpoint>["fields"] = [],
    error =
      !owner && element.dataField
        ? "This field has no live record source. Choose Static text or move it into a live template."
        : "";
  const source = element.dataSource || owner?.dataSource;
  if (source) {
    try {
      fields = listEndpoint(
        services,
        source.serviceId,
        source.endpointId,
      ).fields;
      if (element.dataSource) resolveDataSource(element, services);
    } catch (e) {
      error = e instanceof Error ? e.message : "Choose another source.";
    }
  }
  const setSource = (key: string) => {
    const [serviceId, endpointId] = key.split("/");
    const next = key
      ? listEndpoint(services, serviceId, endpointId)
      : undefined;
    const children = Object.values(elements).filter(
      (node) => node.dataField && dataOwner(node, elements)?.id === element.id,
    );
    projectHistory.run("Change live data source", () => {
      for (const node of children) update(node.id, { dataField: undefined });
      update(element.id, {
        dataSource: next
          ? {
              serviceId,
              endpointId,
              columns:
                element.definitionId === "table"
                  ? next.fields.slice(0, 8).map((f) => ({
                      fieldId: fieldIdentity(f),
                      label: f.name,
                    }))
                  : [],
              emptyMessage: "No records on this page.",
            }
          : undefined,
      });
    });
  };
  if (!isDataContainer(element))
    return (
      <fieldset className="semantic-properties live-data-inspector">
        <legend>Record content</legend>
        <label>
          <span>Record field</span>
          <select
            aria-label="Record field"
            value={element.dataField || ""}
            onChange={(e) =>
              update(element.id, { dataField: e.target.value || undefined })
            }
          >
            <option value="">Static text</option>
            {element.dataField &&
              !fields.some((f) => fieldIdentity(f) === element.dataField) && (
                <option value={element.dataField}>Unavailable field</option>
              )}
            {fields.map((f) => (
              <option key={fieldIdentity(f)} value={fieldIdentity(f)}>
                {f.name}
              </option>
            ))}
          </select>
        </label>
        <p>
          The field replaces this text for each record. Canvas text is the
          design sample.
        </p>
        {error && <p role="alert">{error}</p>}
      </fieldset>
    );
  const endpoints = services.flatMap((service) =>
    service.blocks
      .filter(
        (b) =>
          b.type === "rest_endpoint" &&
          "method" in b.config &&
          b.config.method === "GET",
      )
      .map((endpoint) => {
        let reason = "";
        try {
          listEndpoint(services, service.id, endpoint.id);
        } catch (e) {
          reason = e instanceof Error ? e.message : "Unsupported list";
        }
        return {
          key: `${service.id}/${endpoint.id}`,
          label: `${service.name} · ${endpoint.label}`,
          reason,
        };
      }),
  );
  const key = source ? `${source.serviceId}/${source.endpointId}` : "";
  const patch = (value: Partial<NonNullable<ElementNode["dataSource"]>>) =>
    update(element.id, { dataSource: { ...element.dataSource!, ...value } });
  return (
    <fieldset className="semantic-properties live-data-inspector">
      <legend>Live records</legend>
      <label>
        <span>Record source</span>
        <select
          aria-label="Record source"
          value={key}
          onChange={(e) => setSource(e.target.value)}
        >
          <option value="">Static sample</option>
          {key && !endpoints.some((e) => e.key === key) && (
            <option value={key}>Unavailable endpoint</option>
          )}
          {endpoints.map((e) => (
            <option
              key={e.key}
              value={e.key}
              disabled={!!e.reason}
              title={e.reason}
            >
              {e.label}
              {e.reason ? " (incompatible)" : ""}
            </option>
          ))}
        </select>
      </label>
      <p>
        Read records through an existing list endpoint. Its sign-in and access
        rules still apply. Live data runs in Local full-stack preview or your
        exported application.
      </p>
      {!endpoints.some((e) => !e.reason) && (
        <p>
          Add a GET list endpoint to a database model, or connect Find records
          and its response. This control never opens private access.
        </p>
      )}
      {error && <p role="alert">{error}</p>}
      {element.dataSource && (
        <>
          <label>
            <span>Empty message</span>
            <input
              aria-label="Empty records message"
              maxLength={500}
              value={source?.emptyMessage || ""}
              onChange={(e) => patch({ emptyMessage: e.target.value })}
            />
          </label>
          {element.definitionId === "table" ? (
            <div>
              <p>Choose columns, then edit their headings and order.</p>
              {fields.map((f) => {
                const id = fieldIdentity(f),
                  index = source!.columns.findIndex((c) => c.fieldId === id),
                  column = source!.columns[index];
                return (
                  <label key={id}>
                    <span>{f.name}</span>
                    <input
                      type="checkbox"
                      aria-label={`Show ${f.name} column`}
                      checked={!!column}
                      disabled={!column && source!.columns.length >= 32}
                      onChange={(e) =>
                        patch({
                          columns: e.target.checked
                            ? [
                                ...source!.columns,
                                { fieldId: id, label: f.name },
                              ]
                            : source!.columns.filter((c) => c.fieldId !== id),
                        })
                      }
                    />
                  </label>
                );
              })}
              {source?.columns.map((column, index) => (
                <div className="live-data-column" key={column.fieldId}>
                  <label>
                    <span>Column {index + 1} heading</span>
                    <input
                      aria-label={`Column ${index + 1} heading`}
                      maxLength={120}
                      value={column.label}
                      onChange={(e) =>
                        patch({
                          columns: source.columns.map((c, i) =>
                            i === index ? { ...c, label: e.target.value } : c,
                          ),
                        })
                      }
                    />
                  </label>
                  <button
                    type="button"
                    aria-label={`Move column ${index + 1} earlier`}
                    disabled={index === 0}
                    onClick={() => {
                      const columns = [...source.columns];
                      [columns[index - 1], columns[index]] = [
                        columns[index],
                        columns[index - 1],
                      ];
                      patch({ columns });
                    }}
                  >
                    ↑
                  </button>
                  <button
                    type="button"
                    aria-label={`Move column ${index + 1} later`}
                    disabled={index === source.columns.length - 1}
                    onClick={() => {
                      const columns = [...source.columns];
                      [columns[index], columns[index + 1]] = [
                        columns[index + 1],
                        columns[index],
                      ];
                      patch({ columns });
                    }}
                  >
                    ↓
                  </button>
                  <button
                    type="button"
                    aria-label={`Remove column ${index + 1}`}
                    onClick={() =>
                      patch({
                        columns: source.columns.filter((_, i) => i !== index),
                      })
                    }
                  >
                    ×
                  </button>
                </div>
              ))}
            </div>
          ) : (
            <p>
              Add display elements to the record template, then select a text
              element and choose its Record field.
            </p>
          )}
          <button type="button" onClick={() => setSource("")}>
            Disconnect live records
          </button>
        </>
      )}
    </fieldset>
  );
}
