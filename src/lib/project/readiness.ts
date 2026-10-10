import type { ProjectDocument } from "./schema";
import { serviceSlug } from "./schema";
import type { ElementNode } from "@/types";
import type { FlowGraph, IRDiagnostic } from "@/types/ir";
import { definitionFor } from "@/lib/elements/registry";
import { safeElementUrl, buttonHref } from "@/lib/elements/native";
import { resolveElement, type Breakpoint } from "@/lib/design";

export type ReadinessTarget =
  | { kind: "element"; pageId: string; elementId: string }
  | { kind: "page"; pageId: string }
  | { kind: "backend"; serviceId: string; blockId?: string }
  | { kind: "routing"; connectionId?: string }
  | { kind: "source" }
  | { kind: "secrets" };
export type ReadinessFinding = {
  id: string;
  severity: "error" | "warning" | "runtime";
  title: string;
  context: string;
  message: string;
  target: ReadinessTarget;
};

/** Static review only. Passing these checks never asserts deployed runtime readiness. */
export function publishReadiness(
  project: ProjectDocument,
  graph?: FlowGraph,
  diagnostics: IRDiagnostic[] = [],
  compilationError = "",
): ReadinessFinding[] {
  const findings: ReadinessFinding[] = [];
  const pageNodes = new Map<string, ElementNode[]>();
  const elementPages = new Map<string, string>();
  const nodes = project.editor.elementsById;
  for (const page of project.editor.pages) {
    const visible: ElementNode[] = [];
    const visited = new Set<string>();
    const screens = ["base","tablet","mobile",...(project.editor.canvasSettings.breakpoints || []).map(bp=>`custom_${bp.width}`)] as Breakpoint[];
    const visit = (id: string, hidden = screens.map(()=>false)) => {
      const node = nodes[id] as ElementNode | undefined;
      if (!node || visited.has(id)) return;
      visited.add(id);
      if (!elementPages.has(id)) elementPages.set(id, page.id);
      const invisible = screens.map(bp=>resolveElement(node,bp)).map(
        (resolved, i) =>
          hidden[i] ||
          !resolved.layout.visible ||
          resolved.styles.display === "none" ||
          resolved.styles.visibility === "hidden",
      );
      if (invisible.some((value) => !value)) visible.push(node);
      node.children.forEach((child) => visit(child, invisible));
    };
    [
      ...(project.editor.pageElementMap[page.id] || []),
      ...project.editor.globalRootIds,
    ].forEach((id) => visit(id));
    pageNodes.set(page.id, visible);
  }
  const targetFor = (id?: string, flowId?: string): ReadinessTarget => {
    const page = project.editor.pages.find(
      (p) => p.id === id || p.id === elementPages.get(id || ""),
    );
    if (page)
      return nodes[id || ""]
        ? { kind: "element", pageId: page.id, elementId: id! }
        : { kind: "page", pageId: page.id };
    const service = project.backend.services.find(
      (s) => s.id === id || s.blocks.some((b) => b.id === id),
    );
    if (service)
      return {
        kind: "backend",
        serviceId: service.id,
        ...(id !== service.id ? { blockId: id } : {}),
      };
    if (project.routing.connections.some((c) => c.id === id))
      return { kind: "routing", connectionId: id };
    const flow = graph?.flows.find((f) => f.id === flowId);
    const connection = flow?.steps.find(
      (s) => s.type === "api_call" && s.connectionId,
    );
    if (connection?.type === "api_call")
      return { kind: "routing", connectionId: connection.connectionId };
    if (flow)
      return {
        kind: "element",
        pageId: flow.trigger.pageId,
        elementId: flow.trigger.elementId,
      };
    return { kind: "source" };
  };
  if (compilationError)
    findings.push({
      id: "invalid-project",
      severity: "error",
      title: "Project validation failed",
      context: project.name,
      message: compilationError,
      target: { kind: "source" },
    });
  diagnostics.forEach((d, i) => {
    const target = targetFor(d.nodeId, d.flowId);
    const service =
      target.kind === "backend"
        ? project.backend.services.find((s) => s.id === target.serviceId)
        : undefined;
    const page =
      target.kind === "page" || target.kind === "element"
        ? project.editor.pages.find((p) => p.id === target.pageId)
        : undefined;
    const context = service
      ? `${service.blocks.find((b) => b.id === d.nodeId)?.label || "Service settings"} · ${service.name}`
      : page
        ? `${nodes[d.nodeId || ""]?.label || "Page settings"} · ${page.title} (${page.route})`
        : target.kind === "routing"
          ? "Routing connection"
          : "Source & checks";
    findings.push({
      id: `compiler-${i}`,
      severity: d.severity,
      title: d.severity === "error" ? "Compiler blocker" : "Compiler note",
      context,
      message: d.message,
      target,
    });
  });
  const accountRoutes = new Set(
    project.backend.services
      .filter(
        (s) =>
          s.blocks.some(
            (b) => b.type === "auth_block" && b.config.strategy === "jwt",
          ) &&
          s.blocks.some(
            (b) =>
              b.type === "db_model" &&
              b.config.fields.some((f) => f.name === "password"),
          ),
      )
      .map((s) => `/__levoks/account/${serviceSlug(s.name)}`),
  );
  for (const page of project.editor.pages) {
    const elements = pageNodes.get(page.id)!;
    const context = `${page.title} (${page.route})`;
    const add = (
      code: string,
      title: string,
      message: string,
      element?: ElementNode,
    ) =>
      findings.push({
        id: `${code}:${page.id}:${element?.id || "page"}`,
        severity: "warning",
        title,
        context: element
          ? `${element.label || definitionFor(element)?.name || element.type} · ${context}`
          : context,
        message,
        target: element
          ? { kind: "element", pageId: page.id, elementId: element.id }
          : { kind: "page", pageId: page.id },
      });
    if (!elements.length)
      add(
        "empty-page",
        "Page has no visible content",
        "Add content or remove this page if it is not part of the application.",
      );
    if (!page.seo?.noIndex && !page.seo?.description?.trim())
      add(
        "page-description",
        "Search description is missing",
        "Open Search & sharing to add a description, or disable search indexing for a private or internal page.",
      );
    const wired = new Set(
      graph?.flows
        .filter((f) => f.trigger.pageId === page.id && f.steps.length)
        .map((f) => f.trigger.elementId) || [],
    );
    const submissions = new Set(
      graph?.flows
        .filter(
          (f) =>
            f.trigger.pageId === page.id &&
            f.steps.some((s) => s.type === "api_call"),
        )
        .map((f) => f.trigger.elementId) || [],
    );
    const insideForm = (element: ElementNode) => {
      let parent = nodes[element.parentId || ""];
      const ancestors = new Set<string>();
      while (parent && !ancestors.has(parent.id)) {
        ancestors.add(parent.id);
        if (parent.type === "form") return true;
        parent = nodes[parent.parentId || ""];
      }
      return false;
    };
    for (const element of elements) {
      const definition = definitionFor(element);
      const href =
        element.type === "button"
          ? String(
              element.props.href ||
                (element.actions?.type === "redirect"
                  ? element.actions.target
                  : "") ||
                "",
            ).trim()
          : String(element.props.href || "").trim();
      const click = wired.has(element.id) || !!element.events?.onClick;
      if (element.type === "form") {
        const destination = String(element.props.requestUrl || "").trim();
        if (
          !submissions.has(element.id) &&
          (!destination || wired.has(element.id) || element.events?.onSubmit)
        )
          add(
            "form-destination",
            "Form has no submission destination",
            "Connect this form to a REST endpoint in Routing, or configure and test its Request URL. A redirect alone does not save submissions.",
            element,
          );
        else if (!submissions.has(element.id) && destination)
          add(
            "form-direct",
            "Direct form submission needs verification",
            `Test the destination's native form encoding and response. ${!["GET", "POST"].includes(String(element.props.requestMethod || "POST").toUpperCase()) ? "A native form sends GET or POST; use a Routing endpoint for other methods." : "Use Routing for typed JSON requests and mapped responses."}`,
            element,
          );
      }
      if (
        (element.type === "button" || definition?.tag === "button") &&
        !element.props.disabled &&
        !element.props.loading &&
        !click &&
        !(element.type === "button"
          ? buttonHref(element)
          : safeElementUrl(href)) &&
        !(
          insideForm(element) &&
          ["submit", "reset"].includes(String(element.props.type || "submit"))
        )
      )
        add(
          "button-action",
          "Button has no working action",
          "Set a Link URL or redirect, configure a page interaction, or connect the button in Routing. API calls and scroll actions need a Routing connection or page interaction.",
          element,
        );
      if (href && !click) {
        if (!safeElementUrl(href))
          add(
            "invalid-link",
            "Link URL cannot be exported",
            "Use an HTTP(S) URL, a page route or a section anchor supported by this element.",
            element,
          );
        else if (href.startsWith("/") && !href.startsWith("//")) {
          const path = href.split(/[?#]/)[0].replace(/\/$/, "") || "/";
          if (
            !project.editor.pages.some(
              (p) => (p.route.replace(/\/$/, "") || "/") === path,
            ) &&
            !accountRoutes.has(path)
          )
            add(
              "missing-page",
              "Link points to an absent page",
              "Choose an existing page route, add the destination page, or verify that a custom server route supplies this address.",
              element,
            );
        }
      }
      if (
        (element.type === "image" || definition?.tag === "img") &&
        !element.props.src &&
        !project.editor.assets?.[String(element.props.assetId || "")]
      )
        add(
          "image-source",
          "Image has no source",
          "Choose an image from Assets or provide its source URL.",
          element,
        );
    }
  }
  if (project.backend.services.length)
    findings.push({
      id: "runtime-environment",
      severity: "runtime",
      title: "Configure and verify runtime environments",
      context: "Backend services",
      message:
        "Set database connections, required server secrets, frontend APP_ORIGIN and API_ORIGIN values in the runtime environment. Project secrets are not proof of hosting injection. See each exported .env.example and service guide.",
      target: { kind: "secrets" },
    });
  findings.push({
    id: "runtime-acceptance",
    severity: "runtime",
    title: "Run the exported application before publishing",
    context: "Local and deployment acceptance",
    message:
      "Build the frontend and services, test all pages and journeys against the intended databases, and verify authentication, recovery and mobile behavior. These static checks do not run builds or prove provider availability.",
    target: { kind: "source" },
  });
  if (project.source)
    findings.push({
      id: "edited-source",
      severity: "runtime",
      title: "Review edited source behavior",
      context: "Source overrides",
      message:
        "Canvas checks cannot verify manually edited application behavior. Review and run the edited output, and reconcile any stale canvas changes before export.",
      target: { kind: "source" },
    });
  return findings.sort(
    (a, b) =>
      ["error", "warning", "runtime"].indexOf(a.severity) -
      ["error", "warning", "runtime"].indexOf(b.severity),
  );
}
