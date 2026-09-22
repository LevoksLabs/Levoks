import ts from "typescript";
export type SourceIssue = { line: number; column: number; message: string };
/** Parse only. Never import, evaluate, or execute application source. */
export function analyzeSource(file: string, code: string): { supported: boolean; issues: SourceIssue[] } {
  if (code.length > 500_000) return { supported: false, issues: [{ line: 1, column: 1, message: "Live analysis is limited to 500 KB per file. Validate this file in the exported project." }] };
  if (file.endsWith(".json")) {
    try { JSON.parse(code); return { supported: true, issues: [] }; }
    catch (error) { return { supported: true, issues: [{ line: 1, column: 1, message: error instanceof Error ? error.message : "Invalid JSON" }] }; }
  }
  if (!/\.[cm]?[jt]sx?$/.test(file)) return { supported: false, issues: [] };
  const result = ts.transpileModule(code, { fileName: file, reportDiagnostics: true, compilerOptions: { target: ts.ScriptTarget.ESNext, module: ts.ModuleKind.ESNext, jsx: ts.JsxEmit.Preserve, isolatedModules: true } });
  return { supported: true, issues: (result.diagnostics || []).filter(item => item.category === ts.DiagnosticCategory.Error).slice(0, 50).map(item => { const position = item.file?.getLineAndCharacterOfPosition(item.start || 0); return { line: (position?.line || 0) + 1, column: (position?.character || 0) + 1, message: ts.flattenDiagnosticMessageText(item.messageText, " ") }; }) };
}
