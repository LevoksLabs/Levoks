import { z } from "zod";

export const submissionNotificationSchema = z.object({
  endpointId: z.string().max(120),
  queryId: z.string().max(120),
  modelId: z.string().max(120),
  inboxEndpointId: z.string().max(120),
  enabled: z.boolean(),
  subject: z
    .string()
    .trim()
    .min(1)
    .max(160)
    .regex(/^[^\r\n\x00-\x1f\x7f]+$/),
});
export type SubmissionNotificationConfig = z.infer<
  typeof submissionNotificationSchema
>;
export const DEFAULT_SUBMISSION_NOTIFICATION: SubmissionNotificationConfig = {
  endpointId: "",
  queryId: "",
  modelId: "",
  inboxEndpointId: "",
  enabled: true,
  subject: "New website submission",
};
