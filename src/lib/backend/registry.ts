import {
  BACKEND_SIDEBAR_CATEGORIES,
  DEFAULT_BLOCK_CONFIGS,
  type BackendBlockType,
  type BlockConfig,
} from "@/types/backend";
import { backendBlockSchema } from "@/lib/project/schema";

export const BACKEND_CATEGORIES = [
  "Endpoints",
  "Database",
  "Authentication",
  "Authorization",
  "Logic",
  "Async",
  "Real-Time",
  "Integrations",
  "Files & Storage",
  "Caching",
  "Middleware",
  "Configuration",
  "Observability",
  "Templates",
] as const;
const steps = new Set([
  "query",
  "transaction",
  "transform",
  "function",
  "response",
  "logic_if",
  "logic_loop",
  "logic_trycatch",
  "validation",
]);

/** Registry wraps the existing executable compilers; it does not invent handlers. */
export const BACKEND_REGISTRY = Object.fromEntries(
  Object.entries(DEFAULT_BLOCK_CONFIGS).map(([type, config]) => {
    const category = BACKEND_SIDEBAR_CATEGORIES.find((c) =>
      c.items.some((item) => item.type === type),
    );
    const metadata = category?.items.find((item) => item.type === type);
    const strategy =
      type === "relation"
        ? "unsupported"
        : type === "rest_endpoint"
          ? "express-route"
          : steps.has(type)
            ? "workflow"
            : "service-configuration";
    const schema = backendBlockSchema.options.find(
      (option) => option.shape.type.value === type,
    )!.shape.config;
    return [
      type,
      {
        type: type as BackendBlockType,
        category: category?.label || "Configuration",
        name: metadata?.label || type,
        icon: metadata?.icon || "custom",
        version: 1,
        migration: "legacy-v1" as const,
        status:
          strategy === "unsupported" ? "experimental" : "supported-subset",
        propsSchema: schema,
        defaultConfig: config,
        inputPorts:
          strategy === "workflow"
            ? [{ name: "in", type: "execution-context" }]
            : type === "rest_endpoint"
              ? [{ name: "request", type: "http-request" }]
              : [],
        outputPorts:
          strategy === "workflow"
            ? [{ name: "next", type: "execution-context" }]
            : type === "rest_endpoint"
              ? [{ name: "response", type: "http-response" }]
              : [],
        ir: strategy,
        generate: strategy,
      },
    ];
  }),
) as Record<
  string,
  {
    type: BackendBlockType;
    category: string;
    name: string;
    icon: string;
    version: number;
    migration: string;
    status: string;
    propsSchema: { parse(value: unknown): unknown };
    defaultConfig: BlockConfig;
    inputPorts: { name: string; type: string }[];
    outputPorts: { name: string; type: string }[];
    ir: string;
    generate: string;
  }
>;

export function backendDefaults(type: BackendBlockType) {
  return structuredClone(BACKEND_REGISTRY[type].defaultConfig);
}

export const backendSidebarCategories = BACKEND_SIDEBAR_CATEGORIES;
export function backendSupport(type: BackendBlockType, label: string) {
  return BACKEND_REGISTRY[type].status === "experimental" ||
    (type === "auth_block" && label !== "JWT Auth") ||
    (type === "middleware" && label === "Custom")
    ? "experimental"
    : "supported-subset";
}
