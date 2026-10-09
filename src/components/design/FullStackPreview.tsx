"use client";
import { useEffect, useRef, useState } from "react";
import { useEditorStore } from "@/store/editorStore";
import { useBackendStore } from "@/store/backendStore";
import { useRoutingStore } from "@/store/routingStore";
import { currentProject, useWorkspaceStore } from "@/store/workspaceStore";
import { redactProject } from "@/lib/project/schema";
import {
  previewSnapshot,
  type PreviewState,
} from "@/lib/project/fullstack-preview";

async function request(method: string, body?: unknown, id?: string) {
  const response = await fetch(
    "/api/preview" + (id ? "?id=" + encodeURIComponent(id) : ""),
    {
      method,
      credentials: "same-origin",
      cache: "no-store",
      headers: { "Content-Type": "application/json" },
      ...(body ? { body: JSON.stringify(body) } : {}),
    },
  );
  const value = await response.json();
  if (!response.ok) {
    if (method === "DELETE" && response.status === 404)
      return { stopped: true };
    throw Object.assign(
      new Error(value.error || "Local preview is unavailable."),
      { status: response.status },
    );
  }
  return value;
}
const discard = (id: string) =>
  fetch("/api/preview", {
    method: "DELETE",
    credentials: "same-origin",
    keepalive: true,
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ id }),
  }).catch(() => undefined);

export default function FullStackPreview({
  pageId,
  width,
}: {
  pageId: string;
  width: number;
}) {
  useEditorStore();
  useBackendStore();
  useRoutingStore();
  useWorkspaceStore();
  const project = currentProject(),
    snapshot = previewSnapshot(project);
  const route =
    project.editor.pages.find((page) => page.id === pageId)?.route || "/";
  const [run, setRun] = useState<PreviewState>(),
    [available, setAvailable] = useState(false),
    [busy, setBusy] = useState(false),
    [error, setError] = useState(""),
    [baseline, setBaseline] = useState("");
  const [destination, setDestination] = useState<{
      pageId: string;
      path: string;
    }>(),
    [reload, setReload] = useState(0),
    [hydratedFrame, setHydratedFrame] = useState("");
  const path = destination?.pageId === pageId ? destination.path : route;
  const frameKey = [run?.id, reload, pageId, path].join(":");
  const hydrated = hydratedFrame === frameKey;
  const mounted = useRef(true),
    active = useRef<string | undefined>(undefined),
    initialization = useRef<Promise<unknown> | undefined>(undefined);
  const frame = useRef<HTMLIFrameElement>(null),
    location = useRef("");
  useEffect(() => {
    const observe = (event: MessageEvent) => {
      if (!run?.origin) return;
      if (
        event.source !== frame.current?.contentWindow ||
        event.origin !== run?.origin ||
        event.data?.id !== run.id
      )
        return;
      if (event.data.type === "levoks-preview-loading") {
        setHydratedFrame("");
        return;
      }
      if (
        event.data.type !== "levoks-preview-location" ||
        typeof event.data.path !== "string" ||
        event.data.path.length > 4096
      )
        return;
      try {
        const url = new URL(event.data.path, run.origin);
        if (url.origin === run.origin) {
          location.current = url.pathname + url.search + url.hash;
          setHydratedFrame(frameKey);
        }
      } catch {}
    };
    window.addEventListener("message", observe);
    return () => window.removeEventListener("message", observe);
  }, [run?.id, run?.origin, frameKey]);
  useEffect(() => {
    mounted.current = true;
    initialization.current ||= navigator.locks
      ? navigator.locks.request("levoks-preview-init", () => request("GET"))
      : request("GET");
    void initialization.current
      .then(() => {
        if (mounted.current) setAvailable(true);
      })
      .catch((error) => {
        if (mounted.current) setError(error.message);
      });
    const close = () => {
      if (active.current) void discard(active.current);
    };
    window.addEventListener("pagehide", close);
    return () => {
      mounted.current = false;
      window.removeEventListener("pagehide", close);
      close();
    };
  }, []);
  useEffect(() => {
    if (!run?.id || run.phase === "failed" || run.phase === "stopped") return;
    let ended = false;
    const timer = setInterval(() => {
      void request("GET", undefined, run.id)
        .then((value) => {
          if (!ended && mounted.current) setRun(value);
        })
        .catch((error) => {
          if (!ended && mounted.current) {
            if (error.status === 404) {
              active.current = undefined;
              setRun(undefined);
            }
            setError(error.message);
            clearInterval(timer);
          }
        });
    }, 1500);
    return () => {
      ended = true;
      clearInterval(timer);
    };
  }, [run?.id, run?.phase]);
  const start = async () => {
    setBusy(true);
    setError("");
    try {
      if (active.current) {
        await request("DELETE", { id: active.current });
        active.current = undefined;
        setRun(undefined);
      }
      await request("GET");
      const value: PreviewState = await request("POST", {
        project: redactProject(project),
      });
      active.current = value.id;
      if (!mounted.current) {
        void discard(value.id);
        return;
      }
      setRun(value);
      setBaseline(snapshot);
      setDestination(undefined);
      location.current = route;
    } catch (error) {
      if (mounted.current)
        setError(error instanceof Error ? error.message : "Preview failed.");
    } finally {
      if (mounted.current) setBusy(false);
    }
  };
  const stop = async () => {
    setBusy(true);
    try {
      if (active.current) await request("DELETE", { id: active.current });
      active.current = undefined;
      setRun(undefined);
      setError("");
    } catch (error) {
      setError(
        error instanceof Error ? error.message : "Could not stop preview.",
      );
    } finally {
      setBusy(false);
    }
  };
  const navigate = (path: string) => {
    location.current = path;
    setDestination({ pageId, path });
    // The application may have navigated inside the frame while its src prop stayed unchanged.
    setReload((value) => value + 1);
  };
  return (
    <section
      className="fullstack-preview"
      aria-label="Full-stack preview"
      style={{ width, maxWidth: "100%" }}
    >
      <div className="fullstack-preview-controls">
        <div>
          <strong>Local full-stack preview</strong>
          <p>
            Generated frontend and APIs with temporary test databases. Email is
            captured here. Stopping or rebuilding discards test data.
          </p>
        </div>
        <div className="fullstack-preview-actions">
          <button disabled={!available || busy} onClick={start}>
            {run ? "Rebuild with latest changes" : "Start full-stack preview"}
          </button>
          {run && (
            <button disabled={busy} onClick={stop}>
              Stop preview
            </button>
          )}
          {run?.phase === "ready" && (
            <button
              disabled={!hydrated}
              onClick={() => navigate(location.current || path)}
            >
              Reload page
            </button>
          )}
        </div>
        {run && (
          <p role="status">
            {run.phase === "ready" && !hydrated
              ? "Loading the application controls…"
              : run.message}
          </p>
        )}
        {run && baseline !== snapshot && (
          <p role="status">
            The project changed. Rebuild preview to apply edits and start with
            fresh test data.
          </p>
        )}
        {error && <p role="alert">{error}</p>}
        {run?.phase === "ready" && (
          <nav aria-label="Preview application pages">
            <button onClick={() => navigate(route)}>Open selected page</button>
            {run.accounts.map((account) => (
              <button key={account.path} onClick={() => navigate(account.path)}>
                {account.service} account
              </button>
            ))}
            {run.inboxes.map((inbox) => (
              <button key={inbox.path} onClick={() => navigate(inbox.path)}>
                {inbox.service} inbox
              </button>
            ))}
          </nav>
        )}
        {run?.phase === "ready" &&
          run.accounts.some((account) => account.setupCode) && (
            <details>
              <summary>Test operator setup codes</summary>
              <p>These codes apply only to this temporary preview.</p>
              {run.accounts
                .filter((account) => account.setupCode)
                .map((account) => (
                  <label key={account.path}>
                    {account.service}
                    <input
                      aria-label={`${account.service} preview setup code`}
                      value={account.setupCode}
                      readOnly
                      onFocus={(event) => event.target.select()}
                    />
                  </label>
                ))}
            </details>
          )}
        {run?.phase === "ready" && (
          <details>
            <summary>Captured test emails ({run.emails.length})</summary>
            {run.emails.length ? (
              run.emails.map((email) => (
                <article key={email.id}>
                  <strong>{email.subject}</strong>
                  <pre>{email.text}</pre>
                </article>
              ))
            ) : (
              <p>No test emails yet.</p>
            )}
          </details>
        )}
      </div>
      {run?.phase === "ready" && run.origin && (
        <iframe
          ref={frame}
          key={frameKey}
          style={{ visibility: hydrated ? "visible" : "hidden" }}
          aria-busy={!hydrated}
          onLoad={() => {
            setHydratedFrame("");
            frame.current?.contentWindow?.postMessage(
              { type: "levoks-preview-location-request" },
              run.origin!,
            );
          }}
          title="Full-stack application preview"
          src={run.origin + path}
          sandbox="allow-scripts allow-forms allow-same-origin"
          referrerPolicy="no-referrer"
        />
      )}
    </section>
  );
}
