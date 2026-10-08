import type {
  BackendBlock,
  DbModelConfig,
  RelationConfig,
  SchemaField,
} from "../../src/types/backend";
import { block, programFixture } from "./program-fixture";
import { parseProject } from "../../src/lib/project/schema";
import { emptyProject } from "../../src/lib/project/workspace";

export function relationsFixture() {
  const service = programFixture();
  service.name = "Relations Service";
  service.blocks = service.blocks.filter((b) =>
    ["role", "permission", "access_policy"].includes(b.type),
  );
  const scope: SchemaField[] = [
    { name: "ownerId", type: "string", required: true },
    { name: "tenantId", type: "string", required: true },
  ];
  const reference = (name: string, required = false): SchemaField => ({
    name,
    type: "objectId",
    required,
  });
  const models: [string, string, SchemaField[], boolean][] = [
    ["parent", "Project", [], true],
    ["task", "Task", [reference("projectId")], true],
    ["profile", "Profile", [reference("projectId")], true],
    ["tag", "Tag", [], false],
    [
      "link",
      "ProjectTag",
      [reference("projectId", true), reference("tagId", true)],
      false,
    ],
    ["note", "Note", [reference("projectId")], true],
  ];
  for (const [id, tableName, extra, softDelete] of models) {
    const fields: SchemaField[] = [
      { name: "title", type: "string", required: true },
      ...scope,
      ...extra,
    ];
    service.blocks.push(
      block(id, "db_model", { tableName, fields, softDelete }),
    );
    for (const operation of [
      "create",
      "update",
      "delete",
      ...(softDelete ? ["restore", "purge"] : []),
    ]) {
      const query = block(`${id}_${operation}`, "query", {
        modelId: id,
        operation,
        policyId: "policy",
        ...(operation !== "create"
          ? { filter: { _id: "$request.params.id" } }
          : {}),
        ...(["create", "update"].includes(operation)
          ? {
              values: Object.fromEntries(
                fields
                  .filter((f) => !["ownerId", "tenantId"].includes(f.name))
                  .map((f) => [f.name, `$request.body.${f.name}`]),
              ),
            }
          : {}),
      } as Partial<BackendBlock["config"]>);
      service.blocks.push(
        query,
        block(
          `${id}_${operation}_endpoint`,
          "rest_endpoint",
          {
            route: `/${id}/${operation}${operation !== "create" ? "/:id" : ""}`,
            method: "POST",
            authRequired: true,
            requestBody: ["create", "update"].includes(operation)
              ? fields
                  .filter((f) => !["ownerId", "tenantId"].includes(f.name))
                  .map((f) => ({
                    ...f,
                    required: operation === "create" && f.required,
                  }))
              : [],
          },
          [query.id],
        ),
      );
    }
  }
  const relations: [string, Partial<RelationConfig>][] = [
    [
      "tasks_relation",
      {
        fromModel: "parent",
        toModel: "task",
        foreignKey: "projectId",
        onDelete: "cascade",
      },
    ],
    [
      "profile_relation",
      {
        fromModel: "parent",
        toModel: "profile",
        foreignKey: "projectId",
        relationType: "one-to-one",
      },
    ],
    [
      "tags_relation",
      {
        fromModel: "parent",
        toModel: "tag",
        joinModel: "link",
        foreignKey: "projectId",
        inverseForeignKey: "tagId",
        relationType: "many-to-many",
        onDelete: "cascade",
      },
    ],
    [
      "notes_relation",
      {
        fromModel: "parent",
        toModel: "note",
        foreignKey: "projectId",
        onDelete: "setNull",
      },
    ],
  ];
  service.blocks.push(
    ...relations.map(([id, config]) =>
      block(id, "relation", {
        ...config,
        scopeFields: ["ownerId", "tenantId"],
      }),
    ),
  );
  service.blocks.push(
    block("transaction_delete", "transaction", {
      steps: ["parent_delete", "parent_delete"],
    }),
    block(
      "rollback_endpoint",
      "rest_endpoint",
      { route: "/parent/rollback/:id", method: "POST", authRequired: true },
      ["transaction_delete"],
    ),
    block("failure_response", "response", { status: 200, value: "Swallowed" }),
    block("catch_delete", "logic_trycatch", {
      program: {
        steps: ["parent_delete"],
        catchSteps: ["failure_response"],
        finallySteps: [],
      },
    }),
    block("catch_transaction", "transaction", { steps: ["catch_delete"] }),
    block(
      "catch_endpoint",
      "rest_endpoint",
      { route: "/parent/catch/:id", method: "POST", authRequired: true },
      ["catch_transaction"],
    ),
    block("raw_task_create", "rest_endpoint", {
      route: "/raw-task",
      method: "POST",
      modelId: "task",
      authRequired: true,
    }),
    block("raw_task_update", "rest_endpoint", {
      route: "/raw-task/:id",
      method: "PATCH",
      modelId: "task",
      authRequired: true,
    }),
    block("raw_parent_delete", "rest_endpoint", {
      route: "/raw-parent/:id",
      method: "DELETE",
      modelId: "parent",
      authRequired: true,
    }),
  );
  const project = emptyProject();
  return parseProject({
    ...project,
    backend: { ...project.backend, services: [service] },
  }).backend.services[0];
}

export function modelConfig(
  service: ReturnType<typeof relationsFixture>,
  id: string,
) {
  return service.blocks.find((b) => b.id === id)!.config as DbModelConfig;
}
