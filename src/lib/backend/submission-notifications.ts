import { v4 as uuid } from "uuid";
import { useBackendStore } from "@/store/backendStore";
import { projectHistory } from "@/store/projectHistory";
import type { ProjectDocument } from "@/lib/project/schema";

import { DEFAULT_SUBMISSION_NOTIFICATION } from "./submission-notification-schema";

export function setSubmissionNotifications(
  serviceId: string,
  endpointId: string,
  enabled: boolean,
) {
  const store = useBackendStore.getState();
  const service = store.services.find((s) => s.id === serviceId) as
    ProjectDocument["backend"]["services"][number] | undefined;
  const endpoint = service?.blocks.find(
    (b) => b.type === "rest_endpoint" && b.id === endpointId,
  );
  if (!service || endpoint?.type !== "rest_endpoint")
    throw new Error("Choose a connected submission collection first.");
  if (
    (service.database?.engine && service.database.engine !== "mongodb") ||
    service.blocks.some((b) => b.type === "relation")
  )
    throw new Error(
      "Guided email alerts require a MongoDB submission collection without relationships.",
    );
  const existing = service.blocks.find(
    (b) =>
      b.type === "submission_notification" &&
      b.config.endpointId === endpointId,
  );
  if (existing)
    return projectHistory.run("editor", () =>
      store.updateBlock(service.id, existing.id, {
        config: { ...existing.config, enabled },
      }),
    );
  if (!enabled) return;
  const inbox = service.blocks.find(
    (b) =>
      b.type === "rest_endpoint" &&
      b.config.view === "submissionInbox" &&
      b.config.modelId === endpoint.config.modelId,
  );
  const query = service.blocks.find(
    (b) =>
      b.type === "query" &&
      b.config.operation === "create" &&
      b.config.modelId === endpoint.config.modelId &&
      endpoint.connections.includes(b.id),
  );
  if (!inbox || !query || query.type !== "query")
    throw new Error(
      "Add a private submission inbox before enabling email alerts.",
    );
  if (service.blocks.length >= 1000)
    throw new Error("This service has reached its block limit.");
  projectHistory.run("editor", () =>
    store.updateService(service.id, {
      blocks: [
        ...service.blocks,
        {
          id: uuid(),
          type: "submission_notification",
          label: "Submission email alerts",
          config: {
            ...DEFAULT_SUBMISSION_NOTIFICATION,
            endpointId,
            queryId: query.id,
            modelId: query.config.modelId,
            inboxEndpointId: inbox.id,
          },
          position: { x: 0, y: service.blocks.length * 130 },
          connections: [],
        },
      ],
    }),
  );
}
