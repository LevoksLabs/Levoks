import type {
  BackendBlock,
  ServiceContainer,
  SemanticBackendService,
  DbModelConfig,
  EndpointConfig,
} from "@/types/backend";
import { programConfigs } from "./program-schema";
import type { IRDiagnostic } from "@/types/ir";

const identitySteps = new Set([
  "credential_lookup",
  "password_verify",
  "session_issue",
]);

// ponytail: login proof validation is linear; add branch dominance analysis before supporting branching identity flows.
export function loginDiagnostics(
  service: SemanticBackendService,
): IRDiagnostic[] {
  const issues: IRDiagnostic[] = [];
  const fail = (id: string, message: string) =>
    issues.push({
      severity: "error",
      code: "BACKEND_IDENTITY",
      nodeId: id,
      message,
    });
  const byId = new Map(service.blocks.map((block) => [block.id, block]));
  const model = service.blocks.find(
    (block) =>
      block.type === "db_model" &&
      (block.config as DbModelConfig).fields.some(
        (field) => field.name === "password",
      ),
  );
  const hasIdentity =
    model &&
    service.blocks.some(
      (block) =>
        block.type === "auth_block" &&
        "strategy" in block.config &&
        block.config.strategy === "jwt",
    );
  const used = new Set<string>();
  for (const endpoint of service.blocks) {
    if (
      endpoint.type !== "rest_endpoint" ||
      !("route" in endpoint.config) ||
      !endpoint.connections.length
    )
      continue;
    const config = endpoint.config as EndpointConfig;
    const ordered: typeof service.blocks = [];
    const seen = new Set<string>();
    const visit = (ids: string[]) => {
      for (const id of ids) {
        if (seen.has(id)) {
          fail(endpoint.id, "Login steps cannot repeat or recurse.");
          continue;
        }
        seen.add(id);
        const block = byId.get(id);
        if (!block) continue;
        ordered.push(block);
        visit(block.connections);
        // Also detect identity operations hidden in branches/functions/transactions.
        const config = block.config as unknown as Record<string, unknown>;
        if (Array.isArray(config.steps)) visit(config.steps as string[]);
        const program = config.program as Record<string, unknown> | undefined;
        for (const key of [
          "steps",
          "thenSteps",
          "elseSteps",
          "catchSteps",
          "finallySteps",
        ])
          if (Array.isArray(program?.[key])) visit(program[key] as string[]);
      }
    };
    // Ordinary workflows keep their existing bounded control-flow semantics.
    const candidate = hasIdentity && config.route.endsWith("/login");
    const before = issues.length;
    visit(endpoint.connections);
    const auth = ordered.filter((block) => identitySteps.has(block.type));
    if (!candidate && !auth.length) {
      issues.splice(before);
      continue;
    }
    auth.forEach((block) => used.add(block.id));
    if (
      !candidate ||
      config.method !== "POST" ||
      config.authRequired ||
      config.policyIds?.length
    )
      fail(
        endpoint.id,
        "Identity steps require a public POST login endpoint in a JWT identity service.",
      );
    if (
      ordered.some(
        (block) =>
          ![
            "validation",
            "credential_lookup",
            "password_verify",
            "session_issue",
            "transform",
            "response",
          ].includes(block.type),
      )
    )
      fail(
        endpoint.id,
        "Login workflows support validation, account lookup, password verification, session issuance, transform and response steps. Branches, generic queries and transactions are not supported here.",
      );
    if (
      auth.map((block) => block.type).join(",") !==
      "credential_lookup,password_verify,session_issue"
    )
      fail(
        endpoint.id,
        "Login requires exactly one account lookup, password verification, then session issuance in that order.",
      );
    const responses = ordered.filter((block) => block.type === "response");
    if (
      responses.length !== 1 ||
      ordered.at(-1)?.type !== "response" ||
      responses[0]?.connections.length
    )
      fail(endpoint.id, "Login must finish with exactly one Response block.");
    const [lookup, verification, session] = auth;
    if (lookup?.type === "credential_lookup") {
      const parsed = programConfigs.credential_lookup.safeParse(lookup.config);
      if (parsed.success && parsed.data.identityModelId !== model?.id)
        fail(
          lookup.id,
          "Choose this service's identity model for account lookup.",
        );
    }
    if (verification?.type === "password_verify") {
      const parsed = programConfigs.password_verify.safeParse(
        verification.config,
      );
      if (parsed.success && parsed.data.lookupId !== lookup?.id)
        fail(
          verification.id,
          "Password verification must reference the preceding account lookup.",
        );
    }
    if (session?.type === "session_issue") {
      const parsed = programConfigs.session_issue.safeParse(session.config);
      if (parsed.success && parsed.data.verificationId !== verification?.id)
        fail(
          session.id,
          "Session issuance must reference the preceding password verification.",
        );
    }
    const outputs = new Set<string>();
    for (const block of ordered) {
      if (
        block.type === "credential_lookup" ||
        block.type === "password_verify"
      ) {
        const parsed = programConfigs[block.type].safeParse(block.config);
        if (parsed.success) {
          const value =
            "email" in parsed.data ? parsed.data.email : parsed.data.password;
          const field =
            typeof value === "string" &&
            /^\$request\.body\.([A-Za-z_][A-Za-z0-9_]*)$/.exec(value)?.[1];
          if (
            !field ||
            !config.requestBody.some(
              (item) =>
                item.name === field && item.type === "string" && item.required,
            )
          )
            fail(
              block.id,
              "Bind credentials to a declared, required string request body field.",
            );
        }
      }
      if (block.type === "transform" || block.type === "response") {
        const parsed = programConfigs[block.type].safeParse(block.config);
        if (parsed.success) {
          const values =
            "fields" in parsed.data
              ? Object.values(parsed.data.fields)
              : [parsed.data.value, ...(parsed.data.headers || []).map(header => header.value)];
          for (const value of values)
            if (
              typeof value === "string" &&
              value.startsWith("$") &&
              !outputs.has(value.slice(1).split(".")[0])
            )
              fail(
                block.id,
                "Login responses and transforms may bind only earlier public outputs, never raw request credentials.",
              );
        }
      }
      if ("output" in block.config && typeof block.config.output === "string")
        outputs.add(block.config.output);
    }
  }
  for (const block of service.blocks)
    if (identitySteps.has(block.type) && !used.has(block.id))
      fail(block.id, "Connect this identity operation to a login workflow.");
  return issues;
}

/** New templates get an editable workflow; existing saved identity routes stay compatible. */
export function addLoginWorkflow(
  service: ServiceContainer,
  newId: () => string,
  endpointId?: string,
): ServiceContainer {
  const endpoint = service.blocks.find(
    (block) =>
      (!endpointId || block.id === endpointId) &&
      block.type === "rest_endpoint" &&
      "route" in block.config &&
      block.config.route.endsWith("/login"),
  );
  const model = service.blocks.find(
    (block) =>
      block.type === "db_model" &&
      (block.config as DbModelConfig).fields.some(
        (field) => field.name === "password",
      ),
  );
  if (!endpoint || !model || endpoint.connections.length) return service;
  const ids = Array.from({ length: 5 }, () => newId());
  const specs: Pick<BackendBlock, "type" | "label" | "config">[] = [
    {
      type: "validation",
      label: "Validate credentials",
      config: {
        fieldName: "email",
        rules: [
          { type: "required", message: "Email is required" },
          { type: "email", message: "Enter a valid email" },
        ],
      },
    },
    {
      type: "credential_lookup",
      label: "Find account",
      config: {
        identityModelId: model.id,
        email: "$request.body.email",
        output: "account",
      },
    },
    {
      type: "password_verify",
      label: "Verify password",
      config: { lookupId: ids[1], password: "$request.body.password" },
    },
    {
      type: "session_issue",
      label: "Issue session / JWT",
      config: { verificationId: ids[2], output: "result" },
    },
    {
      type: "response",
      label: "Login response",
      config: { status: 200, value: "$result" },
    },
  ];
  return {
    ...service,
    blocks: [
      ...service.blocks.map((block) =>
        block.id === endpoint.id ? { ...block, connections: [ids[0]] } : block,
      ),
      ...specs.map((spec, index) => ({
        ...spec,
        id: ids[index],
        definitionVersion: 1 as const,
        position: { x: 1000 + index * 300, y: 0, placed: true },
        connections: ids[index + 1] ? [ids[index + 1]] : [],
      })),
    ],
  };
}
