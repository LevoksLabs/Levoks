"use client";
import type { ServiceContainer } from "@/types/backend";
import type { SubmissionNotificationConfig } from "@/lib/backend/submission-notification-schema";

export default function SubmissionNotificationInspector({
  config,
  service,
  onChange,
}: {
  config: SubmissionNotificationConfig;
  service: ServiceContainer;
  onChange: (updates: Partial<SubmissionNotificationConfig>) => void;
}) {
  const select = (
    key: "endpointId" | "modelId" | "queryId" | "inboxEndpointId",
    label: string,
    type: string,
  ) => (
    <label className="bi-field">
      {label}
      <select
        aria-label={label}
        className="bi-select"
        value={config[key]}
        onChange={(e) => onChange({ [key]: e.target.value })}
      >
        <option value="">Choose a block</option>
        {service.blocks
          .filter(
            (b) =>
              b.type === type &&
              (key !== "inboxEndpointId" ||
                ("view" in b.config && b.config.view === "submissionInbox")),
          )
          .map((b) => (
            <option key={b.id} value={b.id}>
              {b.label}
            </option>
          ))}
      </select>
    </label>
  );
  return (
    <section className="bi-section-body" aria-label="Submission email settings">
      <label className="bi-checkbox-label">
        <input
          type="checkbox"
          checked={config.enabled}
          onChange={(e) => onChange({ enabled: e.target.checked })}
        />{" "}
        Email alerts for new submissions
      </label>
      {select("endpointId", "Submission endpoint", "rest_endpoint")}
      {select("queryId", "Save submission query", "query")}
      {select("modelId", "Submission model", "db_model")}
      {select("inboxEndpointId", "Private inbox endpoint", "rest_endpoint")}
      <label className="bi-field">
        Email subject
        <input
          className="bi-input"
          maxLength={160}
          value={config.subject}
          onChange={(e) => onChange({ subject: e.target.value })}
        />
      </label>
      <p className="bi-help">
        Queues one inbox-link email with each saved submission. Submitted data
        is never included. Sender, recipient and provider key belong in the
        separate worker environment. Configure NOTIFICATIONS.md after download.
        Disabling stops new alerts; existing jobs finish processing.
      </p>
    </section>
  );
}
