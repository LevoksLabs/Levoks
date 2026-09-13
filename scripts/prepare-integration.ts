import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { generateServiceCode } from "../src/lib/codegen/express";
import { programFixture } from "../tests/helpers/program-fixture";

async function prepare() {
  const root = path.resolve(".verification/runtime-test");
  const files = generateServiceCode(programFixture());
  await mkdir(root, { recursive: true });
  // Use the generated application's actual dependencies for HTTP/database tests.
  await writeFile(
    path.join(root, "package.json"),
    files["workflow-service/package.json"],
  );
}
void prepare();
