// Backend Builder — Type Definitions

export type BackendBlockType =
    | "rest_endpoint"
    | "db_model"
    | "db_query"
    | "db_transaction"
    | "middleware"
    | "auth_block"
    | "authz_role"
    | "authz_permission"
    | "authz_policy"
    | "logic_if"
    | "logic_loop"
    | "logic_trycatch"
    | "logic_transform"
    | "logic_function"
    | "validation"
    | "relation"
    | "env_var"
    | "config_secret"
    | "async_event"
    | "async_queue"
    | "async_job"
    | "async_worker"
    | "async_scheduler"
    | "realtime_websocket"
    | "realtime_sse"
    | "realtime_subscribe"
    | "realtime_publish"
    | "realtime_broadcast"
    | "integration_http"
    | "integration_webhook"
    | "integration_email"
    | "integration_sms"
    | "integration_payment"
    | "storage_upload"
    | "storage_download"
    | "storage_file"
    | "storage_delete"
    | "cache_cache"
    | "cache_invalidate"
    | "obs_error_handler"
    | "obs_health_check"
    | "obs_audit_log";

export interface StatusCode {
    code: number;
    description: string;
    schemaRef?: string;
}

export interface EndpointConfig {
    route: string;
    method: "GET" | "POST" | "PUT" | "DELETE" | "PATCH";
    description: string;
    pathParams: SchemaField[];
    queryParams: SchemaField[];
    headers: SchemaField[];
    requestBody: SchemaField[];
    responseBody: SchemaField[];
    statusCodes: StatusCode[];
    middlewareIds: string[];
    authRequired: boolean;
    authorizationRoles: string[];
    authorizationPermissions: string[];
    pagination: boolean;
    rateLimit: number | null;
}

export interface SchemaField {
    name: string;
    type: "string" | "number" | "boolean" | "date" | "object" | "array" | "objectId";
    required: boolean;
    defaultValue?: string;
    ref?: string;
}

export interface DbModelConfig {
    tableName: string;
    fields: SchemaField[];
    timestamps: boolean;
    softDelete: boolean;
}

export interface DbQueryConfig {
    model: string;
    operation: "findOne" | "findMany" | "create" | "update" | "delete" | "count" | "aggregate";
    filters: string;
    sort: string;
    limit: number;
    projection: string;
}

export interface DbTransactionConfig {
    operations: string;
    isolationLevel: "READ_COMMITTED" | "REPEATABLE_READ" | "SERIALIZABLE";
    timeout: number;
}

export interface RelationConfig {
    fromModel: string;
    toModel: string;
    relationType: "one-to-one" | "one-to-many" | "many-to-many";
    foreignKey: string;
}

export interface MiddlewareConfig {
    middlewareType: "cors" | "rateLimit" | "logger" | "bodyParser" | "helmet" | "authentication" | "authorization" | "custom";
    corsOrigins?: string;
    rateLimit?: number;
    rateLimitWindow?: number;
    customCode?: string;
}

export interface AuthConfig {
    strategy: "jwt" | "oauth" | "session" | "apiKey";
    secretKey: string;
    tokenExpiry: string;
    providers?: string[];
    hashRounds?: number;
}

export interface AuthzRoleConfig {
    roleName: string;
    description: string;
    inheritsFrom: string;
}

export interface AuthzPermissionConfig {
    permissionKey: string;
    description: string;
    resource: string;
    action: "create" | "read" | "update" | "delete" | "execute";
}

export interface AuthzPolicyConfig {
    policyName: string;
    roles: string[];
    permissions: string[];
    conditions: string;
}

export interface LogicIfConfig {
    condition: string;
    trueBranch: string;
    falseBranch: string;
}

export interface LogicLoopConfig {
    loopType: "for" | "forEach" | "while";
    iteratorName: string;
    collection: string;
    body: string;
}

export interface LogicTryCatchConfig {
    tryBody: string;
    catchBody: string;
    finallyBody?: string;
}

export interface LogicTransformConfig {
    inputVar: string;
    transformCode: string;
    outputVar: string;
}

export interface LogicFunctionConfig {
    functionName: string;
    parameters: string;
    returnType: string;
    body: string;
    isAsync: boolean;
}

export interface ValidationConfig {
    fieldName: string;
    rules: ValidationRule[];
}

export interface ValidationRule {
    type: "required" | "minLength" | "maxLength" | "min" | "max" | "regex" | "email" | "custom";
    value?: string | number;
    message: string;
}

export interface EnvVarConfig {
    key: string;
    value: string;
    isSecret: boolean;
    description: string;
}

export interface ConfigSecretConfig {
    key: string;
    description: string;
    provider: "env" | "vault" | "aws_secrets";
}

export interface AsyncEventConfig {
    eventName: string;
    payload: SchemaField[];
    description: string;
}

export interface AsyncQueueConfig {
    queueName: string;
    maxRetries: number;
    backoffMs: number;
    description: string;
}

export interface AsyncJobConfig {
    jobName: string;
    queueRef: string;
    body: string;
}

export interface AsyncWorkerConfig {
    workerName: string;
    queueRef: string;
    concurrency: number;
    body: string;
}

export interface AsyncSchedulerConfig {
    schedulerName: string;
    cron: string;
    description: string;
    body: string;
}

export interface RealtimeWebSocketConfig {
    path: string;
    authRequired: boolean;
    description: string;
}

export interface RealtimeSseConfig {
    path: string;
    authRequired: boolean;
    description: string;
}

export interface RealtimeSubscribeConfig {
    channel: string;
    description: string;
}

export interface RealtimePublishConfig {
    channel: string;
    payload: SchemaField[];
}

export interface RealtimeBroadcastConfig {
    channel: string;
    excludeSender: boolean;
}

export interface IntegrationHttpConfig {
    url: string;
    method: "GET" | "POST" | "PUT" | "DELETE" | "PATCH";
    headers: string;
    body: string;
    timeoutMs: number;
}

export interface IntegrationWebhookConfig {
    path: string;
    secret: string;
    verifySignature: boolean;
    description: string;
}

export interface IntegrationEmailConfig {
    provider: "smtp" | "sendgrid" | "mailgun" | "ses";
    to: string;
    subject: string;
    template: string;
}

export interface IntegrationSmsConfig {
    provider: "twilio" | "vonage";
    to: string;
    body: string;
}

export interface IntegrationPaymentConfig {
    provider: "stripe" | "paypal" | "square";
    operation: "charge" | "refund" | "subscribe" | "webhook";
    description: string;
}

export interface StorageUploadConfig {
    provider: "local" | "s3" | "gcs" | "cloudinary";
    bucket: string;
    allowedTypes: string;
    maxSizeMb: number;
}

export interface StorageDownloadConfig {
    provider: "local" | "s3" | "gcs" | "cloudinary";
    bucket: string;
}

export interface StorageFileConfig {
    provider: "local" | "s3" | "gcs" | "cloudinary";
    bucket: string;
    description: string;
}

export interface StorageDeleteConfig {
    provider: "local" | "s3" | "gcs" | "cloudinary";
    bucket: string;
}

export interface CacheCacheConfig {
    provider: "memory" | "redis";
    keyPattern: string;
    ttlSeconds: number;
    description: string;
}

export interface CacheInvalidateConfig {
    provider: "memory" | "redis";
    keyPattern: string;
    description: string;
}

export interface ObsErrorHandlerConfig {
    catchAll: boolean;
    logToConsole: boolean;
    notifyOnError: boolean;
    customHandler: string;
}

export interface ObsHealthCheckConfig {
    path: string;
    includeDbCheck: boolean;
    includeCacheCheck: boolean;
    description: string;
}

export interface ObsAuditLogConfig {
    events: string;
    destination: "console" | "database" | "file";
    includeUser: boolean;
}

export type BlockConfig =
    | EndpointConfig
    | DbModelConfig
    | DbQueryConfig
    | DbTransactionConfig
    | RelationConfig
    | MiddlewareConfig
    | AuthConfig
    | AuthzRoleConfig
    | AuthzPermissionConfig
    | AuthzPolicyConfig
    | LogicIfConfig
    | LogicLoopConfig
    | LogicTryCatchConfig
    | LogicTransformConfig
    | LogicFunctionConfig
    | ValidationConfig
    | EnvVarConfig
    | ConfigSecretConfig
    | AsyncEventConfig
    | AsyncQueueConfig
    | AsyncJobConfig
    | AsyncWorkerConfig
    | AsyncSchedulerConfig
    | RealtimeWebSocketConfig
    | RealtimeSseConfig
    | RealtimeSubscribeConfig
    | RealtimePublishConfig
    | RealtimeBroadcastConfig
    | IntegrationHttpConfig
    | IntegrationWebhookConfig
    | IntegrationEmailConfig
    | IntegrationSmsConfig
    | IntegrationPaymentConfig
    | StorageUploadConfig
    | StorageDownloadConfig
    | StorageFileConfig
    | StorageDeleteConfig
    | CacheCacheConfig
    | CacheInvalidateConfig
    | ObsErrorHandlerConfig
    | ObsHealthCheckConfig
    | ObsAuditLogConfig;

export interface BackendBlock {
    id: string;
    type: BackendBlockType;
    label: string;
    config: BlockConfig;
    position: { x: number; y: number };
    connections: string[];
}

export interface ServiceContainer {
    id: string;
    name: string;
    description: string;
    port: number;
    color: string;
    blocks: BackendBlock[];
    collapsed: boolean;
}

export interface ConnectionEdge {
    id: string;
    fromServiceId: string;
    toServiceId: string;
    label: string;
}

export interface BackendProject {
    services: ServiceContainer[];
    connections: ConnectionEdge[];
    globalEnv: Record<string, string>;
    framework: "express";
}

export const DEFAULT_ENDPOINT_CONFIG: EndpointConfig = {
    route: "/api/resource",
    method: "GET",
    description: "New endpoint",
    pathParams: [],
    queryParams: [],
    headers: [],
    requestBody: [],
    responseBody: [],
    statusCodes: [
        { code: 200, description: "Success" },
        { code: 400, description: "Bad Request" },
    ],
    middlewareIds: [],
    authRequired: false,
    authorizationRoles: [],
    authorizationPermissions: [],
    pagination: false,
    rateLimit: null,
};

export const DEFAULT_DB_MODEL_CONFIG: DbModelConfig = {
    tableName: "Model",
    fields: [{ name: "name", type: "string", required: true }],
    timestamps: true,
    softDelete: false,
};

export const DEFAULT_DB_QUERY_CONFIG: DbQueryConfig = {
    model: "",
    operation: "findMany",
    filters: "",
    sort: "",
    limit: 20,
    projection: "",
};

export const DEFAULT_DB_TRANSACTION_CONFIG: DbTransactionConfig = {
    operations: "// BEGIN\n// operation1\n// operation2\n// COMMIT",
    isolationLevel: "READ_COMMITTED",
    timeout: 5000,
};

export const DEFAULT_RELATION_CONFIG: RelationConfig = {
    fromModel: "",
    toModel: "",
    relationType: "one-to-many",
    foreignKey: "",
};

export const DEFAULT_MIDDLEWARE_CONFIG: MiddlewareConfig = {
    middlewareType: "cors",
    corsOrigins: "*",
    rateLimit: 100,
    rateLimitWindow: 15,
};

export const DEFAULT_AUTH_CONFIG: AuthConfig = {
    strategy: "jwt",
    secretKey: "your-secret-key",
    tokenExpiry: "7d",
    hashRounds: 10,
};

export const DEFAULT_AUTHZ_ROLE_CONFIG: AuthzRoleConfig = {
    roleName: "user",
    description: "Standard user role",
    inheritsFrom: "",
};

export const DEFAULT_AUTHZ_PERMISSION_CONFIG: AuthzPermissionConfig = {
    permissionKey: "resource.read",
    description: "",
    resource: "resource",
    action: "read",
};

export const DEFAULT_AUTHZ_POLICY_CONFIG: AuthzPolicyConfig = {
    policyName: "Policy",
    roles: [],
    permissions: [],
    conditions: "",
};

export const DEFAULT_LOGIC_IF_CONFIG: LogicIfConfig = {
    condition: "condition",
    trueBranch: "// true branch",
    falseBranch: "// false branch",
};

export const DEFAULT_LOGIC_LOOP_CONFIG: LogicLoopConfig = {
    loopType: "forEach",
    iteratorName: "item",
    collection: "items",
    body: "// loop body",
};

export const DEFAULT_LOGIC_TRYCATCH_CONFIG: LogicTryCatchConfig = {
    tryBody: "// try",
    catchBody: "// handle error",
};

export const DEFAULT_LOGIC_TRANSFORM_CONFIG: LogicTransformConfig = {
    inputVar: "input",
    transformCode: "return input;",
    outputVar: "output",
};

export const DEFAULT_LOGIC_FUNCTION_CONFIG: LogicFunctionConfig = {
    functionName: "myFunction",
    parameters: "param1, param2",
    returnType: "any",
    body: "// function body",
    isAsync: false,
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

export const DEFAULT_CONFIG_SECRET_CONFIG: ConfigSecretConfig = {
    key: "SECRET_KEY",
    description: "Application secret",
    provider: "env",
};

export const DEFAULT_ASYNC_EVENT_CONFIG: AsyncEventConfig = {
    eventName: "resource.created",
    payload: [],
    description: "",
};

export const DEFAULT_ASYNC_QUEUE_CONFIG: AsyncQueueConfig = {
    queueName: "default",
    maxRetries: 3,
    backoffMs: 1000,
    description: "",
};

export const DEFAULT_ASYNC_JOB_CONFIG: AsyncJobConfig = {
    jobName: "processJob",
    queueRef: "",
    body: "// job logic",
};

export const DEFAULT_ASYNC_WORKER_CONFIG: AsyncWorkerConfig = {
    workerName: "Worker",
    queueRef: "",
    concurrency: 5,
    body: "// worker logic",
};

export const DEFAULT_ASYNC_SCHEDULER_CONFIG: AsyncSchedulerConfig = {
    schedulerName: "Scheduler",
    cron: "0 * * * *",
    description: "Runs every hour",
    body: "// scheduled task",
};

export const DEFAULT_REALTIME_WEBSOCKET_CONFIG: RealtimeWebSocketConfig = {
    path: "/ws",
    authRequired: false,
    description: "WebSocket connection",
};

export const DEFAULT_REALTIME_SSE_CONFIG: RealtimeSseConfig = {
    path: "/events",
    authRequired: false,
    description: "Server-sent events stream",
};

export const DEFAULT_REALTIME_SUBSCRIBE_CONFIG: RealtimeSubscribeConfig = {
    channel: "channel.name",
    description: "",
};

export const DEFAULT_REALTIME_PUBLISH_CONFIG: RealtimePublishConfig = {
    channel: "channel.name",
    payload: [],
};

export const DEFAULT_REALTIME_BROADCAST_CONFIG: RealtimeBroadcastConfig = {
    channel: "channel.name",
    excludeSender: true,
};

export const DEFAULT_INTEGRATION_HTTP_CONFIG: IntegrationHttpConfig = {
    url: "https://api.example.com/endpoint",
    method: "GET",
    headers: "{}",
    body: "{}",
    timeoutMs: 5000,
};

export const DEFAULT_INTEGRATION_WEBHOOK_CONFIG: IntegrationWebhookConfig = {
    path: "/webhooks/stripe",
    secret: "",
    verifySignature: true,
    description: "Incoming webhook",
};

export const DEFAULT_INTEGRATION_EMAIL_CONFIG: IntegrationEmailConfig = {
    provider: "sendgrid",
    to: "user@example.com",
    subject: "Hello",
    template: "// email body",
};

export const DEFAULT_INTEGRATION_SMS_CONFIG: IntegrationSmsConfig = {
    provider: "twilio",
    to: "+1234567890",
    body: "Your message here",
};

export const DEFAULT_INTEGRATION_PAYMENT_CONFIG: IntegrationPaymentConfig = {
    provider: "stripe",
    operation: "charge",
    description: "Process payment",
};

export const DEFAULT_STORAGE_UPLOAD_CONFIG: StorageUploadConfig = {
    provider: "s3",
    bucket: "my-bucket",
    allowedTypes: "image/*,application/pdf",
    maxSizeMb: 10,
};

export const DEFAULT_STORAGE_DOWNLOAD_CONFIG: StorageDownloadConfig = {
    provider: "s3",
    bucket: "my-bucket",
};

export const DEFAULT_STORAGE_FILE_CONFIG: StorageFileConfig = {
    provider: "s3",
    bucket: "my-bucket",
    description: "File storage",
};

export const DEFAULT_STORAGE_DELETE_CONFIG: StorageDeleteConfig = {
    provider: "s3",
    bucket: "my-bucket",
};

export const DEFAULT_CACHE_CACHE_CONFIG: CacheCacheConfig = {
    provider: "redis",
    keyPattern: "resource:{{id}}",
    ttlSeconds: 300,
    description: "Cache response",
};

export const DEFAULT_CACHE_INVALIDATE_CONFIG: CacheInvalidateConfig = {
    provider: "redis",
    keyPattern: "resource:*",
    description: "Invalidate cache",
};

export const DEFAULT_OBS_ERROR_HANDLER_CONFIG: ObsErrorHandlerConfig = {
    catchAll: true,
    logToConsole: true,
    notifyOnError: false,
    customHandler: "",
};

export const DEFAULT_OBS_HEALTH_CHECK_CONFIG: ObsHealthCheckConfig = {
    path: "/health",
    includeDbCheck: true,
    includeCacheCheck: false,
    description: "Health check endpoint",
};

export const DEFAULT_OBS_AUDIT_LOG_CONFIG: ObsAuditLogConfig = {
    events: "create,update,delete",
    destination: "database",
    includeUser: true,
};

export const DEFAULT_BLOCK_CONFIGS: Record<BackendBlockType, BlockConfig> = {
    rest_endpoint: DEFAULT_ENDPOINT_CONFIG,
    db_model: DEFAULT_DB_MODEL_CONFIG,
    db_query: DEFAULT_DB_QUERY_CONFIG,
    db_transaction: DEFAULT_DB_TRANSACTION_CONFIG,
    relation: DEFAULT_RELATION_CONFIG,
    middleware: DEFAULT_MIDDLEWARE_CONFIG,
    auth_block: DEFAULT_AUTH_CONFIG,
    authz_role: DEFAULT_AUTHZ_ROLE_CONFIG,
    authz_permission: DEFAULT_AUTHZ_PERMISSION_CONFIG,
    authz_policy: DEFAULT_AUTHZ_POLICY_CONFIG,
    logic_if: DEFAULT_LOGIC_IF_CONFIG,
    logic_loop: DEFAULT_LOGIC_LOOP_CONFIG,
    logic_trycatch: DEFAULT_LOGIC_TRYCATCH_CONFIG,
    logic_transform: DEFAULT_LOGIC_TRANSFORM_CONFIG,
    logic_function: DEFAULT_LOGIC_FUNCTION_CONFIG,
    validation: DEFAULT_VALIDATION_CONFIG,
    env_var: DEFAULT_ENV_VAR_CONFIG,
    config_secret: DEFAULT_CONFIG_SECRET_CONFIG,
    async_event: DEFAULT_ASYNC_EVENT_CONFIG,
    async_queue: DEFAULT_ASYNC_QUEUE_CONFIG,
    async_job: DEFAULT_ASYNC_JOB_CONFIG,
    async_worker: DEFAULT_ASYNC_WORKER_CONFIG,
    async_scheduler: DEFAULT_ASYNC_SCHEDULER_CONFIG,
    realtime_websocket: DEFAULT_REALTIME_WEBSOCKET_CONFIG,
    realtime_sse: DEFAULT_REALTIME_SSE_CONFIG,
    realtime_subscribe: DEFAULT_REALTIME_SUBSCRIBE_CONFIG,
    realtime_publish: DEFAULT_REALTIME_PUBLISH_CONFIG,
    realtime_broadcast: DEFAULT_REALTIME_BROADCAST_CONFIG,
    integration_http: DEFAULT_INTEGRATION_HTTP_CONFIG,
    integration_webhook: DEFAULT_INTEGRATION_WEBHOOK_CONFIG,
    integration_email: DEFAULT_INTEGRATION_EMAIL_CONFIG,
    integration_sms: DEFAULT_INTEGRATION_SMS_CONFIG,
    integration_payment: DEFAULT_INTEGRATION_PAYMENT_CONFIG,
    storage_upload: DEFAULT_STORAGE_UPLOAD_CONFIG,
    storage_download: DEFAULT_STORAGE_DOWNLOAD_CONFIG,
    storage_file: DEFAULT_STORAGE_FILE_CONFIG,
    storage_delete: DEFAULT_STORAGE_DELETE_CONFIG,
    cache_cache: DEFAULT_CACHE_CACHE_CONFIG,
    cache_invalidate: DEFAULT_CACHE_INVALIDATE_CONFIG,
    obs_error_handler: DEFAULT_OBS_ERROR_HANDLER_CONFIG,
    obs_health_check: DEFAULT_OBS_HEALTH_CHECK_CONFIG,
    obs_audit_log: DEFAULT_OBS_AUDIT_LOG_CONFIG,
};

export interface BackendSidebarCategory {
    id: string;
    label: string;
    items: { type: BackendBlockType; label: string; icon: string }[];
}

export const BACKEND_SIDEBAR_CATEGORIES: BackendSidebarCategory[] = [
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
            { type: "db_query", label: "Query", icon: "query" },
            { type: "db_transaction", label: "Transaction", icon: "transaction" },
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
        id: "authz",
        label: "Authorization",
        items: [
            { type: "authz_role", label: "Role", icon: "role" },
            { type: "authz_permission", label: "Permission", icon: "permission" },
            { type: "authz_policy", label: "Access Policy", icon: "policy" },
        ],
    },
    {
        id: "logic",
        label: "Logic",
        items: [
            { type: "logic_if", label: "If / Else", icon: "if" },
            { type: "logic_loop", label: "Loop", icon: "loop" },
            { type: "logic_trycatch", label: "Try / Catch", icon: "trycatch" },
            { type: "validation", label: "Validation", icon: "validation" },
            { type: "logic_transform", label: "Transform", icon: "transform" },
            { type: "logic_function", label: "Function", icon: "function" },
        ],
    },
    {
        id: "async",
        label: "Async",
        items: [
            { type: "async_event", label: "Event", icon: "event" },
            { type: "async_queue", label: "Queue", icon: "queue" },
            { type: "async_job", label: "Job", icon: "job" },
            { type: "async_worker", label: "Worker", icon: "worker" },
            { type: "async_scheduler", label: "Scheduler", icon: "scheduler" },
        ],
    },
    {
        id: "realtime",
        label: "Real-Time",
        items: [
            { type: "realtime_websocket", label: "WebSocket", icon: "websocket" },
            { type: "realtime_sse", label: "SSE", icon: "sse" },
            { type: "realtime_subscribe", label: "Subscribe", icon: "subscribe" },
            { type: "realtime_publish", label: "Publish", icon: "publish" },
            { type: "realtime_broadcast", label: "Broadcast", icon: "broadcast" },
        ],
    },
    {
        id: "integrations",
        label: "Integrations",
        items: [
            { type: "integration_http", label: "HTTP Request", icon: "http" },
            { type: "integration_webhook", label: "Webhook", icon: "webhook" },
            { type: "integration_email", label: "Email", icon: "email" },
            { type: "integration_sms", label: "SMS", icon: "sms" },
            { type: "integration_payment", label: "Payment", icon: "payment" },
        ],
    },
    {
        id: "storage",
        label: "Files & Storage",
        items: [
            { type: "storage_upload", label: "Upload", icon: "upload" },
            { type: "storage_download", label: "Download", icon: "download" },
            { type: "storage_file", label: "Storage", icon: "storage" },
            { type: "storage_delete", label: "Delete", icon: "storagedelete" },
        ],
    },
    {
        id: "caching",
        label: "Caching",
        items: [
            { type: "cache_cache", label: "Cache", icon: "cache" },
            { type: "cache_invalidate", label: "Invalidate", icon: "invalidate" },
        ],
    },
    {
        id: "middleware",
        label: "Middleware",
        items: [
            { type: "middleware", label: "CORS", icon: "cors" },
            { type: "middleware", label: "Rate Limit", icon: "ratelimit" },
            { type: "middleware", label: "Logger", icon: "logger" },
            { type: "middleware", label: "Authentication", icon: "authmw" },
            { type: "middleware", label: "Authorization", icon: "authzmw" },
            { type: "middleware", label: "Custom", icon: "custom" },
        ],
    },
    {
        id: "config",
        label: "Configuration",
        items: [
            { type: "env_var", label: "Env Variable", icon: "env" },
            { type: "config_secret", label: "Secret", icon: "secret" },
        ],
    },
    {
        id: "observability",
        label: "Observability",
        items: [
            { type: "obs_error_handler", label: "Error Handler", icon: "errorhandler" },
            { type: "obs_health_check", label: "Health Check", icon: "healthcheck" },
            { type: "obs_audit_log", label: "Audit Log", icon: "auditlog" },
        ],
    },
];

export const SERVICE_COLORS = [
    "#6366f1",
    "#f59e0b",
    "#10b981",
    "#ef4444",
    "#8b5cf6",
    "#06b6d4",
    "#f97316",
    "#ec4899",
];
