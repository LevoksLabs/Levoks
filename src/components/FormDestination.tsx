"use client";
import { useState } from "react";
import type { ElementNode } from "@/types";
import { useEditorStore } from "@/store/editorStore";
import { useBackendStore } from "@/store/backendStore";
import { useRoutingStore } from "@/store/routingStore";
import { projectHistory } from "@/store/projectHistory";
import {
  endpointFields,
  fieldIdentity,
  isFormInput,
  type RequestMapping,
} from "@/lib/contracts";
import {
  connectFormDestination,
  createSubmissionDestination,
  formControls,
  submissionFields,
  suggestedFormMappings,
} from "@/lib/form-destination";

export default function FormDestination({ form }: { form: ElementNode }) {
  const connections = useRoutingStore((state) => state.connections);
  const connected = connections.find((connection) =>
    connection.fromPortId.endsWith(`:out:${form.id}`),
  );
  return <FormDestinationSettings key={connected?.id || form.id} form={form} />;
}

function FormDestinationSettings({ form }: { form: ElementNode }) {
  const services = useBackendStore((state) => state.services),
    connections = useRoutingStore((state) => state.connections),
    nodes = useRoutingStore((state) => state.nodes);
  const elements = useEditorStore((state) => state.elementsById);
  const connected = connections.find((connection) =>
    connection.fromPortId.endsWith(`:out:${form.id}`),
  );
  const connectedService = nodes.find(
    (node) => node.id === connected?.toNodeId,
  )?.refId;
  const endpoints = services.flatMap((service) =>
    service.blocks
      .filter(
        (block) =>
          block.type === "rest_endpoint" &&
          "method" in block.config &&
          ["POST", "PUT", "PATCH"].includes(block.config.method),
      )
      .map((block) => ({ service, block, key: `${service.id}/${block.id}` })),
  );
  const initial = endpoints.find(
    (item) =>
      item.service.id === connectedService &&
      connected?.toPortId.endsWith(`:in:${item.block.id}`),
  );
  const [destination, setDestination] = useState(initial?.key || "new"),
    [name, setName] = useState("Form submissions"),
    [message, setMessage] = useState(""),
    [errorMessage, setErrorMessage] = useState("");
  const [mappings, setMappings] = useState<RequestMapping[]>(
    connected?.requestMappings ||
      (initial && "requestBody" in initial.block.config
        ? suggestedFormMappings(form.id, elements, initial.block.config)
        : []),
  );
  const selected = endpoints.find((item) => item.key === destination),
    config =
      selected && "requestBody" in selected.block.config
        ? selected.block.config
        : undefined;
  const fields = config ? endpointFields(config) : [];
  const inputs = formControls(form.id, elements).filter(
    (node) => isFormInput(node) && !node.props.disabled,
  );
  const analysis = submissionFields(form.id, elements);
  const missing = fields.filter(
    (field) =>
      field.required &&
      !mappings.some(
        (mapping) =>
          mapping.location === field.location &&
          mapping.fieldId === fieldIdentity(field),
      ),
  );
  const choose = (value: string) => {
    setDestination(value);
    setMessage("");
    setErrorMessage("");
    const item = endpoints.find((endpoint) => endpoint.key === value);
    setMappings(
      item && "requestBody" in item.block.config
        ? suggestedFormMappings(form.id, elements, item.block.config)
        : [],
    );
  };
  return (
    <div className="form-destination">
      <label className="form-destination-field">
        Save submissions to
        <select
          value={destination}
          onChange={(event) => choose(event.target.value)}
          aria-label="Form destination"
        >
          <option value="new">New submission collection</option>
          {endpoints.map((item) => (
            <option key={item.key} value={item.key}>
              {item.service.name} · {item.block.label}
            </option>
          ))}
        </select>
      </label>
      {destination === "new" ? (
        <>
          <label className="form-destination-field">
            Collection name
            <input
              value={name}
              maxLength={80}
              onChange={(event) => setName(event.target.value)}
            />
          </label>
          <p className="panel-caption">
            Creates a database model and a public submit endpoint. Records stay
            private until you add an authenticated read workflow. Allows 20
            requests per 15 minutes per IP seen by the backend. Visitors behind
            one gateway share this limit; it resets when the service restarts.
          </p>
          <ul className="form-destination-fields">
            {analysis.fields.map(({ input, field }) => (
              <li key={input.id}>
                {input.label || input.props.name || "Input"} → {field.name}{" "}
                <small>
                  {field.type}
                  {field.required ? " · required" : ""}
                </small>
              </li>
            ))}
          </ul>
          {analysis.problems.map((problem) => (
            <p role="alert" key={problem}>
              {problem}
            </p>
          ))}
        </>
      ) : config ? (
        <>
          <p className="panel-caption">
            Match endpoint values to your form inputs. Required values must be
            mapped. For constants or chained responses, use Routes.
          </p>
          {fields.map((field) => {
            const mapping = mappings.find(
              (item) =>
                item.location === field.location &&
                item.fieldId === fieldIdentity(field),
            );
            return (
              <label
                className="form-destination-field"
                key={`${field.location}:${fieldIdentity(field)}`}
              >
                {field.location}.{field.name}
                {field.required ? " (required)" : ""}
                <select
                  aria-label={`Form value for ${field.location}.${field.name}`}
                  value={
                    mapping?.source.kind === "element"
                      ? mapping.source.elementId
                      : ""
                  }
                  onChange={(event) =>
                    setMappings([
                      ...mappings.filter(
                        (item) =>
                          !(
                            item.location === field.location &&
                            item.fieldId === fieldIdentity(field)
                          ),
                      ),
                      ...(event.target.value
                        ? [
                            {
                              location: field.location,
                              fieldId: fieldIdentity(field),
                              source: {
                                kind: "element" as const,
                                elementId: event.target.value,
                              },
                            },
                          ]
                        : []),
                    ])
                  }
                >
                  <option value="">
                    {mapping && mapping.source.kind !== "element"
                      ? "Configured in Routes"
                      : "Choose an input"}
                  </option>
                  {inputs.map((input) => (
                    <option
                      key={input.id}
                      value={input.id}
                      disabled={["object", "array"].includes(field.type)}
                    >
                      {input.label || input.props.name || input.id}
                    </option>
                  ))}
                </select>
                {["object", "array"].includes(field.type) && (
                  <small>Configure structured values in Routes.</small>
                )}
              </label>
            );
          })}
          {missing.length > 0 && (
            <p role="alert">
              Choose values for {missing.map((field) => field.name).join(", ")}.
            </p>
          )}
          {config.authRequired && (
            <p className="panel-caption">
              Visitors must sign in before submitting to this endpoint. Its
              existing authentication and access policies apply.
            </p>
          )}
        </>
      ) : (
        <p role="alert">
          This endpoint is no longer available. Choose another destination.
        </p>
      )}
      <label className="form-destination-field">
        Success message
        <input
          maxLength={500}
          value={String(form.props.successMessage || "")}
          placeholder="Done"
          onChange={(event) =>
            useEditorStore.getState().updateElement(form.id, {
              props: { successMessage: event.target.value },
            })
          }
        />
      </label>
      <label>
        <input
          type="checkbox"
          checked={Boolean(form.props.resetOnSuccess)}
          onChange={(event) =>
            useEditorStore.getState().updateElement(form.id, {
              props: { resetOnSuccess: event.target.checked },
            })
          }
        />{" "}
        Clear fields after a successful save
      </label>
      {connected && (
        <p className="panel-caption">
          Applying a destination replaces this form&apos;s current route
          connections. Undo restores them.
        </p>
      )}
      {connected && initial && (
        <p role="status">
          Connected to {initial.service.name} · {initial.block.label}. Test real
          saves in the downloaded application.
        </p>
      )}
      <button
        type="button"
        className="insp-form-add-btn"
        disabled={
          destination === "new"
            ? !name.trim() || analysis.problems.length > 0
            : !config || missing.length > 0
        }
        onClick={() => {
          setErrorMessage("");
          try {
            if (destination === "new") {
              const result = createSubmissionDestination(form.id, name);
              setDestination(`${result.serviceId}/${result.endpointId}`);
            } else if (selected)
              connectFormDestination(
                form.id,
                selected.service.id,
                selected.block.id,
                mappings,
              );
            setMessage(
              "Form connected. Save the project, then download and run the application to test real submissions.",
            );
          } catch (error) {
            setErrorMessage(
              error instanceof Error
                ? error.message
                : "The form could not be connected.",
            );
          }
        }}
      >
        {destination === "new"
          ? "Create collection and connect"
          : "Apply form destination"}
      </button>
      {connected && (
        <button
          type="button"
          onClick={() => {
            projectHistory.run("editor", () =>
              useRoutingStore.setState({
                connections: useRoutingStore
                  .getState()
                  .connections.filter(
                    (connection) =>
                      !connection.fromPortId.endsWith(`:out:${form.id}`),
                  ),
              }),
            );
            setMessage(
              "Form disconnected. Stored records and backend blocks are retained.",
            );
          }}
        >
          Disconnect form
        </button>
      )}
      {message && <p role="status">{message}</p>}
      {errorMessage && <p role="alert">{errorMessage}</p>}
    </div>
  );
}
