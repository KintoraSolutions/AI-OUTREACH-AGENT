import { z } from "zod";

export const editDraftSchema = z.object({
  subject: z.string().trim().min(1, "Subject is required.").max(200),
  body: z.string().trim().min(1, "Body is required.").max(4000),
});
export type EditDraftInput = z.infer<typeof editDraftSchema>;

export const rejectDraftSchema = z.object({
  reason: z.string().trim().min(3, "A reason is required.").max(500),
});
