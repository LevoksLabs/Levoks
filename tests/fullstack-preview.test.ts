import test from "node:test";
import assert from "node:assert/strict";
import {
  previewProject,
  previewSnapshot,
} from "../src/lib/project/fullstack-preview";
import {
  localPreviewOrigin,
  newPreviewOwner,
  previewOwner,
  previewState,
} from "../src/lib/server/preview";
import { canvasAppFixture } from "./helpers/canvas-app-fixture";
import { block } from "./helpers/program-fixture";
import { defaultDatabase } from "../src/lib/backend/database";
import { compileProject } from "../src/lib/project/compiler";
import {
  designFingerprint,
  backendBlockSchema,
} from "../src/lib/project/schema";

test("local preview clones storage settings, ignores save timestamps and blocks host execution/provider paths", () => {
  const { project } = canvasAppFixture();
  project.backend.services[0].database = {
    ...defaultDatabase(),
    location: "remote",
    tls: true,
  };
  const parsed = previewProject(project);
  assert.equal(parsed.backend.services[0].database?.location, "local");
  assert.equal(parsed.backend.services[0].database?.tls, false);
  assert.equal(project.backend.services[0].database.location, "remote");
  const snapshot = previewSnapshot(project);
  project.updatedAt = new Date(Date.now() + 1000).toISOString();
  assert.equal(previewSnapshot(project), snapshot);
  parsed.editor.elementsById[parsed.editor.rootIds[0]].label = "Changed";
  assert.notEqual(previewSnapshot(parsed), snapshot);
  for (const kind of ["env_var", "http_request", "middleware"] as const) {
    const changed = structuredClone(project);
    changed.backend.services[0].blocks.push(
      backendBlockSchema.parse(
        block(
          "unsafe",
          kind,
          kind === "middleware"
            ? { middlewareType: "custom", customCode: "process.exit(1)" }
            : {},
        ),
      ),
    );
    assert.throws(
      () => previewProject(changed),
      /unavailable in local preview/,
    );
  }
  const sql = structuredClone(project);
  sql.backend.services[0].database = defaultDatabase("sqlite");
  assert.throws(() => previewProject(sql), /isolated preview adapter/);
  const custom = structuredClone(project);
  custom.editor.customElements = {
    unused: {
      name: "Unused",
      version: 1,
      framework: "react",
      description: "",
      source: "process.exit(1)",
      props: {},
      events: [],
      children: false,
      dependencies: {},
    },
  };
  assert.throws(() => previewProject(custom), /container sandbox/);
  project.source = {
    basedOn: designFingerprint(project),
    files: compileProject(project).files,
  };
  assert.throws(() => previewProject(project), /container sandbox/);
});

test("preview management requires a configured loopback host and an unguessable owner capability", () => {
  const previous = process.env.LEVOKS_LOCAL_PREVIEW_ORIGIN;
  try {
    delete process.env.LEVOKS_LOCAL_PREVIEW_ORIGIN;
    assert.throws(
      () =>
        localPreviewOrigin(new Request("http://127.0.0.1:3200/api/preview")),
      /unavailable/,
    );
    process.env.LEVOKS_LOCAL_PREVIEW_ORIGIN = "http://127.0.0.1:3200";
    assert.equal(
      localPreviewOrigin(
        new Request("http://localhost:3200/api/preview", {
          headers: { Host: "127.0.0.1:3200" },
        }),
      ),
      "http://127.0.0.1:3200",
    );
    for (const target of [
      "https://example.test/api/preview",
      "http://127.0.0.1:3300/api/preview",
    ])
      assert.throws(
        () => localPreviewOrigin(new Request(target)),
        /Open http:\/\/127/,
      );
    const owner = newPreviewOwner();
    assert.equal(owner.length, 64);
    assert.notEqual(newPreviewOwner(), owner);
    assert.equal(
      previewOwner(
        new Request("http://localhost", {
          headers: { Cookie: `other=1; levoks_preview_owner=${owner}` },
        }),
      ),
      owner,
    );
    assert.equal(
      previewOwner(
        new Request("http://localhost", {
          headers: { Cookie: "levoks_preview_owner=short" },
        }),
      ),
      undefined,
    );
    assert.throws(() => previewState("missing", owner), /not found/);
  } finally {
    if (previous === undefined) delete process.env.LEVOKS_LOCAL_PREVIEW_ORIGIN;
    else process.env.LEVOKS_LOCAL_PREVIEW_ORIGIN = previous;
  }
});
