"use client";

import { useState } from "react";
import { AlertCircle, ArrowUpRight, ClipboardCheck } from "lucide-react";
import {
  publishReadiness,
  type ReadinessTarget,
} from "@/lib/project/readiness";
import type { ProjectDocument } from "@/lib/project/schema";
import type { FlowGraph, IRDiagnostic } from "@/types/ir";

export default function PublishReadiness({
  project,
  graph,
  diagnostics,
  error,
  onReview,
}: {
  project: ProjectDocument;
  graph?: FlowGraph;
  diagnostics: IRDiagnostic[];
  error?: string;
  onReview: (target: ReadinessTarget) => void;
}) {
  const [shown, setShown] = useState(20);
  const findings = publishReadiness(project, graph, diagnostics, error);
  const blockers = findings.filter((f) => f.severity === "error").length;
  const notes = findings.filter((f) => f.severity === "warning").length;
  return (
    <section
      className="workspace-readiness"
      aria-label="Publish-readiness checklist"
    >
      <h2>
        <ClipboardCheck size={20} /> Publish-readiness checklist
      </h2>
      <p role="status">
        {blockers
          ? `${blockers} compiler blocker${blockers === 1 ? "" : "s"}`
          : "No compiler blockers"}{" "}
        · {notes} item{notes === 1 ? "" : "s"} to review. Runtime checks remain
        required.
      </p>
      <ul className="readiness-list">
        {findings.slice(0, shown).map((finding) => (
          <li
            key={finding.id}
            className={`readiness-item readiness-${finding.severity}`}
          >
            <div className="readiness-item-title">
              <AlertCircle size={14} aria-hidden="true" />
              <strong>{finding.title}</strong>
              <span>
                {finding.severity === "error"
                  ? "Blocker"
                  : finding.severity === "runtime"
                    ? "Runtime"
                    : "Review"}
              </span>
            </div>
            <small>{finding.context}</small>
            <p>{finding.message}</p>
            <button
              aria-label={`Review ${finding.title}: ${finding.context}`}
              onClick={() => onReview(finding.target)}
            >
              Open{" "}
              {finding.target.kind === "source"
                ? "Source & checks"
                : finding.target.kind === "secrets"
                  ? "Project secrets"
                  : "in editor"}
              <ArrowUpRight size={14} aria-hidden="true" />
            </button>
          </li>
        ))}
      </ul>
      {findings.length > shown && (
        <button onClick={() => setShown((value) => value + 20)}>
          Show more checks ({Math.min(shown, findings.length)} of{" "}
          {findings.length} shown)
        </button>
      )}
    </section>
  );
}
