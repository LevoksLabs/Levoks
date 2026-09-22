import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { compileProject } from "../src/lib/project/compiler";
import { designFixture } from "../tests/helpers/design-fixture";
async function main() {
  const fixture = designFixture(),
    output = compileProject(fixture.project);
  const failures = output.diagnostics.filter(
    (item) => item.severity === "error",
  );
  if (failures.length) throw new Error(JSON.stringify(failures));
  for (const [file, source] of Object.entries(output.files)) {
    const target = path.resolve(".verification/design-app", file);
    await mkdir(path.dirname(target), { recursive: true });
    await writeFile(target, source);
  }
  await writeFile(".verification/design-fixture.json", JSON.stringify(fixture));
  console.log(
    `Prepared ${Object.keys(output.files).length} generated files for build and runtime verification.`,
  );
}
void main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
