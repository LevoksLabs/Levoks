"use client";

import { useState } from "react";
import type {
  BackendBlock,
  BlockConfig,
  ServiceContainer,
  EndpointConfig,
  DbModelConfig,
  MiddlewareConfig,
} from "@/types/backend";
import {
  controlSchema,
  programConfigs,
  type ProgramBlockType,
  type AggregationConfig,
} from "@/lib/backend/program-schema";
import { useBackendStore } from "@/store/backendStore";
import { addLoginWorkflow } from "@/lib/backend/login";
import { responseHeaderProblems } from "@/lib/backend/response-headers";

function AggregateFields({
  value,
  fields,
  onChange,
}: {
  value: AggregationConfig;
  fields: DbModelConfig["fields"];
  onChange: (value: AggregationConfig) => void;
}) {
  const scalar = [{ name: "_id", type: "objectId" }, ...fields].filter(
    (field) =>
      !["array", "object"].includes(field.type) &&
      !/password|secret|token/i.test(field.name),
  );
  return (
    <fieldset className="bi-section">
      <legend>Aggregation</legend>
      <label>
        Group by
        <select
          aria-label="Aggregate group field"
          className="bi-select"
          value={value.groupBy}
          onChange={(event) =>
            onChange({ ...value, groupBy: event.target.value })
          }
        >
          <option value="">All matching records</option>
          {scalar.map((field) => (
            <option key={field.name} value={field.name}>
              {field.name}
            </option>
          ))}
        </select>
      </label>
      <p className="bi-hint">
        Policies and filters apply before grouping. Results expose the group as
        _id and each named metric.
      </p>
      {value.metrics.map((metric, index) => (
        <fieldset key={`${index}-${metric.name}`}>
          <legend>Metric {index + 1}</legend>
          <label>
            Result name
            <input
              className="bi-input"
              aria-label={`Metric ${index + 1} name`}
              defaultValue={metric.name}
              required
              pattern="[A-Za-z_][A-Za-z0-9_]*"
              maxLength={100}
              onBlur={(event) => {
                const name = event.target.value;
                event.target.setCustomValidity(
                  ["_id", "__proto__", "prototype", "constructor"].includes(
                    name,
                  ) ||
                    /password|secret|token/i.test(name) ||
                    value.metrics.some(
                      (item, position) =>
                        position !== index && item.name === name,
                    )
                    ? "Choose a unique, non-reserved result name."
                    : "",
                );
                if (event.target.reportValidity())
                  onChange({
                    ...value,
                    metrics: value.metrics.map((item, position) =>
                      position === index ? { ...item, name } : item,
                    ),
                  });
              }}
            />
          </label>
          <label>
            Calculation
            <select
              className="bi-select"
              aria-label={`Metric ${index + 1} calculation`}
              value={metric.operation}
              onChange={(event) =>
                onChange({
                  ...value,
                  metrics: value.metrics.map((item, position) =>
                    position === index
                      ? {
                          ...item,
                          operation: event.target
                            .value as typeof metric.operation,
                        }
                      : item,
                  ),
                })
              }
            >
              {["count", "sum", "avg", "min", "max"].map((operation) => (
                <option key={operation} value={operation}>
                  {operation}
                </option>
              ))}
            </select>
          </label>
          {metric.operation !== "count" && (
            <label>
              Model field
              <select
                className="bi-select"
                aria-label={`Metric ${index + 1} field`}
                value={metric.field}
                onChange={(event) =>
                  onChange({
                    ...value,
                    metrics: value.metrics.map((item, position) =>
                      position === index
                        ? { ...item, field: event.target.value }
                        : item,
                    ),
                  })
                }
              >
                <option value="">Choose a field</option>
                {scalar
                  .filter(
                    (field) =>
                      !["sum", "avg"].includes(metric.operation) ||
                      field.type === "number",
                  )
                  .map((field) => (
                    <option key={field.name} value={field.name}>
                      {field.name}
                    </option>
                  ))}
              </select>
            </label>
          )}
          <button
            className="bi-btn"
            disabled={value.metrics.length === 1}
            onClick={() =>
              onChange({
                ...value,
                metrics: value.metrics.filter(
                  (_, position) => position !== index,
                ),
              })
            }
          >
            Remove metric {index + 1}
          </button>
        </fieldset>
      ))}
      <button
        className="bi-btn"
        disabled={value.metrics.length >= 8}
        onClick={() => {
          let suffix = 1;
          while (
            value.metrics.some((metric) => metric.name === `count${suffix}`)
          )
            suffix++;
          onChange({
            ...value,
            metrics: [
              ...value.metrics,
              { name: `count${suffix}`, operation: "count", field: "" },
            ],
          });
        }}
      >
        Add aggregate metric
      </button>
    </fieldset>
  );
}

type Value = string | number | boolean | null;
const configuration = new Set([
  "submission_notification",
  "rest_endpoint",
  "db_model",
  "role",
  "permission",
  "middleware",
  "auth_block",
  "relation",
  "env_var",
  "health_check",
  "error_handler",
  "audit_log",
]);

function Binding({
  label,
  value,
  onChange,
}: {
  label: string;
  value: Value;
  onChange: (v: Value) => void;
}) {
  const kind = value === null ? "null" : typeof value;
  return (
    <label className="bi-field">
      <span>{label}</span>
      <select
        aria-label={`${label} type`}
        className="bi-select"
        value={kind}
        onChange={(e) =>
          onChange(
            e.target.value === "number"
              ? 0
              : e.target.value === "boolean"
                ? false
                : e.target.value === "null"
                  ? null
                  : "",
          )
        }
      >
        <option>string</option>
        <option>number</option>
        <option>boolean</option>
        <option>null</option>
      </select>
      {kind === "boolean" ? (
        <select
          aria-label={label}
          className="bi-select"
          value={String(value)}
          onChange={(e) => onChange(e.target.value === "true")}
        >
          <option>true</option>
          <option>false</option>
        </select>
      ) : (
        kind !== "null" && (
          <input
            aria-label={label}
            className="bi-input"
            type={kind === "number" ? "number" : "text"}
            value={String(value)}
            onChange={(e) =>
              onChange(
                kind === "number" ? Number(e.target.value) : e.target.value,
              )
            }
          />
        )
      )}
    </label>
  );
}

function Mapping({
  label,
  values,
  onChange,
}: {
  label: string;
  values: Record<string, Value>;
  onChange: (v: Record<string, Value>) => void;
}) {
  const [name, setName] = useState("");
  return (
    <fieldset>
      <legend>{label}</legend>
      {Object.entries(values).map(([key, value]) => (
        <div key={key}>
          <Binding
            label={key}
            value={value}
            onChange={(v) => onChange({ ...values, [key]: v })}
          />
          <button
            type="button"
            onClick={() =>
              onChange(
                Object.fromEntries(
                  Object.entries(values).filter(([k]) => k !== key),
                ),
              )
            }
          >
            Remove {key}
          </button>
        </div>
      ))}
      <input
        className="bi-input"
        aria-label={`New ${label} field`}
        placeholder="Field name"
        value={name}
        onChange={(e) => setName(e.target.value)}
      />
      <button
        type="button"
        disabled={!/^[A-Za-z_][A-Za-z0-9_]*$/.test(name) || name in values}
        onClick={() => {
          onChange({ ...values, [name]: "" });
          setName("");
        }}
      >
        Add field
      </button>
    </fieldset>
  );
}

export function StepList({
  label,
  value,
  block,
  service,
  onChange,
}: {
  label: string;
  value: string[];
  block: BackendBlock;
  service: ServiceContainer;
  onChange: (ids: string[]) => void;
}) {
  return (
    <fieldset>
      <legend>{label}</legend>
      <ol>
        {value.map((id, index) => (
          <li key={`${id}-${index}`}>
            <span>
              {service.blocks.find((b) => b.id === id)?.label ||
                "Missing block"}
            </span>
            <button
              type="button"
              disabled={!index}
              aria-label={`Move step ${index + 1} up`}
              onClick={() => {
                const next = [...value];
                [next[index - 1], next[index]] = [next[index], next[index - 1]];
                onChange(next);
              }}
            >
              ↑
            </button>
            <button
              type="button"
              aria-label={`Remove step ${index + 1}`}
              onClick={() => onChange(value.filter((_, i) => i !== index))}
            >
              ×
            </button>
          </li>
        ))}
      </ol>
      <select
        aria-label={`Add ${label}`}
        className="bi-select"
        value=""
        onChange={(e) => {
          if (e.target.value) onChange([...value, e.target.value]);
        }}
      >
        <option value="">Add an operation…</option>
        {service.blocks
          .filter((b) => b.id !== block.id && !configuration.has(b.type))
          .map((b) => (
            <option key={b.id} value={b.id}>
              {b.label}
            </option>
          ))}
      </select>
    </fieldset>
  );
}

export default function ProgramInspector({
  block,
  service,
}: {
  block: BackendBlock;
  service: ServiceContainer;
}) {
  const update = (changes: Partial<BlockConfig>) =>
    useBackendStore.getState().updateBlockConfig(service.id, block.id, changes);
  const steps = (
    label: string,
    value: string[],
    onChange: (ids: string[]) => void,
  ) => (
    <StepList
      label={label}
      value={value}
      onChange={onChange}
      block={block}
      service={service}
    />
  );
  const select = (
    label: string,
    value: string,
    options: { id: string; label: string }[],
    onChange: (id: string) => void,
  ) => (
    <label className="bi-field">
      {label}
      <select
        aria-label={label}
        className="bi-select"
        value={value}
        onChange={(e) => onChange(e.target.value)}
      >
        <option value="">Select…</option>
        {options.map((option) => (
          <option key={option.id} value={option.id}>
            {option.label}
          </option>
        ))}
      </select>
    </label>
  );
  let content;
  if (block.type === "rest_endpoint") {
    const c = block.config as EndpointConfig;
    content = (
      <>
        {!block.connections.length &&
          c.route.endsWith("/login") &&
          service.blocks.some((b) => b.type === "auth_block") && (
            <button
              type="button"
              className="bi-btn"
              onClick={() =>
                useBackendStore
                  .getState()
                  .updateService(service.id, {
                    blocks: addLoginWorkflow(
                      service,
                      () => crypto.randomUUID(),
                      block.id,
                    ).blocks,
                  })
              }
            >
              Make login workflow editable
            </button>
          )}
        {select(
          "Model for automatic CRUD",
          c.modelId || "",
          service.blocks
            .filter((b) => b.type === "db_model")
            .map((b) => ({ id: b.id, label: b.label })),
          (modelId) => update({ modelId: modelId || undefined }),
        )}
        {select(
          "Endpoint access policy",
          c.policyIds?.[0] || "",
          service.blocks
            .filter((b) => b.type === "access_policy")
            .map((b) => ({ id: b.id, label: b.label })),
          (id) => update({ policyIds: id ? [id] : [] }),
        )}
        <fieldset className="bi-section">
          <legend>Endpoint rate limits</legend>
          <p className="bi-hint">
            Select rate-limit blocks configured for selected endpoints. Service
            and backend limits apply automatically.
          </p>
          {service.blocks
            .filter(
              (b) =>
                b.type === "middleware" &&
                (b.config as MiddlewareConfig).middlewareType === "rateLimit" &&
                (b.config as MiddlewareConfig).scope === "endpoints",
            )
            .map((middleware) => (
              <label key={middleware.id} className="bi-field">
                <input
                  type="checkbox"
                  aria-label={`Apply ${middleware.label}`}
                  checked={c.middlewareIds.includes(middleware.id)}
                  onChange={(event) =>
                    update({
                      middlewareIds: event.target.checked
                        ? [...c.middlewareIds, middleware.id]
                        : c.middlewareIds.filter((id) => id !== middleware.id),
                    })
                  }
                />
                {middleware.label}
              </label>
            ))}
        </fieldset>
        <p>
          Ordered operations below replace automatic CRUD. Each query chooses
          its own model. Endpoint policies also scope every query in its
          workflow.
        </p>
      </>
    );
  } else if (block.type in programConfigs) {
    const parsed = programConfigs[block.type as ProgramBlockType].safeParse(
      block.config,
    );
    if (!parsed.success)
      return <p role="alert">Invalid operation configuration.</p>;
    const c = parsed.data;
    content = (
      <>
        {"identityModelId" in c && (
          <>
            {select(
              "Identity model",
              c.identityModelId,
              service.blocks
                .filter((b) => b.type === "db_model")
                .map((b) => ({ id: b.id, label: b.label })),
              (identityModelId) => update({ identityModelId }),
            )}
            <Binding
              label="Email binding"
              value={c.email}
              onChange={(email) => update({ email })}
            />
          </>
        )}
        {"lookupId" in c && (
          <>
            {select(
              "Account lookup",
              c.lookupId,
              service.blocks
                .filter((b) => b.type === "credential_lookup")
                .map((b) => ({ id: b.id, label: b.label })),
              (lookupId) => update({ lookupId }),
            )}
            <Binding
              label="Password binding"
              value={c.password}
              onChange={(password) => update({ password })}
            />
          </>
        )}
        {"verificationId" in c && (
          <>
            {select(
              "Password verification",
              c.verificationId,
              service.blocks
                .filter((b) => b.type === "password_verify")
                .map((b) => ({ id: b.id, label: b.label })),
              (verificationId) => update({ verificationId }),
            )}
            <p className="bi-hint">
              Uses the service JWT lifetime and revocable sessions. Cookies are
              HttpOnly; secrets cannot be bound as output values.
            </p>
          </>
        )}
        {"originEnv" in c && <>
          <label>Upstream origin environment variable<input className="bi-input" value={c.originEnv} onChange={e => update({originEnv: e.target.value})} /></label>
          <label>Fixed request path<input className="bi-input" value={c.path} onChange={e => update({path: e.target.value})} /></label>
          {select("HTTP method", c.method, ["GET", "POST", "PUT", "PATCH", "DELETE"].map(id => ({id, label: id})), method => update({method: method as typeof c.method}))}
          <Mapping label="Query parameters" values={c.query} onChange={query => update({query})} />
          <Mapping label="JSON body" values={c.body} onChange={body => update({body})} />
          <label>Bearer token environment variable<input className="bi-input" value={c.bearerTokenEnv} onChange={e => update({bearerTokenEnv: e.target.value})} /></label>
          <label>Timeout (ms)<input className="bi-input" type="number" min={100} max={10000} value={c.timeoutMs} onChange={e => update({timeoutMs: Number(e.target.value)})} /></label>
          <label>GET retries<input className="bi-input" type="number" min={0} max={2} value={c.retries} onChange={e => update({retries: Number(e.target.value)})} /></label>
          <p className="bi-hint">JSON REST and GraphQL requests. Configure the origin and credentials on the server. Redirects are rejected; failures enter the workflow error path.</p>
        </>}
        {"namespace" in c && <>
          {select("Cache operation", c.operation, ["get", "set", "delete"].map(id => ({id, label: id})), operation => update({operation: operation as typeof c.operation}))}
          <label>Cache namespace<input className="bi-input" value={c.namespace} onChange={e => update({namespace: e.target.value})} /></label>
          <Binding label="Cache key" value={c.key} onChange={key => update({key})} />
          <Binding label="Cached value" value={c.value} onChange={value => update({value})} />
          <label>TTL (seconds)<input className="bi-input" type="number" min={1} max={3600} value={c.ttlSeconds} onChange={e => update({ttlSeconds: Number(e.target.value)})} /></label>
          <p className="bi-hint">Process-local cache, scoped to the current user and tenant. Up to 256 entries of 64 KB, evicted on restart or capacity.</p>
        </>}
        {"modelId" in c && (
          <>
            {select(
              "Query model",
              c.modelId,
              service.blocks
                .filter((b) => b.type === "db_model")
                .map((b) => ({ id: b.id, label: b.label })),
              (modelId) => update({ modelId }),
            )}
            {select(
              "Operation",
              c.operation,
              [
                "find",
                "findOne",
                "create",
                "update",
                "delete",
                "restore",
                "purge",
                "count",
                "aggregate",
              ].map((id) => ({ id, label: id })),
              (operation) =>
                update({ operation: operation as typeof c.operation, ...(!["find", "findOne", "count", "aggregate"].includes(operation) ? {deleted: "exclude"} : {}) }),
            )}
            {["find", "findOne", "count", "aggregate"].includes(c.operation) && select(
              "Deleted records", c.deleted || "exclude",
              [{id: "exclude", label: "Hide deleted"}, {id: "only", label: "Only deleted"}, {id: "include", label: "Include deleted"}],
              deleted => update({deleted: deleted as typeof c.deleted}),
            )}
            {["restore", "purge"].includes(c.operation) && <p className="bi-hint">{c.operation === "purge" ? "Permanently removes one deleted record. This cannot be undone after the transaction commits." : "Restores one deleted record."} Requires a soft-delete model and an explicit filter. Access policies still apply.</p>}
            {select(
              "Query access policy",
              c.policyId,
              service.blocks
                .filter((b) => b.type === "access_policy")
                .map((b) => ({ id: b.id, label: b.label })),
              (policyId) => update({ policyId }),
            )}
            {c.operation === "aggregate" && (
              <AggregateFields
                value={c.aggregation}
                fields={
                  (
                    service.blocks.find(
                      (block) =>
                        block.id === c.modelId && block.type === "db_model",
                    )?.config as DbModelConfig | undefined
                  )?.fields || []
                }
                onChange={(aggregation) => update({ aggregation })}
              />
            )}
            <Mapping
              label="Filter"
              values={c.filter}
              onChange={(filter) => update({ filter })}
            />
            <Mapping
              label="Values"
              values={c.values}
              onChange={(values) => update({ values })}
            />
            <label>
              Sort field
              <input
                className="bi-input"
                value={c.sortField}
                onChange={(e) => update({ sortField: e.target.value })}
              />
            </label>
            {select(
              "Sort direction",
              c.sortDirection,
              [
                { id: "asc", label: "Ascending" },
                { id: "desc", label: "Descending" },
              ],
              (sortDirection) =>
                update({ sortDirection: sortDirection as "asc" | "desc" }),
            )}
            <Binding label="Page number" value={c.page ?? 1} onChange={page => update({page})} />
            <label>
              Maximum results
              <input
                className="bi-input"
                type="number"
                min={1}
                max={100}
                value={c.limit}
                onChange={(e) =>
                  update({
                    limit: Math.max(1, Math.min(100, Number(e.target.value))),
                  })
                }
              />
            </label>
          </>
        )}
        {"output" in c && (
          <label>
            Output name
            <input
              className="bi-input"
              value={c.output}
              onChange={(e) => update({ output: e.target.value })}
            />
          </label>
        )}
        {"fields" in c && (
          <Mapping
            label="Output fields"
            values={c.fields}
            onChange={(fields) => update({ fields })}
          />
        )}
        {"steps" in c &&
          steps("Operations", c.steps, (ids) => update({ steps: ids }))}
        {block.type === "function" && (
          <>
            <Mapping
              label="Function inputs"
              values={programConfigs.function.parse(block.config).inputs}
              onChange={(inputs) => update({ inputs })}
            />
            <Binding
              label="Function result"
              value={programConfigs.function.parse(block.config).result}
              onChange={(result) => update({ result })}
            />
          </>
        )}
        {"status" in c && (
          <>
            <label>
              HTTP status
              <input
                className="bi-input"
                type="number"
                min={200}
                max={599}
                value={c.status}
                onChange={(e) => update({ status: Number(e.target.value) })}
              />
            </label>
            <Binding
              label="Response value"
              value={c.value}
              onChange={(value) => update({ value })}
            />
            {[204, 205, 304].includes(c.status) && <p className="bi-hint">This status sends no response body. The value is ignored.</p>}
            <fieldset>
              <legend>Response headers</legend>
              <p className="bi-hint">Send application metadata using literals or $context.path bindings. Browser, identity, caching and security headers are managed separately. Maximum 32 headers, 4 KB per value and 8 KB total. Cross-origin clients also need these names in CORS Exposed headers.</p>
              {(c.headers || []).map((header, index) => <fieldset key={index}>
                <legend>Header {index + 1}</legend>
                <label className="bi-field">Name<input className="bi-input" aria-label={`Response header ${index + 1} name`} maxLength={120} value={header.name} onChange={e => update({headers: c.headers!.map((item, position) => position === index ? {...item, name: e.target.value} : item)})} /></label>
                <Binding label={`Response header ${index + 1} value`} value={header.value} onChange={value => update({headers: c.headers!.map((item, position) => position === index ? {...item, value} : item)})} />
                <button type="button" className="bi-btn" aria-label={`Remove response header ${index + 1}`} onClick={() => update({headers: c.headers!.filter((_, position) => position !== index)})}>Remove header</button>
              </fieldset>)}
              <button type="button" className="bi-btn" disabled={(c.headers?.length || 0) >= 32} onClick={() => {
                let number = (c.headers?.length || 0) + 1;
                while (c.headers?.some(header => header.name.toLowerCase() === `x-app-result-${number}`)) number++;
                update({headers: [...(c.headers || []), {name: `X-App-Result-${number}`, value: ""}]});
              }}>Add response header</button>
              {responseHeaderProblems(c.headers || []).map((message, index) => <p className="bi-hint" role="alert" key={index}>{message}</p>)}
            </fieldset>
          </>
        )}
        {"name" in c && (
          <label>
            Role name
            <input
              className="bi-input"
              value={c.name}
              onChange={(e) => update({ name: e.target.value })}
            />
          </label>
        )}
        {"resource" in c && (
          <>
            <label>
              Resource
              <input
                className="bi-input"
                value={c.resource}
                onChange={(e) => update({ resource: e.target.value })}
              />
            </label>
            <label>
              Action
              <input
                className="bi-input"
                value={c.action}
                onChange={(e) => update({ action: e.target.value })}
              />
            </label>
          </>
        )}
        {"permissions" in c && (
          <fieldset>
            <legend>Required / granted permissions</legend>
            {service.blocks
              .filter((b) => b.type === "permission")
              .map((b) => {
                const p = programConfigs.permission.parse(b.config);
                const key = p.resource + "." + p.action;
                return (
                  <label key={b.id}>
                    <input
                      type="checkbox"
                      checked={c.permissions.includes(key)}
                      onChange={(e) =>
                        update({
                          permissions: e.target.checked
                            ? [...c.permissions, key]
                            : c.permissions.filter((v) => v !== key),
                        })
                      }
                    />
                    {key}
                  </label>
                );
              })}
          </fieldset>
        )}
        {"ownerField" in c && (
          <>
            <label>
              Owner field (principal subject)
              <input
                className="bi-input"
                value={c.ownerField}
                onChange={(e) => update({ ownerField: e.target.value })}
              />
            </label>
            <label>
              Tenant field (principal tenantId)
              <input
                className="bi-input"
                value={c.tenantField}
                onChange={(e) => update({ tenantField: e.target.value })}
              />
            </label>
            <fieldset>
              <legend>Allowed roles</legend>
              {service.blocks
                .filter((b) => b.type === "role")
                .map((b) => {
                  const role = programConfigs.role.parse(b.config).name;
                  return (
                    <label key={b.id}>
                      <input
                        type="checkbox"
                        checked={c.roles.includes(role)}
                        onChange={(e) =>
                          update({
                            roles: e.target.checked
                              ? [...c.roles, role]
                              : c.roles.filter((v) => v !== role),
                          })
                        }
                      />
                      {role}
                    </label>
                  );
                })}
            </fieldset>
            <p>
              Ownership and tenant filters are enforced in the database query.
              Client values cannot replace them.
            </p>
          </>
        )}
      </>
    );
  } else if (block.type.startsWith("logic_")) {
    const c = controlSchema.parse(
      (block.config as { program?: unknown }).program || {},
    );
    const change = (values: Partial<typeof c>) =>
      update({ program: { ...c, ...values } });
    content = (
      <>
        {block.type === "logic_if" ? (
          <>
            <Binding
              label="Left value"
              value={c.left}
              onChange={(left) => change({ left })}
            />
            {select(
              "Comparison",
              c.operator,
              ["eq", "ne", "gt", "gte", "lt", "lte", "exists", "includes", "excludes"].map((id) => ({
                id,
                label: id,
              })),
              (operator) => change({ operator: operator as typeof c.operator }),
            )}
            {c.literalValue !== undefined ? <label className="bi-field"><span>Literal choice value</span><input aria-label="Literal choice value" value={c.literalValue} maxLength={1000} onChange={e => change({literalValue: e.target.value})} /></label> : <Binding
              label="Right value"
              value={c.right}
              onChange={(right) => change({ right })}
            />}
            {steps("When true", c.thenSteps, (thenSteps) =>
              change({ thenSteps }),
            )}
            {steps("When false", c.elseSteps, (elseSteps) =>
              change({ elseSteps }),
            )}
          </>
        ) : (
          <>
            {block.type === "logic_loop" && (
              <>
                <Binding
                  label="Collection"
                  value={c.source}
                  onChange={(source) => change({ source })}
                />
                <label>
                  Maximum iterations
                  <input
                    className="bi-input"
                    type="number"
                    min={1}
                    max={1000}
                    value={c.maxIterations}
                    onChange={(e) =>
                      change({ maxIterations: Number(e.target.value) })
                    }
                  />
                </label>
              </>
            )}
            {steps("Operations", c.steps, (ids) => change({ steps: ids }))}
            {block.type === "logic_trycatch" && (
              <>
                {steps("On error", c.catchSteps, (catchSteps) =>
                  change({ catchSteps }),
                )}
                {steps("Finally", c.finallySteps, (finallySteps) =>
                  change({ finallySteps }),
                )}
              </>
            )}
          </>
        )}
      </>
    );
  }
  if (!content && configuration.has(block.type)) return null;
  return (
    <section className="bi-section bi-program">
      <h4>Execution & data flow</h4>
      <p>
        Use $request.body.name, $request.params.id, $request.query.search,
        $result, $item.name or $input.name to bind values. Other values are
        literals.
      </p>
      {content}
      {!configuration.has(block.type) || block.type === "rest_endpoint"
        ? steps("Next steps", block.connections, (connections) =>
            useBackendStore
              .getState()
              .updateBlock(service.id, block.id, { connections }),
          )
        : null}
    </section>
  );
}
