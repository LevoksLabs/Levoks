import { z } from "zod";
export const richDocumentSchema = z
  .array(
    z.object({
      kind: z.enum(["p", "h2", "h3", "li", "blockquote"]),
      spans: z
        .array(
          z.object({
            text: z.string().max(10000),
            bold: z.boolean().optional(),
            italic: z.boolean().optional(),
            underline: z.boolean().optional(),
            href: z
              .string()
              .max(2000)
              .regex(/^(https?:\/\/|\/(?!\/)|#)/)
              .optional(),
          }),
        )
        .min(1)
        .max(200),
    }),
  )
  .min(1)
  .max(200);
export type RichDocument = z.infer<typeof richDocumentSchema>;
export function richDocument(props: Record<string, unknown>): RichDocument {
  return props.richDocument
    ? richDocumentSchema.parse(JSON.parse(String(props.richDocument)))
    : [{ kind: "p", spans: [{ text: String(props.content || "Rich text") }] }];
}
/** Split only the selected characters, retaining formatting outside the range. */
export function formatSpans(
  spans: RichDocument[number]["spans"],
  start: number,
  end: number,
  patch: Partial<RichDocument[number]["spans"][number]>,
) {
  let offset = 0;
  return spans.flatMap((span) => {
    const from = Math.max(0, start - offset),
      to = Math.min(span.text.length, end - offset);
    offset += span.text.length;
    if (to <= from) return [span];
    return [
      ...(from ? [{ ...span, text: span.text.slice(0, from) }] : []),
      { ...span, ...patch, text: span.text.slice(from, to) },
      ...(to < span.text.length
        ? [{ ...span, text: span.text.slice(to) }]
        : []),
    ];
  });
}
export function replaceRichText(
  spans: RichDocument[number]["spans"],
  text: string,
) {
  const before = spans.map((s) => s.text).join("");
  let start = 0,
    tail = 0;
  while (
    start < Math.min(before.length, text.length) &&
    before[start] === text[start]
  )
    start++;
  while (
    tail < before.length - start &&
    tail < text.length - start &&
    before[before.length - 1 - tail] === text[text.length - 1 - tail]
  )
    tail++;
  const slice = (from: number, to: number) => {
    let offset = 0;
    return spans.flatMap((s) => {
      const a = Math.max(0, from - offset),
        b = Math.min(s.text.length, to - offset);
      offset += s.text.length;
      return b > a ? [{ ...s, text: s.text.slice(a, b) }] : [];
    });
  };
  const style = slice(Math.max(0, start - 1), start)[0] || spans[0];
  const result = [
    ...slice(0, start),
    ...(text.length - tail > start
      ? [{ ...style, text: text.slice(start, text.length - tail) }]
      : []),
    ...slice(before.length - tail, before.length),
  ];
  return result.length ? result : [{ text: "" }];
}
export const timelineSchema = z
  .array(
    z.object({
      title: z.string().max(200),
      date: z.string().max(100),
      description: z.string().max(10000),
    }),
  )
  .min(1)
  .max(200);
export function timelineEvents(props: Record<string, unknown>) {
  return props.timelineEvents
    ? timelineSchema.parse(JSON.parse(String(props.timelineEvents)))
    : [
        {
          title: String(props.content || "First milestone"),
          date: "",
          description: "Describe this event.",
        },
      ];
}
