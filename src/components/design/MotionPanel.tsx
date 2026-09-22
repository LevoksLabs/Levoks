"use client";
import { useEffect, useRef, useState } from "react";
import { Play, Pause, X, Plus, Trash2 } from "lucide-react";
import { useEditorStore } from "@/store/editorStore";
import { useEditorUIStore } from "@/store/editorUIStore";
import { motionFrames } from "@/lib/design";
import type { ElementNode } from "@/types";
type Motion = NonNullable<ElementNode["motion"]>;
const initialFrame = { time: 0, x: 0, y: 0, rotation: 0, scale: 1, opacity: 1 };
export default function MotionPanel() {
  const store = useEditorStore();
  const [time, setTime] = useState(0),
    [playing, setPlaying] = useState(false);
  const animations = useRef<Animation[]>([]);
  const visible = new Set<string>();
  const collect = (id: string) => {
    if (visible.has(id)) return;
    visible.add(id);
    store.elementsById[id]?.children.forEach(collect);
  };
  [...store.rootIds, ...store.globalRootIds].forEach(collect);
  const tracks = Object.values(store.elementsById).filter(
    (el) => visible.has(el.id) && el.motion,
  );
  const length = Math.max(
    1,
    ...tracks.map(
      (el) => el.motion!.delay + el.motion!.duration * el.motion!.iterations,
    ),
  );
  const selected = store.selectedElementId
    ? store.elementsById[store.selectedElementId]
    : undefined;
  const motion = selected?.motion;
  const update = (change: Partial<Motion>) => {
    if (selected && motion)
      store.updateElement(selected.id, { motion: { ...motion, ...change } });
  };
  // Preview uses the same keyframes as generation, and never writes animated values into IR.
  useEffect(() => {
    const current = Object.values(store.elementsById).filter((el) => el.motion);
    animations.current = current.flatMap((el) => {
      const target = document.querySelector<HTMLElement>(
        `.canvas-page [data-element-id="${CSS.escape(el.id)}"]`,
      );
      if (!target || !el.motion) return [];
      const track = target.animate(motionFrames(el.motion), {
        duration: el.motion.duration * 1000,
        delay: el.motion.delay * 1000,
        iterations: el.motion.iterations,
        easing: el.motion.easing,
        fill: "both",
      });
      track.pause();
      return [track];
    });
    return () => {
      animations.current.forEach((animation) => animation.cancel());
      animations.current = [];
    };
  }, [store.elementsById, store.activePageId]);
  useEffect(() => {
    animations.current.forEach((animation) => {
      animation.currentTime = time * 1000;
    });
  }, [time, store.elementsById]);
  const clock = useRef(0);
  useEffect(() => { clock.current = time; }, [time]);
  useEffect(() => {
    if (!playing) return;
    let frame: number,
      previous = performance.now();
    const tick = (now: number) => {
      const delta = (now - previous) / 1000;
      previous = now;
      clock.current = Math.min(length, clock.current + delta);
      setTime(clock.current);
      if (clock.current < length) frame = requestAnimationFrame(tick);
      else setPlaying(false);
    };
    frame = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(frame);
  }, [playing, length]);
  const finished = time >= length;
  const keyframeField = (
    frame: Motion["frames"][number],
    index: number,
    field: keyof typeof initialFrame,
    min: number,
    max: number,
    step: number,
  ) => (
    <label key={field}>
      {field === "time" ? "Offset" : field}
      <input
        aria-label={`Keyframe ${index + 1} ${field}`}
        type="number"
        min={min}
        max={max}
        step={step}
        value={frame[field]}
        onChange={(event) => {
          const value = Number(event.target.value);
          if (
            !Number.isFinite(value) ||
            value < min ||
            value > max ||
            (field === "time" &&
              motion!.frames.some(
                (other, i) => i !== index && other.time === value,
              ))
          )
            return;
          update({
            frames: motion!.frames.map((other, i) =>
              i === index ? { ...other, [field]: value } : other,
            ),
          });
        }}
      />
    </label>
  );
  return (
    <section className="motion-panel" aria-label="Motion timeline">
      <header>
        <strong>Motion</strong>
        <span>Animate multiple objects on one timeline</span>
        <button
          aria-label="Close motion timeline"
          onClick={() => useEditorUIStore.setState({ motionOpen: false })}
        >
          <X size={16} />
        </button>
      </header>
      <div className="motion-toolbar">
        <button
          aria-label={
            playing && !finished ? "Pause animation" : "Play animation"
          }
          disabled={!tracks.length}
          onClick={() => {
            if (finished) {
              setTime(0);
              setPlaying(true);
            } else setPlaying(!playing);
          }}
        >
          {playing && !finished ? <Pause size={15} /> : <Play size={15} />}
        </button>
        <input
          aria-label="Animation playhead"
          type="range"
          min={0}
          max={length}
          step={0.01}
          value={Math.min(time, length)}
          onChange={(event) => {
            setPlaying(false);
            setTime(Number(event.target.value));
          }}
        />
        <output>
          {Math.min(time, length).toFixed(2)} / {length.toFixed(2)} s
        </output>
        <button
          disabled={
            !store.selectedElementIds.some(
              (id) => !store.elementsById[id].motion,
            )
          }
          onClick={() => {
            store.beginInteraction();
            store.selectedElementIds.forEach((id) => {
              if (!store.elementsById[id].motion)
                store.updateElement(id, {
                  animation: undefined,
                  motion: {
                    duration: 1,
                    delay: 0,
                    easing: "ease-out",
                    iterations: 1,
                    frames: [
                      { ...initialFrame, opacity: 0, y: 24 },
                      { ...initialFrame, time: 1 },
                    ],
                  },
                });
            });
            store.endInteraction();
          }}
        >
          <Plus size={14} />
          Animate selection
        </button>
      </div>
      <div className="motion-body">
        <div className="motion-tracks">
          {tracks.length ? (
            tracks.map((el) => (
              <button
                key={el.id}
                aria-pressed={selected?.id === el.id}
                onClick={() => store.selectElement(el.id)}
              >
                <span>{el.label || el.type}</span>
                <span className="motion-track-bar">
                  <i
                    style={{
                      left: `${(el.motion!.delay / length) * 100}%`,
                      width: `${((el.motion!.duration * el.motion!.iterations) / length) * 100}%`,
                    }}
                  >
                    {el.motion!.frames.map((frame) => (
                      <b
                        key={frame.time}
                        style={{ left: `${frame.time * 100}%` }}
                      />
                    ))}
                  </i>
                </span>
              </button>
            ))
          ) : (
            <p>
              Select one or more objects and choose Animate selection. Preview
              follows the playhead; exported motion respects reduced-motion
              preferences.
            </p>
          )}
        </div>
        {motion && selected && (
          <div className="motion-properties">
            <div className="design-field-row">
              {(["duration", "delay", "iterations"] as const).map((field) => (
                <label key={field}>
                  {field}
                  <input
                    aria-label={`Animation ${field}`}
                    type="number"
                    min={
                      field === "duration"
                        ? 0.05
                        : field === "iterations"
                          ? 1
                          : 0
                    }
                    max={field === "iterations" ? 100 : 120}
                    step={field === "iterations" ? 1 : 0.05}
                    value={motion[field]}
                    onChange={(event) => {
                      const value = Number(event.target.value);
                      if (
                        Number.isFinite(value) &&
                        value >=
                          (field === "duration"
                            ? 0.05
                            : field === "iterations"
                              ? 1
                              : 0) &&
                        value <= (field === "iterations" ? 100 : 120)
                      )
                        update({
                          [field]:
                            field === "iterations" ? Math.floor(value) : value,
                        });
                    }}
                  />
                </label>
              ))}
              <label>
                Easing
                <select
                  aria-label="Animation easing"
                  value={motion.easing}
                  onChange={(event) =>
                    update({ easing: event.target.value as Motion["easing"] })
                  }
                >
                  {["linear", "ease-in", "ease-out", "ease-in-out"].map(
                    (value) => (
                      <option key={value}>{value}</option>
                    ),
                  )}
                </select>
              </label>
              <button
                aria-label="Remove animation track"
                onClick={() =>
                  store.updateElement(selected.id, { motion: undefined })
                }
              >
                <Trash2 size={14} />
              </button>
            </div>
            {motion.frames.map((frame, index) => (
              <div className="motion-keyframe" key={index}>
                <strong>{index + 1}</strong>
                {keyframeField(frame, index, "time", 0, 1, 0.01)}
                {keyframeField(frame, index, "x", -10000, 10000, 1)}
                {keyframeField(frame, index, "y", -10000, 10000, 1)}
                {keyframeField(frame, index, "scale", 0.01, 20, 0.1)}
                {keyframeField(frame, index, "rotation", -3600, 3600, 1)}
                {keyframeField(frame, index, "opacity", 0, 1, 0.05)}
                <button
                  aria-label={`Delete keyframe ${index + 1}`}
                  disabled={motion.frames.length <= 2}
                  onClick={() =>
                    update({
                      frames: motion.frames.filter((_, i) => i !== index),
                    })
                  }
                >
                  <X size={12} />
                </button>
              </div>
            ))}
            <button
              disabled={motion.frames.length >= 100}
              onClick={() => {
                const ordered = [...motion.frames].sort(
                  (a, b) => a.time - b.time,
                );
                let start = 0,
                  end = ordered[0].time;
                for (let i = 0; i < ordered.length; i++) {
                  const a = ordered[i].time,
                    b = ordered[i + 1]?.time ?? 1;
                  if (b - a > end - start) {
                    start = a;
                    end = b;
                  }
                }
                update({
                  frames: [
                    ...motion.frames,
                    {
                      ...initialFrame,
                      time: Number(((start + end) / 2).toFixed(6)),
                    },
                  ].sort((a, b) => a.time - b.time),
                });
              }}
            >
              <Plus size={13} />
              Add keyframe
            </button>
          </div>
        )}
      </div>
    </section>
  );
}
