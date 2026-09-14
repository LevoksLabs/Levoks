export function validateFiles(value: unknown): Record<string, string> {
  if (!value || typeof value !== "object" || Array.isArray(value))
    throw new Error("Expected a file map.");
  const entries = Object.entries(value);
  if (!entries.length || entries.length > 1000)
    throw new Error("A project must contain 1–1,000 files.");
  let bytes = 0;
  for (const [path, content] of entries) {
    if (
      path.length > 240 ||
      !/^[a-zA-Z0-9_.\-/[\]()]+$/.test(path.replace(/%5F/gi, "_")) ||
      path.startsWith("/") ||
      path
        .split("/")
        .some(
          (p) =>
            !p ||
            p === "." ||
            p === ".." ||
            p === ".git" ||
            p === "node_modules",
        ) ||
      /(^|\/)\.env(?!\.example$)/.test(path) ||
      /\.(pem|key)$/i.test(path)
    )
      throw new Error(`Unsafe or private file path: ${path}`);
    if (typeof content !== "string")
      throw new Error(`File ${path} must contain text.`);
    bytes += new TextEncoder().encode(content).length;
    if (bytes > 10_000_000) throw new Error("Generated source exceeds 10 MB.");
  }
  return Object.fromEntries(entries) as Record<string, string>;
}
