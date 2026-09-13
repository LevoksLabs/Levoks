import test from "node:test";
import assert from "node:assert/strict";
import {
  commitProject,
  gitBlobSHA,
  projectChanges,
} from "../src/lib/server/github";
const target = {
  token: "fixture-credential",
  owner: "owner",
  repo: "repo",
  branch: "main",
};
test("GitHub review detects added, changed and deleted managed files without provider writes", async (t) => {
  const replies = [
    { object: { sha: "a".repeat(40) } },
    { tree: { sha: "tree" } },
    {
      tree: [
        { type: "blob", path: "outside.js", sha: "other" },
        {
          type: "blob",
          path: "levoks/p/unchanged.txt",
          sha: gitBlobSHA("unchanged\n"),
        },
        {
          type: "blob",
          path: "levoks/p/changed.txt",
          sha: gitBlobSHA("before"),
        },
        { type: "blob", path: "levoks/p/deleted.txt", sha: gitBlobSHA("gone") },
      ],
    },
  ];
  t.mock.method(
    globalThis,
    "fetch",
    async (_url: unknown, init: RequestInit) => {
      assert.equal(init.method, "GET");
      return Response.json(replies.shift());
    },
  );
  const result = await projectChanges(target, "p", {
    "unchanged.txt": "unchanged\n",
    "changed.txt": "after",
    "added.txt": "new",
  });
  assert.deepEqual(result.changes, [
    { path: "added.txt", kind: "added" },
    { path: "changed.txt", kind: "modified" },
    { path: "deleted.txt", kind: "deleted" },
  ]);
});
test("worker crash after GitHub push is recovered only with matching operation, parent and contents", async (t) => {
  const old = "a".repeat(40),
    next = "b".repeat(40);
  const replies = [
    { object: { sha: next } },
    { message: "Save\n\nLevoks-Operation: job-1", parents: [{ sha: old }] },
    { object: { sha: next } },
    { tree: { sha: "tree" } },
    {
      tree: [
        { path: "levoks/p/app.js", type: "blob", sha: gitBlobSHA("hello") },
      ],
    },
  ];
  t.mock.method(
    globalThis,
    "fetch",
    async (_url: unknown, init: RequestInit) => {
      assert.equal(init.method, "GET");
      return Response.json(replies.shift());
    },
  );
  const result = await commitProject(
    target,
    "p",
    { "app.js": "hello" },
    old,
    "Save",
    { operationId: "job-1" },
  );
  assert.equal(result.sha, next);
  assert.equal(replies.length, 0);
});
