// ═══════════════════════════════════════════════════
// Code Generation — ZIP Exporter
// ═══════════════════════════════════════════════════

import JSZip from "jszip";
import { validateFiles } from "./files";

/**
 * Takes a flat file map and creates a downloadable ZIP.
 * Keys are file paths (e.g. "auth-service/server.js"),
 * values are file contents.
 */
export async function exportAsZip(
    files: Record<string, string>,
    projectName: string = "backend-project"
): Promise<void> {
    const zip = new JSZip();

    // Add all files to the ZIP
    for (const [path, content] of Object.entries(validateFiles(files))) {
        zip.file(path, content);
    }

    // Generate the ZIP blob
    const blob = await zip.generateAsync({
        type: "blob",
        compression: "DEFLATE",
        compressionOptions: { level: 6 },
    });

    // Trigger download
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `${projectName.replace(/[^a-z0-9_-]/gi, "-")}.zip`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    setTimeout(() => URL.revokeObjectURL(url), 1000);
}
