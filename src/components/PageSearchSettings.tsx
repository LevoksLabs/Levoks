"use client";

import type { Page } from "@/types";
import { useEditorStore } from "@/store/editorStore";

export default function PageSearchSettings({ page }: { page: Page }) {
  const update = useEditorStore((state) => state.updatePageSeo);
  const helpId = `page-search-help-${page.id}`;

  return (
    <details
      className="page-search-settings"
      onClick={(event) => event.stopPropagation()}
    >
      <summary>Search & sharing</summary>
      <label>
        Search title
        <input
          aria-label={`Search title for ${page.title}`}
          maxLength={200}
          value={page.seo?.title || ""}
          placeholder="Use website or page name"
          onChange={(event) =>
            update(page.id, { ...page.seo, title: event.target.value })
          }
        />
      </label>
      <label>
        Description
        <textarea
          aria-label={`Search description for ${page.title}`}
          aria-describedby={helpId}
          rows={3}
          maxLength={500}
          value={page.seo?.description || ""}
          placeholder="Describe what visitors will find on this page."
          onChange={(event) =>
            update(page.id, { ...page.seo, description: event.target.value })
          }
        />
      </label>
      <label className="page-search-indexing">
        <input
          type="checkbox"
          aria-label={`Hide ${page.title} from search engines`}
          checked={!!page.seo?.noIndex}
          onChange={(event) =>
            update(page.id, { ...page.seo, noIndex: event.target.checked })
          }
        />
        Hide from search engines
      </label>
      <p id={helpId}>
        Included in your exported website and link previews. Search engines may
        take time to reflect changes. Hiding a page does not restrict access to
        it.
      </p>
    </details>
  );
}
