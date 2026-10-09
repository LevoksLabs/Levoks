// Next's Windows trace filtering joins globs with backslashes, leaving private files in output.
// Keep the exclusions in next.config.ts and enforce this boundary on the final build too.
import { readdir, readFile, writeFile, rm } from "node:fs/promises";
import path from "node:path";

const build = path.resolve(process.env.LEVOKS_DEPLOYMENT_API_TEST === "1" ? ".next-deployment-api" : process.env.LEVOKS_E2E === "1" ? ".next-e2e" : ".next"),
  standalone = path.join(build, "standalone");
const privatePath = /(?:^|\/)(?:\.levoks-preview|\.verification)(?:\/|$)/;
let removed = 0;
for (const file of await readdir(build, { recursive: true })) {
  if (!file.endsWith(".nft.json")) continue;
  const target = path.join(build, file);
  const trace = JSON.parse(await readFile(target, "utf8"));
  const retained = trace.files
    .map((file, index) => ({ file, index }))
    .filter(({ file }) => !privatePath.test(file.replaceAll("\\", "/")));
  if (retained.length === trace.files.length) continue;
  removed += trace.files.length - retained.length;
  trace.files = retained.map(({ file }) => file);
  if (trace.fileHashes)
    trace.fileHashes = retained.map(({ index }) => trace.fileHashes[index]);
  if (trace.symlinks)
    trace.symlinks = Object.fromEntries(
      retained.flatMap(({ index }, next) =>
        Object.hasOwn(trace.symlinks, index)
          ? [[next, trace.symlinks[index]]]
          : [],
      ),
    );
  await writeFile(target, JSON.stringify(trace));
}
async function prune(directory) {
  for (const entry of await readdir(directory, { withFileTypes: true })) {
    const target = path.resolve(directory, entry.name);
    if (!target.startsWith(standalone + path.sep))
      throw new Error("Invalid standalone cleanup path");
    if ([".levoks-preview", ".verification"].includes(entry.name)) {
      // Only disposable copies inside the build are removed; project/runtime data stays intact.
      await rm(target, { recursive: true, force: true });
    } else if (entry.isDirectory() && !entry.isSymbolicLink())
      await prune(target);
  }
}
await prune(standalone);
console.log(
  `Excluded ${removed} private runtime references from production traces.`,
);
