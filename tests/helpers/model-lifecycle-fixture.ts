import type { DbModelConfig, SchemaField } from "../../src/types/backend";
import { block, programFixture } from "./program-fixture";

export const defaultFields: SchemaField[] = [
  { name: "quantity", type: "number", required: true, defaultValue: "0" },
  { name: "enabled", type: "boolean", required: true, defaultValue: "false" },
  { name: "description", type: "string", required: false, defaultValue: "" },
  {
    name: "settings",
    type: "object",
    required: false,
    defaultValue: '{"theme":"dark"}',
  },
  {
    name: "tags",
    type: "array",
    required: false,
    defaultValue: '["new",1,false]',
  },
  {
    name: "availableAt",
    type: "date",
    required: false,
    defaultValue: "2026-10-02",
  },
  {
    name: "referenceId",
    type: "objectId",
    required: false,
    defaultValue: "507f1f77bcf86cd799439011",
  },
];

export function modelLifecycleFixture() {
  const service = programFixture();
  const model = service.blocks.find((b) => b.id === "model")!
    .config as DbModelConfig;
  model.softDelete = true;
  model.fields.push(...structuredClone(defaultFields));
  for (const operation of ["delete", "restore", "purge"] as const) {
    service.blocks.push(
      block(operation, "query", {
        modelId: "model",
        operation,
        policyId: "policy",
        filter: { _id: "$request.params.id" },
      }),
      block(
        `${operation}_endpoint`,
        "rest_endpoint",
        {
          route: `/entries/:id/${operation}`,
          method: "POST",
          authRequired: true,
        },
        [operation],
      ),
    );
  }
  for (const [id, operation, deleted] of [
    ["trash", "find", "only"],
    ["all", "find", "include"],
    ["trash_count", "count", "only"],
    ["trash_report", "aggregate", "only"],
  ] as const) {
    service.blocks.push(
      block(id, "query", {
        modelId: "model",
        operation,
        deleted,
        policyId: "policy",
      }),
      block(
        `${id}_endpoint`,
        "rest_endpoint",
        { route: `/entries-${id}`, authRequired: true },
        [id],
      ),
    );
  }
  service.blocks.push(
    block("rollback_restore", "transaction", { steps: ["restore", "restore"] }),
    block(
      "rollback_restore_endpoint",
      "rest_endpoint",
      { route: "/entries/:id/rollback", method: "POST", authRequired: true },
      ["rollback_restore"],
    ),
    block("rollback_purge", "transaction", { steps: ["purge", "purge"] }),
    block(
      "rollback_purge_endpoint",
      "rest_endpoint",
      {
        route: "/entries/:id/rollback-purge",
        method: "POST",
        authRequired: true,
      },
      ["rollback_purge"],
    ),
    block("plain", "db_model", {
      tableName: "Plain",
      timestamps: false,
      softDelete: true,
      fields: [
        { name: "title", type: "string", required: true },
        ...structuredClone(defaultFields),
      ],
    }),
    ...(["GET", "POST", "PATCH", "PUT", "DELETE"] as const).map((method) =>
      block(`plain_${method}`, "rest_endpoint", {
        route: `/plain${["PATCH", "PUT", "DELETE"].includes(method) ? "/:id" : ""}`,
        method,
        modelId: "plain",
        authRequired: true,
      }),
    ),
    block("plain_one", "rest_endpoint", {
      route: "/plain/:id",
      modelId: "plain",
      authRequired: true,
    }),
  );
  return service;
}
