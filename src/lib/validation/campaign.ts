import { z } from "zod";
import { CLINIC_CATEGORIES } from "@/lib/leads/constants";

/**
 * Validation for search-campaign creation. Keyword lists arrive as free text
 * (comma- or newline-separated) and are normalized to string arrays; categories
 * arrive as repeated form fields and are validated against the known list.
 */

const emptyToUndef = (v: unknown) =>
  typeof v === "string" && v.trim() === "" ? undefined : v;

const optStr = z.preprocess(emptyToUndef, z.string().trim().max(120).optional());

const keywordList = z.preprocess((v) => {
  if (Array.isArray(v)) return v;
  if (typeof v === "string") {
    return v
      .split(/[\n,]/)
      .map((s) => s.trim())
      .filter(Boolean);
  }
  return [];
}, z.array(z.string().trim().min(1).max(60)).max(25));

const categories = z.preprocess(
  (v) => (Array.isArray(v) ? v : v == null || v === "" ? [] : [v]),
  z
    .array(z.enum(CLINIC_CATEGORIES as [string, ...string[]]))
    .min(1, "Select at least one clinic category")
    .max(CLINIC_CATEGORIES.length),
);

export const campaignCreateSchema = z.object({
  name: z.string().trim().min(1, "Give the campaign a name").max(120),
  categories,
  city: optStr,
  region: optStr,
  country: optStr,
  radiusKm: z.preprocess(
    emptyToUndef,
    z.coerce.number().min(1, "At least 1 km").max(500, "At most 500 km").optional(),
  ),
  minLocations: z.coerce.number().int().min(1, "At least 1").max(100).default(1),
  maxLeads: z.coerce
    .number()
    .int()
    .min(1, "At least 1 lead")
    .max(200, "At most 200 leads per campaign")
    .default(25),
  requiredKeywords: keywordList,
  excludedKeywords: keywordList,
});

export type CampaignCreateInput = z.infer<typeof campaignCreateSchema>;
