import { z } from "zod";
export const errorHandlerSchema = z.object({
  logErrors: z.boolean().default(true),
  fallbackMessage: z
    .string()
    .min(1)
    .max(240)
    .default("The request could not be completed."),
  rules: z
    .array(
      z.object({
        kind: z.enum([
          "validation",
          "conflict",
          "not_found",
          "forbidden",
          "unauthorized",
          "unavailable",
          "internal",
        ]),
        status: z.number().int().min(400).max(599),
        message: z.string().min(1).max(240),
      }),
    )
    .max(7)
    .default([]),
});
export const auditLogSchema = z.object({
  transactionEvents: z.boolean().default(true),
  event: z
    .string()
    .regex(/^[a-zA-Z][a-zA-Z0-9_.-]{0,79}$/)
    .default("application.request"),
  endpointIds: z
    .array(z.string().regex(/^[a-zA-Z0-9_-]+$/))
    .max(1000)
    .default([]),
  includeReads: z.boolean().default(false),
  recordActor: z.boolean().default(true),
  recordTenant: z.boolean().default(true),
  retentionDays: z.number().int().min(1).max(3650).default(90),
  failClosed: z.boolean().default(true),
});
export type ErrorHandlerConfig = z.infer<typeof errorHandlerSchema>;
export type AuditLogConfig = z.infer<typeof auditLogSchema>;
