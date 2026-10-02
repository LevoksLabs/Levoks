import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import JSZip from "jszip";
import { mappedLoginFixture } from "../tests/helpers/mapped-login-fixture";
import { compileProject } from "../src/lib/project/compiler";
import { createProjectZip } from "../src/lib/codegen/exporter";
async function main() {
  const { project } = mappedLoginFixture();
  const output = compileProject(project);
  const errors = output.diagnostics.filter((d) => d.severity === "error");
  if (errors.length) throw new Error(JSON.stringify(errors));
  const root = path.resolve(".verification/mapped-login-e2e");
  await mkdir(root, { recursive: true });
  const bytes = await createProjectZip(output.files);
  await writeFile(path.join(root, "export.zip"), bytes);
  const zip = await JSZip.loadAsync(bytes);
  for (const entry of Object.values(zip.files)) {
    if (entry.dir) continue;
    const destination = path.resolve(root, entry.name);
    if (!destination.startsWith(root + path.sep))
      throw new Error("Unsafe fixture path");
    await mkdir(path.dirname(destination), { recursive: true });
    await writeFile(destination, await entry.async("nodebuffer"));
  }
  console.info(`Exported ZIP and extracted runnable project: ${root}`);
}
void main();
