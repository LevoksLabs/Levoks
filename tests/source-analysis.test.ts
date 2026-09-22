import test from "node:test";
import assert from "node:assert/strict";
import { analyzeSource } from "../src/lib/source-analysis";
test("source diagnostics find syntax errors without evaluating generated or edited code", () => {
  assert.equal(analyzeSource("app/page.jsx", 'export default function Page(){ return <button>Start</button>; }').issues.length, 0);
  const broken = analyzeSource("app/page.tsx", "export const value = ;\nexport default function Page(){return <div/>}");
  assert.ok(broken.issues.some(issue => issue.line === 1));
  const script = 'throw new Error("must never execute"); globalThis.danger = true;';
  assert.equal(analyzeSource("server.js", script).issues.length, 0);
  assert.equal((globalThis as Record<string, unknown>).danger, undefined);
  assert.equal(analyzeSource("package.json", '{"scripts":}').issues.length, 1);
  assert.equal(analyzeSource("style.css", "body{};").supported, false);
  assert.equal(analyzeSource("large.js", " ".repeat(500001)).supported, false);
});
