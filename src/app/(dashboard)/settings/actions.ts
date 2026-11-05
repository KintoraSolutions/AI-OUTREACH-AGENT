"use server";

import { revalidatePath } from "next/cache";
import { Prisma, Role } from "@prisma/client";
import { prisma } from "@/lib/db";
import { PermissionError, requireRole } from "@/lib/auth/rbac";
import { fail, fieldErrorsFromZod, type FormState } from "@/lib/actions/form";
import { orgIdentitySchema } from "@/lib/validation/settings";
import { EMAIL_VOICE_SETTING_KEY, emailVoiceSchema } from "@/lib/ai/email-voice";
import { COMPANY_PROFILE_SETTING_KEY, companyProfileSchema } from "@/lib/ai/company-profile";
import {
  ORG_AI_PROFILE_SETTING_KEY,
  loadOrgAiProfile,
  orgAiProfileSchema,
  resolveOrgAiProfile,
} from "@/lib/ai/org-ai-profile";
import { getPreset } from "@/lib/ai/presets";

export async function updateOrgIdentity(_prev: FormState, formData: FormData): Promise<FormState> {
  let ctx;
  try {
    ctx = await requireRole(Role.ADMIN);
  } catch (e) {
    if (e instanceof PermissionError) return fail(e.message);
    throw e;
  }

  const raw = {
    name: formData.get("name"),
    companyName: formData.get("companyName"),
    portfolioUrl: formData.get("portfolioUrl"),
    contactUrl: formData.get("contactUrl"),
    senderName: formData.get("senderName"),
    senderEmail: formData.get("senderEmail"),
  };

  const parsed = orgIdentitySchema.safeParse(raw);
  if (!parsed.success) {
    return { ok: false, error: "Please fix the errors below.", fieldErrors: fieldErrorsFromZod(parsed.error) };
  }
  const d = parsed.data;

  await prisma.organization.update({
    where: { id: ctx.orgId },
    data: {
      name: d.name,
      companyName: d.companyName ?? null,
      portfolioUrl: d.portfolioUrl ?? null,
      contactUrl: d.contactUrl ?? null,
      senderName: d.senderName ?? null,
      senderEmail: d.senderEmail ?? null,
    },
  });

  revalidatePath("/settings");
  revalidatePath("/", "layout");
  return { ok: true, message: "Settings saved." };
}

export async function updateEmailVoice(_prev: FormState, formData: FormData): Promise<FormState> {
  let ctx;
  try {
    ctx = await requireRole(Role.ADMIN);
  } catch (e) {
    if (e instanceof PermissionError) return fail(e.message);
    throw e;
  }

  const parsed = emailVoiceSchema.safeParse({
    tone: formData.get("tone"),
    length: formData.get("length"),
    objective: formData.get("objective"),
    valueProp: formData.get("valueProp"),
    signatureEnabled: formData.get("signatureEnabled"),
    senderTitle: formData.get("senderTitle"),
    signOff: formData.get("signOff"),
    customInstructions: formData.get("customInstructions"),
  });
  if (!parsed.success) {
    return { ok: false, error: "Please fix the errors below.", fieldErrors: fieldErrorsFromZod(parsed.error) };
  }

  await prisma.systemSetting.upsert({
    where: { orgId_key: { orgId: ctx.orgId, key: EMAIL_VOICE_SETTING_KEY } },
    create: { orgId: ctx.orgId, key: EMAIL_VOICE_SETTING_KEY, value: parsed.data },
    update: { value: parsed.data },
  });

  revalidatePath("/settings");
  return { ok: true, message: "Email voice saved." };
}

export async function updateCompanyProfile(_prev: FormState, formData: FormData): Promise<FormState> {
  let ctx;
  try {
    ctx = await requireRole(Role.ADMIN);
  } catch (e) {
    if (e instanceof PermissionError) return fail(e.message);
    throw e;
  }

  const parsed = companyProfileSchema.safeParse({
    companyDescription: formData.get("companyDescription"),
    offer: formData.get("offer"),
    method: formData.get("method"),
    targetAudience: formData.get("targetAudience"),
    websiteUrl: formData.get("websiteUrl"),
    linkedinUrl: formData.get("linkedinUrl"),
    socialLinks: formData.get("socialLinks"),
  });
  if (!parsed.success) {
    return { ok: false, error: "Please fix the errors below.", fieldErrors: fieldErrorsFromZod(parsed.error) };
  }

  await prisma.systemSetting.upsert({
    where: { orgId_key: { orgId: ctx.orgId, key: COMPANY_PROFILE_SETTING_KEY } },
    create: { orgId: ctx.orgId, key: COMPANY_PROFILE_SETTING_KEY, value: parsed.data },
    update: { value: parsed.data },
  });

  revalidatePath("/settings");
  return { ok: true, message: "Company profile saved." };
}

/**
 * Save the organization's AI configuration. The offerings editor is a repeating
 * structure, so the form posts one JSON field — the same approach the scoring
 * rules form already uses. Preset and use-case guardrails are never stored here,
 * so this can only ever ADD restrictions, never remove one.
 */
export async function updateOrgAiProfile(_prev: FormState, formData: FormData): Promise<FormState> {
  let ctx;
  try {
    ctx = await requireRole(Role.ADMIN);
  } catch (e) {
    if (e instanceof PermissionError) return fail(e.message);
    throw e;
  }

  let raw: unknown;
  try {
    raw = JSON.parse(String(formData.get("profile") ?? "{}"));
  } catch {
    return fail("Could not read the submitted configuration.");
  }

  const parsed = orgAiProfileSchema.safeParse(raw);
  if (!parsed.success) {
    return { ok: false, error: "Please fix the errors below.", fieldErrors: fieldErrorsFromZod(parsed.error) };
  }

  const current = await loadOrgAiProfile(ctx.orgId);
  const next = resolveOrgAiProfile({
    preset: getPreset(parsed.data.presetKey),
    stored: { ...parsed.data, learned: current.learned, revision: current.revision + 1 },
  });

  const value = next as unknown as Prisma.InputJsonObject;
  await prisma.systemSetting.upsert({
    where: { orgId_key: { orgId: ctx.orgId, key: ORG_AI_PROFILE_SETTING_KEY } },
    create: { orgId: ctx.orgId, key: ORG_AI_PROFILE_SETTING_KEY, value },
    update: { value },
  });

  revalidatePath("/settings");
  revalidatePath("/leads");
  return {
    ok: true,
    message: "AI configuration saved. Re-score leads to apply new names to stored explanations.",
  };
}

export async function acknowledgeCompliance(): Promise<void> {
  const ctx = await requireRole(Role.ADMIN);
  await prisma.organization.update({
    where: { id: ctx.orgId },
    data: { complianceAckAt: new Date() },
  });
  revalidatePath("/settings");
}
