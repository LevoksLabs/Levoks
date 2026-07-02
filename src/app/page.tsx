"use client";

import { useState } from "react";
import DndProvider from "@/components/DndProvider";
import Sidebar from "@/components/Sidebar";
import Canvas from "@/components/Canvas";
import PropertyInspector from "@/components/PropertyInspector";
import DebugPanel from "@/components/DebugPanel";
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
import { useEditorStore } from "@/store/editorStore";
import { useBackendStore } from "@/store/backendStore";
import { X, FileCode2 } from "lucide-react";

function UndoRedoButtons() {
  const { undo, redo, canUndo, canRedo } = useEditorStore();
  return (
    <div className="header-undo-redo">
      <button
        className="header-icon-btn"
        onClick={undo}
        disabled={!canUndo}
        title="Undo (Ctrl+Z)"
      >
        ↩
      </button>
      <button
        className="header-icon-btn"
        onClick={redo}
        disabled={!canRedo}
        title="Redo (Ctrl+Shift+Z)"
      >
        ↪
      </button>
    </div>
  );
}

// ─── Code Preview Panel ───
function CodePreviewPanel() {
  const { generatedCode, setCodePreviewOpen, setGeneratedCode } = useBackendStore();
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
  const [autosaveEnabled, setAutosaveEnabled] = useState(true);
  const { selectElement, sidebarOpen, frontendCodePreviewOpen } = useEditorStore();
  const { codePreviewOpen } = useBackendStore();

  const isBackendMode = sidebarOpen === "backend";
  const isRoutingMode = sidebarOpen === "routes";

  const openPreview = () => {
    selectElement(null);
    setIsPreviewOpen(true);
  };

  return (
    <DndProvider>
      <div className="editor-root">
        <KeyboardShortcuts />
        {/* Top Header */}
        <header className="editor-header">
          <div className="header-left">
            <img src="/levoks_logo.svg" alt="Levoks" className="header-logo-img" width={28} height={28} />
            <span className="header-title">Levoks</span>
            {isBackendMode && (
              <span className="header-mode-badge">Backend</span>
            )}
            {isRoutingMode && (
              <span className="header-mode-badge routing-badge">Routes</span>
            )}
          </div>
          <div className="header-center">
            <UndoRedoButtons />
            <button
              className={`autosave-toggle ${autosaveEnabled ? "on" : "off"}`}
              onClick={() => setAutosaveEnabled((v) => !v)}
              title="Toggle autosave"
            >
              Autosave {autosaveEnabled ? "On" : "Off"}
            </button>
          </div>
          <div className="header-right">
            <button className="header-btn" onClick={openPreview}>Preview</button>
            <button className="header-btn primary" disabled title="Coming soon">
              Publish
            </button>
          </div>
        </header>

        {/* Main area */}
        <div className="editor-body">
          <Sidebar />
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
              </>
            )}
          </div>
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
          <DebugPanel />
        </div>

        {isPreviewOpen && <LivePreviewPanel onClose={() => setIsPreviewOpen(false)} />}
        {codePreviewOpen && <CodePreviewPanel />}
        {frontendCodePreviewOpen && <FrontendCodePreviewPanel />}
      </div>
    </DndProvider>
  );
}
