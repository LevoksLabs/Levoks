import test from "node:test";
import assert from "node:assert/strict";
import {
  createVercelRelease,
  verifyVercelTarget,
  getVercelRelease,
  recoverVercelRelease,
} from "../src/lib/server/vercel";
import {
  deploymentEnvironment,
  DEPLOYMENT_CAPABILITIES,
} from "../src/lib/deployment";

const target = {
  token: "fixture-vercel-token",
  name: "preview",
  providerProjectId: "prj_test",
  teamId: "team_test",
};
test("deployment capabilities and origin validation reject unsupported secrets and malformed origins", () => {
  assert.equal(DEPLOYMENT_CAPABILITIES.backend, false);
  assert.equal(DEPLOYMENT_CAPABILITIES.database, false);
  for (const value of [
    "http://api.example.com",
    "https://u:p@api.example.com",
    "https://api.example.com/path",
    "https://api.example.com/?token=123",
    "https://api.example.com/#secret",
  ])
    assert.equal(
      deploymentEnvironment.safeParse({ API_ORIGIN_3001: value }).success,
      false,
    );
  assert.equal(
    deploymentEnvironment.safeParse({
      JWT_SECRET: "https://secret.example.com",
    }).success,
    false,
  );
  assert.equal(
    deploymentEnvironment.safeParse({
      API_ORIGIN_3001: "https://api.example.com",
    }).success,
    true,
  );
});
test("Vercel target and release responses are scoped to the selected project, operation and team", async (t) => {
  let reply: unknown = { id: "prj_test", name: "preview", framework: "nextjs" };
  const paths: string[] = [];
  t.mock.method(globalThis, "fetch", async (url: string | URL | Request) => {
    paths.push(String(url));
    return Response.json(reply);
  });
  await verifyVercelTarget(target);
  assert.match(paths[0], /teamId=team_test/);
  reply = { id: "prj_other", name: "preview", framework: "nextjs" };
  await assert.rejects(verifyVercelTarget(target), /matching name/);
  reply = {
    id: "dpl_one",
    projectId: "prj_other",
    readyState: "READY",
    meta: { levoksOperation: "operation" },
  };
  await assert.rejects(
    getVercelRelease(target, "dpl_one", "operation"),
    /does not match/,
  );
  reply = {
    id: "dpl_one",
    projectId: "prj_test",
    readyState: "READY",
    meta: { levoksOperation: "different" },
  };
  await assert.rejects(
    getVercelRelease(target, "dpl_one", "operation"),
    /does not match/,
  );
  await assert.rejects(
    getVercelRelease(target, "../other", "operation"),
    /Invalid deployment/,
  );
  reply = {
    id: "dpl_one",
    projectId: "prj_test",
    readyState: "UNRECOGNIZED",
    meta: { levoksOperation: "operation" },
  };
  await assert.rejects(
    createVercelRelease(
      target,
      { "frontend/package.json": "{}" },
      {},
      "operation",
    ),
    /does not match/,
  );
});
test("lost acknowledgements recover only matching releases across bounded provider pages", async (t) => {
  const urls: URL[] = [];
  t.mock.method(globalThis, "fetch", async (url: string | URL | Request) => {
    const u = new URL(String(url));
    urls.push(u);
    if (u.pathname === "/v13/deployments/dpl_match")
      return Response.json({
        id: "dpl_match",
        projectId: "prj_test",
        readyState: "BUILDING",
        meta: { levoksOperation: "operation" },
      });
    return Response.json(
      u.searchParams.has("until")
        ? {
            deployments: [
              { uid: "dpl_match", meta: { levoksOperation: "operation" } },
            ],
            pagination: { next: null },
          }
        : {
            deployments: [
              { uid: "dpl_other", meta: { levoksOperation: "other" } },
            ],
            pagination: { next: 1000 },
          },
    );
  });
  assert.equal(
    (
      await recoverVercelRelease(
        target,
        "operation",
        "2026-10-10T00:00:00.000Z",
      )
    )?.id,
    "dpl_match",
  );
  assert.equal(urls.length, 3);
  assert.equal(urls[1].searchParams.get("until"), "1000");
  assert.equal(urls[0].searchParams.get("projectId"), "prj_test");
});
test("reduced create acknowledgements require a scoped status read and preserve uncertainty on read failure", async (t) => {
  let reads = 0;
  let rejectedRead = false;
  t.mock.method(
    globalThis,
    "fetch",
    async (_url: string | URL | Request, init?: RequestInit) => {
      if (init?.method === "POST")
        return Response.json({ id: "dpl_reduced", readyState: "QUEUED" });
      reads++;
      if (rejectedRead)
        return Response.json({ error: "unauthorized" }, { status: 401 });
      return Response.json({
        id: "dpl_reduced",
        projectId: "prj_test",
        readyState: "BUILDING",
        meta: { levoksOperation: "operation" },
      });
    },
  );
  const files = { "frontend/package.json": "{}" };
  assert.equal(
    (await createVercelRelease(target, files, {}, "operation")).readyState,
    "BUILDING",
  );
  assert.equal(reads, 1);
  rejectedRead = true;
  await assert.rejects(
    createVercelRelease(target, files, {}, "operation"),
    (error: unknown) =>
      error instanceof Error && "status" in error && error.status === 502,
  );
});
