import type { StateCreator } from "zustand";

type Slice = Record<string, unknown>;
type Snapshot = Map<string, Slice>;
type Entry = { before: Snapshot; after: Snapshot; scope: string };
export type DurableHistory = {
  version: 1;
  head: Record<string, Slice>;
  past: {
    before: Record<string, Slice>;
    after: Record<string, Slice>;
    scope: string;
  }[];
  future: {
    before: Record<string, Slice>;
    after: Record<string, Slice>;
    scope: string;
  }[];
};
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
let batch: { before: Snapshot; past: Entry[]; future: Entry[] } | undefined;
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
    batch = undefined;
    notify();
  },
  // Responsive editing spans several ordinary drag/inspector gestures.
  beginBatch() {
    if (batch) return;
    this.end();
    batch = { before: capture(), past, future };
    past = [];
    future = [];
    notify();
  },
  serialize(
    normalize: (snapshot: Record<string, Slice>) => Record<string, Slice>,
  ): DurableHistory {
    const encode = (snapshot: Snapshot) =>
      normalize(Object.fromEntries(snapshot));
    const current = capture();
    const pending =
      !batch && gesture && !equal(gesture.before, current)
        ? { before: gesture.before, after: current, scope: gesture.scope }
        : undefined;
    const head = encode(batch?.before || current);
    let bytes = JSON.stringify(head).length;
    const entries = (items: Entry[]) => {
      const saved: DurableHistory["past"] = [];
      for (const entry of [...items].reverse()) {
        try {
          const next = {
            before: encode(entry.before),
            after: encode(entry.after),
            scope: entry.scope,
          };
          bytes += JSON.stringify(next).length;
          if (bytes > 10_000_000) break;
          saved.unshift(next);
        } catch {
          // Invalid intermediate inspector drafts must never prevent a valid save.
          // Retain only the contiguous valid history nearest the saved document.
          break;
        }
      }
      return saved;
    };
    const value: DurableHistory = {
      version: 1,
      head,
      past: entries(
        batch?.past || (pending ? [...past, pending].slice(-50) : past),
      ),
      future: entries(batch?.future || (pending ? [] : future)),
    };
    return value;
  },
  hydrate(
    value: unknown,
    normalize: (snapshot: Record<string, Slice>) => Record<string, Slice>,
  ) {
    this.clear();
    try {
      const data = value as DurableHistory;
      if (
        !data ||
        data.version !== 1 ||
        data.past.length > 50 ||
        data.future.length > 50 ||
        data.past.length + data.future.length > 50 ||
        JSON.stringify(value).length > 15_000_000
      )
        return false;
      const decode = (snapshot: Record<string, Slice>) => {
        if (
          Object.keys(snapshot).length !== participants.size ||
          [...participants.keys()].some((key) => !snapshot[key])
        )
          throw new Error("History participants differ.");
        return new Map(Object.entries(normalize(snapshot)));
      };
      if (
        JSON.stringify(Object.fromEntries(decode(data.head))) !==
        JSON.stringify(normalize(Object.fromEntries(capture())))
      )
        return false;
      const entries = (items: DurableHistory["past"]) =>
        items.map((entry) => {
          if (!participants.has(entry.scope))
            throw new Error("Invalid history scope.");
          return {
            scope: entry.scope,
            before: decode(entry.before),
            after: decode(entry.after),
          };
        });
      const nextPast = entries(data.past),
        nextFuture = entries(data.future);
      past = nextPast;
      future = nextFuture;
      notify();
      return true;
    } catch {
      this.clear();
      return false;
    }
  },
  endBatch(cancel = false) {
    if (!batch) return;
    this.end();
    const active = batch;
    batch = undefined;
    past = active.past;
    future = active.future;
    if (cancel) apply(active.before);
    else commit(active.before, "editor");
    notify();
  },
  savedSlice(scope: string) {
    return batch?.before.get(scope);
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
