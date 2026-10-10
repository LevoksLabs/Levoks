import { spawn } from "node:child_process";
import { readdir } from "node:fs/promises";
import path from "node:path";

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
  await run([
    path.resolve("node_modules/@playwright/test/cli.js"),
    "test",
    ...[
      "attachments",
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
    ...["studio", "portfolio", "workshop"].map((id) => [
      `starter-${id}-export.zip`,
      `starter-${id}-production`,
    ]),
  ];
  for (const [archive, directory] of exports) {
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
      ...(await readdir(path.join(root, "backend"))).map(
        (service) => `backend/${service}`,
      ),
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
    ...["attachments", "compound-form-conditions", "site-starters"].map(
      (name) => `tests/generated/${name}-runtime.test.ts`,
    ),
  ]);
}
void main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
