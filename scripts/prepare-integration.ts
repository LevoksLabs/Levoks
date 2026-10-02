import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { generateServiceCode } from "../src/lib/codegen/express";
import { programFixture } from "../tests/helpers/program-fixture";
import { defaultDatabase } from "../src/lib/backend/database";

async function prepare() {
  const root = path.resolve(".verification/runtime-test");
  const files = generateServiceCode(programFixture());
  const manifest = JSON.parse(files["workflow-service/package.json"]);
  for (const engine of ["sqlite", "postgresql", "mysql"] as const) {
    const sql = generateServiceCode({...programFixture(), database: defaultDatabase(engine)});
    Object.assign(manifest.dependencies, JSON.parse(sql["workflow-service/package.json"]).dependencies);
  }
  await mkdir(root, { recursive: true });
  // Use the generated application's actual dependencies for HTTP/database tests.
  await writeFile(
    path.join(root, "package.json"),
    JSON.stringify(manifest, null, 2),
  );
}
void prepare();
