import test from "node:test";
import assert from "node:assert/strict";
import { readdir, readFile } from "node:fs/promises";
import path from "node:path";

test("production traces and standalone output exclude disposable preview and test data", async () => {
  const files = await readdir(".next", { recursive: true });
  const traces = files.filter((file) => file.endsWith(".nft.json"));
  assert.ok(traces.length > 0, "Run npm run build first");
  for (const file of traces) {
    const trace = JSON.parse(await readFile(path.join(".next", file), "utf8"));
    for (const dependency of trace.files)
      assert.doesNotMatch(
        dependency.replaceAll("\\", "/"),
        /(?:^|\/)(?:\.levoks-preview|\.verification)(?:\/|$)/,
        `${file} packages private runtime data`,
      );
  }
  const standalone = await readdir(".next/standalone", { recursive: true });
  assert.ok(standalone.includes("server.js"));
  for (const file of standalone)
    assert.doesNotMatch(
      file.replaceAll("\\", "/"),
      /(?:^|\/)(?:\.levoks-preview|\.verification)(?:\/|$)/,
    );
});
