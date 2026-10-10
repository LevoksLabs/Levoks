"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useSession } from "next-auth/react";
import {
  ArrowDownToLine,
  ArrowUpRight,
  Check,
  Cloud,
  Folder,
  FolderPlus,
  Grid2X2,
  HardDrive,
  Home,
  List,
  LoaderCircle,
  Menu,
  Pencil,
  Plus,
  Search,
  Star,
  Trash2,
  Upload,
  UserRound,
  X,
} from "lucide-react";
import {
  getProject,
  listProjects,
  saveProject,
  type SavedProject,
} from "@/lib/project/storage";
import {
  projectPath,
  readLibrary,
  removeGroup,
  saveGroup,
  updateProjectMeta,
  type ProjectGroup,
  type ProjectMeta,
} from "@/lib/project/library";
import { emptyProject } from "@/lib/project/workspace";
import {
  MAX_PROJECT_BYTES,
  parseProject,
  parseProjectJSON,
} from "@/lib/project/schema";
import { flushWorkspace, useWorkspaceStore } from "@/store/workspaceStore";
import ProfileSettings from "./ProfileSettings";
import ProjectCard, { formatDate } from "./ProjectCard";
import ActionDialog, { type Action } from "./ActionDialog";
import styles from "./home.module.css";
import { sharedProjectPath } from "@/store/collaborationStore";

type View = "all" | "starred" | "cloud" | "trash" | `group:${string}`;
type CloudProject = {
  ownerId?: string;
  role?: "owner" | "editor" | "viewer";
  projectId: string;
  name: string;
  updatedAt: string;
  revision: number;
};

export default function ProjectDashboard({
  profile = false,
}: {
  profile?: boolean;
}) {
  const router = useRouter();
  const { data: session, status: authStatus } = useSession();
  const ownerId = session?.user?.id;
  const [projects, setProjects] = useState<SavedProject[]>([]);
  const [groups, setGroups] = useState<ProjectGroup[]>([]);
  const [metadata, setMetadata] = useState<ProjectMeta[]>([]);
  const [view, setView] = useState<View>("all");
  const [query, setQuery] = useState("");
  const [sort, setSort] = useState("updated");
  const [layout, setLayout] = useState("grid");
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [action, setAction] = useState<Action | null>(null);
  const [navOpen, setNavOpen] = useState(false);
  const [cloud, setCloud] = useState<{
    ownerId: string;
    projects: CloudProject[];
  }>({ ownerId: "", projects: [] });
  const [cloudLoading, setCloudLoading] = useState(false);
  const [cloudError, setCloudError] = useState("");
  const [cloudReload, setCloudReload] = useState(0);
  const importInput = useRef<HTMLInputElement>(null);
  const running = useRef(false);
  const currentOwner = useRef(ownerId);
  const sidebar = useRef<HTMLElement>(null);
  const navigationButton = useRef<HTMLButtonElement>(null);
  useEffect(() => {
    currentOwner.current = ownerId;
  }, [ownerId]);
  useEffect(() => {
    if (!navOpen) return;
    sidebar.current?.querySelector<HTMLAnchorElement>("a")?.focus();
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        setNavOpen(false);
        navigationButton.current?.focus();
      }
      if (event.key !== "Tab") return;
      const items = Array.from(
        sidebar.current?.querySelectorAll<HTMLElement>("a, button") || [],
      );
      const first = items[0],
        last = items[items.length - 1];
      if (event.shiftKey && document.activeElement === first) {
        event.preventDefault();
        last?.focus();
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault();
        first?.focus();
      }
    };
    const resize = () => {
      if (window.innerWidth > 700) setNavOpen(false);
    };
    document.addEventListener("keydown", onKey);
    window.addEventListener("resize", resize);
    return () => {
      document.removeEventListener("keydown", onKey);
      window.removeEventListener("resize", resize);
    };
  }, [navOpen]);
  const meta = new Map(metadata.map((item) => [item.id, item]));
  const activeProjects = projects.filter(
    (project) => !meta.get(project.id)?.trashedAt,
  );
  const activeGroup = view.startsWith("group:")
    ? groups.find((group) => group.id === view.slice(6))
    : undefined;
  const refresh = useCallback(async () => {
    // A failed pending save must not hide the library or block Trash recovery.
    let saveFailure: unknown;
    try {
      await flushWorkspace();
    } catch (reason) {
      saveFailure = reason;
    }
    const [saved, library] = await Promise.all([listProjects(), readLibrary()]);
    setProjects(saved);
    setGroups(library.groups);
    setMetadata(library.metadata);
    if (saveFailure) throw saveFailure;
  }, []);
  useEffect(() => {
    let active = true;
    const load = () => {
      void refresh()
        .catch((reason) => {
          if (active) setError(reason.message);
        })
        .finally(() => {
          if (active) setLoading(false);
        });
    };
    load();
    window.addEventListener("focus", load);
    return () => {
      active = false;
      window.removeEventListener("focus", load);
    };
  }, [refresh]);
  useEffect(() => {
    if (view !== "cloud" || !ownerId) return;
    const controller = new AbortController();
    async function loadCloud() {
      setCloudLoading(true);
      setCloudError("");
      try {
        const response = await fetch("/api/projects", {
          cache: "no-store",
          signal: controller.signal,
        });
        const data = await response.json();
        if (!response.ok)
          throw new Error(data.error || "Could not load cloud projects.");
        if (!controller.signal.aborted)
          setCloud({ ownerId: ownerId!, projects: data });
      } catch (reason) {
        if (!controller.signal.aborted)
          setCloudError(
            reason instanceof Error
              ? reason.message
              : "Cloud projects are unavailable.",
          );
      } finally {
        if (!controller.signal.aborted) setCloudLoading(false);
      }
    }
    void loadCloud();
    return () => controller.abort();
  }, [view, ownerId, cloudReload]);
  async function run(task: () => Promise<void>) {
    if (running.current) return;
    running.current = true;
    setBusy(true);
    setError("");
    setNotice("");
    try {
      await task();
      await refresh();
    } catch (reason) {
      setError(
        reason instanceof Error
          ? reason.message
          : "Something went wrong. Please try again.",
      );
    } finally {
      running.current = false;
      setBusy(false);
    }
  }
  function navigate(next: View) {
    setView(next);
    setQuery("");
    setNavOpen(false);
  }
  async function submitAction(value: string) {
    if (!action) return;
    if (action.kind === "create") {
      const project = emptyProject(value);
      await saveProject(project, 0, "Project created");
      if (activeGroup)
        await updateProjectMeta(project.id, { groupId: activeGroup.id });
      router.push(projectPath(project.id));
    } else if (action.kind === "group") {
      const id = await saveGroup(value);
      navigate(`group:${id}`);
    } else if (action.kind === "rename-group")
      await saveGroup(value, action.group.id);
    else if (action.kind === "remove-group") {
      await removeGroup(action.group.id);
      navigate("all");
    } else if (action.kind === "move")
      await updateProjectMeta(action.project.id, {
        groupId: value || undefined,
      });
    else if (action.kind === "rename")
      await saveProject(
        {
          ...action.project.document,
          name: value,
          updatedAt: new Date().toISOString(),
        },
        action.project.revision,
        "Project renamed",
      );
    await refresh();
    setAction(null);
  }
  async function duplicate(project: SavedProject) {
    const copy = {
      ...project.document,
      id: crypto.randomUUID(),
      name: `${project.name.slice(0, 93)} (copy)`,
      updatedAt: new Date().toISOString(),
    };
    await saveProject(copy, 0, "Project duplicated");
    const groupId = meta.get(project.id)?.groupId;
    if (groupId) await updateProjectMeta(copy.id, { groupId });
    setNotice(`Created ${copy.name}.`);
  }
  async function openCloud(project: CloudProject) {
    if (project.ownerId && project.ownerId !== ownerId) {
      router.push(sharedProjectPath(project.ownerId, project.projectId));
      return;
    }
    const local = await getProject(project.projectId);
    if (local) {
      if (meta.get(local.id)?.trashedAt)
        throw new Error(
          "The device copy is in Trash. Restore it first, then open it.",
        );
      router.push(projectPath(local.id));
      return;
    }
    const response = await fetch(
      `/api/projects?id=${encodeURIComponent(project.projectId)}`,
      { cache: "no-store" },
    );
    const data = await response.json();
    if (!response.ok)
      throw new Error(data.error || "Could not download the cloud project.");
    if (
      !ownerId ||
      data.ownerId !== ownerId ||
      currentOwner.current !== ownerId
    )
      throw new Error(
        "Your account changed. Reload cloud projects and try again.",
      );
    const document = parseProject(data.document);
    if (document.id !== project.projectId)
      throw new Error("The cloud response did not match this project.");
    await saveProject(document, 0, "Downloaded from cloud");
    sessionStorage.setItem(
      `levoks-cloud-revision:${JSON.stringify([ownerId, document.id])}`,
      String(data.revision),
    );
    router.push(projectPath(document.id));
  }
  const filtered = projects
    .filter((project) => {
      const item = meta.get(project.id);
      if (view === "trash" ? !item?.trashedAt : item?.trashedAt) return false;
      if (view === "starred" && !item?.starred) return false;
      if (view.startsWith("group:") && item?.groupId !== view.slice(6))
        return false;
      return project.name
        .toLocaleLowerCase()
        .includes(query.trim().toLocaleLowerCase());
    })
    .sort((a, b) =>
      sort === "name"
        ? a.name.localeCompare(b.name)
        : sort === "oldest"
          ? a.updatedAt.localeCompare(b.updatedAt)
          : b.updatedAt.localeCompare(a.updatedAt),
    );
  const cloudProjects = (cloud.ownerId === ownerId ? cloud.projects : [])
    .filter((project) =>
      project.name
        .toLocaleLowerCase()
        .includes(query.trim().toLocaleLowerCase()),
    )
    .sort((a, b) =>
      sort === "name"
        ? a.name.localeCompare(b.name)
        : sort === "oldest"
          ? a.updatedAt.localeCompare(b.updatedAt)
          : b.updatedAt.localeCompare(a.updatedAt),
    );
  const title = profile
    ? "Your profile"
    : activeGroup?.name ||
      (
        {
          all: "All projects",
          starred: "Starred projects",
          cloud: "Cloud projects",
          trash: "Trash",
        } as Record<string, string>
      )[view] ||
      "Group";
  const firstName = session?.user?.name?.split(" ")[0];
  const navItems = [
    { id: "all", label: "All projects", Icon: Home },
    { id: "starred", label: "Starred", Icon: Star },
    { id: "cloud", label: "Cloud projects", Icon: Cloud },
    { id: "trash", label: "Trash", Icon: Trash2 },
  ] as const;
  return (
    <div className={styles.shell}>
      <a className={styles.skip} href="#home-content">
        Skip to projects
      </a>
      {navOpen && (
        <button
          className={styles.scrim}
          aria-label="Close navigation"
          onClick={() => setNavOpen(false)}
        />
      )}
      <aside
        ref={sidebar}
        className={`${styles.sidebar} ${navOpen ? styles.sidebarOpen : ""}`}
        aria-label="Workspace navigation"
      >
        <Link href="/" className={styles.brand}>
          <img src="/levoks_logo.svg" width="30" height="30" alt="" />
          <span>levoks</span>
        </Link>
        <div className={styles.workspaceLabel}>
          <span className={styles.avatar}>
            {firstName?.[0]?.toUpperCase() || "L"}
          </span>
          <span>
            {firstName ? `${firstName}’s workspace` : "Your workspace"}
            <small>Personal workspace</small>
          </span>
        </div>
        <nav aria-label="Projects" className={styles.navigation}>
          {navItems.map(({ id, label, Icon }) =>
            profile ? (
              <Link key={id} href={`/?view=${id}`}>
                <Icon size={18} />
                {label}
              </Link>
            ) : (
              <button
                key={id}
                aria-current={view === id ? "page" : undefined}
                onClick={() => navigate(id)}
              >
                <Icon size={18} />
                {label}
                {id === "all" && (
                  <span className={styles.count}>{activeProjects.length}</span>
                )}
              </button>
            ),
          )}
        </nav>
        <div className={styles.groupHeading}>
          <h2>Groups</h2>
          <button
            aria-label="Create group"
            title="Create group"
            onClick={() => {
              if (profile) router.push("/?create=group");
              else setAction({ kind: "group" });
            }}
          >
            <Plus size={16} />
          </button>
        </div>
        <nav className={styles.groupNavigation} aria-label="Project groups">
          {groups.map((group) =>
            profile ? (
              <Link
                href={`/?group=${encodeURIComponent(group.id)}`}
                key={group.id}
              >
                <Folder size={17} />
                <span>{group.name}</span>
              </Link>
            ) : (
              <button
                key={group.id}
                aria-current={view === `group:${group.id}` ? "page" : undefined}
                onClick={() => navigate(`group:${group.id}`)}
              >
                <Folder size={17} />
                <span>{group.name}</span>
                <small>
                  {
                    activeProjects.filter(
                      (project) => meta.get(project.id)?.groupId === group.id,
                    ).length
                  }
                </small>
              </button>
            ),
          )}
          {!groups.length && <p>Keep related projects together.</p>}
        </nav>
        <div className={styles.sidebarBottom}>
          <div className={styles.storageNote}>
            <HardDrive size={17} />
            <span>
              Saved on this device
              <small>Cloud saves are available in the editor.</small>
            </span>
          </div>
          <Link
            className={styles.profileLink}
            href="/profile"
            aria-current={profile ? "page" : undefined}
          >
            <UserRound size={18} />
            <span>Profile &amp; account</span>
            <ArrowUpRight size={15} />
          </Link>
        </div>
      </aside>
      <div className={styles.main} inert={navOpen || undefined}>
        <header className={styles.topbar}>
          <div>
            <button
              className={styles.mobileMenu}
              aria-label="Open navigation"
              aria-expanded={navOpen}
              ref={navigationButton}
              onClick={() => setNavOpen(!navOpen)}
            >
              <Menu size={20} />
            </button>
            <span>Workspace</span>
            <span className={styles.slash}>/</span>
            <strong>{profile ? "Profile" : "Home"}</strong>
          </div>
          {authStatus === "loading" ? (
            <span className={styles.muted}>Loading account…</span>
          ) : session ? (
            <Link href="/profile" className={styles.account}>
              <span className={styles.avatar}>
                {firstName?.[0]?.toUpperCase() || "U"}
              </span>
              <span>{session.user?.name || "Your account"}</span>
            </Link>
          ) : (
            <Link href="/auth/signin" className={styles.secondary}>
              <UserRound size={16} /> Sign in
            </Link>
          )}
        </header>
        <main id="home-content" className={styles.content}>
          {profile ? (
            <ProfileSettings key={ownerId || "guest"} />
          ) : (
            <>
              <div className={styles.heading}>
                <div>
                  <h1>{title}</h1>
                  <p>
                    {view === "trash"
                      ? "Restore projects whenever you need them. Cloud copies are unchanged."
                      : view === "cloud"
                        ? "Your account’s saved projects. Download a copy to continue on this device."
                        : view === "starred"
                          ? "The projects you want to keep close."
                          : activeGroup
                            ? "A little order for your next big idea."
                            : "A home for everything you’re building."}
                  </p>
                </div>
                {view !== "trash" && (
                  <div className={styles.headingActions}>
                    <button
                      className={styles.secondary}
                      disabled={busy || loading}
                      onClick={() => importInput.current?.click()}
                    >
                      <Upload size={16} /> Import project
                    </button>
                    <button
                      className={styles.primary}
                      disabled={busy || loading}
                      onClick={() => setAction({ kind: "create" })}
                    >
                      <Plus size={18} /> New project
                    </button>
                  </div>
                )}
              </div>
              <input
                ref={importInput}
                type="file"
                accept=".json,.levoks.json"
                hidden
                aria-label="Import project backup"
                onChange={(event) => {
                  const file = event.target.files?.[0];
                  event.target.value = "";
                  if (file)
                    void run(async () => {
                      if (file.size > MAX_PROJECT_BYTES)
                        throw new Error(
                          "This backup exceeds the 5 MB project limit.",
                        );
                      let imported;
                      try {
                        imported = parseProjectJSON(await file.text());
                      } catch {
                        throw new Error(
                          "This file is not a valid Levoks project backup. Choose a .levoks.json file exported from Levoks.",
                        );
                      }
                      const project = {
                        ...imported,
                        id: crypto.randomUUID(),
                        name: `${imported.name.slice(0, 91)} (import)`,
                        updatedAt: new Date().toISOString(),
                      };
                      await saveProject(project, 0, "Imported backup");
                      if (activeGroup)
                        await updateProjectMeta(project.id, {
                          groupId: activeGroup.id,
                        });
                      setNotice(`Imported ${project.name}.`);
                    });
                }}
              />
              {error && (
                <div className={styles.error} role="alert">
                  <span>{error}</span>
                  {useWorkspaceStore.getState().dirty && (
                    <Link
                      className={styles.secondary}
                      href={projectPath(useWorkspaceStore.getState().id)}
                    >
                      Recover unsaved edits
                    </Link>
                  )}
                  <button onClick={() => void run(refresh)}>Retry</button>
                  <button
                    aria-label="Dismiss error"
                    onClick={() => setError("")}
                  >
                    <X size={16} />
                  </button>
                </div>
              )}
              {notice && (
                <div className={styles.notice} role="status">
                  <Check size={16} />
                  {notice}
                  <button
                    aria-label="Dismiss notification"
                    onClick={() => setNotice("")}
                  >
                    <X size={16} />
                  </button>
                </div>
              )}
              {activeGroup && (
                <div className={styles.groupActions}>
                  <Folder size={16} />
                  <span>{filtered.length} projects</span>
                  <button
                    onClick={() =>
                      setAction({ kind: "rename-group", group: activeGroup })
                    }
                  >
                    <Pencil size={14} /> Rename group
                  </button>
                  <button
                    onClick={() =>
                      setAction({ kind: "remove-group", group: activeGroup })
                    }
                  >
                    <Trash2 size={14} /> Remove group
                  </button>
                </div>
              )}
              <div className={styles.toolbar}>
                <label className={styles.search}>
                  <Search size={17} />
                  <input
                    aria-label="Search projects"
                    placeholder="Search your projects…"
                    value={query}
                    onChange={(event) => setQuery(event.target.value)}
                  />
                  {query && (
                    <button
                      aria-label="Clear search"
                      onClick={() => setQuery("")}
                    >
                      <X size={15} />
                    </button>
                  )}
                </label>
                <div className={styles.viewControls}>
                  <select
                    aria-label="Sort projects"
                    value={sort}
                    onChange={(event) => setSort(event.target.value)}
                  >
                    <option value="updated">Last edited</option>
                    <option value="oldest">Oldest first</option>
                    <option value="name">Name A–Z</option>
                  </select>
                  <div
                    className={styles.layoutToggle}
                    aria-label="Project view"
                  >
                    <button
                      aria-label="Grid view"
                      aria-pressed={layout === "grid"}
                      onClick={() => setLayout("grid")}
                    >
                      <Grid2X2 size={17} />
                    </button>
                    <button
                      aria-label="List view"
                      aria-pressed={layout === "list"}
                      onClick={() => setLayout("list")}
                    >
                      <List size={18} />
                    </button>
                  </div>
                </div>
              </div>
              {view === "cloud" ? (
                <>
                  {!ownerId ? (
                    <EmptyState
                      icon="cloud"
                      title="Your projects, on another device"
                      description="Sign in to access projects you’ve saved to your account. Your local projects remain available."
                      action={
                        <Link
                          href="/auth/signin?callbackUrl=%2F%3Fview%3Dcloud"
                          className={styles.primary}
                        >
                          Sign in to continue <ArrowUpRight size={16} />
                        </Link>
                      }
                    />
                  ) : cloudLoading ? (
                    <LoadingProjects />
                  ) : cloudError ? (
                    <div className={styles.empty}>
                      <Cloud size={32} />
                      <h2>Cloud projects are unavailable</h2>
                      <p role="alert">{cloudError}</p>
                      <button
                        className={styles.secondary}
                        onClick={() => setCloudReload((value) => value + 1)}
                      >
                        Try again
                      </button>
                    </div>
                  ) : !cloudProjects.length ? (
                    <EmptyState
                      icon="cloud"
                      title={
                        query ? "No matching projects" : "No cloud projects yet"
                      }
                      description={
                        query
                          ? "Try a different project name."
                          : "Open a project and choose Save to account in its project menu. It will appear here."
                      }
                    />
                  ) : (
                    <div
                      className={
                        layout === "grid"
                          ? styles.projectGrid
                          : styles.projectList
                      }
                    >
                      {cloudProjects.map((project) => (
                        <article
                          className={styles.projectCard}
                          key={`${project.ownerId || ownerId}/${project.projectId}`}
                        >
                          <div className={styles.cloudCover}>
                            <Cloud size={36} strokeWidth={1.3} />
                            <span>{project.role === "editor" ? "Shared · Editor" : project.role === "viewer" ? "Shared · Viewer" : "Saved to your account"}</span>
                          </div>
                          <div className={styles.cardInfo}>
                            <h2>{project.name}</h2>
                            <p>
                              <time dateTime={project.updatedAt}>
                                {formatDate(project.updatedAt)}
                              </time>
                            </p>
                            <button
                              className={styles.secondary}
                              disabled={busy}
                              onClick={() => void run(() => openCloud(project))}
                            >
                              {project.ownerId && project.ownerId !== ownerId ? <>Open shared project</> : projects.some(
                                (local) => local.id === project.projectId,
                              ) ? (
                                <>
                                  <ArrowUpRight size={15} /> Open device copy
                                </>
                              ) : (
                                <>
                                  <ArrowDownToLine size={15} /> Download &amp;
                                  open
                                </>
                              )}
                            </button>
                            {(!project.ownerId || project.ownerId === ownerId) && ownerId && <Link className={styles.secondary} href={sharedProjectPath(ownerId, project.projectId)}>Open shared workspace</Link>}
                          </div>
                        </article>
                      ))}
                    </div>
                  )}
                  {ownerId && !cloudLoading && (
                    <p className={styles.footnote}>
                      Cloud saves are explicit. Opening an existing device copy
                      keeps its latest local edits.
                    </p>
                  )}
                </>
              ) : loading ? (
                <LoadingProjects />
              ) : !filtered.length ? (
                <EmptyState
                  icon={view === "trash" ? "trash" : "folder"}
                  title={
                    query
                      ? "No matching projects"
                      : view === "trash"
                        ? "Nothing in Trash"
                        : view === "starred"
                          ? "Keep your favorites here"
                          : activeGroup
                            ? "This group is ready for ideas"
                            : "Your next project starts here"
                  }
                  description={
                    query
                      ? "Try another name or clear your search to see all projects."
                      : view === "trash"
                        ? "Projects you move to Trash will appear here. You can restore them at any time."
                        : view === "starred"
                          ? "Star a project from its card to find it quickly next time."
                          : "Start with a blank canvas, or import a Levoks project you’ve already saved."
                  }
                  action={
                    query ? (
                      <button
                        className={styles.secondary}
                        onClick={() => setQuery("")}
                      >
                        Clear search
                      </button>
                    ) : view === "all" || activeGroup ? (
                      <button
                        className={styles.primary}
                        disabled={busy}
                        onClick={() => setAction({ kind: "create" })}
                      >
                        <Plus size={17} /> Create a project
                      </button>
                    ) : undefined
                  }
                />
              ) : (
                <>
                  <div className={styles.collectionHeading}>
                    <h2>
                      {query
                        ? "Search results"
                        : view === "all"
                          ? "Your projects"
                          : title}
                    </h2>
                    <span>
                      {filtered.length}{" "}
                      {filtered.length === 1 ? "project" : "projects"}
                    </span>
                  </div>
                  <div
                    className={
                      layout === "grid"
                        ? styles.projectGrid
                        : styles.projectList
                    }
                  >
                    {filtered.map((project) => (
                      <ProjectCard
                        key={project.id}
                        project={project}
                        meta={meta.get(project.id)}
                        group={groups.find(
                          (group) => group.id === meta.get(project.id)?.groupId,
                        )}
                        busy={busy}
                        onStar={() =>
                          void run(() =>
                            updateProjectMeta(project.id, {
                              starred: !meta.get(project.id)?.starred,
                            }),
                          )
                        }
                        onRename={() => setAction({ kind: "rename", project })}
                        onMove={() => setAction({ kind: "move", project })}
                        onDuplicate={() => void run(() => duplicate(project))}
                        onTrash={() =>
                          void run(async () => {
                            await updateProjectMeta(project.id, {
                              trashedAt: new Date().toISOString(),
                            });
                            setNotice(
                              `${project.name} moved to Trash. You can restore it there.`,
                            );
                          })
                        }
                        onRestore={() =>
                          void run(async () => {
                            await updateProjectMeta(project.id, {
                              trashedAt: undefined,
                            });
                            setNotice(`${project.name} restored.`);
                          })
                        }
                      />
                    ))}
                  </div>
                  <p className={styles.footnote}>
                    <HardDrive size={14} /> Projects and groups are saved in
                    this browser. Export a backup to keep a portable copy.
                  </p>
                </>
              )}
            </>
          )}
        </main>
      </div>
      {action && (
        <ActionDialog
          action={action}
          groups={groups}
          groupId={
            "project" in action
              ? meta.get(action.project.id)?.groupId
              : undefined
          }
          onClose={() => setAction(null)}
          onSubmit={submitAction}
        />
      )}
      {!profile && <HomeLocation onView={setView} onAction={setAction} />}
    </div>
  );
}

function HomeLocation({
  onView,
  onAction,
}: {
  onView: (view: View) => void;
  onAction: (action: Action) => void;
}) {
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const view = params.get("view");
    if (view && ["all", "starred", "cloud", "trash"].includes(view))
      onView(view as View);
    if (params.get("group")) onView(`group:${params.get("group")}`);
    if (params.get("create") === "group") onAction({ kind: "group" });
  }, [onView, onAction]);
  return null;
}
function EmptyState({
  icon,
  title,
  description,
  action,
}: {
  icon: "folder" | "cloud" | "trash";
  title: string;
  description: string;
  action?: React.ReactNode;
}) {
  const Icon =
    icon === "cloud" ? Cloud : icon === "trash" ? Trash2 : FolderPlus;
  return (
    <div className={styles.empty}>
      <div className={styles.emptyIcon}>
        <Icon size={32} strokeWidth={1.25} />
      </div>
      <h2>{title}</h2>
      <p>{description}</p>
      {action}
    </div>
  );
}
function LoadingProjects() {
  return (
    <div className={styles.loading} role="status">
      <LoaderCircle size={20} /> Loading projects…
    </div>
  );
}
