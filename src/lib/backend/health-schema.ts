import { z } from "zod";

export const healthSchema = z.object({
  route: z
    .string()
    .regex(/^\/[a-zA-Z0-9/_-]+$/)
    .max(160)
    .default("/health/ready"),
  checkDatabase: z.boolean().default(true),
  timeoutMs: z.number().int().min(100).max(10000).default(2000),
  cacheMs: z.number().int().min(0).max(30000).default(1000),
  serviceIds: z
    .array(z.string().regex(/^[a-zA-Z0-9_-]+$/))
    .max(20)
    .default([]),
});
export type HealthConfig = z.infer<typeof healthSchema>;
