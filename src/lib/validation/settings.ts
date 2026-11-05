import { z } from "zod";

const emptyToUndef = (v: unknown) =>
  typeof v === "string" && v.trim() === "" ? undefined : v;

const optStr = z.preprocess(emptyToUndef, z.string().trim().max(300).optional());
const optUrl = z.preprocess(
  emptyToUndef,
  z.string().trim().url("Enter a valid URL (including https://)").max(500).optional(),
);
const optEmail = z.preprocess(
  emptyToUndef,
  z.string().trim().email("Enter a valid email address").max(320).optional(),
);

export const orgIdentitySchema = z.object({
  name: z.string().trim().min(1, "Organization name is required").max(200),
  companyName: optStr,
  portfolioUrl: optUrl,
  contactUrl: optUrl,
  senderName: optStr,
  senderEmail: optEmail,
  // What the organization SELLS is configured in its AI profile offerings
  // (SystemSetting `ai.profile`), not as product-specific columns here.
});

export type OrgIdentityInput = z.infer<typeof orgIdentitySchema>;

// Data-retention window. 0 disables retention (keep everything); otherwise stale,
// unengaged research data older than this many days is eligible for purge. Capped
// at ~10 years so a typo can't set an unreasonable window.
export const retentionSchema = z.object({
  retentionDays: z.coerce
    .number()
    .int("Enter a whole number of days")
    .min(0, "Use 0 to disable retention, or a positive number of days")
    .max(3650, "Retention cannot exceed 3650 days (10 years)"),
});

export type RetentionInput = z.infer<typeof retentionSchema>;
