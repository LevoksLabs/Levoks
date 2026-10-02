import test from "node:test";
import assert from "node:assert/strict";
import {
  defaultDatabase,
  databaseSchema,
  DATABASE_ENGINES,
} from "../src/lib/backend/database";
import { emptyProject } from "../src/lib/project/workspace";
import { parseProject } from "../src/lib/project/schema";
import { compileProject } from "../src/lib/project/compiler";
import { modelLifecycleFixture } from "./helpers/model-lifecycle-fixture";
import { block } from "./helpers/program-fixture";
import { databaseCompose, databaseFiles } from "../src/lib/codegen/database";

test("mixed database exports retain existing MongoDB volume and connection names", () => {
  const legacy = { ...modelLifecycleFixture(), name: "Legacy" };
  const second = { ...modelLifecycleFixture(), name: "Second" };
  const sql = {
    ...modelLifecycleFixture(),
    name: "SQL",
    database: defaultDatabase("postgresql"),
  };
  const compose = databaseCompose([legacy, second, sql], [legacy, second, sql]);
  assert.match(databaseFiles(legacy)["database.js"], /mongodb:\/\/localhost:27017\/auth_db/);
  assert.equal((compose.match(/^  mongodb:/gm) || []).length, 1);
  assert.match(compose, /mongo-data:\/data\/db/);
  assert.match(compose, /mongodb:\/\/mongodb:27017\/legacy_db/);
  assert.match(compose, /sql-data:\/var\/lib\/postgresql\/data/);
  const collision = {...sql, name: "SQL Database"};
  const collisionCompose = databaseCompose([sql, collision], [sql, collision]);
  assert.match(collisionCompose, /^  sql-database-2:/m);
});

test("database engine and storage choices survive persistence and change the complete export", () => {
  for (const engine of Object.keys(DATABASE_ENGINES) as Array<
    keyof typeof DATABASE_ENGINES
  >) {
    for (const location of engine === "sqlite"
      ? (["local"] as const)
      : (["local", "remote"] as const)) {
      const service = {
        ...modelLifecycleFixture(),
        database: {
          ...defaultDatabase(engine),
          location,
          tls: location === "remote",
          connectionEnv: "CUSTOM_DB",
        },
      };
      const original = emptyProject("Databases");
      const project = parseProject({
        ...original,
        backend: { ...original.backend, services: [service] },
      });
      const result = compileProject(project);
      assert.deepEqual(
        result.diagnostics.filter((d) => d.severity === "error"),
        [],
        engine,
      );
      assert.deepEqual(project.backend.services[0].database, service.database);
      const manifest = JSON.parse(
        result.files["backend/workflow-service/package.json"],
      );
      assert.equal(
        Boolean(manifest.dependencies.mongoose),
        engine === "mongodb",
      );
      assert.equal(Boolean(manifest.dependencies.knex), engine !== "mongodb");
      assert.match(
        result.files["backend/workflow-service/.env.example"],
        /CUSTOM_DB=/,
      );
      const compose = result.files["backend/docker-compose.yml"];
      if (location === "remote") {
        assert.doesNotMatch(compose, /image:|volumes:/);
        assert.match(compose, /WORKFLOW_SERVICE_CUSTOM_DB/);
        assert.match(result.files["backend/.env.example"], /WORKFLOW_SERVICE_CUSTOM_DB=/);
      } else assert.match(compose, /workflow-service-data/);
      if (engine !== "mongodb") {
        assert.ok(manifest.scripts["db:migrate"]);
        assert.match(
          result.files["backend/workflow-service/workflow/index.js"],
          /require\("..\/database"\)/,
        );
        assert.equal(
          JSON.parse(result.files["levoks.ir.json"]).backend.target,
          "express-database",
        );
      }
    }
  }
});

test("database validation rejects unsafe destinations and incompatible capabilities before export", () => {
  for (const changes of [
    { engine: "unknown" },
    { engine: "sqlite", location: "remote" },
    { fileName: "../private.db" },
    { connectionEnv: "DATABASE_URL\nPASSWORD=x" },
    { connectionEnv: "JWT_SECRET" },
  ])
    assert.equal(
      databaseSchema.safeParse({ ...defaultDatabase(), ...changes }).success,
      false,
    );
  for (const extra of [
    block("audit", "audit_log"),
    block("secret", "env_var", {
      key: "DATABASE_URL",
      value: "postgresql://private:secret@db/app",
    }),
    block("limit", "middleware", {
      middlewareType: "rateLimit",
      rateLimitStore: "mongodb",
    }),
  ]) {
    const service = {
      ...modelLifecycleFixture(),
      database: defaultDatabase("postgresql"),
    };
    service.blocks.push(extra);
    const original = emptyProject("Invalid database");
    const result = compileProject(
      parseProject({
        ...original,
        backend: { ...original.backend, services: [service] },
      }),
    );
    assert.ok(result.diagnostics.some((d) => d.severity === "error"));
    assert.ok(!result.files["backend/workflow-service/server.js"]);
  }
});
