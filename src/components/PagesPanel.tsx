"use client";

import { useEditorStore } from "@/store/editorStore";
import { useState } from "react";
import type { Page } from "@/types";
import { Plus, Pencil, Trash2 } from "lucide-react";

function RouteField({ page }: { page: Page }) {
  const [route, setRoute] = useState(page.route);
  const [error, setError] = useState("");
  const save = () => {
    try {
      useEditorStore.getState().updatePageRoute(page.id, route.trim());
      setError("");
    } catch (error) {
      setError(error instanceof Error ? error.message : "Invalid route");
    }
  };
  return (
    <div onClick={(event) => event.stopPropagation()}>
      <input
        aria-label={`Route for ${page.title}`}
        value={route}
        onChange={(e) => setRoute(e.target.value)}
        onBlur={save}
        onKeyDown={(event) => {
          if (event.key === "Enter") save();
        }}
        style={{
          width: "100%",
          background: "transparent",
          color: "inherit",
          border: "1px solid #4445",
          padding: 4,
          fontSize: 11,
          borderRadius: 4,
        }}
      />
      {error && (
        <small role="alert" style={{ color: "#f29bab" }}>
          {error}
        </small>
      )}
    </div>
  );
}

const PagesPanel: React.FC = () => {
  const {
    pages,
    activePageId,
    rootIds,
    elementsById,
    pageElementMap,
    addPage,
    deletePage,
    renamePage,
    switchPage,
  } = useEditorStore();
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editValue, setEditValue] = useState("");

  const handleStartRename = (id: string, currentTitle: string) => {
    setEditingId(id);
    setEditValue(currentTitle);
  };

  const handleFinishRename = () => {
    if (editingId && editValue.trim()) {
      renamePage(editingId, editValue.trim());
    }
    setEditingId(null);
  };

  const getPageRootIds = (pageId: string): string[] => {
    if (pageId === activePageId) return rootIds;
    return pageElementMap[pageId] || [];
  };

  return (
    <div className="pages-panel">
      <div className="pages-header">
        <span>Pages</span>
        <button
          className="pages-add-btn"
          onClick={() => addPage()}
          title="Add new page"
          aria-label="Add new page"
        >
          <Plus size={16} />
        </button>
      </div>

      <div className="pages-list">
        {pages.map((page) => {
          const pageRoots = getPageRootIds(page.id);
          return (
            <div
              key={page.id}
              className={`page-card ${page.id === activePageId ? "page-card-active" : ""}`}
              onClick={() => switchPage(page.id)}
            >
              <button
                type="button"
                className="page-thumb"
                aria-label={`Open page ${page.title}`}
                aria-pressed={page.id === activePageId}
                onClick={(event) => {
                  event.stopPropagation();
                  switchPage(page.id);
                }}
              >
                {pageRoots.length === 0 ? (
                  <div className="page-thumb-empty">Empty Page</div>
                ) : (
                  pageRoots.slice(0, 5).map((id, i) => {
                    const el = elementsById[id];
                    return el ? (
                      <div
                        key={`${page.id}-${id}`}
                        className="page-thumb-row"
                        style={{ opacity: Math.max(0.45, 1 - i * 0.1) }}
                      >
                        {el.label || el.type}
                      </div>
                    ) : null;
                  })
                )}
              </button>

              <div className="page-card-meta">
                {editingId === page.id ? (
                  <input
                    className="page-rename-input"
                    aria-label="Page name"
                    value={editValue}
                    onChange={(e) => setEditValue(e.target.value)}
                    onBlur={handleFinishRename}
                    onKeyDown={(e) => {
                      if (e.key === "Enter") handleFinishRename();
                      if (e.key === "Escape") setEditingId(null);
                    }}
                    autoFocus
                    onClick={(e) => e.stopPropagation()}
                  />
                ) : (
                  <button
                    type="button"
                    className="page-title"
                    aria-label={`Rename page ${page.title}`}
                    onClick={(e) => {
                      e.stopPropagation();
                      handleStartRename(page.id, page.title);
                    }}
                  >
                    {page.title}
                    <Pencil size={12} />
                  </button>
                )}
                <RouteField key={`${page.id}:${page.route}`} page={page} />
              </div>

              {pages.length > 1 && (
                <button
                  className="page-delete-btn"
                  onClick={(e) => {
                    e.stopPropagation();
                    deletePage(page.id);
                  }}
                  title="Delete page"
                  aria-label={`Delete page ${page.title}`}
                >
                  <Trash2 size={13} />
                </button>
              )}
            </div>
          );
        })}
      </div>

      <div className="pages-hint">
        Select a preview to open · Select a name to rename
      </div>
    </div>
  );
};

export default PagesPanel;
