"use client";

import { useState, useEffect } from "react";
import DndProvider from "@/components/DndProvider";
import MotionPanel from "@/components/design/MotionPanel";
import PanelResizeHandle from "@/components/PanelResizeHandle";
import { assetFonts } from "@/lib/design-assets";
import Sidebar from "@/components/Sidebar";
import Canvas from "@/components/Canvas";
import PropertyInspector from "@/components/PropertyInspector";
import ShortcutHelp from "@/components/ShortcutHelp";
import FloatingToolbar from "@/components/FloatingToolbar";
import Breadcrumbs from "@/components/Breadcrumbs";
import KeyboardShortcuts from "@/components/KeyboardShortcuts";
import LivePreviewPanel from "@/components/LivePreviewPanel";
import BackendCanvas from "@/components/backend/BackendCanvas";
import BackendInspector from "@/components/backend/BackendInspector";
import BackendHierarchy from "@/components/backend/BackendHierarchy";
import RoutingCanvas from "@/components/routing/RoutingCanvas";
import RoutingRightPanel from "@/components/routing/RoutingRightPanel";
import FrontendCodePreviewPanel from "@/components/FrontendCodePreviewPanel";
import UserMenu from "@/components/UserMenu";
import ProfileModal from "@/components/ProfileModal";
import WorkspaceHub from "@/components/WorkspaceHub";
import { useEditorStore } from "@/store/editorStore";
import { useBackendStore } from "@/store/backendStore";
import {
  X,
  FileCode2,
  Undo2,
  Redo2,
  Play,
  ScanEye,
  Keyboard,
  PanelRightClose,
  PanelRightOpen,
  PanelLeftClose,
} from "lucide-react";
import { useEditorUIStore } from "@/store/editorUIStore";

function UndoRedoButtons() {
  const { undo, redo, canUndo, canRedo } = useEditorStore();
  return (
    <div className="header-undo-redo">
      <button
        className="header-icon-btn"
        onClick={undo}
        disabled={!canUndo}
        title="Undo (Ctrl+Z)"
        aria-label="Undo"
      >
        <Undo2 size={16} />
      </button>
      <button
        className="header-icon-btn"
        onClick={redo}
        disabled={!canRedo}
        title="Redo (Ctrl+Shift+Z)"
        aria-label="Redo"
      >
        <Redo2 size={16} />
      </button>
    </div>
  );
}

// ─── Code Preview Panel ───
function CodePreviewPanel() {
  const { generatedCode, setCodePreviewOpen, setGeneratedCode } =
    useBackendStore();
  const [selectedFile, setSelectedFile] = useState<string | null>(null);

  if (!generatedCode) return null;

  const files = Object.keys(generatedCode).sort();
  const activeFile = selectedFile || files[0] || null;

  return (
    <div className="code-preview-overlay">
      <div className="code-preview-panel">
        <div className="code-preview-header">
          <FileCode2 size={16} />
          <h3>Generated Code</h3>
          <span className="code-file-count">{files.length} files</span>
          <button
            className="code-preview-close"
            onClick={() => {
              setCodePreviewOpen(false);
              setGeneratedCode(null);
            }}
          >
            <X size={16} />
          </button>
        </div>
        <div className="code-preview-body">
          <div className="code-preview-sidebar">
            {files.map((f) => (
              <button
                key={f}
                className={`code-file-btn ${activeFile === f ? "active" : ""}`}
                onClick={() => setSelectedFile(f)}
              >
                <FileCode2 size={12} />
                <span>{f}</span>
              </button>
            ))}
          </div>
          <div className="code-preview-content">
            {activeFile && (
              <pre className="code-preview-code">
                <code>{generatedCode[activeFile]}</code>
              </pre>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

export default function Home() {
  const [isPreviewOpen, setIsPreviewOpen] = useState(false);
  const [profileModalOpen, setProfileModalOpen] = useState(false);
  const { selectElement, sidebarOpen, frontendCodePreviewOpen, assets } =
    useEditorStore();
  const { codePreviewOpen } = useBackendStore();
  const ui = useEditorUIStore();
  useEffect(() => {
    const preview = () => setIsPreviewOpen(true);
    window.addEventListener("levoks:preview", preview);
    return () => window.removeEventListener("levoks:preview", preview);
  }, []);

  const isBackendMode = ui.canvasMode === "backend";
  const isRoutingMode = ui.canvasMode === "routes";

  const openPreview = () => {
    selectElement(null);
    setIsPreviewOpen(true);
  };

  return (
    <DndProvider>
      <div
        style={{ "--flyout-w": `${ui.trayWidth}px`, "--inspector-w": `${ui.inspectorWidth}px` } as React.CSSProperties}
        className={`editor-root ${ui.inspectorVisible ? "" : "inspector-hidden"} ${ui.trayCollapsed ? "tray-collapsed" : ""}`}
      >
        <style>{assetFonts(assets)}</style>
        <KeyboardShortcuts />
        <ShortcutHelp />
        {/* Top Header */}
        <header className="editor-header">
          <div className="header-left">
            <img
              src="/levoks_logo.svg"
              alt="Levoks"
              className="header-logo-img"
              width={28}
              height={28}
            />
            <span className="header-title">levoks</span>
            {isBackendMode && (
              <span className="header-mode-badge">Backend</span>
            )}
            {isRoutingMode && (
              <span className="header-mode-badge routing-badge">Routes</span>
            )}
          </div>
          <div className="header-center">
            <UndoRedoButtons />
            <WorkspaceHub />
          </div>
          <div className="header-right">
            <button
              className="header-btn"
              onClick={openPreview}
              title="Preview (Shift+Enter)"
            >
              <Play size={14} /> Preview
            </button>
            {!isBackendMode && !isRoutingMode && (
              <button
                className="header-icon-btn"
                aria-label="Hide off-screen elements"
                aria-pressed={ui.hideOverflow}
                title="Hide elements outside the screen"
                onClick={() => ui.toggle("hideOverflow")}
              >
                <ScanEye size={16} />
              </button>
            )}
            <UserMenu onOpenProfile={() => setProfileModalOpen(true)} />
          </div>
        </header>

        {/* Main area */}
        <div className="editor-body">
          <Sidebar />
          {!ui.trayCollapsed && sidebarOpen && !["code", "secrets"].includes(sidebarOpen) && <PanelResizeHandle side="tray" />}
          <div className="editor-center">
            {isBackendMode ? (
              <>
                <BackendCanvas />
              </>
            ) : isRoutingMode ? (
              <>
                <RoutingCanvas />
              </>
            ) : (
              <>
                <Canvas />
                <FloatingToolbar />
                {ui.motionOpen && <MotionPanel />}
              </>
            )}
          </div>
          {ui.inspectorVisible && <PanelResizeHandle side="inspector" />}
          {isBackendMode ? (
            <div className="backend-right-panel">
              <BackendHierarchy />
              <BackendInspector />
            </div>
          ) : isRoutingMode ? (
            <RoutingRightPanel />
          ) : (
            <PropertyInspector />
          )}
        </div>

        {/* Bottom bar */}
        <div className="editor-footer">
          <Breadcrumbs />
          <div className="editor-footer-actions">
            <span className="editor-context-label">
              {isBackendMode
                ? "Backend canvas"
                : isRoutingMode
                  ? "Routing canvas"
                  : "UI canvas"}
            </span>
            <button
              onClick={() => ui.toggle("trayCollapsed")}
              title="Toggle sub-tray (Shift+T)"
              aria-label="Toggle sub-tray"
              aria-pressed={!ui.trayCollapsed}
            >
              <PanelLeftClose size={14} />
            </button>
            <button
              onClick={() => ui.toggle("inspectorVisible")}
              title="Toggle inspector (Shift+I)"
              aria-label="Toggle inspector"
              aria-pressed={ui.inspectorVisible}
            >
              {ui.inspectorVisible ? (
                <PanelRightClose size={14} />
              ) : (
                <PanelRightOpen size={14} />
              )}
            </button>
            <button
              onClick={() => ui.toggle("helpOpen")}
              title="Keyboard shortcuts (?)"
            >
              <Keyboard size={14} />
              <span>Shortcuts</span>
              <kbd>?</kbd>
            </button>
          </div>
        </div>

        {isPreviewOpen && (
          <LivePreviewPanel onClose={() => setIsPreviewOpen(false)} />
        )}
        {codePreviewOpen && <CodePreviewPanel />}
        {frontendCodePreviewOpen && <FrontendCodePreviewPanel />}
        {profileModalOpen && (
          <ProfileModal onClose={() => setProfileModalOpen(false)} />
        )}
      </div>
    </DndProvider>
  );
}
