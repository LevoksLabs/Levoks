import { canvasAppFixture } from "./canvas-app-fixture";
import { block } from "./program-fixture";
import { parseProject, backendBlockSchema } from "../../src/lib/project/schema";
import { ELEMENT_REGISTRY } from "../../src/lib/elements/registry";
import { DEFAULT_LAYOUT } from "../../src/lib/defaults";
import {
  restoreProject,
  captureProject,
} from "../../src/lib/project/workspace";
import { createSubmissionInbox } from "../../src/lib/submission-inbox";
import { fieldIdentity } from "../../src/lib/contracts";

export function liveDataFixture(bound = false, privateSource = false) {
  const fixture = canvasAppFixture(),
    form = fixture.form;
  let project = fixture.project;
  const home = project.editor.pages.find((p) => p.route === "/")!;
  const ids = new Set([form, ...project.editor.elementsById[form].children]);
  project.editor.elementsById = Object.fromEntries(
    Object.entries(project.editor.elementsById).filter(([id]) => ids.has(id)),
  );
  project.editor.pages = [home];
  project.editor.activePageId = home.id;
  project.editor.globalRootIds = [];
  project.editor.pageElementMap = { [home.id]: [form] };
  project.editor.rootIds = [form];
  project.editor.canvasSettings = {
    ...project.editor.canvasSettings,
    width: 1100,
    height: 1300,
  };
  project.routing.nodes = project.routing.nodes.filter(
    (n) => n.type === "service" || n.refId === home.id,
  );
  project.routing.connections = project.routing.connections.filter(
    (c) => c.id === "submit",
  );
  const service = project.backend.services[0],
    model = service.blocks.find((b) => b.type === "db_model")!;
  if (model.type !== "db_model") throw new Error("Missing model");
  model.config.fields = model.config.fields.map((f) => ({
    ...f,
    id: "field_" + f.name,
  }));
  const post = service.blocks.find((b) => b.id === "post")!;
  if (post.type !== "rest_endpoint") throw new Error("Missing POST");
  post.config.modelId = model.id;
  const add = (
    id: string,
    template: string,
    parentId: string | null,
    label: string,
    x: number,
    y: number,
  ) => {
    const sample = ELEMENT_REGISTRY[template].template;
    project.editor.elementsById[id] = {
      ...sample,
      id,
      parentId,
      label,
      children: [],
      layout: {
        ...DEFAULT_LAYOUT[sample.type],
        ...sample.layout,
        x,
        y,
        w: parentId ? 420 : 500,
        h: parentId ? 80 : 300,
        position: parentId ? "static" : "absolute",
      },
    };
    if (parentId) project.editor.elementsById[parentId].children.push(id);
    else project.editor.pageElementMap[home.id].push(id);
  };
  add("live_repeater", "repeater", null, "Entry repeater", 20, 710);
  add("repeater_card", "container", "live_repeater", "Repeater card", 0, 0);
  add("repeater_title", "text", "repeater_card", "Repeater title", 0, 0);
  add("repeater_quantity", "text", "repeater_card", "Repeater quantity", 0, 0);
  add("live_collection", "collection", null, "Entry collection", 550, 710);
  add("collection_title", "text", "live_collection", "Collection title", 0, 0);
  let endpointId = "live_list";
  if (privateSource) {
    project.editor.rootIds = [...project.editor.pageElementMap[home.id]];
    restoreProject(project);
    endpointId = createSubmissionInbox(service.id, "post");
    project = captureProject(project.id, project.name);
  } else {
    service.blocks.push(
      ...[
        block(
          endpointId,
          "rest_endpoint",
          {
            route: "/entries",
            method: "GET",
            modelId: model.id,
            queryParameters: [
              { name: "page", type: "number", required: false },
            ],
          },
          ["live_find", "live_response"],
        ),
        block("live_find", "query", {
          modelId: model.id,
          operation: "find",
          limit: 2,
          page: "$request.query.page",
          sortField: "_id",
          sortDirection: "asc",
          output: "records",
        }),
        block("live_response", "response", { status: 200, value: "$records" }),
      ].map((b) => backendBlockSchema.parse(b)),
    );
  }
  if (bound) {
    add("live_table", "table", null, "Entry table", 20, 370);
    for (const id of ["live_table", "live_repeater", "live_collection"])
      project.editor.elementsById[id].dataSource = {
        serviceId: service.id,
        endpointId,
        columns:
          id === "live_table"
            ? model.config.fields.map((f) => ({
                fieldId: fieldIdentity(f),
                label: f.name,
              }))
            : [],
        emptyMessage: "No entries yet.",
      };
    for (const id of ["repeater_title", "collection_title"])
      project.editor.elementsById[id].dataField = "field_title";
    project.editor.elementsById.repeater_quantity.dataField = "field_quantity";
  }
  project.editor.rootIds = [...project.editor.pageElementMap[home.id]];
  return {
    project: parseProject(project),
    form,
    serviceId: service.id,
    endpointId,
  };
}
