"use server";

import { revalidatePath } from "next/cache";
import { ActivityType, Role } from "@prisma/client";
import { z } from "zod";
import { prisma } from "@/lib/db";
import { PermissionError, requireRole } from "@/lib/auth/rbac";
import { fail, type FormState } from "@/lib/actions/form";

/**
 * In-place repairs for the issues the pre-launch review surfaces.
 *
 * The point is that a missing website or email never sends anyone out of the
 * campaign and into the leads database to hunt for one record. Each action
 * takes a single clinic, is org-scoped, and revalidates the campaign screens so
 * the issue list and the cost estimate both reflect the fix immediately.
 *
 * These deliberately do NOT reuse `updateLead`: that takes the full lead edit
 * form and would blank every field absent from a one-input fix.
 */

async function adminOrError(): Promise<{ orgId: string; userId: string; name: string | null } | { error: FormState }> {
  try {
    const ctx = await requireRole(Role.MEMBER);
    return { orgId: ctx.orgId, userId: ctx.userId, name: ctx.userName };
  } catch (e) {
    if (e instanceof PermissionError) return { error: fail(e.message) };
    throw e;
  }
}

/** Confirm the clinic belongs to the caller's org before touching it. */
async function ownedClinic(orgId: string, clinicId: string) {
  return prisma.clinic.findFirst({
    where: { id: clinicId, orgId },
    select: { id: true, name: true, campaignId: true },
  });
}

function revalidateFor(campaignId: string | null, clinicId: string) {
  if (campaignId) {
    revalidatePath(`/campaigns/${campaignId}/review`);
    revalidatePath(`/campaigns/${campaignId}`);
  }
  revalidatePath(`/leads/${clinicId}`);
  revalidatePath("/leads");
}

const websiteSchema = z
  .string()
  .trim()
  .min(1, "Enter a website address")
  .max(500)
  .transform((v) => (/^https?:\/\//i.test(v) ? v : `https://${v}`))
  .pipe(z.string().url("Enter a valid website address"));

/**
 * Set a lead's website so research has something to audit.
 *
 * A bare domain is accepted and normalized to https:// — asking someone to type
 * a scheme to clear a validation error is exactly the friction this screen is
 * meant to remove. The stored URL still goes through the research pipeline's own
 * SSRF guard when it is actually fetched.
 */
export async function setLeadWebsiteAction(clinicId: string, value: string): Promise<FormState> {
  const guard = await adminOrError();
  if ("error" in guard) return guard.error;

  const parsed = websiteSchema.safeParse(value);
  if (!parsed.success) return fail(parsed.error.issues[0]?.message ?? "Enter a valid website address");

  const clinic = await ownedClinic(guard.orgId, clinicId);
  if (!clinic) return fail("Lead not found.");

  await prisma.clinic.update({
    where: { id: clinic.id },
    data: { websiteUrl: parsed.data },
  });
  await prisma.outreachActivity.create({
    data: {
      clinicId: clinic.id,
      type: ActivityType.LEAD_UPDATED,
      actorId: guard.userId,
      actorName: guard.name,
      note: `Website set to ${parsed.data} during campaign review.`,
    },
  });

  revalidateFor(clinic.campaignId, clinic.id);
  return { ok: true, message: `Website saved for ${clinic.name}.` };
}

const emailSchema = z
  .string()
  .trim()
  .min(1, "Enter an email address")
  .max(320)
  .email("Enter a valid email address");

/**
 * Set a lead's public email so an approved draft has somewhere to go.
 *
 * Written to `Clinic.publicEmail` rather than as a new Contact: the review
 * screen asks for one address, and inventing a contact record with no name or
 * role from a single input would put a half-populated person in the CRM.
 * `loadDraftContext` falls back to `publicEmail`, so this is enough to clear the
 * issue.
 */
export async function setLeadEmailAction(clinicId: string, value: string): Promise<FormState> {
  const guard = await adminOrError();
  if ("error" in guard) return guard.error;

  const parsed = emailSchema.safeParse(value);
  if (!parsed.success) return fail(parsed.error.issues[0]?.message ?? "Enter a valid email address");

  const clinic = await ownedClinic(guard.orgId, clinicId);
  if (!clinic) return fail("Lead not found.");

  await prisma.clinic.update({
    where: { id: clinic.id },
    data: { publicEmail: parsed.data },
  });
  await prisma.outreachActivity.create({
    data: {
      clinicId: clinic.id,
      type: ActivityType.LEAD_UPDATED,
      actorId: guard.userId,
      actorName: guard.name,
      note: `Email address added during campaign review.`,
    },
  });

  revalidateFor(clinic.campaignId, clinic.id);
  return { ok: true, message: `Email saved for ${clinic.name}.` };
}

/**
 * Exclude a lead from the run without leaving the review.
 *
 * The honest alternative to fixing a lead you cannot fix: mark it do-not-contact
 * and it stops being counted as an outstanding issue.
 */
export async function excludeLeadAction(clinicId: string): Promise<FormState> {
  const guard = await adminOrError();
  if ("error" in guard) return guard.error;

  const clinic = await ownedClinic(guard.orgId, clinicId);
  if (!clinic) return fail("Lead not found.");

  await prisma.clinic.update({
    where: { id: clinic.id },
    data: { doNotContact: true },
  });
  await prisma.outreachActivity.create({
    data: {
      clinicId: clinic.id,
      type: ActivityType.DO_NOT_CONTACT_SET,
      actorId: guard.userId,
      actorName: guard.name,
      note: "Excluded from the campaign during review.",
    },
  });

  revalidateFor(clinic.campaignId, clinic.id);
  return { ok: true, message: `${clinic.name} excluded from this campaign.` };
}
