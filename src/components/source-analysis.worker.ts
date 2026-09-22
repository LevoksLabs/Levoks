import { analyzeSource } from "@/lib/source-analysis";
self.onmessage = (event: MessageEvent<{ id: number; file: string; code: string }>) => {
  try { self.postMessage({ id: event.data.id, ...analyzeSource(event.data.file, event.data.code) }); }
  catch { self.postMessage({ id: event.data.id, supported: false, issues: [{ line: 1, column: 1, message: "Analysis failed. Validate the exported source before deployment." }] }); }
};
