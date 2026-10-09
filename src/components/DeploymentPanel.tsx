"use client";
import { useEffect, useRef, useState } from "react";
import { Rocket, RefreshCw, ExternalLink } from "lucide-react";
import { currentProject } from "@/store/workspaceStore";
import { useBackendStore } from "@/store/backendStore";
import {
  deploymentTarget,
  deploymentEnvironment,
  type DeploymentMetadata,
} from "@/lib/deployment";

async function request(path: string, body?: unknown, signal?: AbortSignal) {
  const response = await fetch(path, {
    method: body ? "POST" : "GET",
    cache: "no-store",
    signal,
    headers: { "Content-Type": "application/json" },
    ...(body ? { body: JSON.stringify(body) } : {}),
  });
  const data = await response.json();
  if (!response.ok)
    throw new Error(
      data.error || "Deployment request failed. Refresh and try again.",
    );
  return data;
}
export default function DeploymentPanel({
  projectId,
  ownerId,
  blocked,
}: {
  projectId: string;
  ownerId?: string;
  blocked: boolean;
}) {
  const services = useBackendStore((state) => state.services);
  const [connection, setConnection] = useState<DeploymentMetadata | null>(null);
  const [workerOnline, setWorkerOnline] = useState(false);
  const [loaded, setLoaded] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [name, setName] = useState("");
  const [providerProjectId, setProviderProjectId] = useState("");
  const [teamId, setTeamId] = useState("");
  const [token, setToken] = useState("");
  const [origins, setOrigins] = useState<Record<string, string>>({});
  const initialized = useRef(false);
  const alive = useRef(true);
  const epoch = useRef(0);
  const operation = useRef(false);
  const pending = useRef<unknown>(null);
  const [retryQueue, setRetryQueue] = useState(false);
  const url = `/api/deploy?projectId=${encodeURIComponent(projectId)}`;

  async function refresh(signal?: AbortSignal) {
    const revision = ++epoch.current;
    const data = await request(url, undefined, signal);
    if (!alive.current || revision !== epoch.current) return;
    setConnection(data.connection);
    if (
      pending.current &&
      data.connection?.history.some(
        (release: { operationId: string }) =>
          release.operationId ===
          (pending.current as { operationId: string }).operationId,
      )
    ) {
      pending.current = null;
      setRetryQueue(false);
    }
    setWorkerOnline(data.workerOnline);
    setLoaded(true);
    if (!initialized.current && data.connection) {
      initialized.current = true;
      setName(data.connection.name);
      setProviderProjectId(data.connection.providerProjectId);
      setTeamId(data.connection.teamId || "");
      setOrigins(data.connection.environment);
    }
  }
  useEffect(() => {
    alive.current = true;
    if (!ownerId) return;
    const controller = new AbortController();
    let timer: ReturnType<typeof setTimeout>;
    async function poll() {
      try {
        if (!operation.current) await refresh(controller.signal);
      } catch (e) {
        if (!controller.signal.aborted)
          setError(
            e instanceof Error
              ? e.message
              : "Status is unavailable. Refresh to retry.",
          );
      }
      if (!controller.signal.aborted) timer = setTimeout(poll, 15_000);
    }
    void poll();
    return () => {
      alive.current = false;
      controller.abort();
      clearTimeout(timer);
    };
    // The parent keys this panel by account/project. Polling must not overwrite field edits.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ownerId, projectId]);
  async function run(action: () => Promise<void>) {
    if (operation.current) return;
    operation.current = true;
    ++epoch.current;
    setBusy(true);
    setError("");
    setNotice("");
    try {
      await action();
    } catch (e) {
      if (alive.current)
        setError(
          e instanceof Error ? e.message : "Request failed. Refresh to retry.",
        );
    } finally {
      operation.current = false;
      if (alive.current) setBusy(false);
    }
  }
  const validTarget = deploymentTarget.safeParse({
    name,
    providerProjectId,
    ...(teamId ? { teamId } : {}),
  }).success;
  const environment = Object.fromEntries(
    services.map((service) => [
      `API_ORIGIN_${service.port}`,
      origins[`API_ORIGIN_${service.port}`] || "",
    ]),
  );
  const validOrigins = deploymentEnvironment.safeParse(environment).success;
  const latest = connection?.history.at(-1);
  return (
    <section
      className="managed-deployment"
      aria-label="Managed frontend deployment"
      aria-busy={busy}
    >
      <h2>
        <Rocket size={20} /> Managed frontend preview
      </h2>
      <p>
        Connect an existing Vercel Next.js project. Preview releases and their
        status are saved to your account and continue after the editor closes.
      </p>
      <p>
        Backend services, databases and email workers need a separate container
        host. Enter each deployed API address before queuing the frontend.
      </p>
      {!ownerId ? (
        <p>
          Sign in to save a deployment connection. You can still download the
          application ZIP.
        </p>
      ) : (
        <>
          <div className="deployment-actions">
            <button disabled={busy} onClick={() => void run(() => refresh())}>
              <RefreshCw size={16} /> Refresh releases
            </button>
            <span role="status">
              {loaded
                ? workerOnline
                  ? "Worker online"
                  : "Worker offline · queued releases wait"
                : "Loading connection…"}
            </span>
          </div>
          {error && (
            <p className="workspace-error" role="alert">
              {error}
            </p>
          )}
          {notice && <p role="status">{notice}</p>}
          <details open={!connection} className="deployment-settings">
            <summary>
              {connection
                ? `Vercel connection · ${connection.name}`
                : "Vercel connection settings"}
            </summary>
            <label>
              Vercel project name
              <input
                value={name}
                disabled={busy || connection?.active}
                onChange={(e) => setName(e.target.value)}
                placeholder="my-website"
              />
            </label>
            <label>
              Vercel project ID
              <input
                value={providerProjectId}
                disabled={busy || connection?.active}
                onChange={(e) => setProviderProjectId(e.target.value)}
                placeholder="prj_…"
              />
            </label>
            <label>
              Vercel team ID (optional)
              <input
                value={teamId}
                disabled={busy || connection?.active}
                onChange={(e) => setTeamId(e.target.value)}
                placeholder="team_…"
              />
            </label>
            <label>
              {connection ? "Replacement Vercel token" : "Vercel token"}
              <input
                type="password"
                autoComplete="off"
                value={token}
                disabled={busy}
                onChange={(e) => setToken(e.target.value)}
              />
            </label>
            <p>
              The token is encrypted on the server. Saved values are never
              returned to the browser.
            </p>
            <button
              disabled={busy || !loaded || !validTarget || token.length < 10}
              onClick={() =>
                void run(async () => {
                  const result = await request("/api/deploy", {
                    action: "connect",
                    ownerId,
                    projectId,
                    target: {
                      name,
                      providerProjectId,
                      ...(teamId ? { teamId } : {}),
                    },
                    token,
                    version: connection?.version || 0,
                  });
                  if (!alive.current) return;
                  setConnection(result);
                  setToken("");
                  initialized.current = true;
                  setNotice(
                    "Connection saved. No deployment has been submitted.",
                  );
                })
              }
            >
              {connection
                ? "Replace authorization"
                : "Save deployment connection"}
            </button>
          </details>
          {connection && (
            <>
              {services.map((service) => (
                <label key={service.id}>
                  {service.name} API origin
                  <input
                    type="url"
                    value={origins[`API_ORIGIN_${service.port}`] || ""}
                    placeholder="https://api.example.com"
                    disabled={busy || retryQueue}
                    onChange={(e) =>
                      setOrigins((value) => ({
                        ...value,
                        [`API_ORIGIN_${service.port}`]: e.target.value,
                      }))
                    }
                  />
                </label>
              ))}
              <button
                className="primary"
                disabled={busy || blocked || connection.active || !validOrigins}
                onClick={() =>
                  void run(async () => {
                    if (!pending.current)
                      pending.current = {
                        action: "deploy",
                        ownerId,
                        projectId,
                        project: currentProject(),
                        environment,
                        version: connection.version,
                        sequence: connection.sequence,
                        operationId: crypto.randomUUID(),
                      };
                    setRetryQueue(true);
                    const result = await request(
                      "/api/deploy",
                      pending.current,
                    );
                    if (!alive.current) return;
                    setConnection(result);
                    pending.current = null;
                    setRetryQueue(false);
                    setNotice(
                      "Snapshot queued. The worker will submit a frontend preview.",
                    );
                  })
                }
              >
                {retryQueue ? "Retry queue request" : "Queue frontend preview"}
              </button>
              {blocked && (
                <p className="workspace-error">
                  Resolve Source &amp; checks errors before deploying.
                </p>
              )}
              {connection.active && latest && (
                <div className="deployment-actions">
                  {latest.state === "queued" && (
                    <button
                      disabled={busy}
                      onClick={() =>
                        void run(async () => {
                          const result = await request("/api/deploy", {
                            action: "cancel",
                            ownerId,
                            projectId,
                            operationId: latest.operationId,
                          });
                          if (alive.current) setConnection(result);
                        })
                      }
                    >
                      Cancel queued release
                    </button>
                  )}
                  {latest.state === "attention" && (
                    <button
                      disabled={busy}
                      onClick={() =>
                        void run(async () => {
                          const result = await request("/api/deploy", {
                            action: "refresh",
                            ownerId,
                            projectId,
                            operationId: latest.operationId,
                          });
                          if (alive.current) {
                            setConnection(result);
                            setNotice(
                              "Status recovery scheduled. No new build will be submitted.",
                            );
                          }
                        })
                      }
                    >
                      Resume status tracking
                    </button>
                  )}
                </div>
              )}
              <h3>Release history</h3>
              {!connection.history.length ? (
                <p>
                  No releases yet. Save your API addresses, then queue a
                  preview.
                </p>
              ) : (
                <ol className="deployment-history">
                  {[...connection.history].reverse().map((release) => (
                    <li key={release.operationId}>
                      <div>
                        <strong>
                          Release {release.sequence} ·{" "}
                          {release.providerState || release.state}
                        </strong>
                        <time dateTime={release.createdAt}>
                          {new Date(release.createdAt).toLocaleString()}
                        </time>
                      </div>
                      <p>{release.message}</p>
                      {release.state === "ready" &&
                        release.url &&
                        /^[A-Za-z0-9][A-Za-z0-9.-]*\.vercel\.app$/.test(
                          release.url,
                        ) && (
                          <a
                            href={`https://${release.url}`}
                            target="_blank"
                            rel="noopener noreferrer"
                          >
                            <ExternalLink size={14} /> Open frontend preview
                          </a>
                        )}
                      {release.providerId && (
                        <small>Deployment {release.providerId}</small>
                      )}
                    </li>
                  ))}
                </ol>
              )}
            </>
          )}
        </>
      )}
    </section>
  );
}
