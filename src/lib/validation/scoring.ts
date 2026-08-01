import { z } from "zod";
import { Confidence, FindingCategory, RecommendedService } from "@prisma/client";

const emptyToUndef = (v: unknown) => (typeof v === "string" && v.trim() === "" ? undefined : v);

export const manualFindingSchema = z.object({
  category: z.nativeEnum(FindingCategory),
  finding: z.string().trim().min(3, "Describe the finding.").max(300),
  evidence: z.string().trim().min(3, "Provide supporting evidence.").max(1000),
  sourceUrl: z.preprocess(
    emptyToUndef,
    z.string().trim().url("Enter a valid source URL.").max(500).optional(),
  ),
  confidence: z.nativeEnum(Confidence),
  points: z.coerce.number().int().min(0).max(30),
  reason: z.string().trim().min(3, "A reason is required.").max(500),
});
export type ManualFindingInput = z.infer<typeof manualFindingSchema>;

export const scoreOverrideSchema = z
  .object({
    overrideOverall: z.preprocess(
      emptyToUndef,
      z.coerce.number().int().min(0).max(100).optional(),
    ),
    overrideService: z.preprocess(
      emptyToUndef,
      z.nativeEnum(RecommendedService).optional(),
    ),
    reason: z.string().trim().min(3, "A reason is required.").max(500),
  })
  .refine((d) => d.overrideOverall !== undefined || d.overrideService !== undefined, {
    message: "Set an override score, an override service, or both.",
    path: ["overrideOverall"],
  });
export type ScoreOverrideInput = z.infer<typeof scoreOverrideSchema>;

export const reasonSchema = z.object({
  reason: z.string().trim().min(3, "A reason is required.").max(500),
});
