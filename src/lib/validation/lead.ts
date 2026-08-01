import { z } from "zod";
import { FollowUpPriority, PipelineStage } from "@prisma/client";

const emptyToUndef = (v: unknown) =>
  typeof v === "string" && v.trim() === "" ? undefined : v;

const optStr = z.preprocess(emptyToUndef, z.string().trim().max(500).optional());
const optUrl = z.preprocess(
  emptyToUndef,
  z.string().trim().url("Enter a valid URL (including https://)").max(500).optional(),
);
const optEmail = z.preprocess(
  emptyToUndef,
  z.string().trim().email("Enter a valid email address").max(320).optional(),
);
const checkbox = z.preprocess(
  (v) => v === "on" || v === "true" || v === true,
  z.boolean(),
);

export const clinicCoreSchema = z.object({
  name: z.string().trim().min(1, "Clinic name is required").max(200),
  category: optStr,
  websiteUrl: optUrl,
  mainPhone: optStr,
  publicEmail: optEmail,
  contactPageUrl: optUrl,
  bookingMethod: optStr,
  onlineBookingUrl: optUrl,
  locationCount: z.coerce
    .number()
    .int("Must be a whole number")
    .min(1, "At least one location")
    .max(1000)
    .default(1),
});

export const leadCreateSchema = clinicCoreSchema.extend({
  stage: z.nativeEnum(PipelineStage).default(PipelineStage.DISCOVERED),
  doNotContact: checkbox.default(false),
  isTestData: checkbox.default(false),
  primaryAddress: optStr,
  contactName: optStr,
  contactTitle: optStr,
  contactEmail: optEmail,
  contactPhone: optStr,
  note: z.preprocess(emptyToUndef, z.string().trim().max(2000).optional()),
});

export const leadEditSchema = clinicCoreSchema.extend({
  stage: z.nativeEnum(PipelineStage),
  doNotContact: checkbox.default(false),
  followUpDate: z.preprocess(
    emptyToUndef,
    z.coerce.date().optional(),
  ),
});

export const stageUpdateSchema = z.object({
  stage: z.nativeEnum(PipelineStage),
});

export const bulkStageSchema = z.object({
  ids: z.array(z.string().min(1)).min(1, "Select at least one lead"),
  stage: z.nativeEnum(PipelineStage),
});

export const noteSchema = z.object({
  note: z.string().trim().min(1, "Note cannot be empty").max(2000),
});

export const followUpSchema = z.object({
  title: optStr,
  dueDate: z.coerce.date({ message: "Enter a valid date and time" }),
  note: z.preprocess(emptyToUndef, z.string().trim().max(1000).optional()),
  priority: z.nativeEnum(FollowUpPriority).default(FollowUpPriority.MEDIUM),
  assigneeId: optStr,
  addToCalendar: checkbox.default(false),
});

export const doNotContactSchema = z.object({
  value: z.preprocess((v) => v === "true" || v === true || v === "on", z.boolean()),
});

export const contactSchema = z.object({
  name: optStr,
  jobTitle: optStr,
  email: optEmail,
  phone: optStr,
  isDecisionMaker: checkbox.default(false),
}).refine((c) => c.name || c.email || c.phone, {
  message: "Provide at least a name, email, or phone",
  path: ["name"],
});

export const locationSchema = z.object({
  label: optStr,
  address: optStr,
  phone: optStr,
}).refine((l) => l.address || l.label, {
  message: "Provide an address or a label",
  path: ["address"],
});

export type LeadCreateInput = z.infer<typeof leadCreateSchema>;
export type LeadEditInput = z.infer<typeof leadEditSchema>;

/** A single CSV import row after mapping known headers. */
export const csvLeadRowSchema = z.object({
  name: z.string().trim().min(1).max(200),
  category: optStr,
  websiteUrl: z.preprocess(emptyToUndef, z.string().trim().max(500).optional()),
  mainPhone: optStr,
  publicEmail: z.preprocess(emptyToUndef, z.string().trim().max(320).optional()),
  contactPageUrl: z.preprocess(emptyToUndef, z.string().trim().max(500).optional()),
  bookingMethod: optStr,
  address: optStr,
  contactName: optStr,
  contactTitle: optStr,
  contactEmail: z.preprocess(emptyToUndef, z.string().trim().max(320).optional()),
});

export type CsvLeadRow = z.infer<typeof csvLeadRowSchema>;
