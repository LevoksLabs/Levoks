import test from "node:test";
import assert from "node:assert/strict";
import { emptyProject } from "../src/lib/project/workspace";
import { applyProjectPatch } from "../src/lib/project/patch";

test("incremental IR patches apply atomically with preconditions and an affected-field review", () => {
  const base = emptyProject("Before");
  const original = JSON.stringify(base);
  const result = applyProjectPatch(base, [
    { op: "test", path: "/name", value: "Before" },
    { op: "replace", path: "/name", value: "After" },
    { op: "replace", path: "/editor/pages/0/title", value: "Welcome" },
  ]);
  assert.equal(result.project.name, "After");
  assert.equal(result.project.editor.pages[0].title, "Welcome");
  assert.equal(JSON.stringify(base), original);
  assert.equal(result.changes.length, 2);
  assert.equal(result.changes[0].before, '"Before"');
  assert.equal(result.changes[0].after, '"After"');
  assert.throws(
    () =>
      applyProjectPatch(base, [
        { op: "replace", path: "/name", value: "Interim" },
        { op: "test", path: "/name", value: "Wrong" },
      ]),
    /precondition/,
  );
  assert.equal(
    JSON.stringify(base),
    original,
    "a rejected multi-operation proposal never mutates the original",
  );
});
test("patches support coordinated page additions and reject dangling references and compiler regressions", () => {
  const base = emptyProject();
  const page = {
    ...base.editor.pages[0],
    id: "new-page",
    route: "/about",
    title: "About",
  };
  const operations = [
    { op: "add", path: "/editor/pages/-", value: page },
    { op: "add", path: "/editor/pageElementMap/new-page", value: [] },
  ];
  const result = applyProjectPatch(base, operations);
  assert.equal(result.project.editor.pages.length, 2);
  assert.equal(base.editor.pages.length, 1);
  assert.throws(() =>
    applyProjectPatch(base, [
      { op: "replace", path: "/editor/activePageId", value: "missing" },
    ]),
  );
  assert.throws(
    () =>
      applyProjectPatch(base, [
        {
          op: "replace",
          path: "/editor/pages/0/route",
          value: "/__levoks/private",
        },
      ]),
    /compiler errors|home/i,
  );
  assert.throws(
    () =>
      applyProjectPatch(base, [
        { op: "add", path: "/editor/unusedProperty", value: true },
      ]),
    /outside.*schema/,
  );
});
test("patches reject protected data, prototype paths, unsafe pointers, array mistakes and oversized proposals", () => {
  const base = emptyProject();
  for (const path of [
    "/id",
    "/source",
    "/createdAt",
    "/editor/__proto__/polluted",
    "/editor/constructor/prototype",
    "/backend/services/0/config/secretKey",
    "/editor/pages/01",
    "/editor/pages/-",
    "/editor/pages/99",
    "/editor/bad~2key",
  ]) {
    assert.throws(
      () => applyProjectPatch(base, [{ op: "replace", path, value: "unsafe" }]),
      path,
    );
  }
  assert.throws(() =>
    applyProjectPatch(base, [
      { op: "move", from: "/name", path: "/editor/name" },
    ]),
  );
  assert.throws(
    () =>
      applyProjectPatch(base, [
        { op: "replace", path: "/name", value: "a".repeat(1_000_001) },
      ]),
    /exceeds/,
  );
  assert.equal(Object.hasOwn({}, "polluted"), false);
});
