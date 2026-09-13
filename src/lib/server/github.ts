import { HttpError, providerJSON } from "./http";
import { validateFiles } from "@/lib/codegen/files";

export interface GitHubTarget {
  token: string;
  owner: string;
  repo: string;
  branch: string;
}
export async function githubHead(target: GitHubTarget) {
  const base = `https://api.github.com/repos/${encodeURIComponent(target.owner)}/${encodeURIComponent(target.repo)}`;
  const headers = {
    Accept: "application/vnd.github+json",
    "X-GitHub-Api-Version": "2026-03-10",
  };
  const call = (path: string, method = "GET", body?: unknown) =>
    providerJSON(base + path, target.token, {
      method,
      headers,
      ...(body ? { body: JSON.stringify(body) } : {}),
    });
  const ref = await call(
    `/git/ref/heads/${target.branch.split("/").map(encodeURIComponent).join("/")}`,
  );
  return { sha: ref.object.sha as string, call };
}

/** Commit only this project's managed directory; non-fast-forward updates never force push. */
export async function commitProject(
  target: GitHubTarget,
  projectId: string,
  filesInput: unknown,
  expectedHead: string,
  message: string,
) {
  const files = validateFiles(filesInput);
  const { sha, call } = await githubHead(target);
  if (sha !== expectedHead)
    throw new HttpError(
      409,
      "The branch changed since you connected. Reconnect to review the latest head before committing.",
    );
  const commit = await call(`/git/commits/${sha}`);
  const previous = await call(`/git/trees/${commit.tree.sha}?recursive=1`);
  if (previous.truncated)
    throw new HttpError(
      422,
      "Repository tree is too large. Use a dedicated project repository.",
    );
  const prefix = `levoks/${projectId}/`;
  const tree: {
    path: string;
    mode: string;
    type: string;
    content?: string;
    sha?: null;
  }[] = Object.entries(files).map(([path, content]) => ({
    path: prefix + path,
    mode: "100644",
    type: "blob",
    content,
  }));
  for (const item of previous.tree as { path: string; type: string }[])
    if (
      item.type === "blob" &&
      item.path.startsWith(prefix) &&
      !(item.path.slice(prefix.length) in files)
    )
      tree.push({ path: item.path, mode: "100644", type: "blob", sha: null });
  const nextTree = await call("/git/trees", "POST", {
    base_tree: commit.tree.sha,
    tree,
  });
  if (nextTree.sha === commit.tree.sha)
    return {
      sha,
      unchanged: true,
      url: `https://github.com/${target.owner}/${target.repo}/commit/${sha}`,
    };
  const next = await call("/git/commits", "POST", {
    message,
    tree: nextTree.sha,
    parents: [sha],
  });
  // GitHub rejects this if another writer moved the ref while we created the tree.
  await call(
    `/git/refs/heads/${target.branch.split("/").map(encodeURIComponent).join("/")}`,
    "PATCH",
    { sha: next.sha, force: false },
  );
  return {
    sha: next.sha as string,
    unchanged: false,
    url: next.html_url as string,
  };
}
