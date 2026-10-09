import test from "node:test";
import assert from "node:assert/strict";
import { selectOptionProps } from "../src/lib/elements/select-options";
import {
  emptyProject,
  restoreProject,
  captureProject,
} from "../src/lib/project/workspace";
import { useEditorStore } from "../src/store/editorStore";
import { projectHistory } from "../src/store/projectHistory";
import { elementTemplate } from "../src/lib/elements/registry";
import { parseProject } from "../src/lib/project/schema";
import { compileProject } from "../src/lib/project/compiler";
import { nativeMarkup, nativeTree } from "../src/lib/elements/native";

test("visual select edits keep defaults atomic, bounded, undoable and compiler-compatible", () => {
  assert.deepEqual(
    selectOptionProps({ value: "One" }, ["First", "Two"], ["One", "First"]),
    { options: "First\nTwo", value: "First" },
  );
  assert.deepEqual(selectOptionProps({ value: "One" }, ["Two"]), {
    options: "Two",
    value: "",
  });
  assert.deepEqual(
    selectOptionProps(
      { multiple: true, selectedValues: "Two\nOne" },
      ["First", "Two"],
      ["One", "First"],
    ),
    { options: "First\nTwo", selectedValues: "Two\nFirst" },
  );
  assert.deepEqual(
    selectOptionProps({ multiple: true, selectedValues: "Two\nOne" }, []),
    { options: "", selectedValues: "" },
  );
  for (const options of [
    [""],
    ["One", "One"],
    ["One\nTwo"],
    ["One\rTwo"],
    ["a".repeat(10001)],
    Array.from({ length: 201 }, (_, i) => String(i)),
  ])
    assert.throws(() => selectOptionProps({}, options));
  const project = emptyProject();
  restoreProject(project);
  const editor = useEditorStore.getState();
  const id = editor.addElement({
    ...elementTemplate("multiSelect")!,
    props: {
      ...elementTemplate("multiSelect")!.props,
      options: "One\nTwo",
      selectedValues: "One\nTwo",
    },
  });
  const original = { ...useEditorStore.getState().elementsById[id].props };
  editor.updateElement(id, {
    props: selectOptionProps(original, ["First", "Two"], ["One", "First"]),
  });
  assert.equal(
    useEditorStore.getState().elementsById[id].props.selectedValues,
    "First\nTwo",
  );
  projectHistory.undo();
  assert.deepEqual(useEditorStore.getState().elementsById[id].props, original);
  projectHistory.redo();
  const saved = parseProject(captureProject(project.id, project.name));
  const compiled = compileProject(saved);
  assert.deepEqual(
    compiled.diagnostics.filter((item) => item.severity === "error"),
    [],
  );
  restoreProject(saved);
  const node = useEditorStore.getState().elementsById[id];
  assert.match(
    nativeMarkup(nativeTree(node), "jsx"),
    /defaultValue=\{\["First","Two"\]\}/,
  );
  assert.equal(
    (nativeMarkup(nativeTree(node), "html").match(/ selected/g) || []).length,
    2,
  );
});
