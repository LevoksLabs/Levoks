"use client";
import type {
  AuditLogConfig,
  ErrorHandlerConfig,
  ServiceContainer,
} from "@/types/backend";
export function AuditInspector({
  config,
  service,
  onChange,
}: {
  config: AuditLogConfig;
  service: ServiceContainer;
  onChange: (value: Partial<AuditLogConfig>) => void;
}) {
  return (
    <section className="bi-section-body" aria-label="Audit log configuration">
      <label className="bi-field">
        Audit event name
        <input
          className="bi-input"
          value={config.event}
          onChange={(e) => onChange({ event: e.target.value })}
        />
      </label>
      <label className="bi-field">
        Retention (days)
        <input
          className="bi-input"
          type="number"
          min={1}
          max={3650}
          value={config.retentionDays}
          onChange={(e) => onChange({ retentionDays: Number(e.target.value) })}
        />
      </label>
      {(
        [
          "includeReads",
          "recordActor",
          "recordTenant",
          "failClosed",
          "transactionEvents",
        ] as const
      ).map((key) => (
        <label className="bi-checkbox-label" key={key}>
          <input
            type="checkbox"
            checked={config[key]}
            onChange={(e) => onChange({ [key]: e.target.checked })}
          />
          {
            {
              includeReads: "Include read requests",
              recordActor: "Record authenticated actor ID",
              recordTenant: "Record tenant ID",
              failClosed: "Reject requests when the audit store is unavailable",
              transactionEvents:
                "Record committed workflow transactions atomically",
            }[key]
          }
        </label>
      ))}
      <fieldset>
        <legend>Endpoint scope (none selected means all)</legend>
        {service.blocks
          .filter((b) => b.type === "rest_endpoint")
          .map((b) => (
            <label className="bi-checkbox-label" key={b.id}>
              <input
                type="checkbox"
                checked={config.endpointIds.includes(b.id)}
                onChange={(e) =>
                  onChange({
                    endpointIds: e.target.checked
                      ? [...config.endpointIds, b.id]
                      : config.endpointIds.filter((id) => id !== b.id),
                  })
                }
              />
              {b.label}
            </label>
          ))}
      </fieldset>
      <p className="bi-hint">
        Records are stored in this service&apos;s MongoDB database with expiry
        dates. Only endpoint identity, method, outcome, duration, correlation ID
        and selected actor/tenant IDs are retained. Request bodies, query
        strings, headers and secrets are excluded.
      </p>
    </section>
  );
}
export function ErrorInspector({
  config,
  onChange,
}: {
  config: ErrorHandlerConfig;
  onChange: (value: Partial<ErrorHandlerConfig>) => void;
}) {
  const kinds = [
    "validation",
    "conflict",
    "not_found",
    "forbidden",
    "unauthorized",
    "unavailable",
    "internal",
  ] as const;
  return (
    <section
      className="bi-section-body"
      aria-label="Error handler configuration"
    >
      <label className="bi-field">
        Default client message
        <input
          className="bi-input"
          value={config.fallbackMessage}
          onChange={(e) => onChange({ fallbackMessage: e.target.value })}
        />
      </label>
      <label className="bi-checkbox-label">
        <input
          type="checkbox"
          checked={config.logErrors}
          onChange={(e) => onChange({ logErrors: e.target.checked })}
        />
        Log classified error metadata
      </label>
      {config.rules.map((rule, i) => (
        <fieldset key={i}>
          <legend>Error response {i + 1}</legend>
          <label>
            Classification
            <select
              className="bi-select"
              value={rule.kind}
              onChange={(e) =>
                onChange({
                  rules: config.rules.map((r, n) =>
                    n === i
                      ? { ...r, kind: e.target.value as typeof rule.kind }
                      : r,
                  ),
                })
              }
            >
              {kinds.map((k) => (
                <option key={k}>{k}</option>
              ))}
            </select>
          </label>
          <label>
            HTTP status
            <input
              className="bi-input"
              type="number"
              min={400}
              max={599}
              value={rule.status}
              onChange={(e) =>
                onChange({
                  rules: config.rules.map((r, n) =>
                    n === i ? { ...r, status: Number(e.target.value) } : r,
                  ),
                })
              }
            />
          </label>
          <label>
            Client message
            <input
              className="bi-input"
              value={rule.message}
              onChange={(e) =>
                onChange({
                  rules: config.rules.map((r, n) =>
                    n === i ? { ...r, message: e.target.value } : r,
                  ),
                })
              }
            />
          </label>
          <button
            onClick={() =>
              onChange({ rules: config.rules.filter((_, n) => n !== i) })
            }
          >
            Remove error rule
          </button>
        </fieldset>
      ))}
      <button
        disabled={config.rules.length >= 7}
        onClick={() => {
          const kind = kinds.find(
            (k) => !config.rules.some((r) => r.kind === k),
          );
          if (kind)
            onChange({
              rules: [
                ...config.rules,
                {
                  kind,
                  status: kind === "internal" ? 500 : 400,
                  message: config.fallbackMessage,
                },
              ],
            });
        }}
      >
        Add error rule
      </button>
      <p className="bi-hint">
        Messages are explicitly configured; raw exceptions and stacks are never
        returned. Every response includes a server-generated correlation ID.
      </p>
    </section>
  );
}
