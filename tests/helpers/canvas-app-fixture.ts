import {
  emptyProject,
  restoreProject,
  captureProject,
} from "../../src/lib/project/workspace";
import { parseProject } from "../../src/lib/project/schema";
import { useEditorStore } from "../../src/store/editorStore";
import { templates } from "../../src/templates";
import { block, programFixture } from "./program-fixture";

export function canvasAppFixture() {
  const initial = emptyProject("Canvas application");
  restoreProject(initial);
  const editor = useEditorStore.getState();
  editor.updateCanvasSettings({ width: 1000, height: 900 });
  const form = editor.addElement(
    {
      ...templates.form,
      children: [],
      label: "Create entry",
      layout: { w: 400, h: 240 },
    },
    undefined,
    40,
    40,
  );
  const title = editor.addElement(
    {
      ...templates.input,
      layout: { position: "static" },
      props: { name: "title", placeholder: "Entry title", required: true },
    },
    form,
  );
  editor.addElement(
    {
      ...templates.input,
      layout: { position: "static" },
      props: {
        name: "quantity",
        inputType: "number",
        placeholder: "Quantity",
        required: true,
      },
    },
    form,
  );
  editor.addElement(
    {
      ...templates.input,
      props: { name: "active", inputType: "checkbox" },
      layout: { position: "static", w: 20, h: 20 },
      styles: { width: "20px", padding: 0 },
    },
    form,
  );
  editor.addElement(
    {
      ...templates.button,
      props: { label: "Save entry" },
      layout: { position: "static" },
    },
    form,
  );
  const menu = editor.addElement(
    {
      ...templates.menu,
      props: { items: "Browse entries" },
      layout: { w: 400, h: 60 },
    },
    undefined,
    40,
    320,
  );
  const social = editor.addElement(
    {
      ...templates.socialbar,
      props: { facebook: true },
      layout: { w: 400, h: 60 },
    },
    undefined,
    40,
    400,
  );
  const animated = editor.addElement(
    {
      ...templates.text,
      props: { content: "Scroll animation" },
      animation: {
        type: "fadeIn",
        trigger: "onScroll",
        duration: 0.1,
        delay: 0,
        easing: "linear",
        iterationCount: 1,
        direction: "normal",
        fillMode: "forwards",
      },
    },
    undefined,
    40,
    480,
  );
  const details = editor.addPage("Saved entries");
  editor.updatePageRoute(details, "/entries");
  editor.addElement(
    { ...templates.title, props: { content: "Entry saved" } },
    undefined,
    40,
    40,
  );
  const back = editor.addElement(
    { ...templates.button, props: { label: "Back to form" } },
    undefined,
    40,
    120,
  );
  const lookup = editor.addElement(
    {
      ...templates.form,
      children: [],
      label: "Find entry",
      layout: { w: 400, h: 180 },
    },
    undefined,
    40,
    230,
  );
  editor.addElement(
    {
      ...templates.input,
      layout: { position: "static" },
      props: { name: "id", placeholder: "Entry ID", required: true },
    },
    lookup,
  );
  editor.addElement(
    {
      ...templates.button,
      props: { label: "Find entry" },
      layout: { position: "static" },
    },
    lookup,
  );
  editor.switchPage(initial.editor.activePageId);
  const project = captureProject(initial.id, initial.name);
  project.backend.services = parseProject({
    ...project,
    backend: {
      services: [
        {
          ...programFixture(),
          name: "Entries",
          port: 4101,
          blocks: [
            block("model", "db_model", {
              tableName: "Entry",
              fields: [
                { name: "title", type: "string", required: true, unique: true },
                { name: "quantity", type: "number", required: true },
                { name: "active", type: "boolean", required: true },
              ],
            }),
            block("create", "query", {
              modelId: "model",
              operation: "create",
              values: {
                title: "$request.body.title",
                quantity: "$request.body.quantity",
                active: "$request.body.active",
              },
            }),
            block("find", "query", {
              modelId: "model",
              operation: "findOne",
              filter: { _id: "$request.params.id" },
            }),
            block(
              "post",
              "rest_endpoint",
              {
                route: "/entries",
                method: "POST",
                requestBody: [
                  { name: "title", type: "string", required: true },
                  { name: "quantity", type: "number", required: true },
                  { name: "active", type: "boolean", required: true },
                ],
              },
              ["create"],
            ),
            block(
              "get",
              "rest_endpoint",
              { route: "/entries/:id", method: "GET" },
              ["find"],
            ),
          ],
        },
      ],
      connections: [],
    },
  }).backend.services;
  project.routing.nodes = [
    ...project.editor.pages.map((page, index) => ({
      id: `page${index}`,
      type: "page" as const,
      refId: page.id,
      position: { x: index * 300, y: 0 },
      width: 240,
      height: 180,
    })),
    {
      id: "service",
      type: "service",
      refId: "program_service",
      position: { x: 300, y: 300 },
      width: 240,
      height: 180,
    },
  ];
  const edge = (
    id: string,
    from: string,
    element: string,
    to: string,
    input: string,
  ) => ({
    id,
    fromNodeId: from,
    toNodeId: to,
    fromPortId: `${from}:out:${element}`,
    toPortId: `${to}:in:${input}`,
  });
  project.routing.connections = [
    edge("submit", "page0", form, "service", "post"),
    edge("success", "service", "post", "page1", "page"),
    edge("menu", "page0", menu, "page1", "page"),
    edge("social", "page0", social, "page1", "page"),
    edge("back", "page1", back, "page0", "page"),
    edge("lookup", "page1", lookup, "service", "get"),
  ];
  return {
    project: parseProject(project),
    form,
    title,
    menu,
    social,
    animated,
    details,
  };
}
