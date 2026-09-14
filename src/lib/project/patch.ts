import { z } from "zod";
import { parseProject, redactProject, type ProjectDocument } from "./schema";
import { compileProject } from "./compiler";

export const patchSchema = z
  .array(
    z.discriminatedUnion("op", [
      z
        .object({
          op: z.literal("add"),
          path: z.string().max(1500),
          value: z.json(),
        })
        .strict(),
      z
        .object({
          op: z.literal("replace"),
          path: z.string().max(1500),
          value: z.json(),
        })
        .strict(),
      z
        .object({ op: z.literal("remove"), path: z.string().max(1500) })
        .strict(),
      z
        .object({
          op: z.literal("test"),
          path: z.string().max(1500),
          value: z.json(),
        })
        .strict(),
    ]),
  )
  .min(1)
  .max(200);
export type PatchChange = {
  op: string;
  path: string;
  before: string;
  after: string;
};
function equal(a: unknown, b: unknown): boolean {
  if (a === b) return true;
  if (
    !a ||
    !b ||
    typeof a !== "object" ||
    typeof b !== "object" ||
    Array.isArray(a) !== Array.isArray(b)
  )
    return false;
  const x = Object.keys(a),
    y = Object.keys(b);
  return (
    x.length === y.length &&
    x.every(
      (k) =>
        Object.hasOwn(b, k) &&
        equal(
          (a as Record<string, unknown>)[k],
          (b as Record<string, unknown>)[k],
        ),
    )
  );
}
function pointer(path: string) {
  if (!path.startsWith("/") || /~(?![01])/.test(path))
    throw new Error("Invalid patch path");
  const keys = path
    .slice(1)
    .split("/")
    .map((v) => v.replaceAll("~1", "/").replaceAll("~0", "~"));
  if (
    !["editor", "backend", "routing", "name"].includes(keys[0]) ||
    keys.some((v) =>
      ["__proto__", "prototype", "constructor", "secretKey"].includes(v),
    )
  )
    throw new Error("Patch cannot change protected project data");
  return keys;
}
const preview = (value: unknown) =>
  value === undefined ? "(absent)" : JSON.stringify(value).slice(0, 600);
export function applyProjectPatch(base: ProjectDocument, value: unknown) {
  if (JSON.stringify(value).length > 1_000_000)
    throw new Error("Patch exceeds 1 MB");
  const operations = patchSchema.parse(value);
  const original = { ...redactProject(parseProject(base)), source: undefined };
  const next = structuredClone(original) as unknown as Record<string, unknown>;
  const changes: PatchChange[] = [];
  for (const operation of operations) {
    const keys = pointer(operation.path),
      key = keys.pop()!;
    let parent: unknown = next;
    for (const segment of keys) {
      if (
        !parent ||
        typeof parent !== "object" ||
        !Object.hasOwn(parent, segment)
      )
        throw new Error("Patch parent does not exist");
      parent = (parent as Record<string, unknown>)[segment];
    }
    if (!parent || typeof parent !== "object")
      throw new Error("Patch parent is not a container");
    const array = Array.isArray(parent) ? parent : null;
    if (
      array &&
      !(key === "-" && operation.op === "add") &&
      !/^(0|[1-9]\d*)$/.test(key)
    )
      throw new Error("Invalid array patch index");
    const index = key === "-" && array ? array.length : Number(key);
    if (
      array &&
      (index > array.length ||
        (operation.op !== "add" && index >= array.length))
    )
      throw new Error("Array patch index is out of bounds");
    const container = parent as Record<string, unknown>,
      exists = Object.hasOwn(container, key),
      before = container[key];
    if (operation.op !== "add" && !exists)
      throw new Error("Patch target does not exist");
    if (operation.op === "test") {
      if (!equal(before, operation.value))
        throw new Error(
          "Patch precondition failed; the expected value changed",
        );
      continue;
    }
    if (array) {
      if (operation.op === "add")
        array.splice(index, 0, structuredClone(operation.value));
      else if (operation.op === "remove") array.splice(index, 1);
      else array[index] = structuredClone(operation.value);
    } else if (operation.op === "remove") delete container[key];
    else
      Object.defineProperty(container, key, {
        value: structuredClone(operation.value),
        writable: true,
        configurable: true,
        enumerable: true,
      });
    changes.push({
      op: operation.op,
      path: operation.path,
      before: operation.op === "add" && array ? "(absent)" : preview(before),
      after: operation.op === "remove" ? "(absent)" : preview(operation.value),
    });
  }
  const project = parseProject(next);
  if (!equal(project, next))
    throw new Error("Patch contains fields outside the project schema");
  if (!equal(project, redactProject(project)))
    throw new Error("Patch cannot embed secret values");
  const key = (d: { code: string; nodeId?: string; message: string }) =>
    JSON.stringify([d.code, d.nodeId, d.message]);
  const existing = new Set(
    compileProject(original)
      .diagnostics.filter((d) => d.severity === "error")
      .map(key),
  );
  const added = compileProject(project).diagnostics.filter(
    (d) => d.severity === "error" && !existing.has(key(d)),
  );
  if (added.length)
    throw new Error(
      "Patch introduces compiler errors: " +
        added
          .map((d) => d.message)
          .join("; ")
          .slice(0, 1200),
    );
  return { project, changes };
}
