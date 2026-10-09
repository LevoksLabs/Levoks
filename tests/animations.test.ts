import test from "node:test";
import assert from "node:assert/strict";
import { animationFrames, animationTracks, defaultAnimation, insertKeyframe, neutralFrame, stackAnimations } from "../src/lib/animation";
import { elementSchema } from "../src/lib/project/schema";
import { emptyProject, restoreProject, captureProject } from "../src/lib/project/workspace";
import { useEditorStore } from "../src/store/editorStore";
import { templates } from "../src/templates";
import { compileProject } from "../src/lib/project/compiler";
import { generateAnimationSetup } from "../src/lib/codegen/animationCodegen";
import { runInNewContext } from "node:vm";

test("stacked keyframes, hover, scroll and pointer effects survive save and compilation", () => {
    const project = emptyProject("Motion studio"); restoreProject(project);
    const load = defaultAnimation();
    load.keyframes![1] = { ...neutralFrame, time: 1, x: 120, rotateY: 25, blur: 4, clip: 10 };
    const hover = { ...defaultAnimation("custom", "onHover"), hoverMode: "reverse" as const };
    const scroll = { ...defaultAnimation("custom", "onScroll"), scrollMode: "scrub" as const, scrollStart: 90, scrollEnd: 10 };
    const pointer = defaultAnimation("tilt3D", "onPointerMove");
    const animation = stackAnimations([load, hover, scroll, pointer]);
    const id = useEditorStore.getState().addElement({ ...templates.shape, animation });
    const saved = captureProject(project.id, project.name);
    const output = compileProject(saved);
    assert.deepEqual(output.project.editor.elementsById[id].animation, animation);
    const code = output.files["frontend/app/page.jsx"];
    assert.match(code, /scrollStart/);
    assert.match(code, /rotateY\(25deg\)/);
    assert.match(code, /levoks:animation-preview/);
    const source = generateAnimationSetup([{ className: "target", anim: animation! }]);
    const setup = runInNewContext(source + "; setupAnimations", {});
    assert.equal(typeof setup, "function");
    assert.deepEqual(animationTracks(animation).map(effect => effect.trigger), ["onLoad", "onHover", "onScroll", "onPointerMove"]);
});

test("custom animation validation rejects duplicate stops, missing endpoints and reversed scroll boundaries", () => {
    restoreProject(emptyProject());
    const id = useEditorStore.getState().addElement(templates.shape);
    const element = useEditorStore.getState().elementsById[id];
    const animation = defaultAnimation();
    assert.equal(elementSchema.safeParse({ ...element, animation }).success, true);
    assert.equal(elementSchema.safeParse({ ...element, animation: { ...animation, keyframes: [neutralFrame, neutralFrame] } }).success, false);
    assert.equal(elementSchema.safeParse({ ...element, animation: { ...animation, keyframes: [{ ...neutralFrame, time: 0.2 }, { ...neutralFrame, time: 1 }] } }).success, false);
    assert.equal(elementSchema.safeParse({ ...element, animation: { ...animation, keyframes: undefined } }).success, false);
    assert.equal(elementSchema.safeParse({ ...element, animation: { ...animation, scrollMode: "scrub", scrollStart: 20, scrollEnd: 80 } }).success, false);
    assert.equal(elementSchema.safeParse({ ...element, animation: stackAnimations(Array.from({ length: 9 }, () => defaultAnimation())) }).success, false);
});

test("adding a keyframe preserves the path and preset distances remain element-specific", () => {
    const frames = insertKeyframe([{ ...neutralFrame, x: -40, scale: 0.5, opacity: 0 }, { ...neutralFrame, time: 1, x: 80, scale: 1.5 }]);
    assert.deepEqual(frames[1], { ...neutralFrame, time: 0.5, x: 20, scale: 1, opacity: 0.5 });
    const fade = { ...defaultAnimation("fadeInUp"), translateDistance: 140 };
    assert.equal(animationFrames(fade)[0].transform, "translateY(140px)");
    assert.equal(animationFrames({ ...fade, translateDistance: 20 })[0].transform, "translateY(20px)");
    assert.equal(animationFrames(defaultAnimation("pulse")).length, 3);
});

test("disabled effects are saved but never scheduled by the generated runtime", () => {
    const animation = stackAnimations([{ ...defaultAnimation(), enabled: false, name: "Disabled reveal" }, defaultAnimation("float", "continuous")])!;
    const source = generateAnimationSetup([{ className: "target", anim: animation }]);
    assert.doesNotMatch(source, /Disabled reveal/);
    assert.match(source, /translateY\(-10px\)/);
});
