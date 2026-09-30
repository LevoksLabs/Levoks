import { mkdirSync, writeFileSync } from "node:fs";
import { parseProject } from "../src/lib/project/schema";
import path from "node:path";
import {
  ELEMENT_DEFINITIONS,
  elementTemplate,
} from "../src/lib/elements/registry";
import { customTemplate } from "../src/lib/elements/custom";
import {
  emptyProject,
  restoreProject,
  captureProject,
} from "../src/lib/project/workspace";
import { compileProject } from "../src/lib/project/compiler";
import { useEditorStore } from "../src/store/editorStore";
import { programFixture } from "../tests/helpers/program-fixture";

const project = emptyProject("Semantic verification");
restoreProject(project);
const store = useEditorStore.getState();
for (const [index, definition] of ELEMENT_DEFINITIONS.entries())
  store.addElement(
    elementTemplate(definition.id),
    undefined,
    (index % 3) * 500,
    Math.floor(index / 3) * 350,
  );
store.addPage("Details");
store.switchPage(project.editor.activePageId);
const custom = {
  name: "PricingCard",
  version: 1 as const,
  framework: "react" as const,
  description: "Export verification",
  source:
    "export default function PricingCard({ title }) { return <article>{title}</article>; }",
  props: { title: { type: "string" as const, default: "Custom component" } },
  events: [],
  children: false,
  dependencies: {},
};
store.setCustomElement("pricing", custom);
store.addElement(customTemplate("pricing", custom));
const saved = captureProject(project.id, project.name);
saved.backend.services = parseProject({
  ...saved,
  backend: { services: [programFixture()], connections: [] },
}).backend.services;
const output = compileProject(saved);
if (output.diagnostics.some((d) => d.severity === "error"))
  throw new Error(JSON.stringify(output.diagnostics));
for (const [name, content] of Object.entries(output.files)) {
  const file = path.resolve(".verification/semantic-app", name);
  mkdirSync(path.dirname(file), { recursive: true });
  writeFileSync(file, content);
}
console.log(
  `Prepared ${ELEMENT_DEFINITIONS.length} definitions, custom source, two pages and an executable backend workflow.`,
);
