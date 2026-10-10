import { spawn } from "node:child_process";
import { readdir, readFile } from "node:fs/promises";
import path from "node:path";
import JSZip from "jszip";
import { compileProject } from "../src/lib/project/compiler";

async function run(args: string[]) {
  await new Promise<void>((resolve, reject) => {
    const child = spawn(process.execPath, args, {
      stdio: "inherit",
      windowsHide: true,
    });
    child.once("error", reject);
    child.once("exit", (code) =>
      code === 0
        ? resolve()
        : reject(
            new Error(
              `Point 4 verification failed (${code}): ${args.join(" ")}`,
            ),
          ),
    );
  });
}
async function main() {
  const npm = process.env.npm_execpath;
  if (!npm)
    throw new Error("Run this verification with npm run test:point4-export.");
  const tsx = path.resolve("node_modules/tsx/dist/cli.mjs");
  if (!process.argv.includes("--exports-only"))
    await run([
      path.resolve("node_modules/@playwright/test/cli.js"),
      "test",
      "--config",
      "playwright.point4.config.ts",
      ...[
        "attachments",
        "point4-completion",
        "design-tools",
        "animations",
        "point4-acceptance",
        "catalog-layout",
        "compound-form-conditions",
        "nested-editing",
        "responsive",
        "form-conditions",
        "radio-group",
        "checkbox-group",
        "select-metadata",
      ].map((name) => `tests/e2e/${name}.spec.ts`),
    ]);
  const exports = [
    ["attachment-export.zip", "attachment-app"],
    ["compound-export.zip", "compound-app"],
    ["point4-completion-export.zip", "point4-completion-app"],
    ...["studio", "portfolio", "workshop"].map((id) => [
      `starter-${id}-export.zip`,
      `starter-${id}-production`,
    ]),
  ];
  for (const [archive, directory] of exports) {
    const zip = await JSZip.loadAsync(
      await readFile(path.resolve(".verification", archive)),
    );
    const manifest = zip.file("levoks.project.json");
    if (!manifest) throw new Error(`Missing project manifest: ${archive}`);
    const compiled = compileProject(JSON.parse(await manifest.async("string")));
    if (compiled.diagnostics.some((d) => d.severity === "error"))
      throw new Error(`Invalid exported project: ${archive}`);
    for (const [name, source] of Object.entries(compiled.files)) {
      if ((await zip.file(name)?.async("string")) !== source)
        throw new Error(`Stale or mismatched export: ${archive}/${name}`);
    }
    console.info(`Verified ${archive} against the current compiler.`);
    const root = path.resolve(".verification", directory);
    // The shared extractor validates every path and confines replacement to .verification.
    await run([
      tsx,
      "scripts/prepare-canvas-verification.ts",
      path.resolve(".verification", archive),
      root,
    ]);
    const packages = [
      "frontend",
      ...(
        await readdir(path.join(root, "backend"), {
          withFileTypes: true,
        }).catch((error: NodeJS.ErrnoException) => {
          if (error.code === "ENOENT") return [];
          throw error;
        })
      )
        .filter((entry) => entry.isDirectory())
        .map((service) => `backend/${service.name}`),
    ];
    for (const folder of packages) {
      await run([
        npm,
        "install",
        "--prefix",
        path.join(root, folder),
        "--ignore-scripts",
      ]);
      await run([npm, "run", "build", "--prefix", path.join(root, folder)]);
    }
  }
  await run([
    tsx,
    "--test",
    ...[
      "attachments",
      "compound-form-conditions",
      "site-starters",
      "point4-completion",
    ].map((name) => `tests/generated/${name}-runtime.test.ts`),
  ]);
}
void main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
