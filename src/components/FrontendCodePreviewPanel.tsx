"use client";

import { useEffect, useMemo, useState, useCallback } from "react";
import { useEditorStore } from "@/store/editorStore";
import { useBackendStore } from "@/store/backendStore";
import { useRoutingStore } from "@/store/routingStore";
import { compileProject } from "@/lib/project/compiler";
import { currentProject, useWorkspaceStore } from "@/store/workspaceStore";
import GeneratedPreview from "./design/GeneratedPreview";
import { X, FileCode2, Eye, Server, Monitor, FolderOpen, Copy, Check } from "lucide-react";

// ─── Lightweight Syntax Highlighter ───
// Adds <span> tags with CSS classes for keywords, strings, comments, etc.

function highlightCode(code: string, lang: string): string {
    // Escape HTML first
    let html = code
        .replace(/&/g, "&amp;")
        .replace(/</g, "&lt;")
        .replace(/>/g, "&gt;");

    // Placeholder approach: extract tokens that should not be re-processed,
    // replace with unique markers, then restore after all passes.
    const tokens: string[] = [];
    const placeholder = (cls: string, text: string) => {
        const idx = tokens.length;
        tokens.push(`<span class="${cls}">${text}</span>`);
        return `\x00${idx}\x00`;
    };

    if (lang === "json") {
        html = html
            .replace(/("(?:[^"\\]|\\.)*")\s*:/g, (_, k) => `${placeholder("sh-key", k)}:`)
            .replace(/:\s*("(?:[^"\\]|\\.)*")/g, (m, v) => m.replace(v, placeholder("sh-str", v)))
            .replace(/("(?:[^"\\]|\\.)*")/g, (_, s) => s.startsWith('\x00') ? s : placeholder("sh-str", s))
            .replace(/\b(true|false)\b/g, (_, b) => placeholder("sh-bool", b))
            .replace(/\b(null)\b/g, (_, n) => placeholder("sh-null", n))
            .replace(/(?<!\x00)\b(\d+(?:\.\d+)?)\b(?!\x00)/g, (_, n) => placeholder("sh-num", n));
        return html.replace(/\x00(\d+)\x00/g, (_, i) => tokens[Number(i)]);
    }

    if (lang === "md" || lang === "markdown") {
        html = html
            .replace(/^(#{1,6}\s.*)$/gm, (_, h) => placeholder("sh-heading", h))
            .replace(/^(\s*[-*]\s)/gm, (_, b) => placeholder("sh-bullet", b))
            .replace(/`([^`]+)`/g, (m) => placeholder("sh-inline-code", m))
            .replace(/\*\*([^*]+)\*\*/g, (m) => placeholder("sh-bold", m));
        return html.replace(/\x00(\d+)\x00/g, (_, i) => tokens[Number(i)]);
    }

    if (lang === "yaml" || lang === "yml") {
        html = html
            .replace(/#(.*)$/gm, (m) => placeholder("sh-comment", m))
            .replace(/("(?:[^"\\]|\\.)*")/g, (_, s) => placeholder("sh-str", s))
            .replace(/('(?:[^'\\]|\\.)*')/g, (_, s) => placeholder("sh-str", s))
            .replace(/^(\s*[\w-]+):/gm, (_, k) => `${placeholder("sh-key", k)}:`);
        return html.replace(/\x00(\d+)\x00/g, (_, i) => tokens[Number(i)]);
    }

    if (lang === "dockerfile") {
        html = html
            .replace(/#(.*)$/gm, (m) => placeholder("sh-comment", m))
            .replace(/("(?:[^"\\]|\\.)*")/g, (_, s) => placeholder("sh-str", s))
            .replace(/^(FROM|RUN|COPY|CMD|EXPOSE|WORKDIR|ENV|ARG|ENTRYPOINT|LABEL|ADD|VOLUME|USER|HEALTHCHECK)\b/gm,
                (_, k) => placeholder("sh-kw", k));
        return html.replace(/\x00(\d+)\x00/g, (_, i) => tokens[Number(i)]);
    }

    // JS/JSX/TS/CSS/HTML — generic syntax highlighting
    // Phase 1: Extract strings and comments (must not be re-processed)
    html = html.replace(/(\/\/[^\n]*)/g, (m) => placeholder("sh-comment", m));
    html = html.replace(/(\/\*[\s\S]*?\*\/)/g, (m) => placeholder("sh-comment", m));
    html = html.replace(/(`[^`]*`)/g, (m) => placeholder("sh-str", m));
    html = html.replace(/("(?:[^"\\]|\\.)*")/g, (_, s) => placeholder("sh-str", s));
    html = html.replace(/('(?:[^'\\]|\\.)*')/g, (_, s) => placeholder("sh-str", s));

    // Phase 2: Keywords (safe now, strings/comments are placeholders)
    html = html.replace(
        /\b(import|export|from|default|const|let|var|function|return|if|else|for|while|class|extends|new|this|typeof|async|await|try|catch|throw|switch|case|break|continue|do|in|of|yield|void|delete|instanceof)\b/g,
        (_, k) => placeholder("sh-kw", k)
    );
    // JSX/HTML tags
    html = html.replace(/(&lt;\/?)([\w.-]+)/g, (_, prefix, tag) => `${prefix}${placeholder("sh-tag", tag)}`);
    // Booleans/null/undefined
    html = html.replace(/\b(true|false|null|undefined|NaN|Infinity)\b/g, (_, b) => placeholder("sh-bool", b));
    // Numbers (only if not inside a placeholder)
    html = html.replace(/(?<!\x00)\b(\d+(?:\.\d+)?)\b(?!\x00)/g, (_, n) => placeholder("sh-num", n));

    // CSS-specific
    if (lang === "css") {
        html = html.replace(/([\w-]+)\s*:/g, (_, p) => p.startsWith('\x00') ? `${p}:` : `${placeholder("sh-prop", p)}:`);
        html = html.replace(/([.#][\w-]+)\s*\{/g, (_, s) => `${placeholder("sh-sel", s)} {`);
    }

    // Phase 3: Restore all placeholders
    return html.replace(/\x00(\d+)\x00/g, (_, i) => tokens[Number(i)]);
}

function getLanguage(filename: string): string {
    if (filename.endsWith(".json")) return "json";
    if (filename.endsWith(".jsx") || filename.endsWith(".tsx")) return "jsx";
    if (filename.endsWith(".js") || filename.endsWith(".ts")) return "js";
    if (filename.endsWith(".css")) return "css";
    if (filename.endsWith(".html")) return "html";
    if (filename.endsWith(".md")) return "md";
    if (filename.endsWith(".yml") || filename.endsWith(".yaml")) return "yaml";
    if (filename.endsWith(".env") || filename === ".env") return "env";
    if (filename === "Dockerfile" || filename.endsWith("Dockerfile")) return "dockerfile";
    return "text";
}

// ─── Main Panel ───

const FrontendCodePreviewPanel: React.FC = () => {
    const editor = useEditorStore(), backend = useBackendStore(), routing = useRoutingStore();
    const { activePageId, canvasSettings, setFrontendGeneratedCode, setFrontendCodePreviewOpen } = editor;
    const source = useWorkspaceStore(state => state.source);
    const projectName = useWorkspaceStore(state => state.name);
    const [previewPage, setPreviewPage] = useState(activePageId);
    const [activeTab, setActiveTab] = useState<"preview" | "code">("preview");
    const [selectedFile, setSelectedFile] = useState<string | null>(null);
    const [copiedFile, setCopiedFile] = useState<string | null>(null);
    const output = useMemo(() => {
        try {
            const result = compileProject(currentProject());
            const errors = result.diagnostics.filter(item => item.severity === "error");
            return { files: result.files, error: errors.map(item => item.message).join("\n") };
        } catch (error) {
            return { files: {} as Record<string, string>, error: error instanceof Error ? error.message : "Code generation failed." };
        }
    }, [editor.elementsById, editor.rootIds, editor.globalRootIds, editor.pageElementMap, editor.pages, editor.activePageId, editor.canvasSettings, editor.tokens, editor.components, editor.assets, backend.services, backend.connections, routing.nodes, routing.connections, source, projectName]);
    const allFiles = output.files;
    const frontendFileList = Object.keys(allFiles).filter(file => file.startsWith("frontend/")).map(file => file.slice(9)).sort();
    const backendFileList = Object.keys(allFiles).filter(file => file.startsWith("backend/")).map(file => file.slice(8)).sort();
    const totalFiles = Object.keys(allFiles).length;

    const activeFile = selectedFile;
    const activeFileContent = activeFile ? allFiles[activeFile] : null;

    useEffect(() => {
        setFrontendGeneratedCode(output.error ? null : allFiles);
    }, [allFiles, output.error, setFrontendGeneratedCode]);

    // Copy file content
    const copyFile = useCallback(async (filePath: string) => {
        const content = allFiles[filePath];
        if (!content) return;
        await navigator.clipboard.writeText(content);
        setCopiedFile(filePath);
        setTimeout(() => setCopiedFile(null), 2000);
    }, [allFiles]);

    // Render highlighted code
    const renderCode = useCallback((content: string, filename: string) => {
        const lang = getLanguage(filename);
        const highlighted = highlightCode(content, lang);
        const lines = highlighted.split("\n");

        return (
            <div className="sh-code-block">
                <div className="sh-line-numbers">
                    {lines.map((_, i) => (
                        <span key={i} className="sh-line-num">{i + 1}</span>
                    ))}
                </div>
                <pre className="sh-code">
                    <code dangerouslySetInnerHTML={{ __html: highlighted }} />
                </pre>
            </div>
        );
    }, []);

    return (
        <div className="code-preview-overlay">
            <div className="code-preview-panel">
                <div className="code-preview-header">
                    <FileCode2 size={16} />
                    <h3>Full Project Code</h3>
                    <span className="code-file-count">{totalFiles} files</span>
                    <button
                        className="code-preview-close"
                        onClick={() => setFrontendCodePreviewOpen(false)}
                    >
                        <X size={16} />
                    </button>
                </div>
                {output.error && <p role="alert">{output.error}</p>}
                <div className="code-preview-body">
                    <div className="code-preview-sidebar">
                        {/* Live Preview */}
                        <button
                            className={`code-file-btn ${activeTab === "preview" ? "active" : ""}`}
                            onClick={() => { setActiveTab("preview"); setSelectedFile(null); }}
                        >
                            <Eye size={12} />
                            <span>Live Preview</span>
                        </button>

                        <div className="code-preview-divider" />

                        {/* Frontend section */}
                        <div className="code-section-label">
                            <Monitor size={11} />
                            <span>Frontend</span>
                        </div>
                        {frontendFileList.map((f) => {
                            const fullPath = `frontend/${f}`;
                            return (
                                <button
                                    key={fullPath}
                                    className={`code-file-btn code-file-indented ${activeTab === "code" && activeFile === fullPath ? "active" : ""}`}
                                    onClick={() => {
                                        setActiveTab("code");
                                        setSelectedFile(fullPath);
                                    }}
                                >
                                    <FileCode2 size={11} />
                                    <span>{f}</span>
                                </button>
                            );
                        })}

                        {/* Backend section */}
                        {backendFileList.length > 0 && (
                            <>
                                <div className="code-preview-divider" />
                                <div className="code-section-label">
                                    <Server size={11} />
                                    <span>Backend</span>
                                </div>
                                {backendFileList.map((f) => {
                                    const fullPath = `backend/${f}`;
                                    return (
                                        <button
                                            key={fullPath}
                                            className={`code-file-btn code-file-indented ${activeTab === "code" && activeFile === fullPath ? "active" : ""}`}
                                            onClick={() => {
                                                setActiveTab("code");
                                                setSelectedFile(fullPath);
                                            }}
                                        >
                                            <FileCode2 size={11} />
                                            <span>{f}</span>
                                        </button>
                                    );
                                })}
                            </>
                        )}
                    </div>

                    <div className="code-preview-content">
                        {activeTab === "preview" ? (
                            <GeneratedPreview pageId={previewPage} width={canvasSettings.width} onNavigate={setPreviewPage} />
                        ) : (
                            activeFile && activeFileContent && (
                                <div className="code-file-viewer">
                                    <div className="code-file-toolbar">
                                        <div className="code-file-path">
                                            <FolderOpen size={12} />
                                            <span>{activeFile}</span>
                                        </div>
                                        <button
                                            className="code-copy-btn"
                                            onClick={() => copyFile(activeFile)}
                                        >
                                            {copiedFile === activeFile ? (
                                                <><Check size={12} /> Copied!</>
                                            ) : (
                                                <><Copy size={12} /> Copy</>
                                            )}
                                        </button>
                                    </div>
                                    {renderCode(activeFileContent, activeFile)}
                                </div>
                            )
                        )}
                    </div>
                </div>
            </div>
        </div>
    );
};

export default FrontendCodePreviewPanel;
