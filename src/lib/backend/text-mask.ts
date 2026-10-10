/** Masks use fixed character tokens and bounded counts, never authored expressions. */
const maskClasses: Record<string, string> = {
  "0": "[0-9]",
  A: "[A-Z]",
  a: "[a-z]",
  X: "[A-Za-z0-9]",
  L: "[\\p{L}\\p{M}]",
  N: "[\\p{Nd}]",
};
const escape = (value: string) => value.replace(/[\\^$.*+?()[\]{}|]/g, "\\$&");
export function maskHelp(mask: string) {
  const names: Record<string, string> = {
    "0": "digits",
    A: "uppercase letters",
    a: "lowercase letters",
    X: "letters or digits",
    L: "letters or marks",
    N: "digits",
  };
  const parts: { name: string; min: number; max: number }[] = [];
  for (const match of mask.matchAll(
    /(?:\\([\s\S])|([\s\S]))(?:\{(\d+)(?:,(\d+))?\})?/gu,
  )) {
    const name =
        match[1] !== undefined
          ? `“${match[1]}”`
          : names[match[2]] || `“${match[2]}”`,
      min = Number(match[3] ?? 1),
      max = Number(match[4] ?? min),
      previous = parts.at(-1);
    if (
      previous &&
      previous.name === name &&
      previous.min === previous.max &&
      min === max
    ) {
      previous.min += min;
      previous.max += max;
    } else parts.push({ name, min, max });
  }
  return (
    "Format: " +
    parts
      .map(
        (part) =>
          `${part.min === part.max ? part.min : `${part.min}–${part.max}`} ${part.name}`,
      )
      .join(" · ") +
    "."
  );
}
export function maskPattern(mask: string) {
  if (!mask || mask.length > 120 || /[\u0000-\u001f\u007f]/.test(mask))
    throw new Error("Use a custom format of 1–120 characters.");
  const atoms: { pattern: string; min: number; max: number }[] = [];
  const characters = Array.from(mask);
  for (let at = 0; at < characters.length; at++) {
    let character = characters[at],
      literal = false;
    if (character === "\\") {
      character = characters[++at];
      literal = true;
      if (!character) throw new Error("Complete the escaped literal.");
    }
    if (!literal && /[{}]/.test(character))
      throw new Error("Counts follow a character: for example 0{2,4}.");
    let min = 1,
      max = 1;
    if (characters[at + 1] === "{") {
      const count = characters
        .slice(at + 1)
        .join("")
        .match(/^\{(\d{1,3})(?:,(\d{1,3}))?\}/);
      if (!count)
        throw new Error("Use a whole count or range, such as {4} or {2,6}.");
      min = Number(count[1]);
      max = Number(count[2] || count[1]);
      if (max < 1 || max > 100 || min > max)
        throw new Error(
          "Format counts must be ordered and between 0 and 100, with a positive maximum.",
        );
      at += count[0].length;
    }
    atoms.push({
      pattern: (!literal && maskClasses[character]) || escape(character),
      min,
      max,
    });
  }
  const samples = Array.from({ length: 128 }, (_, index) =>
    String.fromCharCode(index),
  ).concat(characters, ["é", "中", "ا", "अ", "١", "१"]);
  for (let at = 0; at < atoms.length; at++) {
    if (atoms[at].min === atoms[at].max) continue;
    const current = new RegExp("^(?:" + atoms[at].pattern + ")$", "v");
    for (let next = at + 1; next < atoms.length; next++) {
      const following = new RegExp("^(?:" + atoms[next].pattern + ")$", "v");
      if (
        samples.some(
          (character) => current.test(character) && following.test(character),
        ) ||
        atoms[at].pattern === atoms[next].pattern
      )
        throw new Error(
          "Separate variable counts with a distinct literal or character type.",
        );
      if (atoms[next].min > 0) break;
    }
  }
  return atoms
    .map(
      (atom) =>
        atom.pattern +
        (atom.min === 1 && atom.max === 1 ? "" : `{${atom.min},${atom.max}}`),
    )
    .join("");
}

/** Standalone copy used in generated apps; mask parity tests cover both implementations. */
export const TEXT_MASK_RUNTIME = String.raw`
const maskClasses = { "0": "[0-9]", A: "[A-Z]", a: "[a-z]", X: "[A-Za-z0-9]", L: "[\\p{L}\\p{M}]", N: "[\\p{Nd}]" };
const escapeMask = (value) => value.replace(/[\\^$.*+?()[\]{}|]/g, "\\$&");
function textMaskPattern(mask) {
    if (!mask || mask.length > 120 || /[\u0000-\u001f\u007f]/.test(mask))
        throw new Error("Use a custom format of 1–120 characters.");
    const atoms = [];
    const characters = Array.from(mask);
    for (let at = 0; at < characters.length; at++) {
        let character = characters[at], literal = false;
        if (character === "\\") {
            character = characters[++at];
            literal = true;
            if (!character)
                throw new Error("Complete the escaped literal.");
        }
        if (!literal && /[{}]/.test(character))
            throw new Error("Counts follow a character: for example 0{2,4}.");
        let min = 1, max = 1;
        if (characters[at + 1] === "{") {
            const count = characters.slice(at + 1).join("").match(/^\{(\d{1,3})(?:,(\d{1,3}))?\}/);
            if (!count)
                throw new Error("Use a whole count or range, such as {4} or {2,6}.");
            min = Number(count[1]);
            max = Number(count[2] || count[1]);
            if (max < 1 || max > 100 || min > max)
                throw new Error("Format counts must be ordered and between 0 and 100, with a positive maximum.");
            at += count[0].length;
        }
        atoms.push({ pattern: !literal && maskClasses[character] || escapeMask(character), min, max });
    }
    const samples = Array.from({ length: 128 }, (_, index) => String.fromCharCode(index)).concat(characters, ["é", "中", "ا", "अ", "١", "१"]);
    for (let at = 0; at < atoms.length; at++) {
        if (atoms[at].min === atoms[at].max)
            continue;
        const current = new RegExp("^(?:" + atoms[at].pattern + ")$", "v");
        for (let next = at + 1; next < atoms.length; next++) {
            const following = new RegExp("^(?:" + atoms[next].pattern + ")$", "v");
            if (samples.some(character => current.test(character) && following.test(character)) || atoms[at].pattern === atoms[next].pattern)
                throw new Error("Separate variable counts with a distinct literal or character type.");
            if (atoms[next].min > 0)
                break;
        }
    }
    return atoms.map(atom => atom.pattern + (atom.min === 1 && atom.max === 1 ? "" : "{" + atom.min + "," + atom.max + "}")).join("");
}

`;
