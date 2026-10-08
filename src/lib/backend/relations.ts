import type {
  DbModelConfig,
  RelationConfig,
  SemanticBackendService,
} from "@/types/backend";
import type { IRDiagnostic } from "@/types/ir";
import { isSql } from "./database";

/** Relation direction: parent (from) → dependent (to), or an explicit junction. */
export function relationEdges(config: RelationConfig) {
  const shared = {
    onDelete: config.onDelete || "restrict",
    scopeFields: config.scopeFields || [],
  };
  return config.relationType === "many-to-many"
    ? [
        {
          ...shared,
          parent: config.fromModel,
          child: config.joinModel || "",
          field: config.foreignKey,
        },
        {
          ...shared,
          parent: config.toModel,
          child: config.joinModel || "",
          field: config.inverseForeignKey || "",
        },
      ]
    : [
        {
          ...shared,
          parent: config.fromModel,
          child: config.toModel,
          field: config.foreignKey,
        },
      ];
}

export function relationDiagnostics(
  service: SemanticBackendService,
): IRDiagnostic[] {
  const diagnostics: IRDiagnostic[] = [];
  const fail = (nodeId: string, message: string) =>
    diagnostics.push({
      severity: "error",
      code: "UNSUPPORTED_CONFIGURATION",
      nodeId,
      message,
    });
  const models = new Map(
    service.blocks
      .filter((b) => b.type === "db_model")
      .map((b) => [b.id, b.config as DbModelConfig]),
  );
  const relations = service.blocks.filter((b) => b.type === "relation");
  const foreignKeys = new Set<string>();
  const cascade = new Map<string, string[]>();
  const protectedFields = [
    ...new Set(
      service.blocks
        .filter((b) => b.type === "access_policy")
        .flatMap((b) => {
          const c = b.config as { ownerField: string; tenantField: string };
          return [c.ownerField, c.tenantField].filter(Boolean);
        }),
    ),
  ];
  for (const block of relations) {
    const c = block.config as RelationConfig;
    if (isSql(service.database))
      fail(
        block.id,
        "Relations currently require a MongoDB service with a replica set. SQL referential constraints need a reviewed migration before export.",
      );
    if (block.connections.length)
      fail(
        block.id,
        "Relations configure models; they cannot contain workflow steps.",
      );
    const ids = [
      c.fromModel,
      c.toModel,
      ...(c.relationType === "many-to-many" ? [c.joinModel || ""] : []),
    ];
    if (ids.some((id) => !models.has(id)))
      fail(
        block.id,
        "Choose existing models in this service for both sides and, for many-to-many, a junction model.",
      );
    if (new Set(ids).size !== ids.length)
      fail(block.id, "Each side and the junction must use a distinct model.");
    if (
      ids.some((id) =>
        models.get(id)?.fields.some((f) => f.name === "password"),
      )
    )
      fail(
        block.id,
        "Identity models cannot participate in resource relations.",
      );
    if (new Set(c.scopeFields || []).size !== (c.scopeFields || []).length)
      fail(block.id, "Relationship scope fields must be distinct.");
    for (const field of protectedFields)
      if (!c.scopeFields?.includes(field))
        fail(
          block.id,
          `Include policy field ${field} in the relationship scope to prevent cross-owner or cross-tenant links.`,
        );
    for (const field of c.scopeFields || []) {
      const fields = ids.map((id) =>
        models.get(id)?.fields.find((f) => f.name === field),
      );
      if (
        fields.some(
          (f) => !f?.required || !["string", "objectId"].includes(f.type),
        ) ||
        new Set(fields.map((f) => f?.type)).size !== 1 ||
        /password|secret|token/i.test(field)
      )
        fail(
          block.id,
          `Scope field ${field} must be a required string or ObjectId with the same type on every related model.`,
        );
    }
    if (
      c.relationType === "many-to-many" &&
      c.foreignKey === c.inverseForeignKey
    )
      fail(block.id, "The junction needs two distinct foreign-key fields.");
    for (const edge of relationEdges(c)) {
      const key = `${edge.child}:${edge.field}`;
      if (foreignKeys.has(key))
        fail(
          block.id,
          "Each foreign-key field can belong to only one relation.",
        );
      foreignKeys.add(key);
      const child = models.get(edge.child),
        parent = models.get(edge.parent);
      const field = child?.fields.find((f) => f.name === edge.field);
      if (
        !field ||
        field.type !== "objectId" ||
        /password|secret|token/i.test(edge.field)
      )
        fail(
          block.id,
          "Choose a non-sensitive ObjectId field on the dependent or junction model.",
        );
      if (field?.unique)
        fail(
          block.id,
          "Remove field-level Unique from the foreign key; the relation supplies its cardinality index.",
        );
      if (field?.ref && field.ref !== parent?.tableName)
        fail(
          block.id,
          "The foreign key's model reference conflicts with the relation.",
        );
      if (c.scopeFields?.includes(edge.field))
        fail(
          block.id,
          "A foreign key cannot also be a relationship scope field.",
        );
      if (edge.onDelete === "setNull" && field?.required)
        fail(
          block.id,
          "Unlink on delete requires an optional foreign-key field.",
        );
      if (c.relationType === "many-to-many" && !field?.required)
        fail(block.id, "Both junction foreign-key fields must be required.");
      if (edge.onDelete === "cascade")
        cascade.set(edge.parent, [
          ...(cascade.get(edge.parent) || []),
          edge.child,
        ]);
    }
  }
  const visiting = new Set<string>(),
    checked = new Map<string, boolean>();
  const reaches = (id: string): boolean => {
    if (visiting.has(id)) return true;
    if (checked.has(id)) return checked.get(id)!;
    visiting.add(id);
    const result = (cascade.get(id) || []).some(reaches);
    visiting.delete(id);
    checked.set(id, result);
    return result;
  };
  for (const block of relations)
    if (
      relationEdges(block.config as RelationConfig).some((e) =>
        reaches(e.parent),
      )
    )
      fail(
        block.id,
        "Cascade relationships must not form a cycle. Use Restrict or Unlink on one edge.",
      );
  return diagnostics;
}
