import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import {
  emptyProject,
  restoreProject,
  captureProject,
} from "../src/lib/project/workspace";
import { useBackendStore } from "../src/store/backendStore";
import { compileProject } from "../src/lib/project/compiler";
async function main() {
  const project = emptyProject("Account workflow verification");
  restoreProject(project);
  useBackendStore.getState().loadAuthTemplate();
  const service = useBackendStore.getState().services[0];
  const auth = service.blocks.find((b) => b.type === "auth_block")!;
  useBackendStore
    .getState()
    .updateBlockConfig(service.id, auth.id, {
      tokenExpiry: "3s",
      requireVerifiedEmail: true,
    });
  const output = compileProject(captureProject(project.id, project.name));
  const errors = output.diagnostics.filter((d) => d.severity === "error");
  if (errors.length) throw new Error(JSON.stringify(errors));
  const root = path.resolve(".verification/account-e2e");
  for (const [file, source] of Object.entries(output.files)) {
    const destination = path.resolve(root, file);
    if (!destination.startsWith(root + path.sep))
      throw new Error("Unsafe fixture path");
    await mkdir(path.dirname(destination), { recursive: true });
    await writeFile(destination, source);
  }
  console.info(`Generated account E2E fixture in ${root}`);
}
void main();
