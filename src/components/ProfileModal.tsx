"use client";

import { useSession } from "next-auth/react";
import { motion, AnimatePresence } from "framer-motion";
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

  if (!session?.user) return null;

  const user = session.user;
  const hasGithub = !!session.githubAccessToken;
  const initials = user.name
    ? user.name
        .split(" ")
        .map((n) => n[0])
        .join("")
        .toUpperCase()
        .slice(0, 2)
    : "U";

  return (
    <AnimatePresence>
      <motion.div
        className="profile-overlay"
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        transition={{ duration: 0.2 }}
      >
        <motion.div
          className="profile-modal"
          initial={{ opacity: 0, y: 20, scale: 0.97 }}
          animate={{ opacity: 1, y: 0, scale: 1 }}
          exit={{ opacity: 0, y: 20, scale: 0.97 }}
          transition={{ duration: 0.3, ease: [0.25, 0.46, 0.45, 0.94] }}
        >
          {/* Header */}
          <div className="profile-modal-header">
            <div className="profile-modal-title">
              <User size={16} />
              <h2>Profile</h2>
            </div>
            <button className="profile-close-btn" onClick={onClose}>
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
                <div className="profile-avatar-glow" />
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
                <div className="profile-account-card connected">
                  <Globe size={20} />
                  <div className="profile-account-info">
                    <span className="profile-account-name">Google</span>
                    <span className="profile-account-status">
                      {user.email ? "Connected" : "Not linked"}
                    </span>
                  </div>
                  {user.email && (
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
                <p>No projects yet</p>
                <span>Projects you build with Levoks will appear here.</span>
              </div>
            </div>
          </div>
        </motion.div>
      </motion.div>
    </AnimatePresence>
  );
}
