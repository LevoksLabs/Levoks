import test from "node:test";
import assert from "node:assert/strict";
import { Script } from "node:vm";
import { compileProject } from "../src/lib/project/compiler";
import {
  emptyProject,
  captureProject,
  restoreProject,
} from "../src/lib/project/workspace";
import { parseProject, backendBlockSchema } from "../src/lib/project/schema";
import { relationDiagnostics } from "../src/lib/backend/relations";
import { defaultDatabase } from "../src/lib/backend/database";
import { useBackendStore } from "../src/store/backendStore";
import { projectHistory } from "../src/store/projectHistory";
import { relationsFixture, modelConfig } from "./helpers/relations-fixture";
import { block } from "./helpers/program-fixture";
import type { RelationConfig } from "../src/types/backend";

test("relations persist through history/IR and generate cardinality, references and transactional CRUD", () => {
  const project = emptyProject("Relationships");
  project.backend.services = [relationsFixture()];
  restoreProject(project);
  const id = project.backend.services[0].id;
  useBackendStore
    .getState()
    .updateBlockConfig(id, "profile_relation", { onDelete: "cascade" });
  projectHistory.undo();
  const saved = parseProject(captureProject(project.id, project.name));
  assert.equal(
    (
      saved.backend.services[0].blocks.find((b) => b.id === "profile_relation")!
        .config as RelationConfig
    ).onDelete,
    "restrict",
  );
  const result = compileProject(saved);
  assert.deepEqual(
    result.diagnostics.filter((d) => d.severity === "error"),
    [],
  );
  const files = result.files;
  const root = "backend/relations-service/";
  assert.match(
    files[root + "models/Profile.js"],
    /unique: true, partialFilterExpression/,
  );
  assert.match(
    files[root + "models/ProjectTag.js"],
    /\{"projectId":1,"tagId":1\}.*unique: true/,
  );
  assert.match(files[root + "models/Task.js"], /ref: "Project"/);
  assert.match(
    files[root + "routes/index.js"],
    /require\('\.\.\/relations'\).mutate/,
  );
  assert.match(
    files[root + "workflow/index.js"],
    /require\('\.\.\/relations'\)/,
  );
  assert.match(files[root + "server.js"], /relations'\).initialize/);
  assert.match(files["backend/docker-compose.yml"], /--replSet/);
  assert.match(files["backend/docker-compose.yml"], /mongo-data/);
  assert.match(files["backend/docker-compose.yml"], /replicaSet=rs0/);
  for (const [name, source] of Object.entries(files))
    if (name.startsWith(root) && name.endsWith(".js"))
      assert.doesNotThrow(() => new Script(source, { filename: name }), name);
});

test("relations reject invalid foreign keys, scope gaps, cascade cycles and incompatible storage", () => {
  const service = relationsFixture();
  const relation = service.blocks.find((b) => b.id === "tasks_relation")!
    .config as RelationConfig;
  relation.scopeFields = ["ownerId"];
  relation.foreignKey = "title";
  relation.onDelete = "setNull";
  modelConfig(service, "task").fields.find(
    (f) => f.name === "title",
  )!.required = true;
  service.database = defaultDatabase("sqlite");
  const issues = relationDiagnostics(service);
  for (const phrase of ["MongoDB", "tenantId", "ObjectId", "optional"])
    assert.ok(
      issues.some((d) => d.message.includes(phrase)),
      phrase,
    );
  relation.foreignKey = "projectId";
  relation.onDelete = "cascade";
  modelConfig(service, "parent").fields.push({
    name: "taskId",
    type: "objectId",
    required: false,
  });
  service.blocks.push(
    backendBlockSchema.parse(
      block("cycle", "relation", {
        fromModel: "task",
        toModel: "parent",
        foreignKey: "taskId",
        onDelete: "cascade",
        scopeFields: ["ownerId", "tenantId"],
      }),
    ),
  );
  assert.ok(relationDiagnostics(service).some((d) => /cycle/.test(d.message)));
  const project = emptyProject();
  project.backend.services = [service];
  assert.ok(
    !Object.keys(compileProject(parseProject(project)).files).some((name) =>
      name.startsWith("backend/"),
    ),
  );
});

test("legacy relation configs retain restrict semantics and require explicit missing model repairs", () => {
  const project = emptyProject();
  const service = relationsFixture();
  const config = service.blocks.find((b) => b.id === "profile_relation")!
    .config as RelationConfig;
  delete config.onDelete;
  project.backend.services = [service];
  assert.deepEqual(
    compileProject(parseProject(project)).diagnostics.filter(
      (d) => d.severity === "error",
    ),
    [],
  );
  config.toModel = "missing";
  assert.ok(
    relationDiagnostics(service).some((d) => /existing models/.test(d.message)),
  );
});

test("cascade cycle validation handles a shared branching graph without enumerating every path", () => {
  const service = {
    ...relationsFixture(),
    blocks: [] as ReturnType<typeof relationsFixture>["blocks"],
  };
  for (let level = 0; level < 25; level++)
    for (let side = 0; side < 2; side++) {
      const id = `node_${level}_${side}`;
      service.blocks.push(
        backendBlockSchema.parse(
          block(id, "db_model", {
            tableName: `Node${level}X${side}`,
            fields: [
              { name: "leftId", type: "objectId", required: false },
              { name: "rightId", type: "objectId", required: false },
            ],
          }),
        ),
      );
      if (level)
        for (let parent = 0; parent < 2; parent++)
          service.blocks.push(
            backendBlockSchema.parse(
              block(`${id}_rel_${parent}`, "relation", {
                fromModel: `node_${level - 1}_${parent}`,
                toModel: id,
                foreignKey: parent ? "rightId" : "leftId",
                onDelete: "cascade",
              }),
            ),
          );
    }
  assert.deepEqual(relationDiagnostics(service), []);
  service.blocks.push(
    backendBlockSchema.parse(
      block("cycle", "relation", {
        fromModel: "node_24_1",
        toModel: "node_0_0",
        foreignKey: "leftId",
        onDelete: "cascade",
      }),
    ),
  );
  assert.ok(relationDiagnostics(service).some((d) => /cycle/.test(d.message)));
});
