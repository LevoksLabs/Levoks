"use client";
import { useEffect, useRef, useState } from "react";
import { X } from "lucide-react";
import { type SavedProject } from "@/lib/project/storage";
import { type ProjectGroup } from "@/lib/project/library";
import styles from "./home.module.css";

export type Action =
  | { kind: "create" | "group" }
  | { kind: "rename" | "move"; project: SavedProject }
  | { kind: "rename-group" | "remove-group"; group: ProjectGroup };

export default function ActionDialog({
  action,
  groups,
  groupId,
  onClose,
  onSubmit,
}: {
  action: Action;
  groups: ProjectGroup[];
  groupId?: string;
  onClose: () => void;
  onSubmit: (value: string) => Promise<void>;
}) {
  const ref = useRef<HTMLDialogElement>(null);
  const [value, setValue] = useState(
    action.kind === "rename"
      ? action.project.name
      : action.kind === "rename-group"
        ? action.group.name
        : action.kind === "move"
          ? groupId || ""
          : action.kind === "create"
            ? "Untitled project"
            : "",
  );
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  useEffect(() => {
    const element = ref.current;
    const previous = document.activeElement as HTMLElement | null;
    element?.showModal();
    element?.querySelector("input")?.select();
    return () => {
      element?.close();
      if (previous?.isConnected) previous.focus();
    };
  }, []);
  const title = {
    create: "Create a project",
    group: "Create a group",
    rename: "Rename project",
    move: "Move to group",
    "rename-group": "Rename group",
    "remove-group": "Remove group",
  }[action.kind];
  return (
    <dialog
      ref={ref}
      className={styles.dialog}
      aria-labelledby="home-dialog-title"
      onCancel={(event) => {
        event.preventDefault();
        if (!busy) onClose();
      }}
    >
      <form
        onSubmit={(event) => {
          event.preventDefault();
          setBusy(true);
          setError("");
          void onSubmit(value.trim())
            .catch((reason) => setError(reason.message))
            .finally(() => setBusy(false));
        }}
      >
        <div className={styles.dialogHeading}>
          <h2 id="home-dialog-title">{title}</h2>
          <button
            type="button"
            aria-label="Close dialog"
            disabled={busy}
            onClick={onClose}
          >
            <X size={19} />
          </button>
        </div>
        {action.kind === "remove-group" ? (
          <p>
            Remove “{action.group.name}”? Its projects will stay in All
            projects.
          </p>
        ) : action.kind === "move" ? (
          <label>
            Group
            <select
              aria-label="Group"
              autoFocus
              value={value}
              onChange={(event) => setValue(event.target.value)}
            >
              <option value="">No group</option>
              {groups.map((group) => (
                <option key={group.id} value={group.id}>
                  {group.name}
                </option>
              ))}
            </select>
          </label>
        ) : (
          <label>
            {action.kind === "group" || action.kind === "rename-group"
              ? "Group name"
              : "Project name"}
            <input
              autoFocus
              required
              maxLength={
                action.kind === "group" || action.kind === "rename-group"
                  ? 80
                  : 100
              }
              value={value}
              onChange={(event) => setValue(event.target.value)}
              placeholder={
                action.kind === "group"
                  ? "e.g. Client projects"
                  : "Name your project"
              }
            />
          </label>
        )}
        {action.kind === "create" && (
          <p>
            Start with an empty UI, backend, and routing workspace. Your project
            saves on this device.
          </p>
        )}
        {action.kind === "group" && (
          <p>Groups organize your projects on this device.</p>
        )}
        {error && (
          <p className={styles.error} role="alert">
            {error}
          </p>
        )}
        <div className={styles.dialogActions}>
          <button
            type="button"
            className={styles.secondary}
            disabled={busy}
            onClick={onClose}
          >
            Cancel
          </button>
          <button
            className={styles.primary}
            disabled={
              busy ||
              (!["move", "remove-group"].includes(action.kind) && !value.trim())
            }
          >
            {busy
              ? "Saving…"
              : action.kind === "create"
                ? "Create project"
                : action.kind === "group"
                  ? "Create group"
                  : action.kind === "remove-group"
                    ? "Remove group"
                    : "Save changes"}
          </button>
        </div>
      </form>
    </dialog>
  );
}
