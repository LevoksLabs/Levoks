"use client";

import { useState } from "react";
import type {
  BackendBlock,
  BlockConfig,
  ServiceContainer,
  EndpointConfig,
} from "@/types/backend";
import {
  controlSchema,
  programConfigs,
  type ProgramBlockType,
} from "@/lib/backend/program-schema";
import { useBackendStore } from "@/store/backendStore";

type Value = string | number | boolean | null;
const configuration = new Set([
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
              ["find", "findOne", "create", "update", "delete", "count"].map(
                (id) => ({ id, label: id }),
              ),
              (operation) =>
                update({ operation: operation as typeof c.operation }),
            )}
            {select(
              "Query access policy",
              c.policyId,
              service.blocks
                .filter((b) => b.type === "access_policy")
                .map((b) => ({ id: b.id, label: b.label })),
              (policyId) => update({ policyId }),
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
              ["eq", "ne", "gt", "gte", "lt", "lte", "exists"].map((id) => ({
                id,
                label: id,
              })),
              (operator) => change({ operator: operator as typeof c.operator }),
            )}
            <Binding
              label="Right value"
              value={c.right}
              onChange={(right) => change({ right })}
            />
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
