import { loginProject } from "./login-fixture";
import { useEditorStore } from "../../src/store/editorStore";
import { captureProject } from "../../src/lib/project/workspace";
import { templates } from "../../src/templates";

export function mappedLoginFixture(withHeaders = false) {
  const initial = loginProject(),
    editor = useEditorStore.getState();
  const form = editor.addElement(
    {
      ...templates.form,
      children: [],
      label: "Login",
      layout: { w: 400, h: 260 },
    },
    undefined,
    40,
    40,
  );
  const email = editor.addElement(
    {
      ...templates.input,
      props: {
        name: "contactAddress",
        placeholder: "Email",
        inputType: "email",
        required: true,
      },
      layout: { position: "static" },
    },
    form,
  );
  const password = editor.addElement(
    {
      ...templates.input,
      props: {
        name: "passphraseInput",
        placeholder: "Password",
        inputType: "password",
        required: true,
      },
      layout: { position: "static" },
    },
    form,
  );
  const submit = editor.addElement(
    {
      ...templates.button,
      props: { label: "Sign in", type: "submit" },
      layout: { position: "static" },
    },
    form,
  );
  const status = editor.addElement(
    { ...templates.text, props: { content: "Signed out" } },
    undefined,
    40,
    340,
  );
  const project = captureProject(initial.id, initial.name);
  project.editor.pages.push({
    id: "dashboard",
    title: "Dashboard",
    route: "/dashboard",
  });
  project.editor.pageElementMap.dashboard = [];
  const service = project.backend.services[0];
  const endpoint = service.blocks.find(
    (b) => b.type === "rest_endpoint" && b.config.route.endsWith("/login"),
  )!;
  if (endpoint.type !== "rest_endpoint") throw new Error("No login");
  endpoint.config.requestBody.forEach((field) => {
    field.id = `login_${field.name}`;
  });
  endpoint.config.responseBody = [
    { id: "account_email", name: "email", type: "string", required: true },
  ];
  project.routing.nodes = [
    {
      id: "page",
      type: "page",
      refId: project.editor.activePageId,
      position: { x: 0, y: 0 },
      width: 240,
      height: 180,
    },
    {
      id: "service",
      type: "service",
      refId: service.id,
      position: { x: 400, y: 0 },
      width: 240,
      height: 180,
    },
    {
      id: "dashboard_node",
      type: "page",
      refId: "dashboard",
      position: { x: 800, y: 0 },
      width: 240,
      height: 180,
    },
  ];
  project.routing.connections = [
    {
      id: "login_wire",
      fromNodeId: "page",
      fromPortId: `page:out:${form}`,
      toNodeId: "service",
      toPortId: `service:in:${endpoint.id}`,
      requestMappings: [
        {
          fieldId: "login_email",
          location: "body",
          source: { kind: "element", elementId: email },
        },
        {
          fieldId: "login_password",
          location: "body",
          source: { kind: "element", elementId: password },
        },
      ],
      responseMappings: [{ fieldId: "account_email", elementId: status }],
    },
    {
      id: "success_wire",
      fromNodeId: "service",
      fromPortId: `service:out:${endpoint.id}`,
      toNodeId: "dashboard_node",
      toPortId: "dashboard_node:in:page",
    },
  ];
  if (withHeaders) {
    endpoint.config.requestHeaders = [{ id: "client_version", name: "x-app-version", type: "number", required: true }];
    project.routing.connections[0].requestMappings!.push({ fieldId: "client_version", location: "header", source: { kind: "literal", value: 7 } });
    const response = service.blocks.find(block => block.type === "response" && block.label === "Login response");
    if (response?.type === "response") response.config.headers = [{name: "X-App-Result", value: "$result.email"}];
  }
  return {
    project,
    form,
    email,
    password,
    submit,
    status,
    endpointId: endpoint.id,
  };
}
