import { v4 as uuid } from "uuid";
import type { BackendBlock, ServiceContainer } from "@/types/backend";
import { backendDefaults } from "@/lib/backend/registry";
import { defaultDatabase } from "@/lib/backend/database";
import { serviceSlug, type ProjectDocument } from "@/lib/project/schema";
import { useBackendStore } from "@/store/backendStore";
import { projectHistory } from "@/store/projectHistory";
import { submissionFileFields } from "@/lib/backend/files";

export function submissionInboxPath(
  service: Pick<ServiceContainer, "name">,
  endpointId: string,
) {
  return `/__levoks/inbox/${serviceSlug(service.name)}/${endpointId}`;
}

/** Add ordinary, editable identity and policy blocks without closing public submissions. */
export function createSubmissionInbox(serviceId: string, submitId: string) {
  const service = useBackendStore
    .getState()
    .services.find((s) => s.id === serviceId) as
    ProjectDocument["backend"]["services"][number] | undefined;
  const submit = service?.blocks.find(
    (b) => b.id === submitId && b.type === "rest_endpoint",
  );
  const model = service?.blocks.find(
    (b) =>
      b.type === "db_model" &&
      submit &&
      "modelId" in submit.config &&
      b.id === submit.config.modelId,
  );
  if (
    !service ||
    !submit ||
    submit.type !== "rest_endpoint" ||
    !model ||
    model.type !== "db_model" ||
    submit.config.method !== "POST" ||
    submit.config.authRequired ||
    submit.config.policyIds?.length ||
    !service.blocks.some(
      (b) =>
        b.type === "query" &&
        b.config.modelId === model.id &&
        b.config.operation === "create" &&
        !b.config.policyId &&
        submit.connections.includes(b.id),
    )
  )
    throw new Error(
      "Choose a public submission collection with a connected create query first.",
    );
  const existing = service.blocks.find(
    (b) =>
      b.type === "rest_endpoint" &&
      b.config.view === "submissionInbox" &&
      b.config.modelId === model.id,
  );
  if (existing) return existing.id;
  if (
    service.blocks.length > 993 ||
    useBackendStore.getState().services.length >= 100
  )
    throw new Error(
      "This project has reached the block or service limit for guided inbox setup.",
    );
  if (
    (service.database || defaultDatabase()).engine !== "mongodb" ||
    model.config.fields.some((f) => /password|secret|token/i.test(f.name))
  )
    throw new Error(
      "Guided inbox setup requires a MongoDB submission collection without credential fields.",
    );
  if (
    service.blocks.some((b) =>
      ["auth_block", "role", "permission", "access_policy"].includes(b.type),
    )
  )
    throw new Error(
      "This service already has access rules. Configure its inbox workflow in Backend instead of replacing those rules.",
    );
  if (
    service.blocks.some(
      (b) =>
        b.type === "rest_endpoint" &&
        b.config.route === "/api/submissions/inbox",
    )
  )
    throw new Error("The inbox endpoint path is already in use.");
  return projectHistory.run("editor", () => {
    const store = useBackendStore.getState();
    store.loadAuthTemplate();
    const identity = useBackendStore.getState().services.at(-1)!;
    const baseName = `${service.name.slice(0, 85)} operators`;
    let identityName = baseName;
    for (
      let suffix = 2;
      useBackendStore
        .getState()
        .services.some(
          (s) =>
            s.id !== identity.id &&
            serviceSlug(s.name) === serviceSlug(identityName),
        );
      suffix++
    )
      identityName = `${baseName} ${suffix}`;
    const user = identity.blocks.find((b) => b.type === "db_model")!;
    const block = (
      type: BackendBlock["type"],
      label: string,
      config: object,
    ): BackendBlock =>
      ({
        id: uuid(),
        type,
        label,
        config: { ...backendDefaults(type), ...config },
        connections: [],
        position: { x: 0, y: 0 },
      }) as BackendBlock;
    const setup = block("rest_endpoint", "First operator setup", {
      route: "/api/auth/operator-setup",
      method: "POST",
      modelId: user.id,
      authRequired: false,
      requestBody: ["email", "name", "password", "setupCode"].map((name) => ({
        name,
        type: "string",
        required: true,
      })),
      responseBody: [],
    });
    store.updateService(identity.id, {
      name: identityName,
      database: defaultDatabase(),
      description:
        "Operator accounts with revocable sessions. Set the runtime setup code to enroll the first operator.",
      blocks: [
        ...identity.blocks,
        { ...setup, position: { x: 0, y: identity.blocks.length * 130 } },
      ],
    });
    const policy = block("access_policy", "Operators read submissions", {
      roles: ["operator"],
      permissions: ["submissions.read"],
      ownerField: "",
      tenantField: "",
    });
    const query = block("query", "Read latest submissions", {
      modelId: model.id,
      operation: "find",
      filter: {},
      sortField: "_id",
      sortDirection: "desc",
      limit: submissionFileFields(model.config, service.blocks).length ? 5 : 50,
      page: "$request.query.page",
      output: "submissions",
      policyId: policy.id,
    });
    const response = block("response", "Inbox records", {
      status: 200,
      value: "$submissions",
    });
    const endpoint = block("rest_endpoint", "Private submission inbox", {
      route: "/api/submissions/inbox",
      method: "GET",
      modelId: model.id,
      authRequired: true,
      policyIds: [policy.id],
      view: "submissionInbox",
      requestBody: [],
      responseBody: [],
      queryParameters: [{ name: "page", type: "number", required: false }],
    });
    endpoint.connections = [query.id, response.id];
    const additions = [
      block("auth_block", "Operator sessions", {
        identityServiceId: identity.id,
        tokenExpiry: "15m",
      }),
      block("permission", "Read submissions", {
        resource: "submissions",
        action: "read",
      }),
      block("role", "Operator", {
        name: "operator",
        permissions: ["submissions.read"],
      }),
      policy,
      endpoint,
      query,
      response,
    ];
    store.updateService(service.id, {
      description: "Public submissions with a private operator inbox.",
      blocks: [
        ...service.blocks,
        ...additions.map((b, index) => ({
          ...b,
          position: { x: 0, y: (service.blocks.length + index) * 130 },
        })),
      ],
    });
    return endpoint.id;
  });
}
