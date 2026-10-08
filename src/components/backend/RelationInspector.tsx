"use client";

import { useId } from "react";
import type {
  BackendBlock,
  DbModelConfig,
  RelationConfig,
  ServiceContainer,
} from "@/types/backend";
import { useBackendStore } from "@/store/backendStore";
import { relationDiagnostics } from "@/lib/backend/relations";
import { projectHistory } from "@/store/projectHistory";

export default function RelationInspector({
  block,
  service,
}: {
  block: BackendBlock;
  service: ServiceContainer;
}) {
  const prefix = useId();
  const config = block.config as RelationConfig;
  const models = service.blocks.filter((b) => b.type === "db_model");
  const many = config.relationType === "many-to-many";
  const model = (id: string) => models.find((b) => b.id === id);
  const fields = (id: string) =>
    (model(id)?.config as DbModelConfig | undefined)?.fields || [];
  const dependent = many ? config.joinModel || "" : config.toModel;
  const ids = [config.fromModel, config.toModel, ...(many ? [dependent] : [])];
  const common = fields(config.fromModel).filter(
    (f) =>
      f.required &&
      ["string", "objectId"].includes(f.type) &&
      !/password|secret|token/i.test(f.name) &&
      ids.every((id) =>
        fields(id).some(
          (other) =>
            other.name === f.name && other.type === f.type && other.required,
        ),
      ),
  );
  const update = (values: Partial<RelationConfig>) =>
    useBackendStore.getState().updateBlockConfig(service.id, block.id, values);
  const errors = relationDiagnostics(service).filter(
    (d) => d.nodeId === block.id,
  );
  const picker = (
    key: "fromModel" | "toModel" | "joinModel",
    label: string,
  ) => (
    <div className="bi-field">
      <label className="bi-label" htmlFor={`${prefix}-${key}`}>
        {label}
      </label>
      <select
        className="bi-select"
        id={`${prefix}-${key}`}
        value={config[key] || ""}
        onChange={(event) => update({ [key]: event.target.value })}
      >
        <option value="">Choose a model</option>
        {config[key] && !model(config[key]!) && (
          <option value={config[key]}>Unavailable model</option>
        )}
        {models.map((b) => (
          <option key={b.id} value={b.id}>
            {(b.config as DbModelConfig).tableName}
          </option>
        ))}
      </select>
    </div>
  );
  const addField = (
    key: "foreignKey" | "inverseForeignKey",
    parent: string,
  ) => {
    const child = model(dependent),
      source = model(parent);
    if (!child || !source) return;
    const name = (source.config as DbModelConfig).tableName;
    let fieldName = `${name[0].toLowerCase()}${name.slice(1)}Id`;
    while (fields(dependent).some((f) => f.name === fieldName))
      fieldName += "Ref";
    projectHistory.run("backend", () => {
      useBackendStore.getState().updateBlockConfig(service.id, child.id, {
        fields: [
          ...fields(dependent),
          {
            id: crypto.randomUUID(),
            name: fieldName,
            type: "objectId",
            required: many || config.onDelete !== "setNull",
          },
        ],
      });
      update({ [key]: fieldName });
    });
  };
  const foreignKey = (
    key: "foreignKey" | "inverseForeignKey",
    label: string,
    parent: string,
  ) => (
    <div className="bi-field">
      <label className="bi-label" htmlFor={`${prefix}-${key}`}>
        {label}
      </label>
      <select
        className="bi-select"
        id={`${prefix}-${key}`}
        value={config[key] || ""}
        onChange={(event) => update({ [key]: event.target.value })}
      >
        <option value="">Choose an ObjectId field</option>
        {config[key] &&
          !fields(dependent).some(
            (f) => f.name === config[key] && f.type === "objectId",
          ) && (
            <option value={config[key]}>
              Unavailable field: {config[key]}
            </option>
          )}
        {fields(dependent)
          .filter((f) => f.type === "objectId")
          .map((f) => (
            <option key={f.name} value={f.name}>
              {f.name}
            </option>
          ))}
      </select>
      <button
        className="bi-add-field-btn"
        disabled={!model(dependent) || !model(parent)}
        onClick={() => addField(key, parent)}
      >
        Add {label.toLowerCase()}
      </button>
    </div>
  );
  return (
    <section className="bi-section" aria-label="Relationship settings">
      <h4 className="bi-section-header">Relationship</h4>
      <div className="bi-section-body">
        <p className="bi-help">
          The first model is the parent. The dependent stores its reference.
          Many-to-many uses an editable junction model.
        </p>
        <div className="bi-field">
          <label className="bi-label" htmlFor={`${prefix}-type`}>
            Cardinality
          </label>
          <select
            className="bi-select"
            id={`${prefix}-type`}
            value={config.relationType}
            onChange={(event) =>
              update({
                relationType: event.target
                  .value as RelationConfig["relationType"],
              })
            }
          >
            <option value="one-to-one">One to one</option>
            <option value="one-to-many">One to many</option>
            <option value="many-to-many">Many to many</option>
          </select>
        </div>
        {picker("fromModel", "Parent model")}
        {picker("toModel", many ? "Other parent model" : "Dependent model")}
        {many && picker("joinModel", "Junction model")}
        {foreignKey("foreignKey", "Parent reference", config.fromModel)}
        {many &&
          foreignKey(
            "inverseForeignKey",
            "Other parent reference",
            config.toModel,
          )}
        <div className="bi-field">
          <label className="bi-label" htmlFor={`${prefix}-delete`}>
            When a parent is deleted
          </label>
          <select
            className="bi-select"
            id={`${prefix}-delete`}
            value={config.onDelete || "restrict"}
            onChange={(event) =>
              update({
                onDelete: event.target.value as RelationConfig["onDelete"],
              })
            }
          >
            <option value="restrict">Restrict</option>
            <option value="cascade">Cascade</option>
            <option value="setNull" disabled={many}>
              Unlink
            </option>
          </select>
        </div>
        <p className="bi-help">
          {config.onDelete === "cascade"
            ? "Cascade deletes dependents with the parent. Purging a parent permanently removes its dependents."
            : config.onDelete === "setNull"
              ? "Unlink clears optional references, including on deleted dependents. Restoring the parent does not reconnect them."
              : "Remove every dependent, including deleted records, before deleting the parent."}
        </p>
        <fieldset className="bi-relation-scope">
          <legend className="bi-label">Match scope fields</legend>
          <p className="bi-help">
            Checked fields must match on both sides. Include every owner and
            tenant policy field.
          </p>
          {!common.length && (
            <p className="bi-help">
              Add matching required String or ObjectId fields to every model to
              isolate relationships.
            </p>
          )}
          {[
            ...new Set([
              ...common.map((f) => f.name),
              ...(config.scopeFields || []),
            ]),
          ].map((name) => (
            <label className="bi-checkbox-label" key={name}>
              <input
                type="checkbox"
                checked={config.scopeFields?.includes(name) || false}
                onChange={(event) =>
                  update({
                    scopeFields: event.target.checked
                      ? [...(config.scopeFields || []), name]
                      : config.scopeFields?.filter((f) => f !== name),
                  })
                }
              />
              {name}
              {!common.some((f) => f.name === name) ? " (unavailable)" : ""}
            </label>
          ))}
        </fieldset>
        <p className="bi-help">
          Requires a MongoDB replica set. References must point to active
          records. Restoring a parent does not restore its children. IDs cannot
          be changed.
        </p>
        {!!errors.length && (
          <ul className="bi-relation-errors" role="alert">
            {errors.map((error, i) => (
              <li key={i}>{error.message}</li>
            ))}
          </ul>
        )}
      </div>
    </section>
  );
}
