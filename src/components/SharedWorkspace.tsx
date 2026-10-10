"use client";
import { useCallback, useEffect, useRef, useState } from "react";
import Link from "next/link";
import { useSession } from "next-auth/react";
import ProjectEditor from "./ProjectEditor";
import CollaborationPanel from "./CollaborationPanel";
import Renderer from "./Renderer";
import DndProvider from "./DndProvider";
import {
  currentProject,
  flushWorkspace,
  openWorkspace,
  useWorkspaceStore,
} from "@/store/workspaceStore";
import { useEditorStore } from "@/store/editorStore";
import {
  useCollaborationStore,
  sharedProjectPath,
} from "@/store/collaborationStore";
import { getProject } from "@/lib/project/storage";
import { downloadProject } from "@/lib/project/workspace";
import { parseProject, type ProjectDocument } from "@/lib/project/schema";
import "./workspace.css";
import "./collaboration.css";
const signature = async (document: ProjectDocument) => {
  const bytes = new TextEncoder().encode(
    JSON.stringify({ ...document, updatedAt: "" }),
  );
  return Array.from(
    new Uint8Array(await crypto.subtle.digest("SHA-256", bytes)),
    (byte) => byte.toString(16).padStart(2, "0"),
  ).join("");
};
export default function SharedWorkspace({
  ownerId,
  projectId,
  invitation = false,
}: {
  ownerId: string;
  projectId: string;
  invitation?: boolean;
}) {
  const { data: session, status } = useSession(),
    actorId = session?.user?.id;
  const project = useCollaborationStore((s) => s.project),
    workspace = useWorkspaceStore();
  const editor = useEditorStore();
  const [loaded, setLoaded] = useState(false),
    [busy, setBusy] = useState(false),
    [sharing, setSharing] = useState(false);
  const [error, setError] = useState(""),
    [notice, setNotice] = useState(""),
    [unavailable, setUnavailable] = useState(false);
  const [invite, setInvite] = useState<{
    name: string;
    role: string;
    alreadyMember?: boolean;
  } | null>(null);
  const [recovery, setRecovery] = useState<ProjectDocument | null>(null);
  const token = useRef(""),
    running = useRef(false),
    generation = useRef(0);
  const accessURL = `/api/projects/access?${new URLSearchParams({ ownerId, projectId })}`;
  const projectURL = `/api/projects?${new URLSearchParams({ ownerId, id: projectId })}`;
  const draftKey = `levoks-shared-draft:${JSON.stringify([actorId, ownerId, projectId])}`;
  const invitationKey = `levoks-invitation:${JSON.stringify([ownerId, projectId])}`;
  const remember = useCallback(
    async (revision: number, document: ProjectDocument) => {
      sessionStorage.setItem(
        draftKey,
        JSON.stringify({ revision, base: await signature(document) }),
      );
    },
    [draftKey],
  );
  const load = useCallback(
    async (restoreDraft: boolean) => {
      const operation = generation.current;
      const response = await fetch(projectURL, { cache: "no-store" }),
        remote = await response.json();
      if (operation !== generation.current) return;
      if (!response.ok)
        throw new Error(remote.error || "Project access is unavailable.");
      const document = parseProject(remote.document);
      if (document.id !== projectId || remote.ownerId !== ownerId)
        throw new Error("The response did not match this shared project.");
      await flushWorkspace();
      const local = await getProject(projectId);
      if (operation !== generation.current) return;
      let draft: { revision: number; base: string } | null = null;
      try {
        draft = JSON.parse(sessionStorage.getItem(draftKey) || "null");
      } catch {
        /* Ignore invalid local metadata. */
      }
      const pending =
        restoreDraft &&
        local &&
        draft &&
        Number.isSafeInteger(draft.revision) &&
        draft.revision > 0 &&
        (await signature(local.document)) !== draft.base;
      if (operation !== generation.current) return;
      if (
        restoreDraft &&
        local &&
        !draft &&
        (await signature(local.document)) !== (await signature(document))
      )
        downloadProject(local.document);
      await openWorkspace(
        pending ? local.document : document,
        local?.revision || 0,
      );
      if (operation !== generation.current) return;
      useWorkspaceStore.setState({ dirty: true });
      await flushWorkspace("Shared project opened");
      if (operation !== generation.current) return;
      useCollaborationStore.setState({
        project: {
          actorId: actorId!,
          ownerId,
          projectId,
          role: remote.role,
          revision: pending ? draft!.revision : remote.revision,
        },
      });
      if (!pending) await remember(remote.revision, document);
      setLoaded(true);
      setUnavailable(false);
      setError("");
      setNotice(
        pending
          ? "Recovered your device draft. Save shared project to publish it; stale revisions will require recovery."
          : "Shared project opened.",
      );
    },
    [projectURL, projectId, ownerId, actorId, draftKey, remember],
  );
  useEffect(() => {
    if (invitation) {
      token.current =
        location.hash.slice(1) || sessionStorage.getItem(invitationKey) || "";
      if (/^[a-f0-9]{64}$/.test(token.current))
        sessionStorage.setItem(invitationKey, token.current);
    }
    if (!actorId) return;
    const current = ++generation.current;
    void (async () => {
      try {
        if (invitation) {
          const response = await fetch(accessURL, {
            cache: "no-store",
            headers: { "X-Levoks-Invitation": token.current },
          });
          const data = await response.json();
          if (!response.ok) throw new Error(data.error);
          if (generation.current === current) setInvite(data);
        } else await load(true);
      } catch (reason) {
        if (generation.current === current) {
          setError((reason as Error).message);
          if (!invitation && sessionStorage.getItem(draftKey))
            setRecovery((await getProject(projectId))?.document || null);
        }
      }
    })();
    return () => {
      generation.current = current + 1;
      useCollaborationStore.setState({ project: null });
    };
  }, [
    actorId,
    invitation,
    accessURL,
    load,
    draftKey,
    projectId,
    invitationKey,
  ]);
  useEffect(() => {
    if (!loaded || invitation) return;
    const controller = new AbortController();
    const check = async () => {
      if (document.hidden) return;
      try {
        const response = await fetch(accessURL, {
            cache: "no-store",
            signal: controller.signal,
          }),
          data = await response.json();
        if (controller.signal.aborted) return;
        if (!response.ok) {
          if ([401, 403, 404].includes(response.status)) setUnavailable(true);
          setError(data.error);
          return;
        }
        setUnavailable(false);
        const current = useCollaborationStore.getState().project;
        if (current?.projectId === projectId)
          useCollaborationStore.setState({
            project: { ...current, role: data.role },
          });
        if (current && current.revision < data.revision)
          setNotice(
            "A newer shared version is available. Download your draft before opening it.",
          );
      } catch {
        /* A network outage preserves the draft; every save checks access on the server. */
      }
    };
    const interval = setInterval(() => void check(), 15000);
    window.addEventListener("focus", check);
    return () => {
      controller.abort();
      clearInterval(interval);
      window.removeEventListener("focus", check);
    };
  }, [loaded, invitation, accessURL, projectId]);
  async function run(task: () => Promise<void>) {
    if (running.current) return;
    running.current = true;
    setBusy(true);
    setError("");
    try {
      await task();
    } catch (reason) {
      setError((reason as Error).message);
    } finally {
      running.current = false;
      setBusy(false);
    }
  }
  async function save() {
    const current = useCollaborationStore.getState().project;
    if (
      !current ||
      current.actorId !== actorId ||
      current.projectId !== projectId
    )
      throw new Error("Reopen the shared workspace before saving.");
    await flushWorkspace("Shared project draft");
    const document = currentProject();
    const response = await fetch("/api/projects", {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        ownerId: actorId,
        projectOwnerId: ownerId,
        project: document,
        revision: current.revision,
      }),
    });
    const data = await response.json();
    if (!response.ok) throw new Error(data.error);
    useCollaborationStore.setState({
      project: { ...current, revision: data.revision },
    });
    await remember(data.revision, document);
    setNotice("Shared project saved.");
  }
  if (status === "loading")
    return (
      <main className="collaboration-entry">
        <p role="status">Checking your account…</p>
      </main>
    );
  if (!actorId)
    return (
      <main className="collaboration-entry">
        <section>
          <h1>Sign in to collaborate</h1>
          <p>
            Use your Levoks account to open this{" "}
            {invitation ? "invitation" : "shared project"}.
          </p>
          <Link
            href={`/auth/signin?callbackUrl=${encodeURIComponent(invitation ? `/invite/${encodeURIComponent(ownerId)}/${encodeURIComponent(projectId)}` : sharedProjectPath(ownerId, projectId))}`}
          >
            Sign in
          </Link>
        </section>
      </main>
    );
  if (invitation)
    return (
      <main className="collaboration-entry">
        <section className="collaboration-panel">
          <h1>{invite ? `Join ${invite.name}` : "Project invitation"}</h1>
          {invite && (
            <>
              {invite.alreadyMember ? (
                <p>
                  You already have access to this project. Your current role is
                  preserved.
                </p>
              ) : (
                <p>
                  You will join as an{" "}
                  <strong>
                    {invite.role === "editor" ? "Editor" : "Viewer"}
                  </strong>
                  .{" "}
                  {invite.role === "editor"
                    ? "You can edit and save the shared project."
                    : "You can inspect the project without editing."}
                </p>
              )}
              <button
                disabled={busy}
                onClick={() =>
                  void run(async () => {
                    const response = await fetch(accessURL, {
                      method: "POST",
                      headers: { "Content-Type": "application/json" },
                      body: JSON.stringify({
                        action: "accept",
                        ownerId,
                        projectId,
                        actorId,
                        token: token.current,
                      }),
                    });
                    const data = await response.json();
                    if (!response.ok) throw new Error(data.error);
                    sessionStorage.removeItem(invitationKey);
                    location.replace(sharedProjectPath(ownerId, projectId));
                  })
                }
              >
                {invite.alreadyMember
                  ? "Open shared project"
                  : "Accept invitation"}
              </button>
            </>
          )}
          {error && <p role="alert">{error}</p>}
          <p>
            <Link href="/">Back to projects</Link>
          </p>
        </section>
      </main>
    );
  if (!loaded || !project)
    return (
      <main className="collaboration-entry">
        <section className="collaboration-panel">
          <h1>
            {error
              ? "Unable to open shared project"
              : "Opening shared project…"}
          </h1>
          <p role={error ? "alert" : "status"}>
            {error || "Loading the current cloud version."}
          </p>
          {recovery && (
            <button onClick={() => downloadProject(recovery)}>
              Download device draft
            </button>
          )}
          <p>
            <Link href="/">Back to projects</Link>
          </p>
        </section>
      </main>
    );
  // Viewer mounts no editor, drag handlers, inspector or editing keyboard shortcuts.
  const readOnly = project.role === "viewer" || unavailable;
  return (
    <main className="shared-workspace">
      <div className="collaboration-bar">
        <Link href="/">Projects</Link>
        <span className="collaboration-state">
          <strong>{workspace.name}</strong> ·{" "}
          {project.role === "owner"
            ? "Owner"
            : project.role === "editor"
              ? "Editor"
              : "Viewer"}{" "}
          · revision {project.revision}
        </span>
        {!readOnly && (
          <button disabled={busy} onClick={() => void run(save)}>
            Save shared project
          </button>
        )}
        <button
          disabled={busy}
          onClick={() =>
            void run(async () => {
              if (!readOnly) downloadProject(currentProject());
              await load(false);
            })
          }
        >
          {readOnly ? "Refresh shared project" : "Back up draft & open latest"}
        </button>
        <button onClick={() => downloadProject(currentProject())}>
          Download draft
        </button>
        <button aria-expanded={sharing} onClick={() => setSharing(!sharing)}>
          {sharing ? "Close sharing" : "Project sharing"}
        </button>
      </div>
      {error && (
        <p className="workspace-error" role="alert">
          {error}
        </p>
      )}
      {notice && (
        <p className="workspace-message" role="status">
          {notice}
        </p>
      )}
      {sharing && (
        <div className="shared-viewer">
          <CollaborationPanel ownerId={ownerId} projectId={projectId} />
        </div>
      )}
      {!sharing &&
        (readOnly ? (
          <div className="shared-viewer">
            <p>
              {unavailable
                ? "Access was removed. Editing is disabled; your device draft remains available for download."
                : "Read-only project view"}
            </p>
            {!unavailable && (
              <>
                <nav aria-label="Project pages">
                  {editor.pages.map((page) => (
                    <button
                      key={page.id}
                      aria-pressed={editor.activePageId === page.id}
                      onClick={() => editor.switchPage(page.id)}
                    >
                      {page.title}
                    </button>
                  ))}
                </nav>
                <DndProvider>
                  <div
                    className="shared-artboard"
                    style={{
                      width: editor.canvasSettings.width,
                      minHeight: editor.canvasSettings.height,
                    }}
                  >
                    <Renderer
                      elementIds={[...editor.globalRootIds, ...editor.rootIds]}
                      readOnly
                      isRoot
                    />
                  </div>
                </DndProvider>
                <details>
                  <summary>Backend and routing overview</summary>
                  <p>
                    {currentProject().backend.services.length} services ·{" "}
                    {currentProject().routing.connections.length} routing
                    connections
                  </p>
                  <pre>
                    {JSON.stringify(
                      {
                        backend: currentProject().backend,
                        routing: currentProject().routing,
                      },
                      null,
                      2,
                    )}
                  </pre>
                </details>
              </>
            )}
          </div>
        ) : (
          <ProjectEditor />
        ))}
    </main>
  );
}
