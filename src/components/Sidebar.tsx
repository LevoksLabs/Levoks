"use client";

import { useEditorStore } from "@/store/editorStore";
import { useBackendStore } from "@/store/backendStore";
import { useRoutingStore } from "@/store/routingStore";
import { templates, sidebarCategories } from "@/templates";
import { ElementType, CONTAINER_TYPES } from "@/types";
import { BACKEND_SIDEBAR_CATEGORIES, BackendBlockType } from "@/types/backend";
import AssetLibrary from "./design/AssetLibrary";
import { useDraggable } from "@dnd-kit/core";
import { CSS } from "@dnd-kit/utilities";
import { useState } from "react";
import { useEditorUIStore } from "@/store/editorUIStore";
import DesignLibrary from "./design/DesignLibrary";
import LayersPanel from "./LayersPanel";
import PagesPanel from "./PagesPanel";
import TemplatesPanel from "./TemplatesPanel";
import {
  Plus,
  FileText,
  Layers,
  Globe,
  Route,
  Code2,
  AlignJustify,
  Square,
  Columns2,
  LayoutList,
  ArrowUpDown,
  Minus,
  Type,
  MousePointerClick,
  Image as ImageIcon,
  PlayCircle,
  LayoutGrid,
  Menu,
  Diamond,
  Star,
  FileInput,
  PenLine,
  Smartphone,
  RotateCcw,
  ChevronDown,
  Code,
  Sparkles,
  Server,
  Database,
  Shield,
  GitBranch,
  Repeat,
  AlertTriangle,
  CheckCircle,
  Link2,
  Settings,
  Zap,
  Download,
  Play,
  Maximize2,
  KeyRound,
  ImagePlus,
  X,
  Keyboard,
} from "lucide-react";

// Map element type string → Lucide icon for sidebar tiles
const TILE_ICONS: Record<string, React.ReactNode> = {
  section: <AlignJustify size={20} />,
  container: <Square size={20} />,
  columns: <Columns2 size={20} />,
  stack: <Layers size={20} />,
  spacer: <ArrowUpDown size={20} />,
  divider: <Minus size={20} />,
  title: <Type size={20} strokeWidth={2.5} />,
  text: <Type size={20} />,
  paragraph: <FileText size={20} />,
  button: <MousePointerClick size={20} />,
  image: <ImageIcon size={20} />,
  video: <PlayCircle size={20} />,
  gallery: <LayoutGrid size={20} />,
  menu: <Menu size={20} />,
  shape: <Diamond size={20} />,
  icon: <Star size={20} />,
  form: <FileInput size={20} />,
  input: <PenLine size={20} />,
  socialbar: <Smartphone size={20} />,
  frame: <Code size={20} />,
  repeater: <RotateCcw size={20} />,
  accordion: <ChevronDown size={20} />,
  tabs: <LayoutList size={20} />,
};

// Draggable sidebar element tile
const DraggableItem: React.FC<{
  type: ElementType;
  label: string;
  icon: string;
}> = ({ type, label, icon }) => {
  const { addElement } = useEditorStore();

  const { attributes, listeners, setNodeRef, transform, isDragging } =
    useDraggable({
      id: `template-${type}`,
      data: {
        type: "template",
        template: templates[type],
        templateType: type,
      },
    });

  const style: React.CSSProperties = {
    transform: CSS.Translate.toString(transform),
    opacity: isDragging ? 0.4 : 1,
  };

  const handleClick = () => {
    const { selectedElementId, getElement } = useEditorStore.getState();
    let parentId: string | undefined;

    if (selectedElementId) {
      const sel = getElement(selectedElementId);
      if (sel && CONTAINER_TYPES.includes(sel.type)) {
        parentId = selectedElementId;
      }
    }

    addElement({ ...templates[type] }, parentId);
  };

  return (
    <div
      ref={setNodeRef}
      style={style}
      className="sidebar-tile"
      {...listeners}
      {...attributes}
      suppressHydrationWarning
      onDoubleClick={handleClick}
      onKeyDown={(event) => {
        if (event.key === "Enter") {
          event.preventDefault();
          handleClick();
        }
      }}
      aria-label={`Add ${label}`}
      title={`Drag or double-click to add ${label}`}
    >
      <div className="sidebar-tile-icon">
        {TILE_ICONS[icon] || TILE_ICONS[type] || <Square size={20} />}
      </div>
      <span className="sidebar-tile-label">{label}</span>
    </div>
  );
};

// Global element item
const GlobalItem: React.FC<{
  type: ElementType;
  label: string;
  description: string;
}> = ({ type, label, description }) => {
  const { addGlobalElement } = useEditorStore();

  const handleAdd = () => {
    addGlobalElement({ ...templates[type] });
  };

  return (
    <button className="global-item" onClick={handleAdd}>
      <div className="global-item-icon">
        {TILE_ICONS[type] || <Square size={20} />}
      </div>
      <div className="global-item-info">
        <span className="global-item-label">{label}</span>
        <span className="global-item-desc">{description}</span>
      </div>
      <Plus size={14} className="global-item-add" />
    </button>
  );
};

const Sidebar: React.FC = () => {
  const {
    sidebarOpen,
    setSidebarOpen,
    globalRootIds,
    elementsById,
    deleteGlobalElement,
    selectElement,
    pages,
  } = useEditorStore();
  const [searchQuery, setSearchQuery] = useState("");
  const ui = useEditorUIStore();

  const getFilteredCategories = () => {
    if (!searchQuery) return sidebarCategories;
    return sidebarCategories
      .map((cat) => ({
        ...cat,
        items: cat.items.filter((item) =>
          item.label.toLowerCase().includes(searchQuery.toLowerCase()),
        ),
      }))
      .filter((cat) => cat.items.length > 0);
  };

  const filteredCategories = getFilteredCategories();

  return (
    <div className="sidebar-container">
      <nav
        className="sidebar-rail"
        aria-label="Editor tools"
        onClick={() => useEditorUIStore.setState({ trayCollapsed: false })}
      >
        <button
          className={`rail-btn ${sidebarOpen === "add" ? "rail-active" : ""}`}
          onClick={() => setSidebarOpen(sidebarOpen === "add" ? null : "add")}
          title="Add Elements"
          aria-label="Elements (Shift+E)"
          aria-pressed={sidebarOpen === "add"}
        >
          <span className="rail-icon">
            <Plus size={18} />
          </span>
          <span className="rail-label">Elements</span>
        </button>
        <button className={`rail-btn ${sidebarOpen === "library" ? "rail-active" : ""}`} aria-label="Design library" aria-pressed={sidebarOpen === "library"} onClick={() => setSidebarOpen(sidebarOpen === "library" ? null : "library")}><span className="rail-icon"><Diamond size={18} /></span><span className="rail-label">Library</span></button>
        <button
          className={`rail-btn ${sidebarOpen === "assets" ? "rail-active" : ""}`}
          onClick={() =>
            setSidebarOpen(sidebarOpen === "assets" ? null : "assets")
          }
          title="Assets (Shift+A)"
          aria-pressed={sidebarOpen === "assets"}
        >
          <span className="rail-icon">
            <ImagePlus size={18} />
          </span>
          <span className="rail-label">Assets</span>
        </button>
        <button
          className={`rail-btn ${sidebarOpen === "templates" ? "rail-active" : ""}`}
          onClick={() =>
            setSidebarOpen(sidebarOpen === "templates" ? null : "templates")
          }
          title="Templates"
        >
          <span className="rail-icon">
            <Sparkles size={16} />
          </span>
          <span className="rail-label">Templates</span>
        </button>
        <button
          className={`rail-btn ${sidebarOpen === "pages" ? "rail-active" : ""}`}
          onClick={() =>
            setSidebarOpen(sidebarOpen === "pages" ? null : "pages")
          }
          title="Pages"
        >
          <span className="rail-icon">
            <FileText size={16} />
          </span>
          <span className="rail-label">Pages</span>
        </button>
        <button
          className={`rail-btn ${sidebarOpen === "layers" ? "rail-active" : ""}`}
          onClick={() =>
            setSidebarOpen(sidebarOpen === "layers" ? null : "layers")
          }
          title="Layers"
        >
          <span className="rail-icon">
            <Layers size={16} />
          </span>
          <span className="rail-label">Layers</span>
        </button>
        <button
          className={`rail-btn ${sidebarOpen === "global" ? "rail-active" : ""}`}
          onClick={() =>
            setSidebarOpen(sidebarOpen === "global" ? null : "global")
          }
          title="Global"
        >
          <span className="rail-icon">
            <Globe size={16} />
          </span>
          <span className="rail-label">Global</span>
        </button>
        <button
          className={`rail-btn ${sidebarOpen === "routes" ? "rail-active" : ""}`}
          onClick={() =>
            setSidebarOpen(sidebarOpen === "routes" ? null : "routes")
          }
          title="Routes"
        >
          <span className="rail-icon">
            <Route size={16} />
          </span>
          <span className="rail-label">Routes</span>
        </button>
        <button
          className={`rail-btn ${sidebarOpen === "code" ? "rail-active" : ""}`}
          onClick={() =>
            window.dispatchEvent(
              new CustomEvent("levoks:panel", { detail: "source" }),
            )
          }
          title="Code"
        >
          <span className="rail-icon">
            <Code2 size={16} />
          </span>
          <span className="rail-label">Code</span>
        </button>
        <div className="rail-divider" />
        <button
          className={`rail-btn ${sidebarOpen === "backend" ? "rail-active" : ""}`}
          onClick={() =>
            setSidebarOpen(sidebarOpen === "backend" ? null : "backend")
          }
          title="Backend Builder"
        >
          <span className="rail-icon">
            <Server size={16} />
          </span>
          <span className="rail-label">Backend</span>
        </button>
        <div className="rail-bottom">
          <button
            className="rail-btn"
            title="Environment & secrets"
            onClick={() =>
              window.dispatchEvent(
                new CustomEvent("levoks:panel", { detail: "secrets" }),
              )
            }
          >
            <span className="rail-icon">
              <KeyRound size={18} />
            </span>
            <span className="rail-label">Secrets</span>
          </button>
          <button
            className={`rail-btn ${sidebarOpen === "settings" ? "rail-active" : ""}`}
            title="Editor settings (Shift+S)"
            onClick={() =>
              setSidebarOpen(sidebarOpen === "settings" ? null : "settings")
            }
            aria-pressed={sidebarOpen === "settings"}
          >
            <span className="rail-icon">
              <Settings size={18} />
            </span>
            <span className="rail-label">Settings</span>
          </button>
        </div>
      </nav>

      {sidebarOpen === "assets" && (
        <div className="sidebar-flyout">
          <div className="flyout-header">
            <h2>Assets</h2>
            <button
              className="flyout-close"
              aria-label="Close Assets"
              onClick={() => setSidebarOpen(null)}
            >
              <X size={16} />
            </button>
          </div>
          <AssetLibrary />
        </div>
      )}
      {sidebarOpen === "settings" && (
        <div className="sidebar-flyout">
          <div className="flyout-header">
            <h2>Editor settings</h2>
            <button
              className="flyout-close"
              aria-label="Close Settings"
              onClick={() => setSidebarOpen(null)}
            >
              <X size={16} />
            </button>
          </div>
          <div className="flyout-body editor-settings">
            <p className="panel-intro">
              Adjust your workspace. These controls do not change the exported
              application.
            </p>
            {(
              [
                ["gridVisible", "Canvas grid"],
                ["snapEnabled", "Snap to guides"],
                ["inspectorVisible", "Property inspector"],
                ["viewportLocked", "Lock canvas navigation"],
              ] as const
            ).map(([key, label]) => (
              <label key={key}>
                <span>{label}</span>
                <input
                  type="checkbox"
                  checked={ui[key]}
                  onChange={() => ui.toggle(key)}
                />
              </label>
            ))}
            <button
              className="code-panel-btn secondary"
              onClick={() => ui.toggle("helpOpen")}
            >
              <Keyboard size={16} />
              Keyboard shortcuts
            </button>
            <p className="panel-caption">
              Motion follows your system’s reduced-motion preference.
            </p>
          </div>
        </div>
      )}

      {/* Flyout — Add Elements */}
      {sidebarOpen === "add" && (
        <div className="sidebar-flyout">
          <div className="flyout-header">
            <h2>Add Elements</h2>
            <button
              className="flyout-close"
              aria-label="Close sub-tray"
              onClick={() => setSidebarOpen(null)}
            >
              <X size={16} />
            </button>
          </div>

          <div className="flyout-search">
            <svg
              className="search-icon"
              width="16"
              height="16"
              viewBox="0 0 16 16"
              fill="none"
            >
              <circle
                cx="7"
                cy="7"
                r="5"
                stroke="currentColor"
                strokeWidth="1.5"
              />
              <path
                d="M11 11l3 3"
                stroke="currentColor"
                strokeWidth="1.5"
                strokeLinecap="round"
              />
            </svg>
            <input
              type="text"
              placeholder="Search elements..."
              aria-label="Search elements"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
            />
          </div>

          <div className="flyout-groups">
            {!filteredCategories.length && (
              <div className="panel-empty">
                <h3>No matching elements</h3>
                <p>Try “text”, “button” or “container”.</p>
                <button onClick={() => setSearchQuery("")}>Clear search</button>
              </div>
            )}
            {filteredCategories.map((cat) => (
              <div key={cat.id} className="flyout-group">
                <div className="flyout-group-header">{cat.label}</div>
                <div className="flyout-grid">
                  {cat.items.map((item, idx) => (
                    <DraggableItem
                      key={`${item.type}-${idx}`}
                      type={item.type}
                      label={item.label}
                      icon={item.icon}
                    />
                  ))}
                </div>
              </div>
            ))}
          </div>

          <div className="flyout-hint">
            Drag to canvas · double-click or Enter to add
          </div>
        </div>
      )}

      {/* Flyout — Templates */}
      {sidebarOpen === "templates" && (
        <div className="sidebar-flyout sidebar-flyout-wide">
          <div className="flyout-header">
            <h2>Templates</h2>
            <button
              className="flyout-close"
              aria-label="Close sub-tray"
              onClick={() => setSidebarOpen(null)}
            >
              <X size={16} />
            </button>
          </div>
          <div className="flyout-body">
            <TemplatesPanel />
          </div>
        </div>
      )}

      {/* Flyout — Pages */}
      {sidebarOpen === "pages" && (
        <div className="sidebar-flyout">
          <div className="flyout-header">
            <h2>Pages</h2>
            <button
              className="flyout-close"
              aria-label="Close sub-tray"
              onClick={() => setSidebarOpen(null)}
            >
              <X size={16} />
            </button>
          </div>
          <div className="flyout-body">
            <PagesPanel />
          </div>
        </div>
      )}

      {/* Flyout — Layers */}
      {sidebarOpen === "layers" && (
        <div className="sidebar-flyout">
          <div className="flyout-header">
            <h2>Layers</h2>
            <button
              className="flyout-close"
              aria-label="Close sub-tray"
              onClick={() => setSidebarOpen(null)}
            >
              <X size={16} />
            </button>
          </div>
          <div className="flyout-body">
            <LayersPanel />
          </div>
        </div>
      )}

      {/* Flyout — Global Elements */}
      {sidebarOpen === "global" && (
        <div className="sidebar-flyout">
          <div className="flyout-header">
            <h2>Global</h2>
            <button
              className="flyout-close"
              aria-label="Close sub-tray"
              onClick={() => setSidebarOpen(null)}
            >
              <X size={16} />
            </button>
          </div>
          <div className="flyout-body">
            <div className="global-panel">
              <p className="global-info">
                <Globe size={14} />
                Elements added here appear on <strong>all pages</strong>.
              </p>

              <div className="global-add-section">
                <span className="global-section-title">Add Global Element</span>
                <GlobalItem
                  type="section"
                  label="Header"
                  description="Top navigation bar"
                />
                <GlobalItem
                  type="section"
                  label="Footer"
                  description="Bottom page section"
                />
                <GlobalItem
                  type="menu"
                  label="Navigation"
                  description="Site-wide nav menu"
                />
                <GlobalItem
                  type="socialbar"
                  label="Social Bar"
                  description="Social media links"
                />
              </div>

              {globalRootIds.length > 0 && (
                <div className="global-current">
                  <span className="global-section-title">
                    Active Global Elements
                  </span>
                  {globalRootIds.map((id) => {
                    const el = elementsById[id];
                    if (!el) return null;
                    return (
                      <div key={id} className="global-active-item">
                        <span className="global-active-icon">
                          {TILE_ICONS[el.type] || <Square size={14} />}
                        </span>
                        <span
                          className="global-active-name"
                          onClick={() => selectElement(id)}
                        >
                          {el.label || el.type}
                        </span>
                        <button
                          className="global-remove-btn"
                          onClick={() => deleteGlobalElement(id)}
                          title="Remove"
                        >
                          ✕
                        </button>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      {/* Flyout — Routes */}
      {sidebarOpen === "routes" && (
        <div className="sidebar-flyout">
          <div className="flyout-header">
            <h2>Routes</h2>
            <button
              className="flyout-close"
              aria-label="Close sub-tray"
              onClick={() => setSidebarOpen(null)}
            >
              <X size={16} />
            </button>
          </div>
          <div className="flyout-body">
            <div className="routes-flyout-section">
              <div className="routes-section-header">
                <span>Pages</span>
                <button
                  className="routes-add-all-btn"
                  onClick={() => {
                    const routingStore = useRoutingStore.getState();
                    pages.forEach((page) => {
                      routingStore.addNode("page", page.id);
                    });
                  }}
                >
                  Add All
                </button>
              </div>
              <div className="routes-page-list">
                {pages.map((page) => {
                  const onCanvas = useRoutingStore
                    .getState()
                    .nodes.some(
                      (n) => n.type === "page" && n.refId === page.id,
                    );
                  return (
                    <div
                      key={page.id}
                      className={`routes-page-item ${onCanvas ? "routes-page-placed" : ""}`}
                      draggable={!onCanvas}
                      onDragStart={(e) => {
                        e.dataTransfer.setData(
                          "text/plain",
                          JSON.stringify({
                            routingType: "page",
                            refId: page.id,
                          }),
                        );
                        e.dataTransfer.effectAllowed = "copy";
                      }}
                    >
                      <div className="routes-page-thumb">
                        <FileText size={20} />
                      </div>
                      <div className="routes-page-info">
                        <span className="routes-page-title">{page.title}</span>
                        <span className="routes-page-route">{page.route}</span>
                      </div>
                      {onCanvas && (
                        <span className="routes-on-canvas-badge">✓</span>
                      )}
                    </div>
                  );
                })}
              </div>
            </div>
            <div className="routes-flyout-section">
              <div className="routes-section-header">
                <span>Quick Actions</span>
              </div>
              <button
                className="routes-action-btn"
                onClick={() => {
                  const routingStore = useRoutingStore.getState();
                  routingStore.autoLayoutNodes();
                }}
              >
                <LayoutGrid size={14} />
                Auto Layout
              </button>
              <button
                className="routes-action-btn"
                onClick={() => {
                  const routingStore = useRoutingStore.getState();
                  routingStore.resetView();
                }}
              >
                <Maximize2 size={14} />
                Reset View
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Flyout — Code */}
      {sidebarOpen === "code" && (
        <div className="sidebar-flyout">
          <div className="flyout-header">
            <h2>Code</h2>
            <button
              className="flyout-close"
              aria-label="Close sub-tray"
              onClick={() => setSidebarOpen(null)}
            >
              <X size={16} />
            </button>
          </div>
          <div className="flyout-body">
            <div className="code-panel">
              <div className="code-panel-info">
                <Code2 size={24} />
                <div>
                  <p>Frontend Code</p>
                  <span>Review all pages, services, and export checks</span>
                </div>
              </div>
              <div className="code-panel-actions">
                <button
                  className="code-panel-btn"
                  onClick={() =>
                    window.dispatchEvent(
                      new CustomEvent("levoks:panel", { detail: "source" }),
                    )
                  }
                >
                  Preview Code
                </button>
                <button
                  className="code-panel-btn secondary"
                  onClick={() =>
                    window.dispatchEvent(
                      new CustomEvent("levoks:panel", { detail: "ship" }),
                    )
                  }
                >
                  Export Full ZIP
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Flyout — Backend Builder */}
      {sidebarOpen === "library" && <DesignLibrary />}
      {sidebarOpen === "backend" && (
        <BackendFlyout onClose={() => setSidebarOpen(null)} />
      )}
    </div>
  );
};

// ─── Backend Flyout Sub-component ───

const BACKEND_BLOCK_ICONS: Record<string, React.ReactNode> = {
  get: <Globe size={16} className="method-icon-get" />,
  post: <Plus size={16} className="method-icon-post" />,
  put: <RotateCcw size={16} className="method-icon-put" />,
  delete: <Minus size={16} className="method-icon-delete" />,
  patch: <Settings size={16} className="method-icon-patch" />,
  model: <Database size={16} />,
  relation: <Link2 size={16} />,
  jwt: <Shield size={16} />,
  oauth: <Globe size={16} />,
  session: <Code size={16} />,
  apikey: <Settings size={16} />,
  if: <GitBranch size={16} />,
  loop: <Repeat size={16} />,
  trycatch: <AlertTriangle size={16} />,
  validation: <CheckCircle size={16} />,
  cors: <Globe size={16} />,
  ratelimit: <Shield size={16} />,
  logger: <FileText size={16} />,
  custom: <Code size={16} />,
  env: <Settings size={16} />,
};

const BackendDraggableItem: React.FC<{
  blockType: BackendBlockType;
  label: string;
  icon: string;
}> = ({ blockType, label, icon }) => {
  const handleDragStart = (e: React.DragEvent) => {
    e.dataTransfer.setData("backend-block-type", blockType);
    e.dataTransfer.setData("backend-block-label", label);
    e.dataTransfer.effectAllowed = "copy";
  };

  const handleClick = () => {
    if (!useBackendStore.getState().services.length)
      useBackendStore.getState().addService("App Service");
    const { services, addBlock, selectedServiceId } =
      useBackendStore.getState();
    addBlock(selectedServiceId || services[0].id, blockType, label);
  };

  return (
    <div
      className="sidebar-tile backend-tile"
      draggable
      onDragStart={handleDragStart}
      onDoubleClick={handleClick}
      role="button"
      tabIndex={0}
      onKeyDown={(event) => {
        if (event.key === "Enter") {
          event.preventDefault();
          handleClick();
        }
      }}
      aria-label={`Add ${label} block`}
      title={`Drag or double-click to add ${label}`}
    >
      <div className="sidebar-tile-icon">
        {BACKEND_BLOCK_ICONS[icon] || <Zap size={16} />}
      </div>
      <span className="sidebar-tile-label">{label}</span>
    </div>
  );
};

const BackendFlyout: React.FC<{ onClose: () => void }> = ({ onClose }) => {
  const { services, loadAuthTemplate, loadCrudTemplate, loadChatTemplate } =
    useBackendStore();
  const [searchQuery, setSearchQuery] = useState("");

  const filteredCategories = BACKEND_SIDEBAR_CATEGORIES.map((cat) => ({
    ...cat,
    items: searchQuery
      ? cat.items.filter((item) =>
          item.label.toLowerCase().includes(searchQuery.toLowerCase()),
        )
      : cat.items,
  })).filter((cat) => cat.items.length > 0);

  const handleGenerateCode = () => {
    window.dispatchEvent(new CustomEvent("levoks:panel", { detail: "source" }));
  };

  const handleExport = async () => {
    window.dispatchEvent(new CustomEvent("levoks:panel", { detail: "ship" }));
  };

  return (
    <div className="sidebar-flyout sidebar-flyout-wide">
      <div className="flyout-header">
        <h2>
          <Server size={14} /> Backend
        </h2>
        <button
          className="flyout-close"
          aria-label="Close backend tray"
          onClick={onClose}
        >
          <X size={16} />
        </button>
      </div>

      <div className="flyout-search">
        <svg
          className="search-icon"
          width="16"
          height="16"
          viewBox="0 0 16 16"
          fill="none"
        >
          <circle cx="7" cy="7" r="5" stroke="currentColor" strokeWidth="1.5" />
          <path
            d="M11 11l3 3"
            stroke="currentColor"
            strokeWidth="1.5"
            strokeLinecap="round"
          />
        </svg>
        <input
          type="text"
          placeholder="Search blocks..."
          aria-label="Search backend blocks"
          value={searchQuery}
          onChange={(e) => setSearchQuery(e.target.value)}
        />
      </div>

      {/* Block categories */}
      <div className="flyout-groups">
        {filteredCategories.map((cat) => (
          <div key={cat.id} className="flyout-group">
            <div className="flyout-group-header">{cat.label}</div>
            <div className="flyout-grid">
              {cat.items.map((item, idx) => (
                <BackendDraggableItem
                  key={`${item.type}-${idx}`}
                  blockType={item.type}
                  label={item.label}
                  icon={item.icon}
                />
              ))}
            </div>
          </div>
        ))}

        {/* Templates section */}
        <div className="flyout-group">
          <div className="flyout-group-header">Templates</div>
          <div className="backend-template-list">
            <button className="backend-template-btn" onClick={loadAuthTemplate}>
              <Shield size={14} />
              <div>
                <span className="bt-name">Auth System</span>
                <span className="bt-desc">JWT login, register, profile</span>
              </div>
            </button>
            <button className="backend-template-btn" onClick={loadCrudTemplate}>
              <Database size={14} />
              <div>
                <span className="bt-name">CRUD API</span>
                <span className="bt-desc">Full REST resource endpoints</span>
              </div>
            </button>
            <button className="backend-template-btn" onClick={loadChatTemplate}>
              <Zap size={14} />
              <div>
                <span className="bt-name">Chat System</span>
                <span className="bt-desc">Messaging architecture starter</span>
              </div>
            </button>
          </div>
        </div>
      </div>

      {/* Actions footer */}
      <div className="backend-flyout-footer">
        <button
          className="backend-action-btn"
          onClick={handleGenerateCode}
          disabled={services.length === 0}
        >
          <Play size={13} /> Generate Code
        </button>
        <button
          className="backend-action-btn backend-export-btn"
          onClick={handleExport}
          disabled={services.length === 0}
        >
          <Download size={13} /> Export ZIP
        </button>
      </div>
    </div>
  );
};

export default Sidebar;
