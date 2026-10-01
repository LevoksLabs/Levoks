import { readFileSync, mkdirSync, writeFileSync } from "node:fs";
import path from "node:path";
import JSZip from "jszip";
import { parseProject } from "../src/lib/project/schema";
import { compileProject } from "../src/lib/project/compiler";

// Consume the actual projects downloaded by the browser regression, not parallel fixtures.
async function main() {
const catalog = await JSZip.loadAsync(readFileSync(".verification/element-audit/application.zip"));
const snapshots = ["functional", "radio", "embed", "controls"].map(name => JSON.parse(readFileSync(`.verification/${name}-app/levoks.project.json`, "utf8")));
snapshots.push(JSON.parse(await catalog.file("levoks.project.json")!.async("string")));
const inputs = snapshots.map((snapshot, index) => {
  const input = parseProject(snapshot);
  const id = (old: string) => `fixture${index}_${old}`;
  input.editor.elementsById = Object.fromEntries(
    Object.values(input.editor.elementsById).map((node) => [
      id(node.id),
      {
        ...node,
        id: id(node.id),
        parentId: node.parentId ? id(node.parentId) : null,
        children: node.children.map(id),
      },
    ]),
  );
  input.editor.pageElementMap = Object.fromEntries(
    Object.entries(input.editor.pageElementMap).map(([page, roots]) => [
      page,
      roots.map(id),
    ]),
  );
  input.editor.rootIds = input.editor.rootIds.map(id);
  input.editor.globalRootIds = input.editor.globalRootIds.map(id);
  return input;
});
const project = inputs[0];
const pageRoots = inputs.map(
  (input) => input.editor.pageElementMap[input.editor.pages[0].id],
);
project.editor.pages = inputs.map((input, index) => ({
  ...input.editor.pages[0],
  id: `acceptance-${index}`,
  route: ["/", "/radio", "/embed", "/controls", "/catalog"][index],
}));
project.editor.elementsById = Object.assign(
  {},
  ...inputs.map((input) => input.editor.elementsById),
);
project.editor.pageElementMap = Object.fromEntries(
  pageRoots.map((roots, index) => [`acceptance-${index}`, roots]),
);
project.editor.activePageId = "acceptance-0";
const output = compileProject(project);
if (output.diagnostics.some((d) => d.severity === "error"))
  throw new Error(JSON.stringify(output.diagnostics));
for (const [name, source] of Object.entries(output.files)) {
  const file = path.resolve(".verification/property-app", name);
  mkdirSync(path.dirname(file), { recursive: true });
  writeFileSync(file, source);
}
console.log(
  "Prepared production application from browser-downloaded Tabs, Radio, Embed, Controls and full catalog projects.",
);

}
main().catch(error => { console.error(error); process.exitCode = 1; });
