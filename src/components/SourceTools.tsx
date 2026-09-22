"use client";
import { useEffect, useRef, useState } from "react";
import type { SourceIssue } from "@/lib/source-analysis";
export default function SourceTools({ file, code, onChange, readOnly }: { file: string; code: string; onChange: (code: string) => void; readOnly: boolean }) {
  const worker = useRef<Worker | null>(null), revision = useRef(0);
  const [result, setResult] = useState<{ code: string; supported: boolean; issues: SourceIssue[] } | null>(null);
  const [find, setFind] = useState(""), [replacement, setReplacement] = useState("");
  useEffect(() => {
    const instance = new Worker(new URL("./source-analysis.worker.ts", import.meta.url), { type: "module" });
    worker.current = instance;
    return () => { instance.terminate(); worker.current = null; };
  }, []);
  useEffect(() => {
    const instance = worker.current; if (!instance) return;
    const id = ++revision.current;
    instance.onmessage = event => { if (event.data.id === revision.current) setResult({ code, supported: event.data.supported, issues: event.data.issues }); };
    instance.onerror = () => setResult({ code, supported: false, issues: [{ line: 1, column: 1, message: "Source analysis could not start. Validate the exported project." }] });
    const timer = setTimeout(() => instance.postMessage({ id, file, code }), 300);
    return () => clearTimeout(timer);
  }, [file, code]);
  const jump = (line: number, column = 1) => {
    const input = document.querySelector<HTMLTextAreaElement>(".source-text-area textarea"); if (!input) return;
    const lines = code.split("\n"), row = Math.max(0, Math.min(lines.length - 1, line - 1));
    const offset = lines.slice(0, row).reduce((count, text) => count + text.length + 1, 0) + Math.min(lines[row].length, column - 1);
    input.focus(); input.setSelectionRange(offset, offset); input.scrollTop = row * parseFloat(getComputedStyle(input).lineHeight || "20"); input.dispatchEvent(new Event("scroll"));
  };
  const matches = find ? code.split(find).length - 1 : 0;
  const current = result?.code === code ? result : null;
  return <div className="source-tools"><div className="source-find"><input aria-label="Find in source" placeholder="Find in file" value={find} onChange={event => setFind(event.target.value)} /><button disabled={!matches} onClick={() => { const input = document.querySelector<HTMLTextAreaElement>(".source-text-area textarea"); if (!input) return; let index = code.indexOf(find, input.selectionEnd); if (index < 0) index = code.indexOf(find); const before = code.slice(0, index).split("\n"); jump(before.length, before.at(-1)!.length + 1); input.setSelectionRange(index, index + find.length); }}>Next · {matches}</button><input aria-label="Replace in source" placeholder="Replace with" value={replacement} disabled={readOnly} onChange={event => setReplacement(event.target.value)} /><button disabled={readOnly || !matches} onClick={() => onChange(code.split(find).join(replacement))}>Replace all</button><label>Line<input aria-label="Go to source line" type="number" min={1} max={code.split("\n").length} placeholder="1" onKeyDown={event => { if (event.key === "Enter") { event.preventDefault(); jump(Number(event.currentTarget.value) || 1); } }} /></label></div><details className="source-issues" open={!!current?.issues.length}><summary>{!current ? "Checking syntax…" : current.issues.length ? `${current.issues.length} source issues` : current.supported ? "No syntax errors · type and runtime checks still required" : "No live parser for this file type"}</summary>{current?.issues.map((issue, index) => <button key={index} onClick={() => jump(issue.line, issue.column)}>Line {issue.line}:{issue.column} — {issue.message}</button>)}</details></div>;
}
