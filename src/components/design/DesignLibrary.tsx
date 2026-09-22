"use client";
import { useState } from "react";
import { useEditorStore } from "@/store/editorStore";
import type { DesignToken } from "@/types";
import { X, Plus, Shapes, Trash2 } from "lucide-react";
export default function DesignLibrary() {
  const store = useEditorStore();
  const [name, setName] = useState(""),
    [value, setValue] = useState("#ad91ff"),
    [kind, setKind] = useState<DesignToken["kind"]>("color"),
    [error, setError] = useState("");
  const [componentName, setComponentName] = useState("");
  const selected = store.selectedElementId
    ? store.elementsById[store.selectedElementId]
    : undefined;
  const validValue = (input: string) =>
    input.length > 0 &&
    input.length <= 200 &&
    !/[;{}<>]|url\s*\(|expression\s*\(/i.test(input);
  return (
    <div className="sidebar-flyout design-library">
      <div className="flyout-header">
        <h2>
          <Shapes size={15} />
          Library
        </h2>
        <button
          className="flyout-close"
          aria-label="Close Library"
          onClick={() => store.setSidebarOpen(null)}
        >
          <X size={16} />
        </button>
      </div>
      <div className="design-library-body">
        <section>
          <h3>Shared tokens</h3>
          <p>One value across your project and exported styles.</p>
          {Object.entries(store.tokens).map(([id, token]) => (
            <div className="token-row" key={id}>
              <label>
                {token.name}
                <input
                  aria-label={`Token ${token.name}`}
                  defaultValue={token.value}
                  key={token.value}
                  onBlur={(event) => {
                    if (validValue(event.target.value)) {
                      store.setToken(id, {
                        ...token,
                        value: event.target.value,
                      });
                      setError("");
                    } else {
                      event.target.value = token.value;
                      setError(
                        "Use a CSS value without markup, URLs or declarations.",
                      );
                    }
                  }}
                  onKeyDown={(event) => {
                    if (event.key === "Enter") event.currentTarget.blur();
                  }}
                />
              </label>
              <button
                aria-label={`Delete token ${token.name}`}
                title="Remove token and keep current values"
                onClick={() => store.setToken(id, null)}
              >
                <Trash2 size={14} />
              </button>
            </div>
          ))}
          <form
            onSubmit={(event) => {
              event.preventDefault();
              if (!name.trim() || !validValue(value)) {
                setError("Enter a token name and a valid CSS value.");
                return;
              }
              store.setToken(
                `token_${crypto.randomUUID().replaceAll("-", "")}`,
                { name: name.trim(), value, kind },
              );
              setName("");
              setError("");
            }}
          >
            <label>
              Token name
              <input
                value={name}
                maxLength={100}
                onChange={(event) => setName(event.target.value)}
                placeholder="Brand violet"
              />
            </label>
            <label>
              Token type
              <select
                value={kind}
                onChange={(event) =>
                  setKind(event.target.value as DesignToken["kind"])
                }
              >
                <option value="color">Color</option>
                <option value="dimension">Dimension</option>
                <option value="font">Font family</option>
              </select>
            </label>
            <label>
              Token value
              <input
                value={value}
                onChange={(event) => setValue(event.target.value)}
              />
            </label>
            <button type="submit">
              <Plus size={14} />
              Add token
            </button>
          </form>
        </section>
        <section>
          <h3>Components & shapes</h3>
          <p>
            Create a linked component from the selection. Local edits become
            overrides; publishing updates other instances.
          </p>
          <label>
            Component name
            <input
              value={componentName}
              maxLength={100}
              onChange={(event) => setComponentName(event.target.value)}
              placeholder={selected?.label || "Select an element"}
            />
          </label>
          <button
            disabled={
              !selected ||
              !!(
                selected.component &&
                selected.component.node !==
                  store.components[selected.component.id]?.rootId
              )
            }
            onClick={() => {
              if (selected)
                store.saveComponent(
                  selected.id,
                  componentName.trim() || selected.label || "Component",
                );
            }}
          >
            Save selection as component
          </button>
          {Object.entries(store.components).map(([id, component]) => (
            <div className="component-row" key={id}>
              <button onClick={() => store.insertComponent(id)}>
                <Shapes size={14} />
                Insert {component.name}
              </button>
              <button
                aria-label={`Remove component ${component.name}`}
                title="Remove definition and detach instances"
                onClick={() => store.removeComponent(id)}
              >
                <Trash2 size={14} />
              </button>
            </div>
          ))}
          {!Object.keys(store.components).length && (
            <p>No components yet. A closed vector can also be saved here.</p>
          )}
        </section>
        {error && <p role="alert">{error}</p>}
      </div>
    </div>
  );
}
