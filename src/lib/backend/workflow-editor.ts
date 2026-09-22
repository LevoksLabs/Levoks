import type {
  BackendBlock,
  BlockConfig,
  ServiceContainer,
} from "@/types/backend";
import { controlSchema } from "./program-schema";
export function withoutWorkflowTarget(
  block: BackendBlock,
  targetId: string,
): BackendBlock {
  const config = { ...block.config } as Record<string, unknown>;
  if (Array.isArray(config.steps))
    config.steps = config.steps.filter((id) => id !== targetId);
  if (config.program && typeof config.program === "object") {
    const program = { ...config.program } as Record<string, unknown>;
    for (const field of [
      "steps",
      "thenSteps",
      "elseSteps",
      "catchSteps",
      "finallySteps",
    ]) {
      if (Array.isArray(program[field]))
        program[field] = program[field].filter((id) => id !== targetId);
    }
    config.program = program;
  }
  return {
    ...block,
    config: config as BlockConfig,
    connections: block.connections.filter((id) => id !== targetId),
  };
}
const configuration = new Set([
  "rest_endpoint",
  "db_model",
  "role",
  "permission",
  "env_var",
  "health_check",
  "error_handler",
  "audit_log",
  "relation",
  "middleware",
  "auth_block",
]);
export const executableBlock = (block: BackendBlock) =>
  !configuration.has(block.type);
export function workflowOutputs(
  block: BackendBlock,
): { field: string; label: string; ids: string[] }[] {
  if (!executableBlock(block) && block.type !== "rest_endpoint") return [];
  const result = [
    { field: "connections", label: "Next", ids: block.connections },
  ];
  if (block.type.startsWith("logic_")) {
    const program = controlSchema.parse(
      (block.config as { program?: unknown }).program || {},
    );
    const fields =
      block.type === "logic_if"
        ? [
            ["thenSteps", "True"],
            ["elseSteps", "False"],
          ]
        : block.type === "logic_trycatch"
          ? [
              ["steps", "Try"],
              ["catchSteps", "Catch"],
              ["finallySteps", "Finally"],
            ]
          : [["steps", "Loop body"]];
    for (const [field, label] of fields)
      result.push({
        field: `program.${field}`,
        label,
        ids: program[
          field as
            "thenSteps" | "elseSteps" | "steps" | "catchSteps" | "finallySteps"
        ],
      });
  } else if ("steps" in block.config && Array.isArray(block.config.steps))
    result.push({
      field: "steps",
      label: "Operations",
      ids: block.config.steps as string[],
    });
  return result;
}
export function editWorkflow(
  service: ServiceContainer,
  sourceId: string,
  field: string,
  ids: string[],
): ServiceContainer {
  const source = service.blocks.find((block) => block.id === sourceId);
  if (
    !source ||
    !workflowOutputs(source).some((output) => output.field === field)
  )
    throw new Error("This block does not have that workflow output.");
  if (ids.length > 100)
    throw new Error("A workflow output supports at most 100 steps.");
  for (const id of ids) {
    const target = service.blocks.find((block) => block.id === id);
    if (!target || !executableBlock(target))
      throw new Error("Choose an executable block in this service.");
  }
  let updated: BackendBlock;
  if (field === "connections") updated = { ...source, connections: ids };
  else {
    const config = field.startsWith("program.")
      ? {
          ...source.config,
          program: {
            ...controlSchema.parse(
              (source.config as { program?: unknown }).program || {},
            ),
            [field.slice(8)]: ids,
          },
        }
      : { ...source.config, [field]: ids };
    updated = { ...source, config: config as BlockConfig } as BackendBlock;
  }
  const blocks = service.blocks.map((block) =>
      block.id === sourceId ? updated : block,
    ),
    byId = new Map(blocks.map((block) => [block.id, block]));
  const visited = new Set<string>(),
    active = new Set<string>();
  const visit = (id: string) => {
    if (active.has(id))
      throw new Error(
        "This connection creates a cycle. Use a Loop block for repetition.",
      );
    if (visited.has(id)) return;
    active.add(id);
    workflowOutputs(byId.get(id)!)
      .flatMap((output) => output.ids)
      .forEach((target) => {
        if (byId.has(target)) visit(target);
      });
    active.delete(id);
    visited.add(id);
  };
  blocks.forEach((block) => visit(block.id));
  return { ...service, blocks };
}
