import { parseProject, type ProjectDocument } from "./schema";

/** Ignore save timestamps: only application definitions change a preview snapshot. */
export function previewSnapshot(project: ProjectDocument) {
  return JSON.stringify({
    editor: project.editor,
    backend: project.backend,
    routing: project.routing,
    source: project.source,
  });
}

export function previewProject(value: unknown) {
  const project = parseProject(value);
  if (
    project.source ||
    Object.keys(project.editor.customElements || {}).length > 0 ||
    Object.values(project.editor.elementsById).some(
      (node) => node.type === "custom",
    )
  )
    throw new Error(
      "Custom components and edited source need a container sandbox. Local preview runs generated applications only.",
    );
  if (project.backend.services.length > 8)
    throw new Error("Local preview supports up to eight backend services.");
  for (const service of project.backend.services) {
    if (service.database && service.database.engine !== "mongodb")
      throw new Error(
        "Local preview currently uses disposable MongoDB databases. Other engines need their own isolated preview adapter.",
      );
    if (
      service.blocks.some(
        (block) =>
          block.type === "http_request" ||
          block.type === "env_var" ||
          (block.type === "middleware" &&
            block.config.middlewareType === "custom"),
      )
    )
      throw new Error(
        "External requests, environment variables and custom middleware are unavailable in local preview. Use test data and the built-in email transport.",
      );
    // A preview always provisions new local storage, regardless of exported deployment settings.
    if (service.database)
      service.database = { ...service.database, location: "local", tls: false };
  }
  return project;
}

export type PreviewState = {
  id: string;
  phase: "starting" | "ready" | "failed" | "stopped";
  message: string;
  origin?: string;
  expiresAt: number;
  accounts: { service: string; path: string; setupCode?: string }[];
  inboxes: { service: string; path: string }[];
  emails: { id: string; subject: string; text: string; to: string[] }[];
};
