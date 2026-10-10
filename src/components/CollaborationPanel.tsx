"use client";
import { useEffect, useRef, useState } from "react";
import { useSession } from "next-auth/react";
import Link from "next/link";
import { Users, RefreshCw, Copy, Link2 } from "lucide-react";
import { sharedProjectPath } from "@/store/collaborationStore";
import "./collaboration.css";
type Access = {
  name: string;
  ownerId: string;
  projectId: string;
  role: "owner" | "editor" | "viewer";
  accessVersion: number;
  revision: number;
  members: { userId: string; name: string; role: "editor" | "viewer" }[];
  invitations: { id: string; role: "editor" | "viewer"; expiresAt: string }[];
};
export default function CollaborationPanel({
  ownerId,
  projectId,
}: {
  ownerId: string;
  projectId: string;
}) {
  const { data: session } = useSession(),
    actorId = session?.user?.id;
  const [access, setAccess] = useState<Access | null>(null),
    [busy, setBusy] = useState(false);
  const [error, setError] = useState(""),
    [notice, setNotice] = useState(""),
    [link, setLink] = useState("");
  const [role, setRole] = useState<"editor" | "viewer">("viewer");
  const [deleteName, setDeleteName] = useState("");
  const epoch = useRef(0),
    running = useRef(false);
  const endpoint = `/api/projects/access?${new URLSearchParams({ ownerId, projectId })}`;
  useEffect(() => {
    const current = ++epoch.current,
      controller = new AbortController();
    void fetch(endpoint, { cache: "no-store", signal: controller.signal })
      .then(async (response) => {
        const data = await response.json();
        if (!response.ok) throw new Error(data.error);
        if (epoch.current === current) {
          setAccess(data);
          setError("");
          setLink("");
        }
      })
      .catch((reason) => {
        if (!controller.signal.aborted) setError(reason.message);
      });
    return () => {
      epoch.current = current + 1;
      controller.abort();
    };
  }, [endpoint, actorId]);
  async function run(body?: object) {
    if (running.current || !actorId) return;
    running.current = true;
    setBusy(true);
    setError("");
    setNotice("");
    const current = epoch.current;
    try {
      const response = await fetch(endpoint, {
        method: body ? "POST" : "GET",
        cache: "no-store",
        headers: { "Content-Type": "application/json" },
        ...(body
          ? {
              body: JSON.stringify({
                ...body,
                ownerId,
                projectId,
                actorId,
                accessVersion: access?.accessVersion || 0,
              }),
            }
          : {}),
      });
      const data = await response.json();
      if (epoch.current !== current) return;
      if (!response.ok)
        throw new Error(
          data.error || "Could not update access. Refresh and try again.",
        );
      if (data.deleted) {
        setAccess(null);
        setLink("");
        setNotice(
          "Cloud project deleted. Device copies remain on their respective devices.",
        );
        return;
      }
      setAccess(data);
      if (data.token) {
        setLink(
          `${location.origin}/invite/${encodeURIComponent(ownerId)}/${encodeURIComponent(projectId)}#${data.token}`,
        );
        setNotice(
          "Invitation created. Copy the link and send it to one trusted person.",
        );
      } else {
        setLink("");
        setNotice(
          body ? "Project access updated." : "Project access refreshed.",
        );
      }
    } catch (reason) {
      if (epoch.current === current) setError((reason as Error).message);
    } finally {
      running.current = false;
      if (epoch.current === current) setBusy(false);
    }
  }
  return (
    <section className="collaboration-panel" aria-label="Project sharing">
      <div className="collaboration-heading">
        <h2>
          <Users size={20} /> Project sharing
        </h2>
        <button type="button" disabled={busy} onClick={() => void run()}>
          <RefreshCw size={15} /> Refresh access
        </button>
      </div>
      <p>
        Owner manages access. Editors edit and save the shared project. Viewers
        inspect it without editing.
      </p>
      {error && (
        <p role="alert" className="workspace-error">
          {error}
        </p>
      )}
      {notice && (
        <p role="status" className="workspace-success">
          {notice}
        </p>
      )}
      {access && (
        <>
          <p>
            Your role:{" "}
            <strong>
              {access.role === "owner"
                ? "Owner"
                : access.role === "editor"
                  ? "Editor"
                  : "Viewer"}
            </strong>
          </p>
          <Link
            className="collaboration-open"
            href={sharedProjectPath(ownerId, projectId)}
          >
            <Link2 size={15} /> Open shared workspace
          </Link>
          {access.role === "owner" && (
            <>
              <h3>Invite a collaborator</h3>
              <p>
                Each link can be accepted once and expires after seven days. The
                recipient must sign in.
              </p>
              <div className="collaboration-actions">
                <label>
                  Invitation role
                  <select
                    value={role}
                    disabled={busy}
                    onChange={(e) => setRole(e.target.value as typeof role)}
                  >
                    <option value="viewer">Viewer — read only</option>
                    <option value="editor">Editor — edit and save</option>
                  </select>
                </label>
                <button
                  type="button"
                  disabled={busy}
                  onClick={() => void run({ action: "invite", role })}
                >
                  Create invitation link
                </button>
              </div>
              {link && (
                <div className="collaboration-link">
                  <label>
                    Invitation link
                    <input
                      readOnly
                      value={link}
                      onFocus={(e) => e.target.select()}
                    />
                  </label>
                  <button
                    type="button"
                    onClick={() =>
                      void navigator.clipboard
                        .writeText(link)
                        .then(() => setNotice("Invitation link copied."))
                        .catch(() =>
                          setError(
                            "Select the invitation link and copy it manually.",
                          ),
                        )
                    }
                  >
                    <Copy size={15} /> Copy link
                  </button>
                </div>
              )}
              <h3>People with access</h3>
              <div className="collaboration-row">
                <span>You</span>
                <strong>Owner</strong>
              </div>
              {access.members.length === 0 && <p>No collaborators yet.</p>}
              {access.members.map((member) => (
                <div className="collaboration-row" key={member.userId}>
                  <span>
                    {member.name}
                    <small>{member.userId}</small>
                  </span>
                  <label>
                    <span className="collaboration-visually-hidden">
                      Role for {member.name}
                    </span>
                    <select
                      value={member.role}
                      disabled={busy}
                      onChange={(e) =>
                        void run({
                          action: "role",
                          memberId: member.userId,
                          role: e.target.value,
                        })
                      }
                    >
                      <option value="editor">Editor</option>
                      <option value="viewer">Viewer</option>
                    </select>
                  </label>
                  <button
                    type="button"
                    disabled={busy}
                    onClick={() =>
                      void run({ action: "remove", memberId: member.userId })
                    }
                  >
                    Remove {member.name}
                  </button>
                </div>
              ))}
              <h3>Pending invitations</h3>
              {access.invitations.length === 0 && (
                <p>No pending invitations.</p>
              )}
              {access.invitations.map((invite) => (
                <div className="collaboration-row" key={invite.id}>
                  <span>
                    {invite.role === "editor" ? "Editor" : "Viewer"} invitation
                    <small>
                      Expires {new Date(invite.expiresAt).toLocaleDateString()}
                    </small>
                  </span>
                  <button
                    type="button"
                    disabled={busy}
                    onClick={() =>
                      void run({ action: "revoke", invitationId: invite.id })
                    }
                  >
                    Revoke invitation
                  </button>
                </div>
              ))}
              <details className="collaboration-delete">
                <summary>Delete cloud project</summary>
                <p>
                  This removes the shared cloud document, all grants and
                  invitations. Device copies and downloaded files remain.
                </p>
                <label>
                  Type {access.name} to confirm
                  <input
                    value={deleteName}
                    onChange={(event) => setDeleteName(event.target.value)}
                    autoComplete="off"
                  />
                </label>
                <button
                  disabled={busy || deleteName !== access.name}
                  onClick={() =>
                    void run({
                      action: "delete",
                      name: deleteName,
                      revision: access.revision,
                    })
                  }
                >
                  Delete shared cloud project
                </button>
              </details>
            </>
          )}
        </>
      )}
    </section>
  );
}
