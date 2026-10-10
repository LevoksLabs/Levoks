"use client";
import { useEffect, useRef, useState } from "react";
import {
  SITE_STARTERS,
  applySiteStarter,
  starterPreview,
  type SiteStarter,
} from "@/lib/site-starters";
import { useEditorStore } from "@/store/editorStore";
import { addSubmissionFormTemplate } from "@/lib/form-destination";

function StarterPreview({
  starter,
  onClose,
  onUse,
}: {
  starter: SiteStarter;
  onClose: () => void;
  onUse: () => void;
}) {
  const dialog = useRef<HTMLDialogElement>(null);
  const returnFocus = useRef<HTMLElement | null>(null);
  const [width, setWidth] = useState(1280);
  const [html] = useState(() => starterPreview(starter));
  useEffect(() => {
    returnFocus.current ||= document.activeElement as HTMLElement;
    const node = dialog.current;
    if (!node?.open) node?.showModal();
    return () => {
      node?.close();
      returnFocus.current?.focus();
    };
  }, []);
  return (
    <dialog
      ref={dialog}
      aria-label={`${starter.name} preview`}
      onCancel={onClose}
      style={{
        width: "min(1400px,96vw)",
        maxWidth: "96vw",
        height: "90vh",
        padding: "16px",
        border: "1px solid #626276",
        background: "#18181f",
        color: "#eee",
      }}
    >
      <div className="template-preview-header">
        <button
          type="button"
          className="template-preview-back"
          onClick={onClose}
        >
          Back to Templates
        </button>
        <h3>{starter.name}</h3>
        <label>
          Preview width{" "}
          <select
            aria-label="Starter preview width"
            value={width}
            onChange={(e) => setWidth(Number(e.target.value))}
          >
            {[320, 768, 1024, 1280].map((w) => (
              <option key={w} value={w}>
                {w}px
              </option>
            ))}
          </select>
        </label>
        <button type="button" className="template-preview-use" onClick={onUse}>
          Use This Template
        </button>
      </div>
      <p className="panel-caption">
        Editable layout and navigation. Submissions save after applying the
        starter and running Local full-stack preview or the exported app.
      </p>
      <div style={{ height: "calc(100% - 100px)", overflow: "auto" }}>
        <iframe
          title={`Preview: ${starter.name}`}
          srcDoc={html}
          sandbox="allow-scripts"
          style={{
            display: "block",
            width,
            height: "100%",
            border: 0,
            margin: "0 auto",
            background: "#f4f3ed",
          }}
        />
      </div>
    </dialog>
  );
}
export default function TemplatesPanel() {
  const [preview, setPreview] = useState<SiteStarter | null>(null),
    [filter, setFilter] = useState("all"),
    [error, setError] = useState("");
  const closeSidebar = () => useEditorStore.getState().setSidebarOpen(null);
  const handleApplyStarter = (starter: SiteStarter) => {
    if (
      !window.confirm(
        `Replace this page with ${starter.name}? Undo restores the page, routing and backend together.`,
      )
    )
      return;
    try {
      applySiteStarter(starter);
      setPreview(null);
      closeSidebar();
    } catch (e) {
      setError((e as Error).message);
      setPreview(null);
    }
  };
  return (
    <div className="templates-panel">
      <div className="working-form-template">
        <h3>Working contact form</h3>
        <p>Editable form, database and submit workflow. Adds to this page.</p>
        <button
          type="button"
          className="template-preview-use"
          onClick={() => {
            try {
              addSubmissionFormTemplate();
              closeSidebar();
            } catch (e) {
              setError((e as Error).message);
            }
          }}
        >
          Add working contact form
        </button>
      </div>
      {error && <p role="alert">{error}</p>}
      <div className="templates-filter-bar">
        {["all", ...new Set(SITE_STARTERS.map((s) => s.category))].map(
          (category) => (
            <button
              key={category}
              className={`templates-filter-btn ${filter === category ? "active" : ""}`}
              aria-pressed={filter === category}
              onClick={() => setFilter(category)}
            >
              {category === "all" ? "All" : category}
            </button>
          ),
        )}
      </div>
      <div className="templates-grid">
        {SITE_STARTERS.filter(
          (s) => filter === "all" || s.category === filter,
        ).map((starter) => (
          <article className="template-card" key={starter.id}>
            <div
              className="template-thumbnail"
              style={{
                background: "#f4f3ed",
                color: "#24352d",
                padding: "24px",
                display: "flex",
                flexDirection: "column",
                justifyContent: "center",
                gap: "16px",
              }}
            >
              <span>{starter.brand}</span>
              <strong style={{ fontSize: "24px", lineHeight: 1.15 }}>
                {starter.headline}
              </strong>
            </div>
            <div className="template-info">
              <span className="template-category-badge">
                {starter.category}
              </span>
              <h3 className="template-name">{starter.name}</h3>
              <p className="template-desc">{starter.description}</p>
              <div style={{ display: "flex", gap: "12px", marginTop: "16px" }}>
                <button
                  type="button"
                  className="template-preview-back"
                  aria-label={`Preview ${starter.name}`}
                  onClick={() => setPreview(starter)}
                >
                  Preview
                </button>
                <button
                  type="button"
                  className="template-preview-use"
                  aria-label={`Use ${starter.name}`}
                  onClick={() => handleApplyStarter(starter)}
                >
                  Use
                </button>
              </div>
            </div>
          </article>
        ))}
      </div>
      <p className="templates-hint">
        Starters replace this page and add connected storage and a private
        inbox. Undo restores the previous project.
      </p>
      {preview && (
        <StarterPreview
          key={preview.id}
          starter={preview}
          onClose={() => setPreview(null)}
          onUse={() => handleApplyStarter(preview)}
        />
      )}
    </div>
  );
}
