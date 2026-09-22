"use client";

import { useState } from "react";
import { siteTemplates, SiteTemplate } from "@/templates/siteTemplates";
import { useEditorStore } from "@/store/editorStore";
import { Eye, Download, X, ArrowLeft, ExternalLink } from "lucide-react";

// ─── Template Card ───
const TemplateCard: React.FC<{
    template: SiteTemplate;
    onPreview: () => void;
    onUse: () => void;
}> = ({ template, onPreview, onUse }) => (
    <div className="template-card">
        <div className="template-thumbnail">
            <img
                src={template.thumbnail}
                alt={template.name}
                onError={(e) => {
                    (e.target as HTMLImageElement).src =
                        "data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='400' height='240' fill='%23232329'%3E%3Crect width='400' height='240' rx='8'/%3E%3Ctext x='200' y='120' text-anchor='middle' fill='%2372728a' font-family='Inter' font-size='14'%3EPreview unavailable%3C/text%3E%3C/svg%3E";
                }}
            />
            <div className="template-overlay">
                <button className="template-overlay-btn" onClick={onPreview} title="Preview">
                    <Eye size={16} />
                    <span>Preview</span>
                </button>
                <button className="template-overlay-btn primary" onClick={onUse} title="Use Template">
                    <Download size={16} />
                    <span>Use</span>
                </button>
            </div>
        </div>
        <div className="template-info">
            <span className="template-category-badge">{template.category}</span>
            <h3 className="template-name">{template.name}</h3>
            <p className="template-desc">{template.description}</p>
        </div>
    </div>
);

// ─── Preview Modal ───
const PreviewModal: React.FC<{
    template: SiteTemplate;
    onClose: () => void;
    onUse: () => void;
}> = ({ template, onClose, onUse }) => (
    <div className="template-preview-overlay">
        <div className="template-preview-header">
            <button className="template-preview-back" onClick={onClose}>
                <ArrowLeft size={16} />
                <span>Back to Templates</span>
            </button>
            <div className="template-preview-title">
                <h3>{template.name}</h3>
                <span className="template-category-badge">{template.category}</span>
            </div>
            <div className="template-preview-actions">
                <a
                    href={template.previewUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="template-preview-link"
                >
                    <ExternalLink size={14} />
                    <span>Open Full Site</span>
                </a>
                <button className="template-preview-use" onClick={onUse}>
                    <Download size={14} />
                    <span>Use This Template</span>
                </button>
            </div>
        </div>
        <div className="template-preview-body">
            <iframe
                src={template.previewUrl}
                title={`Preview: ${template.name}`}
                className="template-preview-iframe"
                sandbox="allow-scripts" referrerPolicy="no-referrer"
            />
        </div>
    </div>
);

// ─── Main Panel ───
const TemplatesPanel: React.FC = () => {
    const { loadTemplate, setSidebarOpen } = useEditorStore();
    const [previewTemplate, setPreviewTemplate] = useState<SiteTemplate | null>(null);
    const [filter, setFilter] = useState<string>("all");

    const categories = ["all", ...Array.from(new Set(siteTemplates.map((t) => t.category)))];
    const filtered = filter === "all" ? siteTemplates : siteTemplates.filter((t) => t.category === filter);

    const handleUseTemplate = (template: SiteTemplate) => {
        const confirmUse = window.confirm(
            `This will replace your current canvas with the "${template.name}" template. Your current work will be saved to undo history.\n\nContinue?`
        );
        if (!confirmUse) return;

        loadTemplate(template.elements);
        setPreviewTemplate(null);
        setSidebarOpen(null);
    };

    // Preview modal takes over the full viewport
    if (previewTemplate) {
        return (
            <PreviewModal
                template={previewTemplate}
                onClose={() => setPreviewTemplate(null)}
                onUse={() => handleUseTemplate(previewTemplate)}
            />
        );
    }

    return (
        <div className="templates-panel">
            <div className="templates-filter-bar">
                {categories.map((cat) => (
                    <button
                        key={cat}
                        className={`templates-filter-btn ${filter === cat ? "active" : ""}`}
                        onClick={() => setFilter(cat)}
                    >
                        {cat === "all" ? "All" : cat}
                    </button>
                ))}
            </div>

            <div className="templates-grid">
                {filtered.map((template) => (
                    <TemplateCard
                        key={template.id}
                        template={template}
                        onPreview={() => setPreviewTemplate(template)}
                        onUse={() => handleUseTemplate(template)}
                    />
                ))}
            </div>

            {filtered.length === 0 && (
                <div className="templates-empty">
                    <p>No templates in this category</p>
                </div>
            )}

            <div className="templates-hint">
                Templates replace your current canvas • Undo to restore
            </div>
        </div>
    );
};

export default TemplatesPanel;
