import { z } from "zod";

const propName = z
  .string()
  .regex(/^[a-zA-Z][a-zA-Z0-9_]*$/)
  .refine(
    (name) =>
      ![
        "children",
        "key",
        "ref",
        "dangerouslySetInnerHTML",
        "__proto__",
        "constructor",
        "prototype",
      ].includes(name) && !/^on[A-Z]/.test(name),
    "Reserved property name",
  );
export const customDefinitionSchema = z.object({
  name: z
    .string()
    .regex(/^[A-Z][A-Za-z0-9]*$/)
    .max(80),
  version: z.literal(1),
  framework: z.literal("react"),
  description: z.string().max(1000),
  source: z.string().min(1).max(100_000),
  props: z.record(
    propName,
    z
      .object({
        type: z.enum(["string", "number", "boolean"]),
        default: z.union([
          z.string().max(10000),
          z.number().finite(),
          z.boolean(),
        ]),
      })
      .refine(
        (p) => typeof p.default === p.type,
        "Default must match declared type",
      ),
  ),
  events: z.array(z.string().regex(/^on[A-Z][A-Za-z0-9]*$/)).max(30),
  children: z.boolean(),
  dependencies: z
    .record(
      z.string().regex(/^(?:@[a-z0-9-]+\/)?[a-z0-9][a-z0-9._-]*$/),
      z.string().regex(/^\d+\.\d+\.\d+(?:-[a-zA-Z0-9.-]+)?$/),
    )
    .refine(
      (deps) =>
        !Object.keys(deps).some((key) =>
          [
            "next",
            "react",
            "react-dom",
            "__proto__",
            "constructor",
            "prototype",
          ].includes(key),
        ),
      "Framework dependencies are managed by the generator",
    ),
});
export type CustomDefinition = z.infer<typeof customDefinitionSchema>;
export const customIdentifier = (id: string) =>
  "Custom_" +
  Array.from(id)
    .map((char) => char.charCodeAt(0).toString(16))
    .join("_");
export function customTemplate(id: string, definition: CustomDefinition) {
  return {
    type: "custom" as const,
    definitionId: id,
    definitionVersion: definition.version,
    label: definition.name,
    props: Object.fromEntries(
      Object.entries(definition.props).map(([key, field]) => [
        key,
        field.default,
      ]),
    ),
    styles: {},
  };
}
