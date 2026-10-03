"use client";

import { useState, useRef, useEffect } from "react";
import { useSession, signOut } from "next-auth/react";
import { useRouter } from "next/navigation";
import { flushWorkspace } from "@/store/workspaceStore";
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
  const triggerRef = useRef<HTMLButtonElement>(null);
  const focusLast = useRef(false);

  function closeMenu() {
    setOpen(false);
    triggerRef.current?.focus();
  }

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

  useEffect(() => {
    if (!open) return;
    const items = menuRef.current?.querySelectorAll<HTMLButtonElement>('[role="menuitem"]');
    items?.[focusLast.current ? items.length - 1 : 0]?.focus();
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
        onClick={() => router.push(`/auth/signin?callbackUrl=${encodeURIComponent(window.location.pathname)}`)}
      >
        <User size={14} />
        <span>Sign In</span>
      </button>
    );
  }

  const user = session.user;
  const hasGithub = session.provider === "github";
  const initials = user?.name
    ? user.name
        .split(" ")
        .map((n) => n[0])
        .join("")
        .toUpperCase()
        .slice(0, 2)
    : "U";

  return (
    <div className="user-menu-container" ref={menuRef}
      onBlur={event => {
        if (!event.currentTarget.contains(event.relatedTarget as Node | null)) setOpen(false);
      }}
      onKeyDown={event => {
        if (!open) return;
        if (event.key === "Escape") {
          event.preventDefault();
          event.stopPropagation();
          closeMenu();
          return;
        }
        if (!["ArrowDown", "ArrowUp", "Home", "End"].includes(event.key)) return;
        event.preventDefault();
        event.stopPropagation();
        const items = Array.from(event.currentTarget.querySelectorAll<HTMLButtonElement>('[role="menuitem"]'));
        const index = items.indexOf(document.activeElement as HTMLButtonElement);
        const next = event.key === "Home" ? 0 : event.key === "End" ? items.length - 1
          : (index + (event.key === "ArrowDown" ? 1 : -1) + items.length) % items.length;
        items[next]?.focus();
      }}>
      <button
        ref={triggerRef}
        className={`user-menu-trigger ${open ? "active" : ""}`}
        onClick={() => { focusLast.current = false; setOpen(!open); }}
        onKeyDown={event => {
          if (open || !["ArrowDown", "ArrowUp"].includes(event.key)) return;
          event.preventDefault();
          event.stopPropagation();
          focusLast.current = event.key === "ArrowUp";
          setOpen(true);
        }}
        aria-label="User menu"
        aria-expanded={open}
        aria-haspopup="menu"
        aria-controls={open ? "account-actions" : undefined}
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
          <div id="account-actions" role="menu" aria-label="Account actions">
          <button
            role="menuitem" tabIndex={-1}
            className="user-menu-item"
            onClick={() => {
              closeMenu();
              onOpenProfile();
            }}
          >
            <Settings size={14} />
            Profile Settings
          </button>
          <button role="menuitem" tabIndex={-1} className="user-menu-item" onClick={() => { closeMenu(); window.dispatchEvent(new Event("levoks:home")); }}>
            <FolderOpen size={14} />
            My Projects
          </button>
          <button role="menuitem" tabIndex={-1} className="user-menu-item" onClick={() => { closeMenu(); onOpenProfile(); }}>
            <Link2 size={14} />
            Linked Accounts
          </button>

          <div className="user-menu-divider" />

          <button
            role="menuitem" tabIndex={-1}
            className="user-menu-item user-menu-signout"
            onClick={() => void flushWorkspace().then(() => signOut({ callbackUrl: "/" })).catch(() => {
              window.alert("Your edits could not be saved. Download a project backup before signing out.");
            })}
          >
            <LogOut size={14} />
            Sign Out
          </button>
          </div>
        </div>
      )}
    </div>
  );
}
