"use client";

import { useSession } from "next-auth/react";
import { useEffect, useRef } from "react";
import {
  X,
  User,
  Github,
  Mail,
  Globe,
  FolderOpen,
  Link2,
  Shield,
  Sparkles,
} from "lucide-react";

interface ProfileModalProps {
  onClose: () => void;
}

export default function ProfileModal({ onClose }: ProfileModalProps) {
  const { data: session } = useSession();
  const dialog = useRef<HTMLDialogElement>(null);
  const hasUser = Boolean(session?.user);

  useEffect(() => {
    if (hasUser) dialog.current?.showModal();
  }, [hasUser]);

  function closeProfile() {
    dialog.current?.close();
    onClose();
  }

  if (!session?.user) return null;

  const user = session.user;
  const hasGithub = session.provider === "github";
  const initials = user.name
    ? user.name
        .split(" ")
        .map((n) => n[0])
        .join("")
        .toUpperCase()
        .slice(0, 2)
    : "U";

  return (
        <dialog
          ref={dialog}
          className="profile-modal"
          aria-labelledby="profile-heading"
          onCancel={event => { event.preventDefault(); closeProfile(); }}
        >
          {/* Header */}
          <div className="profile-modal-header">
            <div className="profile-modal-title">
              <User size={16} />
              <h2 id="profile-heading">Profile</h2>
            </div>
            <button className="profile-close-btn" aria-label="Close profile" onClick={closeProfile}>
              <X size={16} />
            </button>
          </div>

          <div className="profile-modal-body">
            {/* User card */}
            <div className="profile-user-card">
              <div className="profile-avatar-section">
                {user.image ? (
                  <img
                    src={user.image}
                    alt={user.name || "User"}
                    className="profile-avatar-large"
                    width={72}
                    height={72}
                    referrerPolicy="no-referrer"
                  />
                ) : (
                  <div className="profile-avatar-large-fallback">{initials}</div>
                )}
              </div>
              <div className="profile-user-details">
                <h3 className="profile-user-name">{user.name || "User"}</h3>
                {user.email && (
                  <div className="profile-user-email">
                    <Mail size={12} />
                    <span>{user.email}</span>
                  </div>
                )}
                <div className="profile-user-badge">
                  <Sparkles size={11} />
                  Builder
                </div>
              </div>
            </div>

            {/* Linked Accounts */}
            <div className="profile-section">
              <div className="profile-section-header">
                <Link2 size={14} />
                <span>Linked Accounts</span>
              </div>
              <div className="profile-accounts-grid">
                <div
                  className={`profile-account-card ${hasGithub ? "connected" : ""}`}
                >
                  <Github size={20} />
                  <div className="profile-account-info">
                    <span className="profile-account-name">GitHub</span>
                    <span className="profile-account-status">
                      {hasGithub ? "Connected" : "Not linked"}
                    </span>
                  </div>
                  {hasGithub && (
                    <div className="profile-account-check">
                      <Shield size={14} />
                    </div>
                  )}
                </div>
                <div className={`profile-account-card ${session.provider === "google" ? "connected" : ""}`}>
                  <Globe size={20} />
                  <div className="profile-account-info">
                    <span className="profile-account-name">Google</span>
                    <span className="profile-account-status">
                      {session.provider === "google" ? "Signed in" : "Not linked"}
                    </span>
                  </div>
                  {session.provider === "google" && (
                    <div className="profile-account-check">
                      <Shield size={14} />
                    </div>
                  )}
                </div>
              </div>
            </div>

            {/* Projects */}
            <div className="profile-section">
              <div className="profile-section-header">
                <FolderOpen size={14} />
                <span>My Projects</span>
              </div>
              <div className="profile-projects-empty">
                <FolderOpen size={24} strokeWidth={1.5} />
                <p>Your visual workspace and cloud projects</p>
                <button className="header-btn" onClick={() => { closeProfile(); window.dispatchEvent(new CustomEvent("levoks:panel", { detail: "projects" })); }}>Open projects</button>
              </div>
            </div>
            <div className="profile-section"><div className="profile-section-header"><Sparkles size={14} /><span>Personal plan · Bring your own key</span></div><p style={{ fontSize: 12, lineHeight: 1.6 }}>Local editing and code export are available without an AI subscription. AI inference is billed directly by your selected provider. Levoks does not provision a paid inference plan.</p></div>
          </div>
        </dialog>
  );
}
