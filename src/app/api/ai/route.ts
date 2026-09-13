import { NextResponse } from "next/server";
import { z } from "zod";
import { apiError, HttpError, providerJSON, readJSON } from "@/lib/server/http";
import {
  parseProject,
  projectSchema,
  redactProject,
} from "@/lib/project/schema";
import { validateFiles } from "@/lib/codegen/files";
import { compileProject } from "@/lib/project/compiler";

export const maxDuration = 120;
export async function POST(request: Request) {
  try {
    const body = z
      .object({
        provider: z.enum(["huggingface", "openrouter"]),
        apiKey: z.string().min(10).max(1000),
        model: z.string().min(1).max(200),
        prompt: z.string().trim().min(1).max(12000),
        project: z.unknown(),
        mode: z.enum(["design", "code"]),
      })
      .parse(await readJSON(request));
    let project;
    try {
      project = redactProject(parseProject(body.project));
    } catch {
      throw new HttpError(400, "Project validation failed.");
    }
    if (body.mode === "design") project = { ...project, source: undefined };
    const compilation = compileProject(project);
    const system =
      body.mode === "design"
        ? `You are Levoks, a visual full-stack application designer. Return ONLY a JSON object with keys summary (string) and project (complete project document). Preserve project id, existing IDs, and all unaffected pages and services. Match this schema: ${JSON.stringify(z.toJSONSchema(projectSchema))}. All elements must have valid parent/child references, belong to exactly one page or global root, and be reachable. Use current editor.rootIds for the active page and keep pageElementMap in sync. Do not embed credentials. For visual editing prefer accessible layout, clear hierarchy and responsive containers. Keep a / home route. Supported backend blocks are defined by the schema; do not invent block types.`
        : "You are a senior full-stack engineer working in Levoks. Return ONLY a JSON object with keys summary (string) and files (COMPLETE flat map of source path to text content). Implement the user request using the provided project IR and baseline source. Preserve Next.js app router and Express architecture. Never include secret values, .env files, private keys, executable workflows, or absolute paths. Include .env.example placeholders. Do not claim tests or deployment have run. Code changes do not modify the visual IR; retain levoks.project.json as provided.";
    const context =
      body.mode === "design"
        ? { project, graph: compilation.graph }
        : {
            project,
            graph: compilation.graph,
            files: compilation.files,
            diagnostics: compilation.diagnostics,
          };
    const url =
      body.provider === "huggingface"
        ? "https://router.huggingface.co/v1/chat/completions"
        : "https://openrouter.ai/api/v1/chat/completions";
    const response = await providerJSON(url, body.apiKey, {
      method: "POST",
      signal: AbortSignal.any([request.signal, AbortSignal.timeout(110_000)]),
      body: JSON.stringify({
        model: body.model,
        messages: [
          { role: "system", content: system },
          {
            role: "user",
            content: JSON.stringify(context) + "\nRequest: " + body.prompt,
          },
        ],
        max_tokens: 16000,
        temperature: 0.2,
      }),
    });
    const raw = response?.choices?.[0]?.message?.content;
    if (
      typeof raw !== "string" ||
      response?.choices?.[0]?.finish_reason === "length"
    )
      throw new HttpError(
        502,
        "The model returned an incomplete response. Try a smaller change or another model.",
      );
    let proposal;
    try {
      proposal = JSON.parse(
        raw
          .trim()
          .replace(/^```(?:json)?\s*/, "")
          .replace(/\s*```$/, ""),
      );
    } catch {
      throw new HttpError(
        502,
        "The model did not return valid JSON. No changes were applied.",
      );
    }
    if (!proposal || typeof proposal.summary !== "string")
      throw new HttpError(502, "The model response is missing a summary.");
    if (body.mode === "design") {
      try {
        const next = {
          ...redactProject(parseProject(proposal.project)),
          source: undefined,
        };
        if (next.id !== project.id) throw new Error("Project ID changed");
        return NextResponse.json({
          summary: proposal.summary.slice(0, 2000),
          project: next,
        });
      } catch {
        throw new HttpError(
          502,
          "The proposed design failed validation. No changes were applied; try a smaller request.",
        );
      }
    }
    try {
      return NextResponse.json({
        summary: proposal.summary.slice(0, 2000),
        files: validateFiles(proposal.files),
      });
    } catch {
      throw new HttpError(
        502,
        "The proposed source files failed validation. No changes were applied.",
      );
    }
  } catch (error) {
    return apiError(error);
  }
}
