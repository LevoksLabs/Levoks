"use client";
import { useRef, useState } from "react";
import { ImagePlus } from "lucide-react";
import { useEditorStore } from "@/store/editorStore";
import { templates } from "@/templates";
import { currentProject } from "@/store/workspaceStore";
import type { DesignAsset } from "@/types";
import { MAX_PROJECT_BYTES } from "@/lib/project/schema";

export default function AssetUpload() {
  const input = useRef<HTMLInputElement>(null);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  async function upload(file: File) {
    setError("");
    setBusy(true);
    try {
      const mime = (/\.woff2?$/i.test(file.name) ? /\.woff2$/i.test(file.name) ? "font/woff2" : "font/woff" : file.type) as DesignAsset["mime"];
      if (!["image/png", "image/jpeg", "image/webp", "image/gif", "font/woff", "font/woff2"].includes(mime)) throw new Error("Choose a PNG, JPEG, WebP, GIF, WOFF or WOFF2 file.");
      if (file.size > 1_000_000)
        throw new Error(
          "Choose an image smaller than 1 MB so your project stays quick to save.",
        );
      const raw = await new Promise<string>((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = () => resolve(String(reader.result));
        reader.onerror = () =>
          reject(new Error("The image could not be read."));
        reader.readAsDataURL(file);
      });
      const source = raw.replace(/^data:[^;]*;base64,/, `data:${mime};base64,`);
      if (
        new TextEncoder().encode(JSON.stringify(currentProject())).length +
          source.length +
          5000 >
        MAX_PROJECT_BYTES
      )
        throw new Error(
          "This image would exceed the project's 5 MB limit. Use a smaller image or an HTTPS image URL.",
        );
      const id = `asset_${crypto.randomUUID().replaceAll("-", "")}`;
      const store = useEditorStore.getState();
      if (mime.startsWith("font/")) {
        await new FontFace(`LevoksFont-${id}`, `url("${source}")`).load();
        store.setAsset(id, { name: file.name, mime, source });
      } else {
        const image = new Image(); image.src = source; await image.decode();
        const width = Math.min(600, image.naturalWidth);
        store.beginInteraction();
        store.setAsset(id, { name: file.name, mime, source, width: image.naturalWidth, height: image.naturalHeight });
        store.addElement({ ...templates.image, label: file.name, props: { src: "", assetId: id, alt: file.name.replace(/\.[^.]+$/, "") }, layout: { w: width, h: Math.max(20, width * image.naturalHeight / image.naturalWidth) } });
        store.endInteraction();
      }
    } catch (error) {
      setError(error instanceof Error ? error.message : "Upload failed.");
    } finally {
      setBusy(false);
    }
  }
  return (
    <div style={{ padding: "10px 14px" }}>
      <button
        className="code-panel-btn"
        disabled={busy}
        onClick={() => input.current?.click()}
      >
        <ImagePlus size={15} /> {busy ? "Adding asset…" : "Upload asset"}
      </button>
      <input
        ref={input}
        type="file"
        accept="image/png,image/jpeg,image/webp,image/gif,.woff,.woff2"
        hidden
        onChange={(event) => {
          const file = event.target.files?.[0];
          event.target.value = "";
          if (file) void upload(file);
        }}
      />
      {error && (
        <p
          role="alert"
          style={{ fontSize: 12, color: "#ef8797", paddingTop: 8 }}
        >
          {error}
        </p>
      )}
    </div>
  );
}
