"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { Prisma, Role } from "@prisma/client";
import { z } from "zod";
import { prisma } from "@/lib/db";
import { PermissionError, requireRole } from "@/lib/auth/rbac";
import { fail, fieldErrorsFromZod, type FormState } from "@/lib/actions/form";
import { emailVoiceSchema, EMAIL_VOICE_SETTING_KEY } from "@/lib/ai/email-voice";
import { companyProfileSchema, COMPANY_PROFILE_SETTING_KEY } from "@/lib/ai/company-profile";
import {
  ORG_AI_PROFILE_SETTING_KEY,
  orgAiProfileSchema,
  resolveOrgAiProfile,
  type OrgAiProfile,
} from "@/lib/ai/org-ai-profile";
import { DEFAULT_PRESET_KEY, getPreset } from "@/lib/ai/presets";
import { inferOrgAiProfile } from "@/lib/ai/infer-profile";
import { getAiProvider } from "@/lib/ai/provider";

/**
 * First-run onboarding. Collects the sender identity, the company profile
 * (what you do / sell / how / who you target), and the email voice in one form,
 * then persists all three and marks the org onboarded (writing the
 * `company.profile` row is itself the onboarding gate — see `isOrgOnboarded`).
 *
 * Both `completeOnboarding` and `skipOnboarding` write that row, so the user is
 * never routed back through onboarding once past it. Everything remains editable
 * afterwards in Settings.
 */

const emptyToUndef = (v: unknown) => (typeof v === "string" && v.trim() === "" ? undefined : v);

const identitySchema = z.object({
  companyName: z.preprocess(emptyToUndef, z.string().trim().max(300).optional()),
  senderName: z.preprocess(emptyToUndef, z.string().trim().max(300).optional()),
  senderEmail: z.preprocess(
    emptyToUndef,
    z.string().trim().email("Enter a valid email address").max(320).optional(),
  ),
});

export async function completeOnboarding(_prev: FormState, formData: FormData): Promise<FormState> {
  let ctx;
  try {
    ctx = await requireRole(Role.ADMIN);
  } catch (e) {
    if (e instanceof PermissionError) return fail(e.message);
    throw e;
  }

  const identity = identitySchema.safeParse({
    companyName: formData.get("companyName"),
    senderName: formData.get("senderName"),
    senderEmail: formData.get("senderEmail"),
  });
  const profile = companyProfileSchema.safeParse({
    companyDescription: formData.get("companyDescription"),
    offer: formData.get("offer"),
    method: formData.get("method"),
    targetAudience: formData.get("targetAudience"),
    websiteUrl: formData.get("websiteUrl"),
    linkedinUrl: formData.get("linkedinUrl"),
    socialLinks: formData.get("socialLinks"),
  });
  const voice = emailVoiceSchema.safeParse({
    tone: formData.get("tone"),
    length: formData.get("length"),
    objective: formData.get("objective"),
    valueProp: formData.get("valueProp"),
    signatureEnabled: formData.get("signatureEnabled"),
    senderTitle: formData.get("senderTitle"),
    signOff: formData.get("signOff"),
    customInstructions: formData.get("customInstructions"),
  });

  if (!identity.success) {
    return { ok: false, error: "Please fix the errors below.", fieldErrors: fieldErrorsFromZod(identity.error) };
  }
  // Profile/voice fields are all optional/defaulted, so they parse; guard anyway.
  if (!profile.success || !voice.success) {
    return { ok: false, error: "Something went wrong. Please try again." };
  }

  const id = identity.data;
  await prisma.$transaction([
    prisma.organization.update({
      where: { id: ctx.orgId },
      data: {
        // Use the company name as the org's display name on first setup.
        ...(id.companyName ? { name: id.companyName } : {}),
        companyName: id.companyName ?? null,
        senderName: id.senderName ?? null,
        senderEmail: id.senderEmail ?? null,
      },
    }),
    prisma.systemSetting.upsert({
      where: { orgId_key: { orgId: ctx.orgId, key: COMPANY_PROFILE_SETTING_KEY } },
      create: { orgId: ctx.orgId, key: COMPANY_PROFILE_SETTING_KEY, value: profile.data },
      update: { value: profile.data },
    }),
    prisma.systemSetting.upsert({
      where: { orgId_key: { orgId: ctx.orgId, key: EMAIL_VOICE_SETTING_KEY } },
      create: { orgId: ctx.orgId, key: EMAIL_VOICE_SETTING_KEY, value: voice.data },
      update: { value: voice.data },
    }),
  ]);

  // Inference runs AFTER the answers are safely committed, so a slow or failing
  // model call can never lose what the user typed.
  const preset = getPreset(String(formData.get("industry") ?? DEFAULT_PRESET_KEY));
  let inferred: Partial<OrgAiProfile> | null = null;
  let model: string | null = null;
  try {
    const result = await inferOrgAiProfile({
      provider: getAiProvider(),
      companyName: id.companyName ?? null,
      company: profile.data,
      objective: voice.data.objective,
      preset,
    });
    inferred = result?.patch ?? null;
    model = result?.model ?? null;
  } catch {
    // Unreachable config or a bad model response must not block setup; the
    // review step shows the preset defaults and offers a retry.
    inferred = null;
  }

  const aiProfile = resolveOrgAiProfile({
    preset,
    inferred,
    stored: { revision: 1, inferred: { at: new Date().toISOString(), model } },
  });

  await prisma.systemSetting.upsert({
    where: { orgId_key: { orgId: ctx.orgId, key: ORG_AI_PROFILE_SETTING_KEY } },
    create: {
      orgId: ctx.orgId,
      key: ORG_AI_PROFILE_SETTING_KEY,
      value: aiProfile as unknown as Prisma.InputJsonObject,
    },
    update: { value: aiProfile as unknown as Prisma.InputJsonObject },
  });

  revalidatePath("/", "layout");
  redirect("/onboarding/review");
}

/** Confirm (and optionally edit) the AI configuration proposed at onboarding. */
export async function confirmOrgAiProfile(_prev: FormState, formData: FormData): Promise<FormState> {
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
  if (!parsed.success) return fail("Please fix the errors below.");

  const next = resolveOrgAiProfile({
    preset: getPreset(parsed.data.presetKey),
    stored: { ...parsed.data, confirmedAt: new Date().toISOString() },
  });

  await prisma.systemSetting.upsert({
    where: { orgId_key: { orgId: ctx.orgId, key: ORG_AI_PROFILE_SETTING_KEY } },
    create: {
      orgId: ctx.orgId,
      key: ORG_AI_PROFILE_SETTING_KEY,
      value: next as unknown as Prisma.InputJsonObject,
    },
    update: { value: next as unknown as Prisma.InputJsonObject },
  });

  revalidatePath("/", "layout");
  redirect("/dashboard");
}

export async function skipOnboarding(): Promise<void> {
  const ctx = await requireRole(Role.ADMIN);
  // Writing an (empty) profile row marks the org onboarded so it is not routed
  // here again; the user can fill everything in later from Settings.
  await prisma.systemSetting.upsert({
    where: { orgId_key: { orgId: ctx.orgId, key: COMPANY_PROFILE_SETTING_KEY } },
    create: {
      orgId: ctx.orgId,
      key: COMPANY_PROFILE_SETTING_KEY,
      value: { companyDescription: null, offer: null, method: null, targetAudience: null, websiteUrl: null, linkedinUrl: null, socialLinks: [] },
    },
    update: {},
  });
  revalidatePath("/", "layout");
  redirect("/dashboard");
}
