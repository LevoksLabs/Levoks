import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import {
  emptyProject,
  restoreProject,
  captureProject,
} from "../src/lib/project/workspace";
import { useEditorStore } from "../src/store/editorStore";
import { useBackendStore } from "../src/store/backendStore";
import { siteTemplates } from "../src/templates/siteTemplates";
import { templates } from "../src/templates";
import { compileProject } from "../src/lib/project/compiler";

async function main() {
  const project = emptyProject("Verification project");
  restoreProject(project);
  useEditorStore.getState().loadTemplate(siteTemplates[0].elements);
  const firstForm = useEditorStore.getState().addElement(templates.form);
  useEditorStore.getState().addPage("Contact");
  useEditorStore.getState().addElement(templates.form);
  useBackendStore.getState().loadCrudTemplate();
  useBackendStore.getState().loadAuthTemplate();
  const snapshot = captureProject(project.id, project.name);
  const service = snapshot.backend.services[0];
  const endpoint = service.blocks.find(
    (block) => block.type === "rest_endpoint" && block.config.method === "POST",
  )!;
  snapshot.routing.nodes = [
    {
      id: "page_node",
      type: "page",
      refId: snapshot.editor.pages[0].id,
      position: { x: 0, y: 0 },
      width: 240,
      height: 180,
    },
    {
      id: "service_node",
      type: "service",
      refId: service.id,
      position: { x: 400, y: 0 },
      width: 240,
      height: 180,
    },
  ];
  snapshot.routing.connections = [
    {
      id: "form_edge",
      fromNodeId: "page_node",
      toNodeId: "service_node",
      fromPortId: `page_node:out:${firstForm}`,
      toPortId: `service_node:in:${endpoint.id}`,
    },
  ];
  const compilation = compileProject(snapshot);
  const errors = compilation.diagnostics.filter(
    (item) => item.severity === "error",
  );
  if (errors.length) throw new Error(JSON.stringify(errors));
  const { files } = compilation;
  const root = path.resolve(".verification");
  for (const [file, source] of Object.entries(files)) {
    const target = path.resolve(root, file);
    if (!target.startsWith(root + path.sep)) throw new Error("Unsafe path");
    await mkdir(path.dirname(target), { recursive: true });
    await writeFile(target, source);
  }
  console.log(
    `Generated ${Object.keys(files).length} fixture files in .verification/`,
  );
}
void main();
