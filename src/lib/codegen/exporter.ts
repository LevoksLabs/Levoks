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
    const bytes = await createProjectZip(files);
    const blob = new Blob([bytes as Uint8Array<ArrayBuffer>], {type: "application/zip"});

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

export async function createProjectZip(files: Record<string, string>) {
    const zip = new JSZip();

    // Add all files to the ZIP
    for (const [path, content] of Object.entries(validateFiles(files)).sort(([a], [b]) => a.localeCompare(b))) {
        zip.file(path, content, { date: new Date("2000-01-01T00:00:00.000Z"), createFolders: false });
    }

    // Generate the ZIP blob
    return zip.generateAsync({
        type: "uint8array",
        compression: "DEFLATE",
        compressionOptions: { level: 6 },
    });

}
