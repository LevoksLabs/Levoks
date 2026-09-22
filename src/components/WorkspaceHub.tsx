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
  Link2,
  Check,
  ChevronDown,
  Circle,
  AlertCircle,
  LoaderCircle,
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
import SourceTools from "./SourceTools";
import SecretsPanel from "./SecretsPanel";
import GitHubPanel from "./GitHubPanel";
import { conversations, saveConversation, clearConversations, type ConversationEntry } from "@/lib/project/conversations";
import { readProposalStream, type GenerationProgress } from "@/lib/ai-stream";

type Panel = "projects" | "ai" | "source" | "ship" | "secrets" | "connections";
type Proposal = {
  conversationId?: string;
  usage?: {
    inputTokens: number | null;
    outputTokens: number | null;
    totalTokens: number | null;
  };
  changes?: { op: string; path: string; before: string; after: string }[];
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
  progress?: (event: GenerationProgress) => void,
) {
  const response = await fetch(path, {
    method,
    cache: "no-store",
    signal,
    headers: { "Content-Type": "application/json" },
    ...(body !== undefined ? { body: JSON.stringify(body) } : {}),
  });
  if (
    response.ok &&
    response.headers.get("content-type")?.includes("application/x-ndjson")
  )
    return readProposalStream(response, progress || (() => {}));
  const data = await response.json();
  if (!response.ok)
    throw new Error(data.error || `Request failed (${response.status})`);
  return data;
}
function projectSignature() {
  const p = currentProject();
  return JSON.stringify([p.id, p.name, designFingerprint(p), p.source || null]);
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
  const [chat, setChat] = useState<{ projectId: string; entries: ConversationEntry[] }>({ projectId: "", entries: [] });
  const [rememberChat, setRememberChat] = useState(true);
  const [includeChat, setIncludeChat] = useState(false);
  const [contextScope, setContextScope] = useState("project");
  const [chatError, setChatError] = useState("");
  const chatEntries = chat.projectId === workspace.id ? chat.entries : [];
  useEffect(() => {
    if (!workspace.ready) return;
    let active = true;
    void conversations(workspace.id).then(entries => { if (active) setChat({ projectId: workspace.id, entries }); }).catch(() => { if (active) setChatError("Conversation history is unavailable. Generation still works."); });
    return () => { active = false; };
  }, [workspace.id, workspace.ready]);
  async function recordConversation(entry: ConversationEntry) {
    setChat(current => ({ projectId: entry.projectId, entries: [...(current.projectId === entry.projectId ? current.entries.filter(item => item.id !== entry.id) : []), entry].slice(-50) }));
    if (rememberChat) try { await saveConversation(entry); } catch { setChatError("Could not save conversation history. Your project has not been changed."); }
  }
  async function markConversation(id: string | undefined, outcome: ConversationEntry["outcome"]) {
    const entry = chatEntries.find(item => item.id === id); if (entry) await recordConversation({ ...entry, outcome });
  }
  const [providerSettingsOpen, setProviderSettingsOpen] = useState(true);
  const [aiPosition, setAIPosition] = useState<{ x: number; y: number } | null>(
    null,
  );
  const aiDrag = useRef<{
    x: number;
    y: number;
    left: number;
    top: number;
  } | null>(null);
  const [mode, setMode] = useState("patch");
  const [maxOutputTokens, setMaxOutputTokens] = useState(4096);
  const [maxInputBytes, setMaxInputBytes] = useState(120000);
  const [streaming, setStreaming] = useState(true);
  const [streamText, setStreamText] = useState("");
  const [generationStatus, setGenerationStatus] = useState("");
  const [proposal, setProposal] = useState<Proposal | null>(null);
  const [selectedFile, setSelectedFile] = useState("");
  const [openFiles, setOpenFiles] = useState<string[]>([]);
  const lineNumbers = useRef<HTMLDivElement>(null);
  const [query, setQuery] = useState("");
  const [vercelToken, setVercelToken] = useState("");
  const [origins, setOrigins] = useState<Record<string, string>>({});
  const [deployment, setDeployment] = useState<{
    id: string;
    url: string;
    state: string;
  } | null>(null);
  const dialog = useRef<HTMLDialogElement>(null);
  const importInput = useRef<HTMLInputElement>(null);
  const abort = useRef<AbortController | null>(null);
  const operation = useRef(false);

  useEffect(() => {
    const keepAssistantVisible = () => {
      const bounds = dialog.current?.getBoundingClientRect();
      if (!bounds) return;
      setAIPosition((position) =>
        position
          ? {
              x: Math.max(
                8,
                Math.min(
                  position.x,
                  window.innerWidth - Math.min(bounds.width, 440) - 8,
                ),
              ),
              y: Math.max(
                8,
                Math.min(
                  position.y,
                  window.innerHeight -
                    Math.min(bounds.height, window.innerHeight - 120) -
                    8,
                ),
              ),
            }
          : null,
      );
    };
    window.addEventListener("resize", keepAssistantVisible);
    return () => window.removeEventListener("resize", keepAssistantVisible);
  }, []);

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
    editor.assets,
    editor.tokens,
    editor.components,
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
    const element = dialog.current;
    if (!element) return;
    if (element.open) element.close();
    if (panel === "ai") element.show();
    else if (panel) element.showModal();
  }, [panel]);
  useEffect(
    () =>
      useWorkspaceStore.subscribe((next, previous) => {
        if (next.id !== previous.id) {
          setProposal(null);
        }
      }),
    [],
  );
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
    const scope = contextScope === "selection" ? `Focus only on these selected element IDs: ${editor.selectedElementIds.join(", ")}.` : contextScope === "page" ? `Focus on page ${editor.activePageId} and its elements.` : "Consider the whole project.";
    if (contextScope === "selection" && !editor.selectedElementIds.length) throw new Error("Select one or more elements, or choose a different focus.");
    const recent = includeChat ? chatEntries.slice(-4).map(entry => ({ request: entry.prompt.slice(0, 1000), response: entry.summary.slice(0, 500), outcome: entry.outcome })) : [];
    const requestPrompt = `${scope} Preserve unaffected parts.\n${recent.length ? "Previous conversation (context only): " + JSON.stringify(recent) + "\n" : ""}Current request: ${prompt}`;
    if (requestPrompt.length > 12000) throw new Error("Request and conversation exceed 12,000 characters. Shorten the request or turn off recent conversation context.");
    const requestText = prompt;
    abort.current = new AbortController();
    setProposal(null);
    setStreamText("");
    setGenerationStatus("Connecting to provider…");
    try {
      const result = await api(
        "/api/ai",
        {
          project,
          provider,
          apiKey,
          model,
          prompt: requestPrompt,
          mode,
          maxOutputTokens,
          maxInputBytes,
          stream: streaming,
        },
        "POST",
        abort.current.signal,
        (event) => {
          if (event.type === "status") setGenerationStatus(event.message);
          else setStreamText((value) => (value + event.text).slice(-12000));
        },
      );
      const conversationId = crypto.randomUUID();
      const scrub = (text: string) => apiKey ? text.replaceAll(apiKey, "[provider key removed]") : text;
      await recordConversation({ id: conversationId, projectId: project.id, createdAt: new Date().toISOString(), prompt: scrub(requestText), summary: scrub(result.summary || "Proposal ready"), outcome: "review", tokens: result.usage?.totalTokens ?? null });
      setProposal({ ...result, basedOn, conversationId });
      setGenerationStatus("Proposal validated and ready for review.");
      setMessage("Proposal ready. Review it before applying.");
    } catch (error) {
      setGenerationStatus(
        abort.current.signal.aborted
          ? "Generation cancelled. No changes were applied."
          : "Generation failed. No changes were applied.",
      );
      throw error;
    }
  }
  const openPanel = (next: Panel) => {
    setPanel(next);
    if (next === "projects") void run(refreshProjects);
  };

  return (
    <>
      <div className="workspace-actions">
        <details className="header-action-menu" onKeyDown={event => { if (event.key === "Escape") { event.preventDefault(); event.currentTarget.open = false; event.currentTarget.querySelector("summary")?.focus(); } }}>
          <summary>Files <ChevronDown size={12} /></summary>
          <div onClick={event => event.currentTarget.closest("details")?.removeAttribute("open")}>
            <button disabled={!workspace.ready || busy} onClick={() => void run(async () => { await flushWorkspace("Before new project"); await openWorkspace(emptyProject()); await refreshProjects(); })}>New project</button>
            <button disabled={!workspace.ready} onClick={() => openPanel("projects")}>Open, rename or import…</button>
            <button disabled={!workspace.ready || busy} onClick={() => void run(async () => { await flushWorkspace("Manual checkpoint"); setMessage("Checkpoint saved."); })}>Save checkpoint</button>
            <button disabled={!workspace.ready || busy} onClick={() => void run(async () => { downloadProject(redactProject(currentProject())); })}>Download project backup</button>
            <button disabled={!workspace.ready || busy} onClick={() => void run(async () => { await exportAsZip(buildFiles(), workspace.name); })}>Download application ZIP</button>
          </div>
        </details>
        <button
          className="header-btn workspace-project-button"
          onClick={() => openPanel("projects")}
          title="Files and projects"
          disabled={!workspace.ready}
        >
          <FolderOpen size={14} />{" "}
          <span className="workspace-name">{workspace.name}</span>
          <ChevronDown size={12} />
        </button>
        <button
          className={`autosave-toggle ${workspace.autosave ? "on" : "off"}`}
          onClick={workspace.toggleAutosave}
          disabled={!workspace.ready}
          title={workspace.status}
          aria-pressed={workspace.autosave}
        >
          Autosave {workspace.autosave ? "On" : "Off"}
        </button>
        <span
          className="workspace-status"
          role="status"
          title={workspace.error || workspace.status}
          aria-label={
            workspace.error ? "Save needs attention" : workspace.status
          }
          data-state={
            workspace.error ? "error" : workspace.dirty ? "pending" : "saved"
          }
        >
          {workspace.error ? (
            <AlertCircle size={14} />
          ) : !workspace.ready || workspace.status === "Saving…" ? (
            <LoaderCircle size={14} />
          ) : workspace.dirty ? (
            <Circle size={10} />
          ) : (
            <Check size={14} />
          )}
          <span className="workspace-status-text">
            {workspace.error ? "Save needs attention" : workspace.status}
          </span>
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
          className="header-btn connections-action"
          onClick={() => openPanel("connections")}
          disabled={!workspace.ready}
          title="Manage provider connections"
        >
          <Link2 size={14} />
          <span>Connections</span>
        </button>
        <button
          className="header-btn"
          onClick={() => openPanel("ai")}
          title="AI assistant (Shift+G)"
          disabled={!workspace.ready}
        >
          <Sparkles size={14} /> AI
        </button>
        <button
          className="header-btn"
          onClick={() => openPanel("source")}
          title="Code (Shift+C)"
          disabled={!workspace.ready}
        >
          <Code2 size={14} /> Code
        </button>
        <button
          className="header-btn primary"
          onClick={() => openPanel("ship")}
          title="Deploy and export (Shift+D)"
          disabled={!workspace.ready}
        >
          <Rocket size={14} /> Deploy
        </button>
        <details className="header-action-menu deploy-action-menu" onKeyDown={event => { if (event.key === "Escape") { event.preventDefault(); event.currentTarget.open = false; event.currentTarget.querySelector("summary")?.focus(); } }}><summary aria-label="Deploy options"><ChevronDown size={12} /></summary><div onClick={event => event.currentTarget.closest("details")?.removeAttribute("open")}><button disabled={!workspace.ready} onClick={() => openPanel("ship")}>Configure deployment</button><button disabled={!workspace.ready || busy} onClick={() => void run(async () => { await exportAsZip(buildFiles(), workspace.name); })}>Download application ZIP</button><button disabled={!workspace.ready} onClick={() => openPanel("connections")}>Commit to GitHub…</button></div></details>
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
          <div className="workspace-loading-content">
            <img src="/levoks_logo.svg" width="32" height="32" alt="" />
            <strong>Opening your workspace</strong>
            <span>Restoring your project and saved changes.</span>
            <div className="loading-track" />
          </div>
        </div>
      )}
      {panel && (
        <dialog
          ref={dialog}
          aria-label="Levoks project workspace"
          aria-modal={panel === "ai" ? "false" : "true"}
          style={
            panel === "ai" && aiPosition
              ? {
                  left: aiPosition.x,
                  top: aiPosition.y,
                  right: "auto",
                  bottom: "auto",
                }
              : undefined
          }
          onKeyDown={(event) => {
            if (panel === "ai" && event.key === "Escape" && !busy) {
              event.preventDefault();
              setPanel(null);
            }
          }}
          className={`workspace-dialog workspace-${panel}`}
          onCancel={(event) => {
            if (busy) event.preventDefault();
            else setPanel(null);
          }}
        >
          <div
            className="workspace-dialog-header"
            onPointerDown={(event) => {
              if (
                panel !== "ai" ||
                event.button !== 0 ||
                (event.target as HTMLElement).closest("button")
              )
                return;
              const bounds = dialog.current!.getBoundingClientRect();
              aiDrag.current = {
                x: event.clientX,
                y: event.clientY,
                left: bounds.left,
                top: bounds.top,
              };
              event.currentTarget.setPointerCapture(event.pointerId);
              event.preventDefault();
            }}
            onPointerMove={(event) => {
              const drag = aiDrag.current;
              if (!drag) return;
              const bounds = dialog.current!.getBoundingClientRect();
              setAIPosition({
                x: Math.max(
                  8,
                  Math.min(
                    window.innerWidth - bounds.width - 8,
                    drag.left + event.clientX - drag.x,
                  ),
                ),
                y: Math.max(
                  8,
                  Math.min(
                    window.innerHeight - bounds.height - 8,
                    drag.top + event.clientY - drag.y,
                  ),
                ),
              });
            }}
            onPointerUp={() => {
              aiDrag.current = null;
            }}
            onPointerCancel={() => {
              aiDrag.current = null;
            }}
          >
            <div>
              <strong>
                {
                  {
                    projects: "Files & projects",
                    ai: "AI assistant",
                    source: "Code workspace",
                    ship: "Deploy & export",
                    secrets: "Environment & secrets",
                    connections: "Connections",
                  }[panel]
                }
              </strong>
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
                ["connections", GitBranch, "Connections"],
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
            {panel === "connections" && (
              <GitHubPanel key={workspace.id} projectId={workspace.id} />
            )}
            {panel === "secrets" && (
              <SecretsPanel key={workspace.id} projectId={workspace.id} />
            )}
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
                  <h2>What would you like to change?</h2>
                  <details
                    className="ai-provider-settings"
                    open={providerSettingsOpen}
                    onToggle={(event) =>
                      setProviderSettingsOpen(event.currentTarget.open)
                    }
                  >
                    <summary>
                      Provider &amp; model{" "}
                      {model ? `- ${model}` : "- setup required"}
                    </summary>
                    <p>
                      Describe a design or code change. Levoks sends the project
                      and its IR to your selected provider. Your key is held
                      only in this tab&apos;s memory; provider usage is billed
                      to your account.
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
                  </details>
                  <label>
                    Change type
                    <select
                      value={mode}
                      onChange={(e) => setMode(e.target.value)}
                    >
                      <option value="patch">
                        Incremental visual changes → review affected fields
                      </option>
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
                      rows={4}
                      value={prompt}
                      maxLength={12000}
                      onChange={(e) => setPrompt(e.target.value)}
                      placeholder="Create a pricing page with three plans, a comparison section, and a clear call to action…"
                    />
                  </label>
                  <label>Change focus<select aria-label="AI change focus" value={contextScope} onChange={event => setContextScope(event.target.value)}><option value="project">Whole project</option><option value="page">Current page</option><option value="selection">Selected elements ({editor.selectedElementIds.length})</option></select></label>
                  <p>Focus guides the proposal. The provider still receives the redacted project for context; review every proposed change before applying.</p>
                  <div className="ai-suggestions">{["Improve spacing and visual hierarchy on this page.", "Adapt the selected elements for mobile screens.", "Review accessibility and improve labels and contrast."].map(suggestion => <button key={suggestion} disabled={busy} onClick={() => setPrompt(suggestion)}>{suggestion}</button>)}</div>
                  <details className="ai-conversation"><summary>Conversation · {chatEntries.length} requests</summary><label><input type="checkbox" checked={rememberChat} onChange={event => setRememberChat(event.target.checked)} />Keep requests and summaries on this device</label><label><input type="checkbox" checked={includeChat} onChange={event => setIncludeChat(event.target.checked)} />Include the last four requests in the next generation</label><p>Provider keys are never stored. The last 50 requests are retained per project. Turning off history affects new requests; clear history to remove saved messages.</p>{chatError && <p role="alert">{chatError}</p>}<ol>{chatEntries.map(entry => <li key={entry.id}><p>{entry.prompt}</p><p>{entry.summary}</p><small>{entry.outcome} · {new Date(entry.createdAt).toLocaleString()}{entry.tokens === null ? "" : ` · ${entry.tokens} tokens`}</small><button onClick={() => setPrompt(entry.prompt)}>Reuse request</button></li>)}</ol><button disabled={!chatEntries.length || busy} onClick={() => void run(async () => { await clearConversations(workspace.id); setChat({ projectId: workspace.id, entries: [] }); })}>Clear conversation history</button></details>
                  <details className="ai-usage-settings">
                    <summary>Usage limits &amp; streaming</summary>
                    <label>
                      Maximum output tokens
                      <input
                        type="number"
                        min={256}
                        max={16000}
                        value={maxOutputTokens}
                        onChange={(e) =>
                          setMaxOutputTokens(Number(e.target.value))
                        }
                      />
                    </label>
                    <label>
                      <input
                        type="checkbox"
                        checked={streaming}
                        onChange={(e) => setStreaming(e.target.checked)}
                      />
                      Show generation as it arrives
                    </label>
                    <label>
                      Maximum input size (bytes)
                      <input
                        type="number"
                        min={1000}
                        max={1000000}
                        value={maxInputBytes}
                        onChange={(e) =>
                          setMaxInputBytes(Number(e.target.value))
                        }
                      />
                    </label>
                    <p>
                      Input size is checked before contacting the provider.
                      Token limits constrain each request; they are not a
                      currency spending budget.
                    </p>
                  </details>
                  <button
                    className="primary"
                    disabled={
                      busy || !apiKey || !model.trim() || !prompt.trim()
                    }
                    onClick={() => {
                      setProviderSettingsOpen(false);
                      void run(generate);
                    }}
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
                  {generationStatus && <p role="status">{generationStatus}</p>}
                  {busy && streamText && (
                    <details open>
                      <summary>Incoming proposal (not applied)</summary>
                      <pre className="workspace-json">{streamText}</pre>
                    </details>
                  )}
                  {proposal ? (
                    <>
                      <p>{proposal.summary}</p>
                      {proposal.usage && (
                        <p>
                          Provider-reported tokens: input{" "}
                          {proposal.usage.inputTokens ?? "unavailable"} · output{" "}
                          {proposal.usage.outputTokens ?? "unavailable"} · total{" "}
                          {proposal.usage.totalTokens ?? "unavailable"}
                        </p>
                      )}
                      {proposal.changes && (
                        <details open>
                          <summary>
                            {proposal.changes.length} affected fields
                          </summary>
                          <div className="workspace-json">
                            {proposal.changes.map((change, i) => (
                              <div key={i}>
                                <strong>
                                  {change.op} {change.path}
                                </strong>
                                <pre>
                                  Before: {change.before}
                                  {"\n"}After: {change.after}
                                </pre>
                              </div>
                            ))}
                          </div>
                        </details>
                      )}
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
                            await markConversation(proposal.conversationId, "applied");
                            setProposal(null);
                            setMessage("Proposal applied and saved.");
                          })
                        }
                      >
                        Apply proposal
                      </button>
                      <button onClick={() => { void markConversation(proposal.conversationId, "discarded"); setProposal(null); }}>Discard</button>
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
                          onClick={() => {
                            setSelectedFile(file);
                            setOpenFiles((current) =>
                              current.includes(file)
                                ? current
                                : [...current.slice(-7), file],
                            );
                          }}
                        >
                          {file}
                        </button>
                      ))}
                  </aside>
                  <div className="source-editor-pane">
                    <div
                      className="source-tabs"
                      role="tablist"
                      aria-label="Open source files"
                    >
                      {Array.from(new Set([activeFile, ...openFiles]))
                        .filter((file) => file in files)
                        .map((file) => (
                          <button
                            role="tab"
                            aria-selected={file === activeFile}
                            key={file}
                            onClick={() => setSelectedFile(file)}
                            title={file}
                          >
                            <Code2 size={12} />
                            {file.split("/").pop()}
                          </button>
                        ))}
                    </div>
                    <div className="workspace-file-title">
                      {activeFile || "No source available"}
                      <span>
                        {activeFile.startsWith("levoks.")
                          ? "Read only"
                          : workspace.source
                            ? "Edited source"
                            : "Generated source"}
                      </span>
                    </div>
                    <SourceTools key={activeFile} file={activeFile} code={files[activeFile] || ""} readOnly={!activeFile || activeFile.startsWith("levoks.")} onChange={code => updateSource({ ...files, [activeFile]: code })} />
                    <div className="source-text-area">
                      <div
                        className="source-line-numbers"
                        ref={lineNumbers}
                        aria-hidden="true"
                      >
                        {(files[activeFile] || "")
                          .split("\n")
                          .map((_, index) => (
                            <div key={index}>{index + 1}</div>
                          ))}
                      </div>
                      <textarea
                        aria-label={`Source code for ${activeFile}`}
                        spellCheck={false}
                        wrap="off"
                        onScroll={(event) => {
                          if (lineNumbers.current)
                            lineNumbers.current.scrollTop =
                              event.currentTarget.scrollTop;
                        }}
                        value={files[activeFile] || ""}
                        disabled={
                          !activeFile || activeFile.startsWith("levoks.")
                        }
                        onChange={(e) =>
                          updateSource({
                            ...files,
                            [activeFile]: e.target.value,
                          })
                        }
                      />
                    </div>
                    <div className="source-status">
                      <span>
                        {(files[activeFile] || "").split("\n").length} lines ·
                        UTF-8
                      </span>
                      <span>{workspace.status}</span>
                    </div>
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
                  <button onClick={() => openPanel("connections")}>
                    <GitBranch size={16} /> Open GitHub Connections
                  </button>
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
                        value={origins[`API_ORIGIN_${service.port}`] || ""}
                        onChange={(e) =>
                          setOrigins({
                            ...origins,
                            [`API_ORIGIN_${service.port}`]: e.target.value,
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
                        (s) => !origins[`API_ORIGIN_${s.port}`],
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
