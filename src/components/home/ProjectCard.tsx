"use client";
import { useRef } from "react";
import Link from "next/link";
import {
  ArrowUpRight,
  Copy,
  Download,
  Folder,
  LayoutTemplate,
  MoreHorizontal,
  Pencil,
  Star,
  Trash2,
  Undo2,
} from "lucide-react";
import { type SavedProject } from "@/lib/project/storage";
import {
  projectPath,
  type ProjectGroup,
  type ProjectMeta,
} from "@/lib/project/library";
import { downloadProject } from "@/lib/project/workspace";
import styles from "./home.module.css";

export const formatDate = (date: string) =>
  new Date(date).toLocaleDateString(undefined, {
    month: "short",
    day: "numeric",
    year: "numeric",
  });

export default function ProjectCard({
  project,
  meta,
  group,
  busy,
  onStar,
  onRename,
  onMove,
  onDuplicate,
  onTrash,
  onRestore,
}: {
  project: SavedProject;
  meta?: ProjectMeta;
  group?: ProjectGroup;
  busy: boolean;
  onStar: () => void;
  onRename: () => void;
  onMove: () => void;
  onDuplicate: () => void;
  onTrash: () => void;
  onRestore: () => void;
}) {
  const menu = useRef<HTMLDetailsElement>(null);
  const closeThen = (action: () => void) => {
    if (menu.current) menu.current.open = false;
    menu.current?.querySelector("summary")?.focus();
    action();
  };
  const pages = project.document.editor.pages;
  const services = project.document.backend.services.length;
  return (
    <article className={styles.projectCard} aria-label={project.name}>
      {meta?.trashedAt ? (
        <div className={styles.projectCover}>
          <Trash2 size={32} strokeWidth={1.3} />
        </div>
      ) : (
        <Link
          href={projectPath(project.id)}
          className={styles.projectCover}
          aria-label={`Open ${project.name}`}
        >
          <div className={styles.documentPreview}>
            <div className={styles.previewBar}>
              <LayoutTemplate size={13} />
              <span>{pages[0]?.title || "Home"}</span>
              <MoreHorizontal size={14} />
            </div>
            <div className={styles.previewPages}>
              {pages.slice(0, 3).map((page) => (
                <div key={page.id}>
                  <LayoutTemplate size={22} strokeWidth={1.2} />
                  <span>{page.title}</span>
                  <small>{page.route}</small>
                </div>
              ))}
            </div>
            <div className={styles.previewFooter}>
              <span>
                {pages.length} {pages.length === 1 ? "page" : "pages"}
              </span>
              <span>
                {services} {services === 1 ? "service" : "services"}
              </span>
            </div>
          </div>
          <span className={styles.openHint}>
            Open project <ArrowUpRight size={15} />
          </span>
        </Link>
      )}
      <div className={styles.cardInfo}>
        <div className={styles.cardTitle}>
          {meta?.trashedAt ? (
            <h2>{project.name}</h2>
          ) : (
            <h2>
              <Link href={projectPath(project.id)}>{project.name}</Link>
            </h2>
          )}
          {!meta?.trashedAt && (
            <button
              className={styles.starButton}
              aria-label={`${meta?.starred ? "Unstar" : "Star"} ${project.name}`}
              aria-pressed={!!meta?.starred}
              disabled={busy}
              onClick={onStar}
            >
              <Star size={16} fill={meta?.starred ? "currentColor" : "none"} />
            </button>
          )}
          <details
            ref={menu}
            className={styles.cardMenu}
            onBlur={(event) => {
              if (
                !event.currentTarget.contains(
                  event.relatedTarget as Node | null,
                )
              )
                event.currentTarget.open = false;
            }}
            onKeyDown={(event) => {
              if (event.key === "Escape") {
                event.currentTarget.open = false;
                event.currentTarget.querySelector("summary")?.focus();
              }
            }}
          >
            <summary aria-label={`Actions for ${project.name}`}>
              <MoreHorizontal size={19} />
            </summary>
            <div className={styles.menuItems}>
              {meta?.trashedAt ? (
                <button disabled={busy} onClick={() => closeThen(onRestore)}>
                  <Undo2 size={15} /> Restore project
                </button>
              ) : (
                <>
                  <button disabled={busy} onClick={() => closeThen(onRename)}>
                    <Pencil size={15} /> Rename
                  </button>
                  <button disabled={busy} onClick={() => closeThen(onMove)}>
                    <Folder size={15} /> Move to group
                  </button>
                  <button
                    disabled={busy}
                    onClick={() => closeThen(onDuplicate)}
                  >
                    <Copy size={15} /> Duplicate
                  </button>
                  <button
                    onClick={() =>
                      closeThen(() => downloadProject(project.document))
                    }
                  >
                    <Download size={15} /> Export backup
                  </button>
                  <button disabled={busy} onClick={() => closeThen(onTrash)}>
                    <Trash2 size={15} /> Move to Trash
                  </button>
                </>
              )}
            </div>
          </details>
        </div>
        <p>
          {group && (
            <span className={styles.groupTag}>
              <Folder size={12} />
              {group.name}
            </span>
          )}
          <span>
            Edited{" "}
            <time dateTime={project.updatedAt}>
              {formatDate(project.updatedAt)}
            </time>
          </span>
        </p>
        {meta?.trashedAt && (
          <button
            className={styles.secondary}
            disabled={busy}
            onClick={onRestore}
          >
            <Undo2 size={15} /> Restore project
          </button>
        )}
      </div>
    </article>
  );
}
