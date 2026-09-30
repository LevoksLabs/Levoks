// ═══════════════════════════════════════════════════
// Intermediate Representation (IR) — Type Definitions
// ═══════════════════════════════════════════════════
//
// The IR is the single source of truth between canvas state
// and all consumers: codegen, preview, export.
//
// Pipeline:  Canvas State → resolveGraph() → FlowGraph → codegen / preview
//

// ─── Flow Steps ───
// Each step in an execution flow (ordered, deterministic)

export interface ApiCallStep {
    type: "api_call";
    method: string;           // GET, POST, PUT, DELETE, PATCH
    endpoint: string;         // /api/users
    serviceName: string;      // user-service
    servicePort: number;      // 3001
    serviceId: string;        // UUID of the service container
    blockId: string;          // UUID of the endpoint block
    authRequired: boolean;
}

export interface NavigateStep {
    type: "navigate";
    pageId: string;
    pageRoute: string;        // /dashboard
    pageTitle: string;
}

export interface AuthStep {
    type: "auth";
    strategy: string;         // jwt, oauth, session, apiKey
    serviceId: string;
    blockId: string;
}

export interface ValidateStep {
    type: "validate";
    rules: { fieldName: string; ruleType: string; value?: string | number; message: string }[];
    blockId: string;
}

export type FlowStep = ApiCallStep | NavigateStep | AuthStep | ValidateStep;

// ─── Flow ───
// A complete execution chain triggered by a UI element event

export interface Flow {
    id: string;               // unique flow ID (derived from connection chain)
    trigger: {
        elementId: string;    // UUID of the triggering element
        elementType: string;  // button, form, image, menu, etc.
        pageId: string;       // UUID of the page containing the element
        pageRoute: string;    // route of the page
        event: "click" | "submit";
    };
    steps: FlowStep[];        // ordered execution steps
}

// ─── FlowGraph ───
// Routing IR. The application IR also includes the validated project and
// versioned element/backend contracts (lib/project/ir.ts).

export interface FlowGraph {
    flows: Flow[];
    // Preserve traversal failures so validation cannot accept a truncated flow.
    diagnostics?: IRDiagnostic[];
    // Metadata for cross-referencing
    pages: { id: string; title: string; route: string }[];
    services: { id: string; name: string; port: number }[];
}

// ─── Diagnostics ───

export type DiagnosticSeverity = "error" | "warning";

export interface IRDiagnostic {
    severity: DiagnosticSeverity;
    flowId?: string;          // which flow has the issue (if applicable)
    nodeId?: string;          // which node has the issue (if applicable)
    code: string;             // machine-readable code, e.g. "MISSING_ENDPOINT"
    message: string;          // human-readable description
}
