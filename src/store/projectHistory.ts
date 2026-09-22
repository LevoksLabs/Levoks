import type { StateCreator } from "zustand";

type Slice = Record<string, unknown>;
type Snapshot = Map<string, Slice>;
type Entry = { before: Snapshot; after: Snapshot; scope: string };
const participants = new Map<
  string,
  { read: () => Slice; write: (slice: Slice) => void }
>();
const listeners = new Set<(scope?: string) => void>();
let past: Entry[] = [],
  future: Entry[] = [];
let depth = 0,
  suspended = 0,
  restoring = false;
let gesture: { before: Snapshot; scope: string } | undefined;
let settle = () => {};
const capture = (): Snapshot =>
  new Map(
    [...participants].map(([key, participant]) => [key, participant.read()]),
  );
const equal = (a: Snapshot, b: Snapshot) =>
  [...a].every(([key, slice]) => {
    const other = b.get(key);
    return (
      other &&
      Object.keys(slice).every((field) => slice[field] === other[field])
    );
  });
const notify = (scope?: string) =>
  listeners.forEach((listener) => listener(scope));
function apply(snapshot: Snapshot) {
  restoring = true;
  try {
    for (const [key, slice] of snapshot) participants.get(key)?.write(slice);
  } finally {
    restoring = false;
  }
}
function commit(before: Snapshot, scope: string) {
  const after = capture();
  if (equal(before, after)) return;
  past = [...past, { before, after, scope }].slice(-50);
  future = [];
  notify();
}
export const projectHistory = {
  get restoring() {
    return restoring;
  },
  get canUndo() {
    return past.length > 0;
  },
  get canRedo() {
    return future.length > 0;
  },
  subscribe(listener: (scope?: string) => void) {
    listeners.add(listener);
    return () => {
      listeners.delete(listener);
    };
  },
  reconcile(callback: () => void) {
    settle = callback;
  },
  clear() {
    past = [];
    future = [];
    gesture = undefined;
    notify();
  },
  without<T>(action: () => T): T {
    suspended++;
    try {
      return action();
    } finally {
      suspended--;
    }
  },
  run<T>(scope: string, action: () => T): T {
    if (restoring || suspended) return action();
    const outer = depth++ === 0;
    const before = outer && !gesture ? capture() : undefined;
    try {
      const result = action();
      if (outer && !equal(before || gesture!.before, capture())) settle();
      if (before) commit(before, scope);
      return result;
    } catch (error) {
      if (before) apply(before);
      throw error;
    } finally {
      depth--;
    }
  },
  begin(scope = "editor") {
    if (!gesture && !restoring) gesture = { before: capture(), scope };
  },
  end(cancel = false) {
    const active = gesture;
    if (!active) return;
    gesture = undefined;
    if (cancel) apply(active.before);
    else {
      settle();
      commit(active.before, active.scope);
    }
    notify();
  },
  undo() {
    if (gesture) this.end();
    const entry = past.pop();
    if (!entry) return;
    apply(entry.before);
    future.push(entry);
    notify(entry.scope);
  },
  redo() {
    if (gesture) this.end();
    const entry = future.pop();
    if (!entry) return;
    apply(entry.after);
    past.push(entry);
    notify(entry.scope);
  },
};

/** Capture document fields only; selection, navigation and provider tokens are not history. */
export function withProjectHistory<T extends object>(
  scope: string,
  fields: readonly (keyof T)[],
  creator: StateCreator<T>,
  onRestore?: (state: T, document: Partial<T>) => Partial<T>,
): StateCreator<T> {
  return (set, get, api) => {
    participants.set(scope, {
      read: () =>
        Object.fromEntries(fields.map((field) => [field, get()?.[field]])),
      write: (slice) =>
        set({
          ...slice,
          ...onRestore?.(get(), slice as Partial<T>),
        } as Partial<T>),
    });
    const trackedSet: typeof set = (value, replace) =>
      projectHistory.run(scope, () => {
        if (replace) set(value as T | ((state: T) => T), true);
        else set(value, false);
      });
    return creator(trackedSet, get, api);
  };
}
