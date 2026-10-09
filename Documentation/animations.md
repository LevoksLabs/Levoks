# Animation editor

Select an element and open **Animate** in the inspector. Add up to eight effects with independent triggers. Select a row to edit it; the eye button enables or disables it without deleting its settings. Effects are saved in the project document and compiled into the generated frontend.

Start with Scroll reveal, Hover lift, Parallax, Pointer tilt, Cinematic reveal or Float, or add a custom effect. Existing preset animations and legacy timeline tracks remain readable. Editing a legacy track in Animate moves its keyframes into the effect stack.

## Keyframes

Choose Custom keyframes under Motion. Select a diamond on the timeline to edit that stop. The endpoints stay at 0% and 100%; intermediate stops can be added, moved and removed. Adding a stop interpolates the existing values.

| Channel | Control |
| --- | --- |
| Translation | Move X, Y and Z in pixels |
| Scale | Scale multiplier |
| Rotation | Rotate X, Y and Z in degrees |
| Appearance | Opacity, blur radius and clipping from the right |

The canvas scrubber previews the selected effect and its child stagger without writing animated values into the project. Reset restores the normal canvas runtime. Open site Preview to test the full effect stack, trigger interactions, delays and repeats together.

## Triggers

| Trigger | Behavior |
| --- | --- |
| Page load | Play when the element mounts |
| Hover | Play on pointer entry or keyboard focus; reverse, reset or finish on leave |
| Scroll: Reveal in view | Play at a visibility threshold; optionally replay after leaving and re-entering |
| Scroll: Scrub with scroll | Map scroll position directly to animation progress; scrolling back reverses progress |
| Click | Restart on click; native buttons also activate from the keyboard |
| Pointer | Follow pointer position in two axes with 3D tilt or translation; touch keeps the resting state |
| Loop | Repeat continuously; timing controls configure the iteration count and direction |

For scroll scrubbing, Start is the viewport percentage reached by the element's top edge. End is the viewport percentage reached by its bottom edge. Start must exceed End. The runtime measures an unanimated anchor so animated translation does not feed back into scroll progress. It follows the nearest scrolling ancestor, or the window.

Choose Direct children under Animate to apply an effect to each immediate child with staggered timing. This does not split text into characters. Typewriter uses a character interval and supports timed triggers and viewport reveals, rather than scroll scrubbing.

Each timed effect has duration, delay, easing, repeat count, direction and retained-state controls. Custom cubic Bézier easing exposes its four control coordinates. Scrubbed effects retain both endpoint states and use a single iteration; scroll position controls playback.

## Page motion timeline

The page motion timeline displays an object's first enabled custom page-load or looping effect alongside legacy timeline tracks. It shares the animation tab's keyframes, supports multiple objects and retains other hover, scroll and pointer effects when adding or editing a track. Custom-effect endpoints remain fixed at 0% and 100% in this timeline too. Edit individual stacked effects in Animate and test interactive triggers in site Preview.

## Runtime and scope

New effects use the same Web Animations runtime in the canvas, generated HTML preview and exported React application. Transform layers add to the object's existing rotation and to each other. Opacity, blur, clipping and other appearance channels use replacement composition, so the most recent active effect controlling a channel takes precedence. Opacity keyframes multiply the target's resting opacity, including each child's opacity when staggering. Neutral appearance channels are omitted from transform-only effects. Completed layers persist until cleanup so a temporary interaction can return to the underlying state.

The runtime cancels animations, observers, animation frames, timers and event handlers on cleanup. It reacts to reduced-motion preference changes and restores readable resting content. Existing v1 presets retain their legacy path until edited in the new tab.

This feature authors DOM/CSS motion, including layered parallax and perspective transforms. WebGL scenes, 3D model loading, shaders, camera choreography, pinned scroll scenes and path drawing are separate capabilities; this update does not supply a scene renderer.
