import { mkdir, writeFile } from "node:fs/promises";
import { resolve, dirname } from "node:path";
import { compileProject } from "../src/lib/project/compiler";
import { emptyProject } from "../src/lib/project/workspace";
import { parseProject } from "../src/lib/project/schema";
import { defaultDatabase } from "../src/lib/backend/database";
import { modelLifecycleFixture } from "../tests/helpers/model-lifecycle-fixture";
import { createProjectZip } from "../src/lib/codegen/exporter";

async function main() {
  const initial = emptyProject("Container acceptance");
  const service = {
    ...modelLifecycleFixture(),
    database: defaultDatabase("sqlite"),
  };
  const project = parseProject({
    ...initial,
    backend: { ...initial.backend, services: [service] },
  });
  const { files, diagnostics } = compileProject(project);
  if (diagnostics.some((value) => value.severity === "error"))
    throw new Error("Acceptance fixture has compiler errors.");
  const root = resolve(".verification/runtime-test/container-release");
  for (const [name, content] of Object.entries(files)) {
    const path = resolve(root, name);
    await mkdir(dirname(path), { recursive: true });
    await writeFile(path, content);
  }
  await writeFile(resolve(root, "release.zip"), await createProjectZip(files));
  console.log("Prepared the exported container acceptance release.");
}
void main();
