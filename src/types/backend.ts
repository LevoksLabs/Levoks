// ═══════════════════════════════════════════════════
// Backend Builder — Type Definitions
// ═══════════════════════════════════════════════════

// ─── Block Types ───

import {
  PROGRAM_DEFAULTS,
  controlSchema,
  type ProgramBlockType,
  type ProgramConfig,
  type ControlConfig,
} from "@/lib/backend/program-schema";
import { healthSchema, type HealthConfig } from "@/lib/backend/health-schema";
import { errorHandlerSchema, auditLogSchema, type ErrorHandlerConfig, type AuditLogConfig } from "@/lib/backend/observability-schema";
export type { ErrorHandlerConfig, AuditLogConfig } from "@/lib/backend/observability-schema";
export type { HealthConfig } from "@/lib/backend/health-schema";
export type BackendBlockType =
  | ProgramBlockType
  | "rest_endpoint"
  | "db_model"
  | "middleware"
  | "auth_block"
  | "logic_if"
  | "logic_loop"
  | "logic_trycatch"
  | "validation"
  | "relation"
  | "health_check"
  | "error_handler"
  | "audit_log"
  | "env_var";

// ─── Block Configs ───

export interface EndpointConfig {
  route: string;
  method: "GET" | "POST" | "PUT" | "DELETE" | "PATCH";
  description: string;
  requestBody: SchemaField[];
  responseBody: SchemaField[];
  middlewareIds: string[]; // references to middleware blocks
  authRequired: boolean;
  modelId?: string;
  policyIds?: string[];
}

export interface SchemaField {
  name: string;
  type:
    "string" | "number" | "boolean" | "date" | "object" | "array" | "objectId";
  required: boolean;
  defaultValue?: string;
  ref?: string; // for objectId references
  unique?: boolean;
  indexed?: boolean;
}

export interface DbModelConfig {
  tableName: string;
  fields: SchemaField[];
  timestamps: boolean;
  softDelete: boolean;
}

export interface RelationConfig {
  fromModel: string;
  toModel: string;
  relationType: "one-to-one" | "one-to-many" | "many-to-many";
  foreignKey: string;
}

export interface MiddlewareConfig {
  middlewareType:
    "cors" | "rateLimit" | "logger" | "bodyParser" | "helmet" | "custom";
  corsOrigins?: string;
  rateLimit?: number; // requests per minute
  rateLimitWindow?: number; // window in minutes
  customCode?: string;
}

export interface AuthConfig {
  requireVerifiedEmail?: boolean;
  identityServiceId?: string;
  refreshDays?: number;
  idleMinutes?: number;
  strategy: "jwt" | "oauth" | "session" | "apiKey";
  secretKey: string;
  tokenExpiry: string; // e.g. "7d", "24h"
  providers?: string[]; // for oauth: "google", "github", etc.
  hashRounds?: number;
}

export interface LogicIfConfig {
  program?: ControlConfig;
  condition: string;
  trueBranch: string;
  falseBranch: string;
}

export interface LogicLoopConfig {
  program?: ControlConfig;
  loopType: "for" | "forEach" | "while";
  iteratorName: string;
  collection: string;
  body: string;
}

export interface LogicTryCatchConfig {
  program?: ControlConfig;
  tryBody: string;
  catchBody: string;
  finallyBody?: string;
}

export interface ValidationConfig {
  fieldName: string;
  rules: ValidationRule[];
}

export interface ValidationRule {
  type:
    | "required"
    | "minLength"
    | "maxLength"
    | "min"
    | "max"
    | "regex"
    | "email"
    | "custom";
  value?: string | number;
  message: string;
}

export interface EnvVarConfig {
  key: string;
  value: string;
  isSecret: boolean;
  description: string;
}

// Union config type
export type BlockConfig =
  | ErrorHandlerConfig
  | AuditLogConfig
  | HealthConfig
  | ProgramConfig
  | EndpointConfig
  | DbModelConfig
  | RelationConfig
  | MiddlewareConfig
  | AuthConfig
  | LogicIfConfig
  | LogicLoopConfig
  | LogicTryCatchConfig
  | ValidationConfig
  | EnvVarConfig;

// ─── Backend Block ───

export interface BackendBlock {
  id: string;
  type: BackendBlockType;
  label: string;
  config: BlockConfig;
  position: { x: number; y: number };
  connections: string[]; // IDs of connected blocks
}

// ─── Service Container ───

export interface ServiceContainer {
  id: string;
  name: string;
  description: string;
  port: number;
  color: string;
  blocks: BackendBlock[];
  collapsed: boolean;
}

// ─── Connection Edge ───

export interface ConnectionEdge {
  id: string;
  fromServiceId: string;
  toServiceId: string;
  label: string;
}

// ─── Backend Project ───

export interface BackendProject {
  services: ServiceContainer[];
  connections: ConnectionEdge[];
  globalEnv: Record<string, string>;
  framework: "express";
}

// ─── Default Configs ───

export const DEFAULT_ENDPOINT_CONFIG: EndpointConfig = {
  route: "/api/resource",
  method: "GET",
  description: "New endpoint",
  requestBody: [],
  responseBody: [],
  middlewareIds: [],
  authRequired: false,
};

export const DEFAULT_DB_MODEL_CONFIG: DbModelConfig = {
  tableName: "Model",
  fields: [{ name: "name", type: "string", required: true }],
  timestamps: true,
  softDelete: false,
};

export const DEFAULT_RELATION_CONFIG: RelationConfig = {
  fromModel: "",
  toModel: "",
  relationType: "one-to-many",
  foreignKey: "",
};

export const DEFAULT_MIDDLEWARE_CONFIG: MiddlewareConfig = {
  middlewareType: "cors",
  corsOrigins: "http://localhost:3000",
  rateLimit: 100,
  rateLimitWindow: 15,
};

export const DEFAULT_AUTH_CONFIG: AuthConfig = {
  strategy: "jwt",
  secretKey: "",
  tokenExpiry: "15m",
  refreshDays: 7,
  idleMinutes: 60,
  hashRounds: 10,
};

export const DEFAULT_LOGIC_IF_CONFIG: LogicIfConfig = {
  program: controlSchema.parse({}),
  condition: "condition",
  trueBranch: "// true branch",
  falseBranch: "// false branch",
};

export const DEFAULT_LOGIC_LOOP_CONFIG: LogicLoopConfig = {
  program: controlSchema.parse({}),
  loopType: "forEach",
  iteratorName: "item",
  collection: "items",
  body: "// loop body",
};

export const DEFAULT_LOGIC_TRYCATCH_CONFIG: LogicTryCatchConfig = {
  program: controlSchema.parse({}),
  tryBody: "// try",
  catchBody: "// handle error",
};

export const DEFAULT_VALIDATION_CONFIG: ValidationConfig = {
  fieldName: "email",
  rules: [
    { type: "required", message: "Field is required" },
    { type: "email", message: "Must be a valid email" },
  ],
};

export const DEFAULT_ENV_VAR_CONFIG: EnvVarConfig = {
  key: "API_KEY",
  value: "",
  isSecret: true,
  description: "API key for external service",
};

// Map block type → default config
export const DEFAULT_BLOCK_CONFIGS: Record<BackendBlockType, BlockConfig> = {
  health_check: healthSchema.parse({}),
  error_handler: errorHandlerSchema.parse({}),
  audit_log: auditLogSchema.parse({}),
  ...PROGRAM_DEFAULTS,
  rest_endpoint: DEFAULT_ENDPOINT_CONFIG,
  db_model: DEFAULT_DB_MODEL_CONFIG,
  relation: DEFAULT_RELATION_CONFIG,
  middleware: DEFAULT_MIDDLEWARE_CONFIG,
  auth_block: DEFAULT_AUTH_CONFIG,
  logic_if: DEFAULT_LOGIC_IF_CONFIG,
  logic_loop: DEFAULT_LOGIC_LOOP_CONFIG,
  logic_trycatch: DEFAULT_LOGIC_TRYCATCH_CONFIG,
  validation: DEFAULT_VALIDATION_CONFIG,
  env_var: DEFAULT_ENV_VAR_CONFIG,
};

// ─── Sidebar Category Definitions ───

export interface BackendSidebarCategory {
  id: string;
  label: string;
  items: { type: BackendBlockType; label: string; icon: string }[];
}

export const BACKEND_SIDEBAR_CATEGORIES: BackendSidebarCategory[] = [
  {id: 'observability', label: 'Observability', items: [{type: 'health_check', label: 'Health Check', icon: 'validation'}, {type: 'error_handler', label: 'Error Handler', icon: 'trycatch'}, {type: 'audit_log', label: 'Audit Log', icon: 'logger'}]},
  {
    id: "endpoints",
    label: "Endpoints",
    items: [
      { type: "rest_endpoint", label: "GET", icon: "get" },
      { type: "rest_endpoint", label: "POST", icon: "post" },
      { type: "rest_endpoint", label: "PUT", icon: "put" },
      { type: "rest_endpoint", label: "DELETE", icon: "delete" },
      { type: "rest_endpoint", label: "PATCH", icon: "patch" },
    ],
  },
  {
    id: "database",
    label: "Database",
    items: [
      { type: "db_model", label: "Model", icon: "model" },
      { type: "relation", label: "Relation", icon: "relation" },
      { type: "query", label: "Query", icon: "model" },
      { type: "transaction", label: "Transaction", icon: "model" },
    ],
  },
  {
    id: "auth",
    label: "Authentication",
    items: [
      { type: "auth_block", label: "JWT Auth", icon: "jwt" },
      { type: "auth_block", label: "OAuth", icon: "oauth" },
      { type: "auth_block", label: "Session", icon: "session" },
      { type: "auth_block", label: "API Key", icon: "apikey" },
    ],
  },
  {
    id: "authorization",
    label: "Authorization",
    items: [
      { type: "role", label: "Role", icon: "jwt" },
      { type: "permission", label: "Permission", icon: "jwt" },
      { type: "access_policy", label: "Access Policy", icon: "jwt" },
    ],
  },
  {
    id: "logic",
    label: "Logic",
    items: [
      { type: "logic_if", label: "If / Else", icon: "if" },
      { type: "logic_loop", label: "Loop", icon: "loop" },
      { type: "logic_trycatch", label: "Try/Catch", icon: "trycatch" },
      { type: "validation", label: "Validation", icon: "validation" },
      { type: "transform", label: "Transform", icon: "if" },
      { type: "function", label: "Function", icon: "if" },
      { type: "response", label: "Response", icon: "get" },
    ],
  },
  {
    id: "middleware",
    label: "Middleware",
    items: [
      { type: "middleware", label: "CORS", icon: "cors" },
      { type: "middleware", label: "Rate Limit", icon: "ratelimit" },
      { type: "middleware", label: "Logger", icon: "logger" },
      { type: "middleware", label: "Custom", icon: "custom" },
    ],
  },
  {
    id: "config",
    label: "Configuration",
    items: [{ type: "env_var", label: "Env Variable", icon: "env" }],
  },
];

// ─── Service Colors ───

export const SERVICE_COLORS = [
  "#6366f1", // indigo
  "#f59e0b", // amber
  "#10b981", // emerald
  "#ef4444", // red
  "#8b5cf6", // violet
  "#06b6d4", // cyan
  "#f97316", // orange
  "#ec4899", // pink
];
