"use client";

import { useState, useRef, useEffect } from "react";
import { useSession, signOut } from "next-auth/react";
import { useRouter } from "next/navigation";
import {
  User,
  LogOut,
  Settings,
  FolderOpen,
  Link2,
  ChevronDown,
  Github,
} from "lucide-react";

interface UserMenuProps {
  onOpenProfile: () => void;
}

export default function UserMenu({ onOpenProfile }: UserMenuProps) {
  const { data: session, status } = useSession();
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);

  // Close menu on outside click
  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) {
        setOpen(false);
      }
    };
    if (open) document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, [open]);

  // Close on Escape
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (e.key === "Escape") setOpen(false);
    };
    if (open) document.addEventListener("keydown", handler);
    return () => document.removeEventListener("keydown", handler);
  }, [open]);

  if (status === "loading") {
    return (
      <div className="user-menu-skeleton">
        <div className="user-menu-skeleton-avatar" />
      </div>
    );
  }

  if (!session) {
    return (
      <button
        className="header-btn signin-btn"
        onClick={() => router.push("/auth/signin")}
      >
        <User size={14} />
        Sign In
      </button>
    );
  }

  const user = session.user;
  const hasGithub = !!session.githubAccessToken;
  const initials = user?.name
    ? user.name
        .split(" ")
        .map((n) => n[0])
        .join("")
        .toUpperCase()
        .slice(0, 2)
    : "U";

  return (
    <div className="user-menu-container" ref={menuRef}>
      <button
        className={`user-menu-trigger ${open ? "active" : ""}`}
        onClick={() => setOpen(!open)}
        aria-label="User menu"
      >
        {user?.image ? (
          <img
            src={user.image}
            alt={user.name || "User"}
            className="user-avatar"
            width={28}
            height={28}
            referrerPolicy="no-referrer"
          />
        ) : (
          <div className="user-avatar-fallback">{initials}</div>
        )}
        <ChevronDown
          size={12}
          className={`user-menu-chevron ${open ? "open" : ""}`}
        />
      </button>

      {open && (
        <div className="user-menu-dropdown">
          {/* User info header */}
          <div className="user-menu-header">
            {user?.image ? (
              <img
                src={user.image}
                alt={user.name || "User"}
                className="user-menu-avatar"
                width={36}
                height={36}
                referrerPolicy="no-referrer"
              />
            ) : (
              <div className="user-menu-avatar-fallback">{initials}</div>
            )}
            <div className="user-menu-info">
              <span className="user-menu-name">{user?.name || "User"}</span>
              <span className="user-menu-email">{user?.email || ""}</span>
            </div>
          </div>

          <div className="user-menu-divider" />

          {/* Account status */}
          <div className="user-menu-status">
            <div className="user-menu-status-item">
              <Github size={13} />
              <span>GitHub</span>
              {hasGithub ? (
                <span className="status-connected">Connected</span>
              ) : (
                <span className="status-disconnected">Not linked</span>
              )}
            </div>
          </div>

          <div className="user-menu-divider" />

          {/* Menu items */}
          <button
            className="user-menu-item"
            onClick={() => {
              setOpen(false);
              onOpenProfile();
            }}
          >
            <Settings size={14} />
            Profile Settings
          </button>
          <button className="user-menu-item" onClick={() => setOpen(false)}>
            <FolderOpen size={14} />
            My Projects
          </button>
          <button className="user-menu-item" onClick={() => setOpen(false)}>
            <Link2 size={14} />
            Linked Accounts
          </button>

          <div className="user-menu-divider" />

          <button
            className="user-menu-item user-menu-signout"
            onClick={() => signOut({ callbackUrl: "/" })}
          >
            <LogOut size={14} />
            Sign Out
          </button>
        </div>
      )}
    </div>
  );
}
