"use client";

import React, { useState } from "react";
import ProgramInspector from "./ProgramInspector";
import HealthInspector from "./HealthInspector";
import { AuditInspector, ErrorInspector } from "./ObservabilityInspector";
import { useBackendStore } from "@/store/backendStore";
import {
  EndpointConfig,
  HealthConfig,
  AuditLogConfig,
  ErrorHandlerConfig,
  DbModelConfig,
  MiddlewareConfig,
  AuthConfig,
  ValidationConfig,
  EnvVarConfig,
  SchemaField,
  SERVICE_COLORS,
} from "@/types/backend";
import {
  Settings,
  Globe,
  Database,
  Shield,
  GitBranch,
  Repeat,
  AlertTriangle,
  CheckCircle,
  Link2,
  ChevronDown,
  ChevronRight,
  Plus,
  Trash2,
  X,
} from "lucide-react";

// ─── Collapsible Section ───

const Section: React.FC<{
  title: string;
  icon?: React.ReactNode;
  defaultOpen?: boolean;
  children: React.ReactNode;
}> = ({ title, icon, defaultOpen = true, children }) => {
  const [open, setOpen] = useState(defaultOpen);
  return (
    <div className="bi-section">
      <button className="bi-section-header" onClick={() => setOpen(!open)}>
        {open ? <ChevronDown size={12} /> : <ChevronRight size={12} />}
        {icon}
        <span>{title}</span>
      </button>
      {open && <div className="bi-section-body">{children}</div>}
    </div>
  );
};

// ─── Field Row ───
const FieldRow: React.FC<{ label: string; children: React.ReactNode }> = ({
  label,
  children,
}) => (
  <div className="bi-field">
    <label className="bi-label">{label}</label>
    <div className="bi-input-wrap">{children}</div>
  </div>
);

// ─── Schema Fields Editor ───
const SchemaFieldsEditor: React.FC<{
  fields: SchemaField[];
  onChange: (fields: SchemaField[]) => void;
  label?: string;
}> = ({ fields, onChange, label = "Fields" }) => {
  const addField = () => {
    let name = `field_${fields.length + 1}`;
    while (fields.some((field) => field.name === name)) name += "_new";
    onChange([...fields, { id: crypto.randomUUID(), name, type: "string", required: false }]);
  };

  const updateField = (index: number, updates: Partial<SchemaField>) => {
    const newFields = fields.map((f, i) =>
      i === index ? { ...f, id: f.id || f.name, ...updates } : f,
    );
    onChange(newFields);
  };

  const removeField = (index: number) => {
    onChange(fields.filter((_, i) => i !== index));
  };

  return (
    <div className="bi-schema-editor">
      <div className="bi-schema-header">
        <span>{label}</span>
        <button className="bi-add-field-btn" onClick={addField}>
          <Plus size={12} /> Add
        </button>
      </div>
      {fields.map((field, idx) => (
        <div key={idx} className="bi-schema-field">
          <input
            className="bi-input bi-input-sm"
            value={field.name}
            onChange={(e) => updateField(idx, { name: e.target.value })}
            placeholder="name"
          />
          <select
            className="bi-select bi-select-sm"
            value={field.type}
            onChange={(e) =>
              updateField(idx, { type: e.target.value as SchemaField["type"] })
            }
          >
            <option value="string">String</option>
            <option value="number">Number</option>
            <option value="boolean">Boolean</option>
            <option value="date">Date</option>
            <option value="object">Object</option>
            <option value="array">Array</option>
            <option value="objectId">ObjectId</option>
          </select>
          <label className="bi-checkbox-label">
            <input
              type="checkbox"
              checked={field.required}
              onChange={(e) => updateField(idx, { required: e.target.checked })}
            />
            Req
          </label>
          <label className="bi-checkbox-label">
            <input
              type="checkbox"
              checked={!!field.unique}
              onChange={(e) => updateField(idx, { unique: e.target.checked })}
            />
            Unique
          </label>
          <label className="bi-checkbox-label">
            <input
              type="checkbox"
              checked={!!field.indexed}
              onChange={(e) => updateField(idx, { indexed: e.target.checked })}
            />
            Index
          </label>
          <button
            className="bi-remove-field-btn"
            onClick={() => removeField(idx)}
          >
            <X size={10} />
          </button>
        </div>
      ))}
    </div>
  );
};

// ─── Main Inspector ───

const BackendInspector: React.FC = () => {
  const {
    selectedServiceId,
    selectedBlockId,
    services,
    updateService,
    updateBlockConfig,
    getSelectedService,
    getSelectedBlock,
  } = useBackendStore();

  const selectedService = getSelectedService();
  const selectedBlockData = getSelectedBlock();

  // If a block is selected, show block inspector
  if (selectedBlockData) {
    const { block, serviceId } = selectedBlockData;
    return (
      <div className="backend-inspector">
        <div className="bi-header">
          <h3>Block Properties</h3>
          <span className="bi-type-badge">{block.type.replace(/_/g, " ")}</span>
        </div>
        <div className="bi-content">
          {/* Block label */}
          <Section title="General" icon={<Settings size={12} />}>
            <FieldRow label="Label">
              <input
                className="bi-input"
                value={block.label}
                onChange={(e) => {
                  useBackendStore.getState().updateBlock(serviceId, block.id, {
                    label: e.target.value,
                  });
                }}
              />
            </FieldRow>
          </Section>

          {/* Type-specific editors */}
          <ProgramInspector
            block={block}
            service={services.find((s) => s.id === serviceId)!}
          />
          {block.type === "rest_endpoint" && (
            <EndpointEditor
              config={block.config as EndpointConfig}
              onChange={(updates) =>
                updateBlockConfig(serviceId, block.id, updates)
              }
            />
          )}
          {block.type === "db_model" && (
            <DbModelEditor
              config={block.config as DbModelConfig}
              onChange={(updates) =>
                updateBlockConfig(serviceId, block.id, updates)
              }
            />
          )}
          {block.type === "middleware" && (
            <MiddlewareEditor
              config={block.config as MiddlewareConfig}
              onChange={(updates) =>
                updateBlockConfig(serviceId, block.id, updates)
              }
            />
          )}
          {block.type === "auth_block" && (
            <AuthEditor
              config={block.config as AuthConfig}
              onChange={(updates) =>
                updateBlockConfig(serviceId, block.id, updates)
              }
            />
          )}
          {block.type === "validation" && (
            <ValidationEditor
              config={block.config as ValidationConfig}
              onChange={(updates) =>
                updateBlockConfig(serviceId, block.id, updates)
              }
            />
          )}
          {block.type === "health_check" && (
            <HealthInspector
              config={block.config as HealthConfig}
              serviceId={serviceId}
              onChange={(updates) =>
                updateBlockConfig(serviceId, block.id, updates)
              }
            />
          )}
          {block.type === "error_handler" && (
            <ErrorInspector
              config={block.config as ErrorHandlerConfig}
              onChange={(updates) =>
                updateBlockConfig(serviceId, block.id, updates)
              }
            />
          )}
          {block.type === "audit_log" && (
            <AuditInspector
              config={block.config as AuditLogConfig}
              service={services.find((s) => s.id === serviceId)!}
              onChange={(updates) =>
                updateBlockConfig(serviceId, block.id, updates)
              }
            />
          )}
          {block.type === "env_var" && (
            <EnvVarEditor
              config={block.config as EnvVarConfig}
              onChange={(updates) =>
                updateBlockConfig(serviceId, block.id, updates)
              }
            />
          )}
        </div>
      </div>
    );
  }

  // If service is selected, show service inspector
  if (selectedService) {
    return (
      <div className="backend-inspector">
        <div className="bi-header">
          <h3>Service Settings</h3>
          <div
            className="bi-color-dot"
            style={{ background: selectedService.color }}
          />
        </div>
        <div className="bi-content">
          <Section title="General" icon={<Settings size={12} />}>
            <FieldRow label="Name">
              <input
                className="bi-input"
                value={selectedService.name}
                onChange={(e) =>
                  updateService(selectedService.id, { name: e.target.value })
                }
              />
            </FieldRow>
            <FieldRow label="Description">
              <textarea
                className="bi-textarea"
                value={selectedService.description}
                onChange={(e) =>
                  updateService(selectedService.id, {
                    description: e.target.value,
                  })
                }
                rows={2}
              />
            </FieldRow>
            <FieldRow label="Port">
              <input
                className="bi-input"
                type="number"
                value={selectedService.port}
                onChange={(e) =>
                  updateService(selectedService.id, {
                    port: parseInt(e.target.value) || 3000,
                  })
                }
              />
            </FieldRow>
            <FieldRow label="Color">
              <div className="bi-color-picker">
                {SERVICE_COLORS.map((c) => (
                  <button
                    key={c}
                    className={`bi-color-swatch ${selectedService.color === c ? "active" : ""}`}
                    style={{ background: c }}
                    onClick={() =>
                      updateService(selectedService.id, { color: c })
                    }
                  />
                ))}
              </div>
            </FieldRow>
          </Section>

          <Section title="Stats" defaultOpen={false}>
            <div className="bi-stats">
              <div className="bi-stat">
                <span>{selectedService.blocks.length}</span> blocks
              </div>
              <div className="bi-stat">
                <span>
                  {
                    selectedService.blocks.filter(
                      (b) => b.type === "rest_endpoint",
                    ).length
                  }
                </span>{" "}
                endpoints
              </div>
              <div className="bi-stat">
                <span>
                  {
                    selectedService.blocks.filter((b) => b.type === "db_model")
                      .length
                  }
                </span>{" "}
                models
              </div>
            </div>
          </Section>
        </div>
      </div>
    );
  }

  // Nothing selected
  return (
    <div className="backend-inspector">
      <div className="bi-header">
        <h3>Properties</h3>
      </div>
      <div className="bi-empty">
        <Settings size={32} strokeWidth={1} />
        <p>Select a service or block to edit its properties</p>
      </div>
    </div>
  );
};

// ─── Endpoint Editor ───

const EndpointEditor: React.FC<{
  config: EndpointConfig;
  onChange: (u: Partial<EndpointConfig>) => void;
}> = ({ config, onChange }) => (
  <>
    <Section title="Endpoint" icon={<Globe size={12} />}>
      <FieldRow label="Route">
        <input
          className="bi-input"
          value={config.route}
          onChange={(e) => onChange({ route: e.target.value })}
        />
      </FieldRow>
      <FieldRow label="Method">
        <select
          className="bi-select"
          value={config.method}
          onChange={(e) =>
            onChange({ method: e.target.value as EndpointConfig["method"] })
          }
        >
          <option value="GET">GET</option>
          <option value="POST">POST</option>
          <option value="PUT">PUT</option>
          <option value="DELETE">DELETE</option>
          <option value="PATCH">PATCH</option>
        </select>
      </FieldRow>
      <FieldRow label="Description">
        <input
          className="bi-input"
          value={config.description}
          onChange={(e) => onChange({ description: e.target.value })}
        />
      </FieldRow>
      <FieldRow label="Auth Required">
        <label className="bi-toggle">
          <input
            type="checkbox"
            checked={config.authRequired}
            onChange={(e) => onChange({ authRequired: e.target.checked })}
          />
          <span className="bi-toggle-slider" />
        </label>
      </FieldRow>
    </Section>
    <Section
      title="Request Body"
      icon={<ChevronDown size={12} />}
      defaultOpen={false}
    >
      <SchemaFieldsEditor
        fields={config.requestBody}
        onChange={(fields) => onChange({ requestBody: fields })}
      />
    </Section>
    <Section
      title="Response Body"
      icon={<ChevronDown size={12} />}
      defaultOpen={false}
    >
      <SchemaFieldsEditor label="Query Parameters" fields={config.queryParameters || []} onChange={fields => onChange({queryParameters: fields})} />
      <SchemaFieldsEditor label="Path Parameters" fields={config.pathParameters || []} onChange={fields => onChange({pathParameters: fields})} />
      <SchemaFieldsEditor
        fields={config.responseBody}
        onChange={(fields) => onChange({ responseBody: fields })}
      />
    </Section>
  </>
);

// ─── DB Model Editor ───

const DbModelEditor: React.FC<{
  config: DbModelConfig;
  onChange: (u: Partial<DbModelConfig>) => void;
}> = ({ config, onChange }) => (
  <>
    <Section title="Model" icon={<Database size={12} />}>
      <FieldRow label="Table Name">
        <input
          className="bi-input"
          value={config.tableName}
          onChange={(e) => onChange({ tableName: e.target.value })}
        />
      </FieldRow>
      <FieldRow label="Timestamps">
        <label className="bi-toggle">
          <input
            type="checkbox"
            checked={config.timestamps}
            onChange={(e) => onChange({ timestamps: e.target.checked })}
          />
          <span className="bi-toggle-slider" />
        </label>
      </FieldRow>
      <FieldRow label="Soft Delete">
        <label className="bi-toggle">
          <input
            type="checkbox"
            checked={config.softDelete}
            onChange={(e) => onChange({ softDelete: e.target.checked })}
          />
          <span className="bi-toggle-slider" />
        </label>
      </FieldRow>
    </Section>
    <Section title="Schema Fields" icon={<ChevronDown size={12} />}>
      <SchemaFieldsEditor
        fields={config.fields}
        onChange={(fields) => onChange({ fields })}
      />
    </Section>
  </>
);

// ─── Middleware Editor ───

const MiddlewareEditor: React.FC<{
  config: MiddlewareConfig;
  onChange: (u: Partial<MiddlewareConfig>) => void;
}> = ({ config, onChange }) => (
  <Section title="Middleware" icon={<Settings size={12} />}>
    <FieldRow label="Type">
      <select
        className="bi-select"
        value={config.middlewareType}
        onChange={(e) =>
          onChange({
            middlewareType: e.target
              .value as MiddlewareConfig["middlewareType"],
            scope: e.target.value === "rateLimit" ? config.scope : "service",
          })
        }
      >
        <option value="cors">CORS</option>
        <option value="rateLimit">Rate Limit</option>
        <option value="logger">Logger</option>
        <option value="bodyParser">Body Parser</option>
        <option value="helmet">Helmet</option>
        <option value="custom">Custom</option>
      </select>
    </FieldRow>
    {config.middlewareType === "cors" && (
      <FieldRow label="Origins">
        <input
          className="bi-input"
          value={config.corsOrigins || ""}
          onChange={(e) => onChange({ corsOrigins: e.target.value })}
        />
      </FieldRow>
    )}
    {config.middlewareType === "rateLimit" && (
      <>
        <FieldRow label="Scope">
          <select
            className="bi-select"
            aria-label="Rate limit scope"
            value={config.scope || "service"}
            onChange={(event) =>
              onChange({
                scope: event.target.value as MiddlewareConfig["scope"],
              })
            }
          >
            <option
              value="service"
              disabled={config.rateLimitKey === "identity"}
            >
              This service
            </option>
            <option value="endpoints">Selected endpoints</option>
            <option
              value="backend"
              disabled={config.rateLimitKey === "identity"}
            >
              Every backend service
            </option>
          </select>
        </FieldRow>
        <FieldRow label="Count requests by">
          <select
            className="bi-select"
            aria-label="Rate limit client identity"
            value={config.rateLimitKey || "ip"}
            onChange={(event) =>
              onChange({
                rateLimitKey: event.target
                  .value as MiddlewareConfig["rateLimitKey"],
              })
            }
          >
            <option value="ip">Client IP address</option>
            <option value="identity" disabled={config.scope !== "endpoints"}>
              Signed-in user and tenant
            </option>
          </select>
        </FieldRow>
        {config.scope === "endpoints" && (
          <p className="bi-hint">
            Attach this block in each endpoint’s inspector. User quotas also
            require Auth Required on those endpoints.
          </p>
        )}
        <FieldRow label="Counter storage">
          <select
            className="bi-select"
            aria-label="Rate limit counter storage"
            value={config.rateLimitStore || "memory"}
            onChange={(event) =>
              onChange({
                rateLimitStore: event.target
                  .value as MiddlewareConfig["rateLimitStore"],
              })
            }
          >
            <option value="memory">Memory — single server</option>
            <option value="mongodb">Database — shared across replicas</option>
          </select>
        </FieldRow>
        <p className="bi-hint">
          {config.rateLimitStore === "mongodb"
            ? "Survives restarts and shares quotas across replicas using the same database."
            : "Resets on restart. Choose Database for multiple server replicas."}
        </p>
        <FieldRow label="Max Requests">
          <input
            className="bi-input"
            aria-label="Rate limit maximum requests"
            type="number"
            min={1}
            max={100000}
            step={1}
            value={config.rateLimit || 100}
            onChange={(e) => {
              if (e.target.validity.valid && e.target.value)
                onChange({ rateLimit: Number(e.target.value) });
            }}
          />
        </FieldRow>
        <FieldRow label="Window (min)">
          <input
            className="bi-input"
            aria-label="Rate limit window minutes"
            type="number"
            min={1 / 60}
            max={1440}
            step="any"
            value={config.rateLimitWindow || 15}
            onChange={(e) =>
              e.target.validity.valid &&
              e.target.value &&
              onChange({ rateLimitWindow: Number(e.target.value) })
            }
          />
        </FieldRow>
        <FieldRow label="Limit message">
          <input
            className="bi-input"
            aria-label="Rate limit response message"
            maxLength={160}
            value={config.rateLimitMessage || ""}
            placeholder="Too many requests. Please try again later."
            onChange={(event) =>
              onChange({ rateLimitMessage: event.target.value || undefined })
            }
          />
        </FieldRow>
        <details className="bi-help">
          <summary>How quotas apply</summary>
          <p>
            Selected endpoints share one quota per client. Backend scope
            installs an independent quota in each service. Database outages
            block requests instead of resetting quotas.
          </p>
          <p>
            User quotas use the verified identity and tenant, never
            client-supplied identity headers. IP quotas see the frontend
            server’s address when requests use its gateway.
          </p>
          <p>
            The built-in service ceiling of 120 requests per minute also
            applies. User quotas require selected endpoints with authentication
            enabled.
          </p>
        </details>
      </>
    )}
    {config.middlewareType === "custom" && (
      <FieldRow label="Code">
        <textarea
          className="bi-textarea bi-code-textarea"
          value={config.customCode || ""}
          onChange={(e) => onChange({ customCode: e.target.value })}
          rows={5}
          placeholder="module.exports = (req, res, next) => { ... }"
        />
      </FieldRow>
    )}
  </Section>
);

// ─── Auth Editor ───

const AuthEditor: React.FC<{
  config: AuthConfig;
  onChange: (u: Partial<AuthConfig>) => void;
}> = ({ config, onChange }) => {
  const services = useBackendStore((s) => s.services);
  return (
    <Section title="Authentication" icon={<Shield size={12} />}>
      <FieldRow label="Identity service">
        <select
          className="bi-select"
          value={config.identityServiceId || ""}
          onChange={(e) =>
            onChange({ identityServiceId: e.target.value || undefined })
          }
        >
          <option value="">Local identity / standalone JWT validation</option>
          {services
            .filter((s) =>
              s.blocks.some(
                (b) =>
                  b.type === "db_model" &&
                  (b.config as DbModelConfig).fields.some(
                    (f) => f.name === "password",
                  ),
              ),
            )
            .map((s) => (
              <option key={s.id} value={s.id}>
                {s.name}
              </option>
            ))}
        </select>
        <small>
          Resource services use this connection to enforce logout and account
          changes immediately.
        </small>
      </FieldRow>
      <FieldRow label="Strategy">
        <select
          className="bi-select"
          value={config.strategy}
          onChange={(e) =>
            onChange({ strategy: e.target.value as AuthConfig["strategy"] })
          }
        >
          <option value="jwt">JWT</option>
          <option value="oauth">OAuth</option>
          <option value="session">Session</option>
          <option value="apiKey">API Key</option>
        </select>
      </FieldRow>
      <FieldRow label="Secret reference">
        <span>JWT_SECRET</span>
        <button
          onClick={() =>
            window.dispatchEvent(
              new CustomEvent("levoks:panel", { detail: "secrets" }),
            )
          }
        >
          Manage encrypted secrets
        </button>
      </FieldRow>
      <FieldRow label="Email verification">
        <label>
          <input
            type="checkbox"
            checked={config.requireVerifiedEmail ?? false}
            onChange={(e) =>
              onChange({ requireVerifiedEmail: e.target.checked })
            }
          />{" "}
          Require verified email before login
        </label>
        <small>
          Requires the generated email worker, sender and recovery-page
          configuration.
        </small>
      </FieldRow>
      <FieldRow label="Token Expiry">
        <input
          className="bi-input"
          value={config.tokenExpiry}
          onChange={(e) => onChange({ tokenExpiry: e.target.value })}
          placeholder="7d"
        />
      </FieldRow>
      {config.strategy === "jwt" && (
        <FieldRow label="Session lifetime (days)">
          <input
            className="bi-input"
            type="number"
            min={1}
            max={30}
            value={config.refreshDays ?? 7}
            onChange={(e) => onChange({ refreshDays: Number(e.target.value) })}
          />
        </FieldRow>
      )}
      {config.strategy === "jwt" && (
        <FieldRow label="Idle timeout (minutes)">
          <input
            className="bi-input"
            type="number"
            min={5}
            max={1440}
            value={config.idleMinutes ?? 60}
            onChange={(e) => onChange({ idleMinutes: Number(e.target.value) })}
          />
        </FieldRow>
      )}
      {config.strategy === "jwt" && (
        <FieldRow label="Hash Rounds">
          <input
            className="bi-input"
            type="number"
            value={config.hashRounds || 10}
            onChange={(e) => onChange({ hashRounds: parseInt(e.target.value) })}
          />
        </FieldRow>
      )}
    </Section>
  );
};

const ValidationEditor: React.FC<{
  config: ValidationConfig;
  onChange: (u: Partial<ValidationConfig>) => void;
}> = ({ config, onChange }) => (
  <Section title="Validation" icon={<CheckCircle size={12} />}>
    <FieldRow label="Field Name">
      <input
        className="bi-input"
        value={config.fieldName}
        onChange={(e) => onChange({ fieldName: e.target.value })}
      />
    </FieldRow>
    <div className="bi-rules-list">
      {config.rules.map((rule, idx) => (
        <div key={idx} className="bi-rule-item">
          <select
            className="bi-select bi-select-sm"
            value={rule.type}
            onChange={(e) => {
              const newRules = [...config.rules];
              newRules[idx] = {
                ...rule,
                type: e.target.value as typeof rule.type,
              };
              onChange({ rules: newRules });
            }}
          >
            <option value="required">Required</option>
            <option value="minLength">Min Length</option>
            <option value="maxLength">Max Length</option>
            <option value="min">Min Value</option>
            <option value="max">Max Value</option>
            <option value="regex">Regex</option>
            <option value="email">Email</option>
            <option value="custom">Custom</option>
          </select>
          <input
            className="bi-input bi-input-sm"
            value={rule.message}
            onChange={(e) => {
              const newRules = [...config.rules];
              newRules[idx] = { ...rule, message: e.target.value };
              onChange({ rules: newRules });
            }}
            placeholder="message"
          />
          <button
            className="bi-remove-field-btn"
            onClick={() =>
              onChange({ rules: config.rules.filter((_, i) => i !== idx) })
            }
          >
            <X size={10} />
          </button>
        </div>
      ))}
      <button
        className="bi-add-field-btn"
        onClick={() =>
          onChange({
            rules: [...config.rules, { type: "required", message: "" }],
          })
        }
      >
        <Plus size={12} /> Add Rule
      </button>
    </div>
  </Section>
);

const EnvVarEditor: React.FC<{
  config: EnvVarConfig;
  onChange: (u: Partial<EnvVarConfig>) => void;
}> = ({ config, onChange }) => (
  <Section title="Environment Variable" icon={<Settings size={12} />}>
    <FieldRow label="Key">
      <input
        className="bi-input"
        value={config.key}
        onChange={(e) => onChange({ key: e.target.value })}
      />
    </FieldRow>
    <FieldRow label="Value">
      <input
        className="bi-input"
        value={config.isSecret ? "" : config.value}
        onChange={(e) => onChange({ value: e.target.value })}
        type={config.isSecret ? "password" : "text"}
        disabled={config.isSecret}
        placeholder={config.isSecret ? "Managed in Project secrets" : "Value"}
      />
      {config.isSecret && (
        <button
          onClick={() =>
            window.dispatchEvent(
              new CustomEvent("levoks:panel", { detail: "secrets" }),
            )
          }
        >
          Manage encrypted secrets
        </button>
      )}
    </FieldRow>
    <FieldRow label="Secret">
      <label className="bi-toggle">
        <input
          type="checkbox"
          checked={config.isSecret}
          onChange={(e) => onChange({ isSecret: e.target.checked })}
        />
        <span className="bi-toggle-slider" />
      </label>
    </FieldRow>
    <FieldRow label="Description">
      <input
        className="bi-input"
        value={config.description}
        onChange={(e) => onChange({ description: e.target.value })}
      />
    </FieldRow>
  </Section>
);

export default BackendInspector;
