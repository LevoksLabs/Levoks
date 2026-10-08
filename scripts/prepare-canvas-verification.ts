import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import JSZip from "jszip";
import { validateFiles } from "../src/lib/codegen/files";
async function main() {
  const archive = await JSZip.loadAsync(
    await readFile(process.argv[2] || ".verification/canvas-export.zip"),
  );
  const files = validateFiles(
    Object.fromEntries(
      await Promise.all(
        Object.values(archive.files)
          .filter((file) => !file.dir)
          .map(async (file) => [file.name, await file.async("string")]),
      ),
    ),
  );
  const root = path.resolve(process.argv[3] || ".verification/canvas-app");
  for (const [file, source] of Object.entries(files)) {
    const destination = path.resolve(root, file);
    if (!destination.startsWith(root + path.sep))
      throw new Error("Unsafe export path");
    await mkdir(path.dirname(destination), { recursive: true });
    await writeFile(destination, source);
  }
  console.info(
    `Extracted ${Object.keys(files).length} actual downloaded application files.`,
  );
}
void main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
