import test from "node:test";
import assert from "node:assert/strict";
import {runInNewContext} from "node:vm";
import {maskPattern, TEXT_MASK_RUNTIME} from "../src/lib/backend/text-mask";
import {textConfigError, textLimits, TEXT_VALIDATION_RUNTIME} from "../src/lib/backend/text-validation";
import {emptyProject, restoreProject, captureProject} from "../src/lib/project/workspace";
import {useEditorStore} from "../src/store/editorStore";
import {templates} from "../src/templates";
import {elementTemplate} from "../src/lib/elements/registry";
import {createSubmissionDestination} from "../src/lib/form-destination";
import {parseProject} from "../src/lib/project/schema";
import {compileProject} from "../src/lib/project/compiler";
import {nativeMarkup, nativeTree} from "../src/lib/elements/native";

test("custom masks have matching native and emitted validation for fixed, variable, escaped and Unicode text", () => {
  const emitted = runInNewContext(TEXT_MASK_RUNTIME + ";textMaskPattern") as typeof maskPattern;
  const valid = runInNewContext(TEXT_VALIDATION_RUNTIME + ";textRuleValid") as (rule:unknown,value:unknown)=>boolean;
  const cases = [
    ["AA-0000",["AB-1234"],["ab-1234","AB-123","AB-12345","AB-1234\n"]],
    ["A{2,4}-0{2,6}",["AB-12","ABCD-123456"],["A-12","ABCDE-12","AB-1"]],
    ["L{2,6}/N{2}",["भारत/१२","日本/١٢","éé/12"],["é/12","éé/123"]],
    ["\\A\\0-X{2}",["A0-a1"],["B0-a1","A1-a1"]],
    ["\\+-0{4}",["+-1234"],["+1234"]],
    ["😀-0{2}",["😀-12"],["😀-1"]],
    ["A{0,4}-0{2}",["-12","ABC-12"],["ABCDE-12"]],
  ] as const;
  for (const [mask, good, bad] of cases) {
    assert.equal(emitted(mask), maskPattern(mask));
    const pattern = new RegExp("^(?:"+maskPattern(mask)+")$","v");
    for (const value of good) {assert.equal(valid({text:{mask}},value),true,value); assert.equal(pattern.exec(value)?.[0],value);}
    for (const value of bad) assert.equal(valid({text:{mask}},value),false,value);
    assert.equal(valid({text:{mask,minLength:4,maxLength:15}},""),true);
    assert.equal(valid({text:{mask}},42),false);
  }
  for (const mask of ["", "A{5,2}", "0{101}", "A{1,4}A", "L{1,5}Ω", "0{", "\\", "A{0}", "A\n0", "A".repeat(121), "A{0,4}a{0,4}X"]) {
    assert.throws(()=>maskPattern(mask),mask);
    assert.throws(()=>emitted(mask),mask);
    assert.equal(valid({text:{mask}},"value"),false,mask);
    assert.ok(textConfigError({mask}),mask);
  }
  assert.ok(textConfigError({mask:"AA-0000",pattern:"[0-9]+"}));
});

test("mask authoring persists in validated project data, native output and guided server validation", () => {
  const project=emptyProject(); restoreProject(project);
  const store=useEditorStore.getState(), form=store.addElement(templates.form);
  const input=store.addElement({...elementTemplate("textInput"),props:{...elementTemplate("textInput").props,name:"reference",label:"Reference",formatMask:"AA-0000",required:true}},form);
  createSubmissionDestination(form,"References");
  const saved=parseProject(captureProject(project.id,project.name));
  assert.equal(saved.editor.elementsById[input].props.formatMask,"AA-0000");
  const rules=saved.backend.services[0].blocks.filter(block=>block.type==="validation").flatMap(block=>block.type==="validation"?block.config.rules:[]);
  assert.ok(rules.some(rule=>rule.text?.mask==="AA-0000"));
  assert.equal(textLimits(saved.editor.elementsById[input].props).mask,"AA-0000");
  const compiled=compileProject(saved); assert.deepEqual(compiled.diagnostics.filter(d=>d.severity==="error"),[]);
  assert.ok(nativeMarkup(nativeTree(useEditorStore.getState().elementsById[input]),"html").includes('pattern="[A-Z][A-Z]-[0-9][0-9][0-9][0-9]"'));
  const invalid=structuredClone(saved); invalid.editor.elementsById[input].props.formatMask="A{1,4}A";
  assert.ok(textConfigError(textLimits(invalid.editor.elementsById[input].props)));
  assert.throws(()=>parseProject(invalid));
  const invalidRule=structuredClone(saved);
  const ruleBlock=invalidRule.backend.services[0].blocks.find(block=>block.type==="validation"&&block.config.fieldName==="reference")!;
  if(ruleBlock.type!=="validation") throw new Error("validation");
  ruleBlock.config.rules.find(rule=>rule.type==="text")!.text!.mask="A{1,4}A";
  assert.throws(()=>parseProject(invalidRule));
});

