"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import {
  FolderOpen,
  Save,
  Sparkles,
  Code2,
  Rocket,
  X,
  Download,
  GitBranch,
  History,
  Cloud,
  Plus,
  RefreshCw,
} from "lucide-react";
import { useEditorStore } from "@/store/editorStore";
import { useBackendStore } from "@/store/backendStore";
import { useRoutingStore } from "@/store/routingStore";
import {
  applyDesign,
  currentProject,
  flushWorkspace,
  initializeWorkspace,
  openWorkspace,
  reopenSavedWorkspace,
  recoverSavedWorkspace,
  updateSource,
  useWorkspaceStore,
} from "@/store/workspaceStore";
import { downloadProject, emptyProject } from "@/lib/project/workspace";
import {
  designFingerprint,
  MAX_PROJECT_BYTES,
  parseProjectJSON,
  redactProject,
  serviceSlug,
  type ProjectDocument,
} from "@/lib/project/schema";
import {
  listCheckpoints,
  listProjects,
  getProject,
  type Checkpoint,
  type SavedProject,
} from "@/lib/project/storage";
import { compileProject } from "@/lib/project/compiler";
import { exportAsZip } from "@/lib/codegen/exporter";
import { validateFiles } from "@/lib/codegen/files";
import "./workspace.css";
import SecretsPanel from "./SecretsPanel";

type Panel = "projects" | "ai" | "source" | "ship" | "secrets";
type Proposal = {
  summary: string;
  project?: ProjectDocument;
  files?: Record<string, string>;
  basedOn: string;
};
async function api(
  path: string,
  body?: unknown,
  method = "POST",
  signal?: AbortSignal,
) {
  const response = await fetch(path, {
    method,
    cache: "no-store",
    signal,
    headers: { "Content-Type": "application/json" },
    ...(body !== undefined ? { body: JSON.stringify(body) } : {}),
  });
  const data = await response.json();
  if (!response.ok)
    throw new Error(data.error || `Request failed (${response.status})`);
  return data;
}
function projectSignature() {
  const p = currentProject();
  return designFingerprint(p) + JSON.stringify(p.source || {});
}

export default function WorkspaceHub() {
  const workspace = useWorkspaceStore();
  const editor = useEditorStore();
  const backend = useBackendStore();
  const routing = useRoutingStore();
  const [panel, setPanel] = useState<Panel | null>(null);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");
  const [projects, setProjects] = useState<SavedProject[]>([]);
  const [history, setHistory] = useState<Checkpoint[]>([]);
  const [cloudProjects, setCloudProjects] = useState<
    { projectId: string; name: string; updatedAt: string }[]
  >([]);
  const [provider, setProvider] = useState("huggingface");
  const [model, setModel] = useState("");
  const [apiKey, setApiKey] = useState("");
  const [prompt, setPrompt] = useState("");
  const [mode, setMode] = useState("design");
  const [proposal, setProposal] = useState<Proposal | null>(null);
  const [selectedFile, setSelectedFile] = useState("");
  const [query, setQuery] = useState("");
  const [githubToken, setGithubToken] = useState("");
  const [owner, setOwner] = useState("");
  const [repo, setRepo] = useState("");
  const [branch, setBranch] = useState("main");
  const [head, setHead] = useState("");
  const [commitMessage, setCommitMessage] = useState("Save Levoks progress");
  const [autoCommit, setAutoCommit] = useState(false);
  const [vercelToken, setVercelToken] = useState("");
  const [origins, setOrigins] = useState<Record<string, string>>({});
  const [deployment, setDeployment] = useState<{
    id: string;
    url: string;
    state: string;
  } | null>(null);
  const [lastCommit, setLastCommit] = useState("");
  const dialog = useRef<HTMLDialogElement>(null);
  const importInput = useRef<HTMLInputElement>(null);
  const abort = useRef<AbortController | null>(null);
  const operation = useRef(false);
  const autoCommitAction = useRef<() => void>(() => {});

  const compilation = useMemo(() => {
    if (!panel || !workspace.ready) return null;
    try {
      return { value: compileProject(currentProject()), error: "" };
    } catch (error) {
      return {
        value: null,
        error:
          error instanceof Error ? error.message : "Project validation failed",
      };
    }
    // Each immutable canvas slice can affect generation.
  }, [
    panel,
    workspace.ready,
    workspace.name,
    workspace.source,
    editor.elementsById,
    editor.pages,
    editor.rootIds,
    editor.globalRootIds,
    editor.pageElementMap,
    editor.activePageId,
    editor.canvasSettings,
    backend.services,
    backend.connections,
    routing.nodes,
    routing.connections,
  ]);
  const files = compilation?.value?.files || {};
  const activeFile =
    selectedFile in files ? selectedFile : Object.keys(files).sort()[0] || "";
  const diagnostics = compilation?.value?.diagnostics || [];
  const blocked =
    !!compilation?.error || diagnostics.some((d) => d.severity === "error");

  useEffect(() => {
    void initializeWorkspace();
  }, []);
  useEffect(() => {
    const open = (event: Event) => {
      setPanel((event as CustomEvent<Panel>).detail);
      void refreshProjects().catch(() => {});
    };
    const save = (event: KeyboardEvent) => {
      if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === "s") {
        event.preventDefault();
        void flushWorkspace("Manual save").catch(() => {});
      }
    };
    window.addEventListener("levoks:panel", open);
    window.addEventListener("keydown", save);
    return () => {
      window.removeEventListener("levoks:panel", open);
      window.removeEventListener("keydown", save);
    };
  }, []);
  useEffect(() => {
    if (panel) dialog.current?.showModal();
    else dialog.current?.close();
  }, [panel]);
  useEffect(() => {
    autoCommitAction.current = () => {
      if (!operation.current && projectSignature() !== lastCommit)
        void run(async () => {
          await commit();
        });
    };
  });
  useEffect(
    () =>
      useWorkspaceStore.subscribe((next, previous) => {
        if (next.id !== previous.id) {
          setAutoCommit(false);
          setProposal(null);
          setLastCommit("");
        }
      }),
    [],
  );
  useEffect(() => {
    if (!autoCommit) return;
    const interval = setInterval(() => autoCommitAction.current(), 300_000);
    return () => clearInterval(interval);
  }, [autoCommit]);
  useEffect(() => {
    if (
      !deployment ||
      ["READY", "ERROR", "CANCELED"].includes(deployment.state) ||
      !vercelToken
    )
      return;
    const controller = new AbortController();
    const timer = setTimeout(() => {
      api(
        "/api/deploy",
        { token: vercelToken, action: "status", deploymentId: deployment.id },
        "POST",
        controller.signal,
      )
        .then(setDeployment)
        .catch((e) => {
          if (!controller.signal.aborted) setError(e.message);
        });
    }, 5000);
    return () => {
      clearTimeout(timer);
      controller.abort();
    };
  }, [deployment, vercelToken]);

  async function run(action: () => Promise<void>) {
    if (operation.current) return;
    operation.current = true;
    setBusy(true);
    setError("");
    setMessage("");
    try {
      await action();
    } catch (error) {
      if (!(error instanceof DOMException && error.name === "AbortError"))
        setError(
          error instanceof Error
            ? error.message
            : "Operation failed. Please try again.",
        );
    } finally {
      operation.current = false;
      setBusy(false);
    }
  }
  async function refreshProjects() {
    setProjects(await listProjects());
    setHistory(await listCheckpoints(useWorkspaceStore.getState().id));
  }
  function buildFiles() {
    const output = compileProject(currentProject());
    const errors = output.diagnostics.filter((d) => d.severity === "error");
    if (errors.length) throw new Error(errors.map((d) => d.message).join("\n"));
    return output.files;
  }
  async function generate() {
    const project = redactProject(currentProject());
    const basedOn = projectSignature();
    abort.current = new AbortController();
    const result = await api(
      "/api/ai",
      { project, provider, apiKey, model, prompt, mode },
      "POST",
      abort.current.signal,
    );
    setProposal({ ...result, basedOn });
    setMessage("Proposal ready. Review it before applying.");
  }
  async function commit() {
    if (!head) throw new Error("Connect the repository and branch first.");
    const signature = projectSignature();
    try {
      const result = await api("/api/github", {
        action: "commit",
        token: githubToken,
        owner,
        repo,
        branch,
        expectedHead: head,
        projectId: workspace.id,
        files: buildFiles(),
        message: commitMessage,
      });
      setHead(result.sha);
      setLastCommit(signature);
      setMessage(
        result.unchanged
          ? "No source changes to commit."
          : `Committed ${result.sha.slice(0, 7)} to ${owner}/${repo}.`,
      );
      await flushWorkspace("GitHub commit");
    } catch (error) {
      setAutoCommit(false);
      throw error;
    }
  }
  function changeTarget(setter: (value: string) => void, value: string) {
    setter(value);
    setHead("");
    setAutoCommit(false);
  }
  const openPanel = (next: Panel) => {
    setPanel(next);
    if (next === "projects") void run(refreshProjects);
  };

  return (
    <>
      <div className="workspace-actions">
        <button
          className="header-btn"
          onClick={() => openPanel("projects")}
          disabled={!workspace.ready}
        >
          <FolderOpen size={14} />{" "}
          <span className="workspace-name">{workspace.name}</span>
        </button>
        <button
          className={`autosave-toggle ${workspace.autosave ? "on" : "off"}`}
          onClick={workspace.toggleAutosave}
          disabled={!workspace.ready}
          title={workspace.status}
        >
          Autosave {workspace.autosave ? "On" : "Off"}
        </button>
        <span className="workspace-status" role="status">
          {workspace.error ? "Save needs attention" : workspace.status}
        </span>
        <button
          className="header-icon-btn"
          aria-label="Save project"
          title="Save (Ctrl+S)"
          onClick={() =>
            void run(async () => {
              await flushWorkspace("Manual save");
              setMessage("Project saved on this device.");
            })
          }
          disabled={!workspace.ready || busy}
        >
          <Save size={15} />
        </button>
        <button
          className="header-btn"
          onClick={() => openPanel("ai")}
          disabled={!workspace.ready}
        >
          <Sparkles size={14} /> AI
        </button>
        <button
          className="header-btn"
          onClick={() => openPanel("source")}
          disabled={!workspace.ready}
        >
          <Code2 size={14} /> Code
        </button>
        <button
          className="header-btn primary"
          onClick={() => openPanel("ship")}
          disabled={!workspace.ready}
        >
          <Rocket size={14} /> Ship
        </button>
      </div>
      {workspace.error && !panel && (
        <button
          className="workspace-alert"
          role="alert"
          onClick={() => openPanel("projects")}
        >
          {workspace.error}
        </button>
      )}
      {!workspace.ready && (
        <div className="workspace-loading" role="status">
          Opening your workspace…
        </div>
      )}
      {panel && (
        <dialog
          ref={dialog}
          aria-label="Levoks project workspace"
          className="workspace-dialog"
          onCancel={(event) => {
            if (busy) event.preventDefault();
            else setPanel(null);
          }}
        >
          <div className="workspace-dialog-header">
            <div>
              <strong>Levoks workspace</strong>
              <small>{workspace.name}</small>
            </div>
            <button
              aria-label="Close workspace"
              disabled={busy}
              onClick={() => setPanel(null)}
            >
              <X size={18} />
            </button>
          </div>
          <nav className="workspace-tabs" aria-label="Workspace tools">
            {(
              [
                ["projects", FolderOpen, "Projects"],
                ["ai", Sparkles, "AI assistant"],
                ["source", Code2, "Source & checks"],
                ["secrets", Save, "Secrets"],
                ["ship", Rocket, "Export & deploy"],
              ] as const
            ).map(([id, Icon, label]) => (
              <button
                key={id}
                aria-current={panel === id ? "page" : undefined}
                className={panel === id ? "active" : ""}
                onClick={() => openPanel(id)}
              >
                <Icon size={16} />
                {label}
              </button>
            ))}
          </nav>
          <div className="workspace-feedback" aria-live="polite">
            {busy && <p>Working…</p>}
            {(error || workspace.error) && (
              <p role="alert" className="workspace-error">
                {error || workspace.error}
              </p>
            )}
            {message && <p className="workspace-success">{message}</p>}
          </div>
          <div className="workspace-content">
            {panel === "secrets" && <SecretsPanel key={workspace.id} projectId={workspace.id} />}
            {panel === "projects" && (
              <div className="workspace-grid">
                <section>
                  <h2>Your project</h2>
                  <p>
                    Autosaved on this device. Download a backup or save to your
                    account to work elsewhere.
                  </p>
                  <label>
                    Project name
                    <input
                      value={workspace.name}
                      maxLength={100}
                      onChange={(e) => workspace.rename(e.target.value)}
                      onBlur={() => {
                        if (!workspace.name.trim())
                          workspace.rename("Untitled project");
                      }}
                    />
                  </label>
                  <div className="workspace-button-row">
                    <button
                      disabled={busy}
                      onClick={() =>
                        void run(async () => {
                          await flushWorkspace("Manual checkpoint");
                          await refreshProjects();
                          setMessage("Checkpoint saved.");
                        })
                      }
                    >
                      <Save size={15} /> Save checkpoint
                    </button>
                    <button
                      onClick={() =>
                        void run(async () => {
                          downloadProject(redactProject(currentProject()));
                        })
                      }
                    >
                      <Download size={15} /> Backup JSON
                    </button>
                  </div>
                  <div className="workspace-button-row">
                    <button
                      disabled={busy}
                      onClick={() =>
                        void run(async () => {
                          await openWorkspace(emptyProject());
                          await refreshProjects();
                        })
                      }
                    >
                      <Plus size={15} /> New project
                    </button>
                    <button
                      disabled={busy}
                      onClick={() => importInput.current?.click()}
                    >
                      Import backup
                    </button>
                  </div>
                  <input
                    ref={importInput}
                    hidden
                    type="file"
                    accept=".json"
                    onChange={(event) => {
                      const file = event.target.files?.[0];
                      event.target.value = "";
                      if (!file) return;
                      void run(async () => {
                        if (file.size > MAX_PROJECT_BYTES)
                          throw new Error("Project exceeds 5 MB.");
                        const project = parseProjectJSON(await file.text());
                        await openWorkspace({
                          ...project,
                          id: crypto.randomUUID(),
                          name: `${project.name.slice(0, 90)} (import)`,
                        });
                        await refreshProjects();
                      });
                    }}
                  />
                  <h3>
                    <FolderOpen size={16} /> Saved on this device
                  </h3>
                  {workspace.error && (
                    <button
                      disabled={busy}
                      onClick={() =>
                        void run(async () => {
                          downloadProject(redactProject(currentProject()));
                          await recoverSavedWorkspace();
                          await refreshProjects();
                          setMessage(
                            "Recovery backup downloaded; reopened the saved version.",
                          );
                        })
                      }
                    >
                      Back up &amp; reopen saved version
                    </button>
                  )}
                  {projects.map((project) => (
                    <button
                      className="workspace-list-item"
                      key={project.id}
                      disabled={busy}
                      onClick={() =>
                        void run(async () => {
                          await reopenSavedWorkspace(project.id);
                          await refreshProjects();
                        })
                      }
                    >
                      <span>{project.name}</span>
                      <small>
                        {new Date(project.updatedAt).toLocaleString()}
                      </small>
                    </button>
                  ))}
                  <h3>
                    <History size={16} /> Restore a checkpoint
                  </h3>
                  <p>
                    The last 20 checkpoints are kept. Restoring saves your
                    current work first.
                  </p>
                  {history.length ? (
                    history.map((item) => (
                      <button
                        className="workspace-list-item"
                        key={item.id}
                        disabled={busy}
                        onClick={() =>
                          void run(async () => {
                            await applyDesign(item.document);
                            await refreshProjects();
                            setMessage("Checkpoint restored.");
                          })
                        }
                      >
                        <span>{item.label}</span>
                        <small>
                          {new Date(item.createdAt).toLocaleString()}
                        </small>
                      </button>
                    ))
                  ) : (
                    <p>No checkpoints yet.</p>
                  )}
                </section>
                <section>
                  <h2>
                    <Cloud size={20} /> Cloud projects
                  </h2>
                  <p>
                    Sign in using your profile menu. Cloud saves use revision
                    checks to prevent overwriting changes from another device.
                  </p>
                  <button
                    disabled={busy}
                    onClick={() =>
                      void run(async () => {
                        const project = redactProject(currentProject());
                        const key = `levoks-cloud-revision:${project.id}`;
                        const result = await api(
                          "/api/projects",
                          {
                            project,
                            revision: Number(localStorage.getItem(key) || 0),
                          },
                          "PUT",
                        );
                        localStorage.setItem(key, String(result.revision));
                        setMessage("Saved to your account.");
                      })
                    }
                  >
                    Save to account
                  </button>
                  <button
                    disabled={busy}
                    onClick={() =>
                      void run(async () => {
                        setCloudProjects(
                          await api("/api/projects", undefined, "GET"),
                        );
                      })
                    }
                  >
                    <RefreshCw size={15} /> Load cloud projects
                  </button>
                  {cloudProjects.map((project) => (
                    <button
                      className="workspace-list-item"
                      key={project.projectId}
                      disabled={busy}
                      onClick={() =>
                        void run(async () => {
                          const remote = await api(
                            `/api/projects?id=${encodeURIComponent(project.projectId)}`,
                            undefined,
                            "GET",
                          );
                          await flushWorkspace("Before cloud restore");
                          const local = await getProject(project.projectId);
                          await openWorkspace(
                            remote.document,
                            local?.revision || 0,
                          );
                          useWorkspaceStore.setState({ dirty: true });
                          await flushWorkspace("Cloud restore");
                          localStorage.setItem(
                            `levoks-cloud-revision:${project.projectId}`,
                            String(remote.revision),
                          );
                          await refreshProjects();
                        })
                      }
                    >
                      <span>{project.name}</span>
                      <small>
                        {new Date(project.updatedAt).toLocaleString()}
                      </small>
                    </button>
                  ))}
                  <h3>Keyboard shortcuts</h3>
                  <p>
                    Ctrl/Cmd + S saves a checkpoint. Ctrl/Cmd + Z undoes a
                    canvas edit. Ctrl/Cmd + D duplicates the selection. Delete
                    removes it.
                  </p>
                </section>
              </div>
            )}
            {panel === "ai" && (
              <div className="workspace-grid">
                <section>
                  <h2>Build with your own AI</h2>
                  <p>
                    Describe a design or code change. Levoks sends the project
                    and its IR to your selected provider. Your key is held only
                    in this tab&apos;s memory; provider usage is billed to your
                    account.
                  </p>
                  <label>
                    Provider
                    <select
                      value={provider}
                      onChange={(e) => setProvider(e.target.value)}
                    >
                      <option value="huggingface">
                        Hugging Face Inference Providers
                      </option>
                      <option value="openrouter">OpenRouter</option>
                    </select>
                  </label>
                  <label>
                    API key
                    <input
                      type="password"
                      autoComplete="off"
                      value={apiKey}
                      onChange={(e) => setApiKey(e.target.value)}
                    />
                  </label>
                  <label>
                    Model ID
                    <input
                      value={model}
                      onChange={(e) => setModel(e.target.value)}
                      placeholder="Provider model ID, e.g. organization/model"
                    />
                  </label>
                  <label>
                    Change type
                    <select
                      value={mode}
                      onChange={(e) => setMode(e.target.value)}
                    >
                      <option value="design">
                        Visual design → editable canvas
                      </option>
                      <option value="code">
                        Full-stack code → source files
                      </option>
                    </select>
                  </label>
                  <label>
                    Your request
                    <textarea
                      rows={6}
                      value={prompt}
                      maxLength={12000}
                      onChange={(e) => setPrompt(e.target.value)}
                      placeholder="Create a pricing page with three plans, a comparison section, and a clear call to action…"
                    />
                  </label>
                  <button
                    className="primary"
                    disabled={
                      busy || !apiKey || !model.trim() || !prompt.trim()
                    }
                    onClick={() => void run(generate)}
                  >
                    <Sparkles size={15} /> Generate proposal
                  </button>
                  {busy && (
                    <button onClick={() => abort.current?.abort()}>
                      Cancel generation
                    </button>
                  )}
                </section>
                <section>
                  <h2>Review proposed changes</h2>
                  {proposal ? (
                    <>
                      <p>{proposal.summary}</p>
                      <div className="workspace-stat">
                        {proposal.project
                          ? `${proposal.project.editor.pages.length} pages · ${Object.keys(proposal.project.editor.elementsById).length} elements · ${proposal.project.backend.services.length} services`
                          : `${Object.keys(proposal.files || {}).length} source files`}
                      </div>
                      <details>
                        <summary>Inspect proposal JSON</summary>
                        <pre className="workspace-json">
                          {JSON.stringify(
                            proposal.project || proposal.files,
                            null,
                            2,
                          )}
                        </pre>
                      </details>
                      <p>
                        {proposal.project
                          ? "Applying creates a checkpoint of your current design first."
                          : "Code changes are saved separately from the visual canvas. Future canvas edits require regenerating or reconciling the source."}
                      </p>
                      <button
                        className="primary"
                        disabled={busy}
                        onClick={() =>
                          void run(async () => {
                            if (proposal.basedOn !== projectSignature())
                              throw new Error(
                                "Your project changed while this proposal was generated. Generate a fresh proposal to avoid overwriting your work.",
                              );
                            if (proposal.project)
                              await applyDesign(proposal.project, true);
                            else if (proposal.files) {
                              await flushWorkspace("Before AI code");
                              updateSource(validateFiles(proposal.files));
                              await flushWorkspace("AI source applied");
                            }
                            setProposal(null);
                            setMessage("Proposal applied and saved.");
                          })
                        }
                      >
                        Apply proposal
                      </button>
                      <button onClick={() => setProposal(null)}>Discard</button>
                    </>
                  ) : (
                    <div className="workspace-empty">
                      <Sparkles size={28} />
                      <p>
                        Your proposed changes will appear here. Nothing changes
                        until you apply them.
                      </p>
                    </div>
                  )}
                </section>
              </div>
            )}
            {panel === "source" && (
              <section>
                <div className="workspace-section-heading">
                  <div>
                    <h2>Full-stack source</h2>
                    <p>
                      {Object.keys(files).length} files ·{" "}
                      {workspace.source
                        ? "Edited source"
                        : "Generated from the canvas"}
                    </p>
                  </div>
                  <div>
                    <button
                      disabled={busy}
                      onClick={() =>
                        void run(async () => {
                          await flushWorkspace("Before source regeneration");
                          updateSource();
                          setMessage(
                            "Source regenerated from the visual project.",
                          );
                        })
                      }
                    >
                      Regenerate from canvas
                    </button>
                    <button
                      disabled={busy || blocked}
                      onClick={() =>
                        void run(async () => {
                          await exportAsZip(buildFiles(), workspace.name);
                        })
                      }
                    >
                      <Download size={15} /> ZIP
                    </button>
                  </div>
                </div>
                {(compilation?.error || diagnostics.length > 0) && (
                  <details className="workspace-diagnostics" open={blocked}>
                    <summary>
                      {blocked
                        ? "Resolve these issues before exporting"
                        : `${diagnostics.length} design notes`}
                    </summary>
                    {compilation?.error && (
                      <p className="workspace-error">{compilation.error}</p>
                    )}
                    {diagnostics.map((d, i) => (
                      <p
                        className={
                          d.severity === "error" ? "workspace-error" : ""
                        }
                        key={i}
                      >
                        {d.message}
                      </p>
                    ))}
                  </details>
                )}
                <div className="workspace-code">
                  <aside>
                    <input
                      aria-label="Filter source files"
                      placeholder="Find a file…"
                      value={query}
                      onChange={(e) => setQuery(e.target.value)}
                    />
                    {Object.keys(files)
                      .sort()
                      .filter((file) =>
                        file.toLowerCase().includes(query.toLowerCase()),
                      )
                      .map((file) => (
                        <button
                          key={file}
                          className={activeFile === file ? "active" : ""}
                          onClick={() => setSelectedFile(file)}
                        >
                          {file}
                        </button>
                      ))}
                  </aside>
                  <div>
                    <div className="workspace-file-title">
                      {activeFile || "No source available"}
                    </div>
                    <textarea
                      aria-label={`Source code for ${activeFile}`}
                      spellCheck={false}
                      value={files[activeFile] || ""}
                      disabled={!activeFile || activeFile.startsWith("levoks.")}
                      onChange={(e) =>
                        updateSource({ ...files, [activeFile]: e.target.value })
                      }
                    />
                  </div>
                </div>
              </section>
            )}
            {panel === "ship" && (
              <div className="workspace-grid">
                <section>
                  <h2>Export the complete application</h2>
                  <p>
                    Download all pages, Express services, Docker configuration,
                    and the visual project. Secret values are replaced with
                    environment placeholders.
                  </p>
                  <button
                    className="primary"
                    disabled={busy || blocked}
                    onClick={() =>
                      void run(async () => {
                        await exportAsZip(buildFiles(), workspace.name);
                        setMessage("ZIP downloaded.");
                      })
                    }
                  >
                    <Download size={16} /> Download full-stack ZIP
                  </button>
                  {blocked && (
                    <p className="workspace-error">
                      Export checks need attention. Open Source &amp; checks for
                      details.
                    </p>
                  )}
                  <h2>
                    <GitBranch size={20} /> Save progress to GitHub
                  </h2>
                  <p>
                    Use an existing repository with at least one commit and a
                    fine-grained token with Contents read/write access.
                    Generated files are managed in{" "}
                    <code>levoks/{workspace.id}/</code>.
                  </p>
                  <label>
                    GitHub token
                    <input
                      type="password"
                      autoComplete="off"
                      value={githubToken}
                      onChange={(e) =>
                        changeTarget(setGithubToken, e.target.value)
                      }
                    />
                  </label>
                  <div className="workspace-field-row">
                    <label>
                      Owner
                      <input
                        value={owner}
                        onChange={(e) => changeTarget(setOwner, e.target.value)}
                      />
                    </label>
                    <label>
                      Repository
                      <input
                        value={repo}
                        onChange={(e) => changeTarget(setRepo, e.target.value)}
                      />
                    </label>
                  </div>
                  <label>
                    Branch
                    <input
                      value={branch}
                      onChange={(e) => changeTarget(setBranch, e.target.value)}
                    />
                  </label>
                  <button
                    disabled={busy || !githubToken || !owner || !repo}
                    onClick={() =>
                      void run(async () => {
                        const result = await api("/api/github", {
                          action: "connect",
                          token: githubToken,
                          owner,
                          repo,
                          branch,
                          projectId: workspace.id,
                        });
                        setHead(result.sha);
                        setMessage(
                          `Connected at commit ${result.sha.slice(0, 7)}.`,
                        );
                      })
                    }
                  >
                    Connect / refresh branch
                  </button>
                  {head && (
                    <>
                      <label>
                        Commit message
                        <input
                          value={commitMessage}
                          maxLength={200}
                          onChange={(e) => setCommitMessage(e.target.value)}
                        />
                      </label>
                      <button
                        disabled={busy || blocked || !commitMessage.trim()}
                        onClick={() => void run(commit)}
                      >
                        Commit reviewed source
                      </button>
                      <label className="workspace-check">
                        <input
                          type="checkbox"
                          checked={autoCommit}
                          onChange={(e) => setAutoCommit(e.target.checked)}
                        />{" "}
                        Commit changed source every 5 minutes while this tab is
                        open
                      </label>
                      <p>
                        Automatic commits stop on errors or conflicts.
                        Credentials are cleared when this tab reloads.
                      </p>
                    </>
                  )}
                </section>
                <section>
                  <h2>
                    <Rocket size={20} /> Deploy frontend to Vercel
                  </h2>
                  <p>
                    Create a preview deployment of the generated Next.js
                    frontend. Backend services must be deployed on a container
                    host; enter their HTTPS addresses below before building.
                  </p>
                  <label>
                    Vercel token
                    <input
                      type="password"
                      autoComplete="off"
                      value={vercelToken}
                      onChange={(e) => setVercelToken(e.target.value)}
                    />
                  </label>
                  {backend.services.map((service) => (
                    <label key={service.id}>
                      {service.name} API origin
                      <input
                        type="url"
                        placeholder="https://api.example.com"
                        value={origins[`NEXT_PUBLIC_API_${service.port}`] || ""}
                        onChange={(e) =>
                          setOrigins({
                            ...origins,
                            [`NEXT_PUBLIC_API_${service.port}`]: e.target.value,
                          })
                        }
                      />
                    </label>
                  ))}
                  <button
                    className="primary"
                    disabled={
                      busy ||
                      blocked ||
                      !vercelToken ||
                      backend.services.some(
                        (s) => !origins[`NEXT_PUBLIC_API_${s.port}`],
                      )
                    }
                    onClick={() =>
                      void run(async () => {
                        const result = await api("/api/deploy", {
                          action: "deploy",
                          token: vercelToken,
                          name: serviceSlug(workspace.name).slice(0, 81),
                          files: buildFiles(),
                          environment: origins,
                        });
                        setDeployment(result);
                        setMessage(
                          "Deployment submitted. Waiting for the provider build.",
                        );
                      })
                    }
                  >
                    Create preview deployment
                  </button>
                  {deployment && (
                    <div className="workspace-deployment">
                      <strong>{deployment.state}</strong>
                      <p>Deployment {deployment.id}</p>
                      {deployment.state === "READY" &&
                        /^[a-zA-Z0-9.-]+$/.test(deployment.url) && (
                          <a
                            href={`https://${deployment.url}`}
                            target="_blank"
                            rel="noopener noreferrer"
                          >
                            Open deployed website ↗
                          </a>
                        )}
                      {["ERROR", "CANCELED"].includes(deployment.state) && (
                        <p>
                          The build did not complete. Inspect the build logs in
                          your Vercel dashboard.
                        </p>
                      )}
                      <button
                        disabled={busy}
                        onClick={() =>
                          void run(async () => {
                            setDeployment(
                              await api("/api/deploy", {
                                action: "status",
                                token: vercelToken,
                                deploymentId: deployment.id,
                              }),
                            );
                          })
                        }
                      >
                        Refresh status
                      </button>
                    </div>
                  )}
                  <h3>Container deployment</h3>
                  <p>
                    The ZIP contains Dockerfiles for the frontend and each
                    backend service, plus backend Docker Compose. Set database
                    and authentication secrets in your hosting provider. No
                    provider token is included in exported source.
                  </p>
                </section>
              </div>
            )}
          </div>
        </dialog>
      )}
    </>
  );
}
