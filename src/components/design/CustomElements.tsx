"use client";
import { useState } from "react";
import { useEditorStore } from "@/store/editorStore";
import { customDefinitionSchema } from "@/lib/elements/custom";

export default function CustomElements() {
  const [name, setName] = useState("PricingCard");
  const [source, setSource] = useState(
    "export default function PricingCard({ title, price }) {\n  return <article><h2>{title}</h2><p>{price}</p></article>;\n}",
  );
  const [manifest, setManifest] = useState(
    JSON.stringify(
      {
        description: "A configurable pricing card",
        props: {
          title: { type: "string", default: "Starter" },
          price: { type: "number", default: 19 },
        },
        events: ["onSelect"],
        children: false,
        dependencies: {},
      },
      null,
      2,
    ),
  );
  const [error, setError] = useState("");
  const [saved, setSaved] = useState("");
  const store = useEditorStore();
  const save = () => {
    try {
      const definition = customDefinitionSchema.parse({
        ...JSON.parse(manifest),
        name,
        source,
        version: 1,
        framework: "react",
      });
      const id = `custom_${name}`;
      if (store.customElements[id])
        throw new Error(
          "A component with this name already exists. Choose a new name to preserve existing instances.",
        );
      store.setCustomElement(id, definition);
      setSaved(`${name} added to the library.`);
      setError("");
    } catch (error) {
      setError(
        error instanceof Error
          ? error.message
          : "Check the component definition.",
      );
      setSaved("");
    }
  };
  return (
    <details className="semantic-properties">
      <summary>Create Custom Element</summary>
      <p className="panel-caption">
        Provide a React default export and declare its properties. Source runs
        only when you build the exported application.
      </p>
      <label>
        <span>Component name</span>
        <input
          aria-label="Component name"
          value={name}
          onChange={(e) => setName(e.target.value)}
        />
      </label>
      <label>
        <span>React source</span>
        <textarea
          aria-label="React source"
          rows={8}
          value={source}
          onChange={(e) => setSource(e.target.value)}
          spellCheck={false}
        />
      </label>
      <label>
        <span>Properties, events and dependencies (JSON)</span>
        <textarea
          aria-label="Component manifest"
          rows={8}
          value={manifest}
          onChange={(e) => setManifest(e.target.value)}
          spellCheck={false}
        />
      </label>
      {error && <p role="alert">{error}</p>}
      {saved && <p role="status">{saved}</p>}
      <button className="code-panel-btn" onClick={save}>
        Add to element library
      </button>
    </details>
  );
}
