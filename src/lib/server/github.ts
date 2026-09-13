import { HttpError, providerJSON } from "./http";
import { validateFiles } from "@/lib/codegen/files";
import { createHash } from "node:crypto";

export const githubHeaders = {
  Accept: "application/vnd.github+json",
  "X-GitHub-Api-Version": "2026-03-10",
};
export const githubCall = (
  token: string,
  path: string,
  method = "GET",
  body?: unknown,
) =>
  providerJSON(`https://api.github.com${path}`, token, {
    method,
    headers: githubHeaders,
    ...(body ? { body: JSON.stringify(body) } : {}),
  });
export const repositoryPath = (owner: string, repo: string) =>
  `/repos/${encodeURIComponent(owner)}/${encodeURIComponent(repo)}`;
export function gitBlobSHA(content: string) {
  const bytes = Buffer.from(content);
  return createHash("sha1")
    .update(`blob ${bytes.length}\0`)
    .update(bytes)
    .digest("hex");
}
export async function projectChanges(
  target: GitHubTarget,
  projectId: string,
  files: Record<string, string>,
) {
  const { sha, call } = await githubHead(target);
  const commit = await call(`/git/commits/${sha}`);
  const previous = await call(`/git/trees/${commit.tree.sha}?recursive=1`);
  if (previous.truncated)
    throw new HttpError(
      422,
      "Repository tree is too large. Use a dedicated repository.",
    );
  const prefix = `levoks/${projectId}/`;
  const old = new Map<string, string>(
    (previous.tree as { path: string; type: string; sha: string }[])
      .filter((x) => x.type === "blob" && x.path.startsWith(prefix))
      .map((x) => [x.path.slice(prefix.length), x.sha]),
  );
  const changes: { path: string; kind: "added" | "modified" | "deleted" }[] =
    [];
  for (const [path, content] of Object.entries(files)) {
    if (old.get(path) !== gitBlobSHA(content))
      changes.push({ path, kind: old.has(path) ? "modified" : "added" });
    old.delete(path);
  }
  for (const path of old.keys()) changes.push({ path, kind: "deleted" });
  return { sha, changes: changes.sort((a, b) => a.path.localeCompare(b.path)) };
}

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
  options: { operationId?: string; beforePush?: () => Promise<void> } = {},
) {
  const files = validateFiles(filesInput);
  const { sha, call } = await githubHead(target);
  const commitMessage = options.operationId
    ? `${message}\n\nLevoks-Operation: ${options.operationId}`
    : message;
  if (sha !== expectedHead && options.operationId) {
    // Recover a successful ref update whose acknowledgement was lost when a worker exited.
    const current = await call(`/git/commits/${sha}`);
    if (
      current.message === commitMessage &&
      current.parents?.length === 1 &&
      current.parents[0].sha === expectedHead
    ) {
      const review = await projectChanges(target, projectId, files);
      if (review.sha === sha && review.changes.length === 0)
        return {
          sha,
          unchanged: false,
          url: `https://github.com/${target.owner}/${target.repo}/commit/${sha}`,
        };
    }
  }
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
    message: commitMessage,
    tree: nextTree.sha,
    parents: [sha],
  });
  // GitHub rejects this if another writer moved the ref while we created the tree.
  await options.beforePush?.();
  try {
    await call(
      `/git/refs/heads/${target.branch.split("/").map(encodeURIComponent).join("/")}`,
      "PATCH",
      { sha: next.sha, force: false },
    );
  } catch (error) {
    if (error instanceof HttpError && [409, 422].includes(error.status))
      throw new HttpError(
        409,
        "GitHub rejected the branch update. Review remote changes or branch protection before retrying.",
      );
    throw error;
  }
  return {
    sha: next.sha as string,
    unchanged: false,
    url: next.html_url as string,
  };
}
