"use client";
import { useCallback, useEffect, useState } from "react";
import { currentProject } from "@/store/workspaceStore";
import { redactProject } from "@/lib/project/schema";
import type { ConnectionMetadata } from "@/lib/server/github-connections";

type Repository = { owner: string; name: string; defaultBranch: string };
type Branch = { name: string; sha: string; protected: boolean };
type Review = { sha: string; changes: { path: string; kind: string }[] };
async function request(projectId: string, body?: object) {
  const response = await fetch(
    `/api/connections/github${body ? "" : `?projectId=${encodeURIComponent(projectId)}`}`,
    {
      method: body ? "POST" : "GET",
      cache: "no-store",
      headers: { "Content-Type": "application/json" },
      ...(body ? { body: JSON.stringify({ projectId, ...body }) } : {}),
    },
  );
  const data = await response.json();
  if (!response.ok) throw new Error(data.error || "GitHub operation failed.");
  return data;
}
export default function GitHubPanel({ projectId }: { projectId: string }) {
  const [connection, setConnection] = useState<ConnectionMetadata | null>(null);
  const [online, setOnline] = useState(false),
    [busy, setBusy] = useState(false),
    [error, setError] = useState("");
  const [token, setToken] = useState(""),
    [repos, setRepos] = useState<Repository[]>([]),
    [branches, setBranches] = useState<Branch[]>([]);
  const [repo, setRepo] = useState<Repository | null>(null),
    [branch, setBranch] = useState(""),
    [review, setReview] = useState<Review | null>(null);
  const [repoPage, setRepoPage] = useState(1),
    [moreRepos, setMoreRepos] = useState(false),
    [branchPage, setBranchPage] = useState(1),
    [moreBranches, setMoreBranches] = useState(false);
  const [newRepo, setNewRepo] = useState(""),
    [newBranch, setNewBranch] = useState(""),
    [message, setMessage] = useState("Save Levoks progress");
  const [history, setHistory] = useState<
    { sha: string; message: string; at: string }[]
  >([]);
  const refresh = useCallback(async () => {
    const result = await request(projectId);
    setConnection(result.connection);
    setOnline(result.workerOnline);
  }, [projectId]);
  useEffect(() => {
    let stopped = false;
    const poll = async () => {
      try {
        const r = await request(projectId);
        if (!stopped) {
          setConnection(r.connection);
          setOnline(r.workerOnline);
        }
      } catch (e) {
        if (!stopped) setError((e as Error).message);
      }
    };
    void poll();
    const timer = setInterval(() => void poll(), 10_000);
    return () => {
      stopped = true;
      clearInterval(timer);
    };
  }, [projectId]);
  async function run(action: () => Promise<void>) {
    setBusy(true);
    setError("");
    try {
      await action();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }
  const target = {
    token: token || undefined,
    owner: repo?.owner,
    repo: repo?.name,
    branch: branch || undefined,
  };
  async function listRepos(page = 1) {
    const r = await request(projectId, {
      action: "repositories",
      token: token || undefined,
      page,
    });
    setRepos((p) => (page === 1 ? r.repositories : [...p, ...r.repositories]));
    setMoreRepos(r.hasMore);
    setRepoPage(page);
  }
  async function selectRepo(next: Repository, page = 1) {
    setRepo(next);
    if (page === 1) {
      setBranch("");
      setBranches([]);
      setReview(null);
    }
    const r = await request(projectId, {
      action: "branches",
      token: token || undefined,
      owner: next.owner,
      repo: next.name,
      page,
    });
    setBranches((p) => (page === 1 ? r.branches : [...p, ...r.branches]));
    setMoreBranches(r.hasMore);
    setBranchPage(page);
    if (page === 1)
      setBranch(
        r.branches.some((b: Branch) => b.name === next.defaultBranch)
          ? next.defaultBranch
          : r.branches[0]?.name || "",
      );
  }
  return (
    <div className="workspace-grid">
      <section>
        <h2>GitHub connection</h2>
        <p>
          Connect a repository using a fine-grained token with Contents
          read/write access. The token is encrypted on the server and never
          included in the project or exported files.
        </p>
        {error && (
          <p role="alert" className="workspace-error">
            {error}
          </p>
        )}
        <p role="status">
          {connection
            ? `${connection.owner}/${connection.repo} · ${connection.branch} · ${connection.status}`
            : "No repository connected"}
        </p>
        {connection && <p>{connection.message}</p>}
        <p>
          {online
            ? "Background worker is online."
            : "Background worker is offline. Queued snapshots remain saved until it starts."}
        </p>
        <label>
          GitHub access token
          <input
            type="password"
            autoComplete="off"
            value={token}
            onChange={(e) => {
              setToken(e.target.value);
              setReview(null);
            }}
            placeholder={
              connection
                ? "Leave empty to use the saved authorization"
                : "Fine-grained personal access token"
            }
          />
        </label>
        <button
          disabled={busy || (!token && !connection)}
          onClick={() => void run(() => listRepos())}
        >
          Find repositories
        </button>
        <label>
          Repository
          <select
            value={repo ? `${repo.owner}/${repo.name}` : ""}
            onChange={(e) => {
              const r = repos.find(
                (r) => `${r.owner}/${r.name}` === e.target.value,
              );
              if (r) void run(() => selectRepo(r));
            }}
          >
            <option value="">Choose a repository</option>
            {repos.map((r) => (
              <option key={`${r.owner}/${r.name}`}>
                {r.owner}/{r.name}
              </option>
            ))}
          </select>
        </label>
        {moreRepos && (
          <button
            disabled={busy}
            onClick={() => void run(() => listRepos(repoPage + 1))}
          >
            More repositories
          </button>
        )}
        <label>
          Branch
          <select
            value={branch}
            onChange={(e) => {
              setBranch(e.target.value);
              setReview(null);
            }}
          >
            <option value="">Choose a branch</option>
            {branches.map((b) => (
              <option key={b.name} value={b.name}>
                {b.name}
                {b.protected ? " (protected)" : ""}
              </option>
            ))}
          </select>
        </label>
        {moreBranches && repo && (
          <button
            disabled={busy}
            onClick={() => void run(() => selectRepo(repo, branchPage + 1))}
          >
            More branches
          </button>
        )}
        <button
          disabled={busy || !repo || !branch}
          onClick={() =>
            void run(async () =>
              setReview(
                await request(projectId, {
                  action: "review",
                  ...target,
                  project: redactProject(currentProject()),
                }),
              ),
            )
          }
        >
          Review selected branch
        </button>
        {review && (
          <>
            <p>
              Reviewed branch head: <code>{review.sha.slice(0, 12)}</code>.{" "}
              {review.changes.length} managed files differ from the canvas.
            </p>
            <ul className="github-file-changes">
              {review.changes.map((c) => (
                <li key={c.path}>
                  {c.kind}: {c.path}
                </li>
              ))}
            </ul>
            <button
              disabled={busy}
              onClick={() =>
                void run(async () => {
                  setConnection(
                    await request(projectId, {
                      action: "connect",
                      ...target,
                      expectedHead: review.sha,
                      version: connection?.version || 0,
                    }),
                  );
                  setToken("");
                  setReview(null);
                })
              }
            >
              Connect reviewed branch
            </button>
          </>
        )}
        <details>
          <summary>Create repository or branch</summary>
          <label>
            New private repository name
            <input
              value={newRepo}
              onChange={(e) => setNewRepo(e.target.value)}
            />
          </label>
          <button
            disabled={busy || !newRepo || (!token && !connection)}
            onClick={() =>
              void run(async () => {
                const r = await request(projectId, {
                  action: "createRepository",
                  token: token || undefined,
                  repo: newRepo,
                  private: true,
                });
                await listRepos();
                await selectRepo(r);
                setNewRepo("");
              })
            }
          >
            Create private repository on GitHub
          </button>
          <label>
            New branch name
            <input
              value={newBranch}
              onChange={(e) => setNewBranch(e.target.value)}
            />
          </label>
          <button
            disabled={busy || !repo || !branch || !newBranch}
            onClick={() =>
              void run(async () => {
                await request(projectId, {
                  action: "createBranch",
                  ...target,
                  branch: newBranch,
                  expectedHead: branches.find((b) => b.name === branch)?.sha,
                });
                await selectRepo(repo!);
                setBranch(newBranch);
                setNewBranch("");
              })
            }
          >
            Create branch from selected head
          </button>
          {repo && branches.length === 0 && (
            <button
              disabled={busy}
              onClick={() =>
                void run(async () => {
                  await request(projectId, {
                    action: "initialize",
                    ...target,
                    branch: repo.defaultBranch || "main",
                  });
                  await selectRepo(repo);
                })
              }
            >
              Initialize empty repository with README
            </button>
          )}
        </details>
      </section>
      <section>
        <h2>Commit progress</h2>
        <p>
          Generated files are managed under <code>levoks/{projectId}/</code>.
          Remote changes pause synchronization for review. Updates never force
          push.
        </p>
        {connection && (
          <>
            <p>
              Recorded head: <code>{connection.head.slice(0, 12)}</code>.
              Snapshot {connection.processed} of {connection.sequence}{" "}
              processed.
            </p>
            <label>
              Commit message
              <input
                value={message}
                maxLength={200}
                onChange={(e) => setMessage(e.target.value)}
              />
            </label>
            <button
              disabled={
                busy ||
                !message.trim() ||
                ["conflict", "reauthorize", "failed"].includes(
                  connection.status,
                )
              }
              onClick={() =>
                void run(async () => {
                  setConnection(
                    await request(projectId, {
                      action: "queue",
                      project: redactProject(currentProject()),
                      sequence: connection.sequence,
                      version: connection.version,
                      message,
                    }),
                  );
                })
              }
            >
              Queue current application
            </button>
            <label>
              <input
                type="checkbox"
                checked={connection.automatic}
                disabled={busy || connection.status === "running"}
                onChange={(e) => {
                  const automatic = e.target.checked;
                  void run(async () =>
                    setConnection(
                      await request(projectId, {
                        action: "configure",
                        version: connection.version,
                        automatic,
                      }),
                    ),
                  );
                }}
              />{" "}
              Automatically commit cloud saves every five minutes
            </label>
            <p>
              Save your project to your account in Projects to publish a cloud
              revision. The server can commit that revision while this tab is
              closed. Local-only edits stay on this device.
            </p>
            <button
              disabled={busy || connection.status === "running"}
              onClick={() =>
                void run(async () =>
                  setConnection(
                    await request(projectId, {
                      action: "configure",
                      version: connection.version,
                      automatic: false,
                      cancel: true,
                    }),
                  ),
                )
              }
            >
              Cancel pending sync / clear error
            </button>
            <button
              disabled={
                busy ||
                connection.status === "running" ||
                connection.sequence !== connection.processed
              }
              onClick={() =>
                void run(async () => {
                  await request(projectId, {
                    action: "disconnect",
                    version: connection.version,
                  });
                  setConnection(null);
                  setReview(null);
                })
              }
            >
              Disconnect and delete stored token
            </button>
            <h3>Recent synchronization</h3>
            <ul>
              {connection.history
                .slice()
                .reverse()
                .map((c, i) => (
                  <li key={`${c.sha}-${i}`}>
                    <a
                      href={`https://github.com/${connection.owner}/${connection.repo}/commit/${c.sha}`}
                      target="_blank"
                      rel="noreferrer"
                    >
                      {c.sha.slice(0, 12)}
                    </a>{" "}
                    · {c.unchanged ? "No source changes" : "Committed"} ·{" "}
                    {new Date(c.at).toLocaleString()}
                  </li>
                ))}
            </ul>
            <button
              disabled={busy}
              onClick={() =>
                void run(async () =>
                  setHistory(await request(projectId, { action: "history" })),
                )
              }
            >
              Load GitHub commit history
            </button>
            <ul>
              {history.map((c) => (
                <li key={c.sha}>
                  <code>{c.sha.slice(0, 12)}</code> {c.message.split("\n")[0]} ·{" "}
                  {new Date(c.at).toLocaleString()}
                </li>
              ))}
            </ul>
          </>
        )}
        <button disabled={busy} onClick={() => void run(refresh)}>
          Refresh connection status
        </button>
      </section>
    </div>
  );
}
