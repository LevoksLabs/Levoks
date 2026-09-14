import { NextResponse } from "next/server";
import { z } from "zod";
import {
  apiError,
  HttpError,
  providerJSON,
  providerResponse,
  readJSON,
} from "@/lib/server/http";
import { proposalStream, type ChatCompletion } from "@/lib/server/ai-stream";
import {
  parseProject,
  projectSchema,
  redactProject,
  type ProjectDocument,
} from "@/lib/project/schema";
import { validateFiles } from "@/lib/codegen/files";
import { compileProject } from "@/lib/project/compiler";
import { applyProjectPatch, patchSchema } from "@/lib/project/patch";

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
        mode: z.enum(["design", "patch", "code"]),
        stream: z.boolean().default(false),
        maxOutputTokens: z.number().int().min(256).max(16000).default(16000),
        maxInputBytes: z
          .number()
          .int()
          .min(1000)
          .max(1_000_000)
          .default(120_000),
      })
      .parse(await readJSON(request));
    let project: ProjectDocument;
    try {
      project = redactProject(parseProject(body.project));
    } catch {
      throw new HttpError(400, "Project validation failed.");
    }
    if (body.mode !== "code") project = { ...project, source: undefined };
    const compilation = compileProject(project);
    const system =
      body.mode === "patch"
        ? `You edit the Levoks visual project incrementally. Return ONLY JSON with summary (string) and operations matching ${JSON.stringify(z.toJSONSchema(patchSchema))}. Use add/replace/remove/test operations with JSON Pointer paths. Modify only /editor, /backend, /routing or /name. Preserve unaffected state and identifiers. Use test preconditions for replaced values. Batch all parent/child/page references required for a valid final document. Never modify project metadata, source overrides or secret values. Limit the response to the smallest required changes. Final project schema: ${JSON.stringify(z.toJSONSchema(projectSchema))}.`
        : body.mode === "design"
          ? `You are Levoks, a visual full-stack application designer. Return ONLY a JSON object with keys summary (string) and project (complete project document). Preserve project id, existing IDs, and all unaffected pages and services. Match this schema: ${JSON.stringify(z.toJSONSchema(projectSchema))}. All elements must have valid parent/child references, belong to exactly one page or global root, and be reachable. Use current editor.rootIds for the active page and keep pageElementMap in sync. Do not embed credentials. For visual editing prefer accessible layout, clear hierarchy and responsive containers. Keep a / home route. Supported backend blocks are defined by the schema; do not invent block types.`
          : "You are a senior full-stack engineer working in Levoks. Return ONLY a JSON object with keys summary (string) and files (COMPLETE flat map of source path to text content). Implement the user request using the provided project IR and baseline source. Preserve Next.js app router and Express architecture. Never include secret values, .env files, private keys, executable workflows, or absolute paths. Include .env.example placeholders. Do not claim tests or deployment have run. Code changes do not modify the visual IR; retain levoks.project.json as provided.";
    const context =
      body.mode !== "code"
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
    const input = JSON.stringify(context) + "\nRequest: " + body.prompt;
    if (new TextEncoder().encode(system + input).length > body.maxInputBytes)
      throw new HttpError(
        413,
        "The project and instructions exceed your input size limit. Increase the limit or reduce the requested scope before sending a paid request.",
      );
    const cancel = new AbortController();
    const init: RequestInit = {
      method: "POST",
      signal: AbortSignal.any([
        request.signal,
        cancel.signal,
        AbortSignal.timeout(110_000),
      ]),
      body: JSON.stringify({
        model: body.model,
        messages: [
          { role: "system", content: system },
          {
            role: "user",
            content: input,
          },
        ],
        max_tokens: body.maxOutputTokens,
        temperature: 0.2,
        ...(body.stream
          ? { stream: true, stream_options: { include_usage: true } }
          : {}),
      }),
    };
    function validate(response: ChatCompletion) {
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
      const reported = response.usage;
      const count = (value: unknown) =>
        typeof value === "number" && Number.isSafeInteger(value) && value >= 0
          ? value
          : null;
      const usage = {
        inputTokens: count(reported?.prompt_tokens),
        outputTokens: count(reported?.completion_tokens),
        totalTokens: count(reported?.total_tokens),
      };
      if (body.mode === "patch") {
        try {
          return NextResponse.json({
            summary: proposal.summary.slice(0, 2000),
            usage,
            ...applyProjectPatch(project, proposal.operations),
          });
        } catch (error) {
          throw new HttpError(
            502,
            "The incremental proposal was rejected. " +
              (error instanceof Error
                ? error.message.slice(0, 1600)
                : "Invalid patch."),
          );
        }
      }
      if (body.mode === "design") {
        try {
          const next = {
            ...redactProject(parseProject(proposal.project)),
            source: undefined,
          };
          if (next.id !== project.id) throw new Error("Project ID changed");
          return NextResponse.json({
            summary: proposal.summary.slice(0, 2000),
            usage,
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
          usage,
          files: validateFiles(proposal.files),
        });
      } catch {
        throw new HttpError(
          502,
          "The proposed source files failed validation. No changes were applied.",
        );
      }
    }
    if (body.stream)
      return proposalStream(
        await providerResponse(url, body.apiKey, init),
        cancel,
        validate,
      );
    return validate(await providerJSON(url, body.apiKey, init));
  } catch (error) {
    return apiError(error);
  }
}
