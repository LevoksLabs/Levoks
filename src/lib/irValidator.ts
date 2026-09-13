// ═══════════════════════════════════════════════════
// IR Validator
// ═══════════════════════════════════════════════════
//
// Validates a FlowGraph before it's consumed by codegen.
// Catches issues that would otherwise become silent bugs
// in the generated code.
//

import { FlowGraph, Flow, FlowStep, IRDiagnostic } from "@/types/ir";

/**
 * Validate a FlowGraph and return diagnostics.
 * Empty array = valid graph.
 */
export function validateIR(graph: FlowGraph): IRDiagnostic[] {
    const diagnostics: IRDiagnostic[] = [];

    const pageIds = new Set(graph.pages.map((p) => p.id));
    const serviceIds = new Set(graph.services.map((s) => s.id));

    // ── Check each flow ──
    const seenTriggers = new Map<string, string>(); // elementId → flowId

    for (const flow of graph.flows) {
        // 1. Duplicate trigger detection
        const triggerKey = `${flow.trigger.pageId}:${flow.trigger.elementId}:${flow.trigger.event}`;
        const existing = seenTriggers.get(triggerKey);
        if (existing) {
            diagnostics.push({
                severity: "warning",
                flowId: flow.id,
                code: "DUPLICATE_TRIGGER",
                message: `Element "${flow.trigger.elementId}" has multiple flows (also in ${existing}). Only the last will take effect.`,
            });
        }
        seenTriggers.set(triggerKey, flow.id);

        // 2. Empty steps
        if (flow.steps.length === 0) {
            diagnostics.push({
                severity: "error",
                flowId: flow.id,
                code: "EMPTY_FLOW",
                message: `Flow "${flow.id}" has no steps. Connection may be broken.`,
            });
            continue;
        }

        // 3. Validate trigger page exists
        if (!pageIds.has(flow.trigger.pageId)) {
            diagnostics.push({
                severity: "error",
                flowId: flow.id,
                code: "MISSING_TRIGGER_PAGE",
                message: `Flow "${flow.id}" references page "${flow.trigger.pageId}" which does not exist.`,
            });
        }

        // 4. Validate each step
        for (let i = 0; i < flow.steps.length; i++) {
            const step = flow.steps[i];
            validateStep(step, flow, i, pageIds, serviceIds, diagnostics);
        }

        // 5. Warn if API call has no subsequent navigate (may be intentional)
        const hasApiCall = flow.steps.some((s) => s.type === "api_call");
        const hasNavigate = flow.steps.some((s) => s.type === "navigate");
        if (hasApiCall && !hasNavigate) {
            diagnostics.push({
                severity: "warning",
                flowId: flow.id,
                code: "API_NO_REDIRECT",
                message: `Flow "${flow.id}" calls an API but has no navigation step. User will stay on the same page.`,
            });
        }
    }

    // ── Check for orphan pages (pages with no incoming or outgoing flows) ──
    const referencedPageIds = new Set<string>();
    for (const flow of graph.flows) {
        referencedPageIds.add(flow.trigger.pageId);
        for (const step of flow.steps) {
            if (step.type === "navigate") {
                referencedPageIds.add(step.pageId);
            }
        }
    }

    for (const page of graph.pages) {
        if (!referencedPageIds.has(page.id) && graph.flows.length > 0) {
            diagnostics.push({
                severity: "warning",
                nodeId: page.id,
                code: "ORPHAN_PAGE",
                message: `Page "${page.title}" (${page.route}) has no routing connections.`,
            });
        }
    }

    // ── Check for orphan services ──
    const referencedServiceIds = new Set<string>();
    for (const flow of graph.flows) {
        for (const step of flow.steps) {
            if (step.type === "api_call" || step.type === "auth") {
                referencedServiceIds.add(step.serviceId);
            }
        }
    }

    for (const service of graph.services) {
        if (!referencedServiceIds.has(service.id) && graph.flows.length > 0) {
            diagnostics.push({
                severity: "warning",
                nodeId: service.id,
                code: "ORPHAN_SERVICE",
                message: `Service "${service.name}" (port ${service.port}) has no routing connections.`,
            });
        }
    }

    return diagnostics;
}

// ─── Step-level validation ───

function validateStep(
    step: FlowStep,
    flow: Flow,
    index: number,
    pageIds: Set<string>,
    serviceIds: Set<string>,
    diagnostics: IRDiagnostic[]
): void {
    switch (step.type) {
        case "api_call": {
            if (!step.endpoint || step.endpoint.trim() === "") {
                diagnostics.push({
                    severity: "error",
                    flowId: flow.id,
                    code: "MISSING_ENDPOINT",
                    message: `Step ${index + 1} in flow "${flow.id}": API call has no endpoint route.`,
                });
            }
            if (!step.method) {
                diagnostics.push({
                    severity: "error",
                    flowId: flow.id,
                    code: "MISSING_METHOD",
                    message: `Step ${index + 1} in flow "${flow.id}": API call has no HTTP method.`,
                });
            }
            if (!serviceIds.has(step.serviceId)) {
                diagnostics.push({
                    severity: "error",
                    flowId: flow.id,
                    code: "MISSING_SERVICE",
                    message: `Step ${index + 1} in flow "${flow.id}": references service "${step.serviceId}" which does not exist.`,
                });
            }
            break;
        }

        case "navigate": {
            if (!pageIds.has(step.pageId)) {
                diagnostics.push({
                    severity: "error",
                    flowId: flow.id,
                    code: "MISSING_TARGET_PAGE",
                    message: `Step ${index + 1} in flow "${flow.id}": navigates to page "${step.pageId}" which does not exist.`,
                });
            }
            if (!step.pageRoute || step.pageRoute.trim() === "") {
                diagnostics.push({
                    severity: "warning",
                    flowId: flow.id,
                    code: "EMPTY_PAGE_ROUTE",
                    message: `Step ${index + 1} in flow "${flow.id}": navigation target has no route.`,
                });
            }
            break;
        }

        case "auth": {
            if (!serviceIds.has(step.serviceId)) {
                diagnostics.push({
                    severity: "error",
                    flowId: flow.id,
                    code: "MISSING_AUTH_SERVICE",
                    message: `Step ${index + 1} in flow "${flow.id}": auth block references missing service "${step.serviceId}".`,
                });
            }
            break;
        }

        case "validate": {
            if (!step.rules || step.rules.length === 0) {
                diagnostics.push({
                    severity: "warning",
                    flowId: flow.id,
                    code: "EMPTY_VALIDATION",
                    message: `Step ${index + 1} in flow "${flow.id}": validation has no rules.`,
                });
            }
            break;
        }
    }
}

/**
 * Returns only error-level diagnostics (ignoring warnings).
 * Useful for gating codegen — only block on real errors.
 */
export function hasErrors(diagnostics: IRDiagnostic[]): boolean {
    return diagnostics.some((d) => d.severity === "error");
}
