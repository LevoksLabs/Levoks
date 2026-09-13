"use client";
import { useRef, useState } from "react";
import { ImagePlus } from "lucide-react";
import { useEditorStore } from "@/store/editorStore";
import { templates } from "@/templates";
import { currentProject } from "@/store/workspaceStore";
import { MAX_PROJECT_BYTES } from "@/lib/project/schema";

export default function AssetUpload() {
  const input = useRef<HTMLInputElement>(null);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  async function upload(file: File) {
    setError("");
    setBusy(true);
    try {
      if (
        !["image/png", "image/jpeg", "image/webp", "image/gif"].includes(
          file.type,
        )
      )
        throw new Error("Choose a PNG, JPEG, WebP, or GIF image.");
      if (file.size > 1_000_000)
        throw new Error(
          "Choose an image smaller than 1 MB so your project stays quick to save.",
        );
      const source = await new Promise<string>((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = () => resolve(String(reader.result));
        reader.onerror = () =>
          reject(new Error("The image could not be read."));
        reader.readAsDataURL(file);
      });
      if (
        new TextEncoder().encode(JSON.stringify(currentProject())).length +
          source.length +
          5000 >
        MAX_PROJECT_BYTES
      )
        throw new Error(
          "This image would exceed the project's 5 MB limit. Use a smaller image or an HTTPS image URL.",
        );
      const image = new Image();
      image.src = source;
      await image.decode();
      const width = Math.min(600, image.naturalWidth);
      useEditorStore
        .getState()
        .addElement({
          ...templates.image,
          label: file.name,
          props: { src: source, alt: file.name.replace(/\.[^.]+$/, "") },
          layout: {
            w: width,
            h: Math.max(20, (width * image.naturalHeight) / image.naturalWidth),
          },
        });
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
        <ImagePlus size={15} /> {busy ? "Adding image…" : "Upload image"}
      </button>
      <input
        ref={input}
        type="file"
        accept="image/png,image/jpeg,image/webp,image/gif"
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
