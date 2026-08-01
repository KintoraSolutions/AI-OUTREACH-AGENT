"use server";

import { revalidatePath } from "next/cache";
import { Role } from "@prisma/client";
import { prisma } from "@/lib/db";
import { OrgContext, PermissionError, requireRole } from "@/lib/auth/rbac";
import { fail, fieldErrorsFromZod, type FormState } from "@/lib/actions/form";
import { retentionSchema } from "@/lib/validation/settings";
import { runRetentionForOrg } from "@/lib/retention/retention";

async function ctxOrError(min: Role): Promise<{ ctx: OrgContext } | { error: FormState }> {
  try {
    return { ctx: await requireRole(min) };
  } catch (e) {
    if (e instanceof PermissionError) return { error: fail(e.message) };
    throw e;
  }
}

/** Update the org's data-retention window (admins only). */
export async function updateRetentionAction(_prev: FormState, formData: FormData): Promise<FormState> {
  const guard = await ctxOrError(Role.ADMIN);
  if ("error" in guard) return guard.error;
  const { ctx } = guard;

  const parsed = retentionSchema.safeParse({ retentionDays: formData.get("retentionDays") });
  if (!parsed.success) {
    return { ok: false, error: "Please fix the errors below.", fieldErrors: fieldErrorsFromZod(parsed.error) };
  }

  await prisma.organization.update({
    where: { id: ctx.orgId },
    data: { retentionDays: parsed.data.retentionDays },
  });
  revalidatePath("/settings");
  return {
    ok: true,
    message:
      parsed.data.retentionDays === 0
        ? "Retention disabled. No data will be purged."
        : `Retention set to ${parsed.data.retentionDays} days.`,
  };
}

/**
 * Preview what a purge would remove right now, deleting nothing (admins only).
 * Writes a DRY_RUN audit record.
 */
export async function retentionDryRunAction(): Promise<FormState> {
  const guard = await ctxOrError(Role.ADMIN);
  if ("error" in guard) return guard.error;
  const { ctx } = guard;

  const org = await prisma.organization.findUnique({
    where: { id: ctx.orgId },
    select: { retentionDays: true },
  });
  if (!org) return fail("Organization not found.");

  const summary = await runRetentionForOrg(prisma, {
    orgId: ctx.orgId,
    retentionDays: org.retentionDays,
    now: new Date(),
    dryRun: true,
    actorId: ctx.userId,
    actorName: ctx.userName,
  });
  revalidatePath("/settings");
  return { ok: true, message: summary.message ?? "Dry run complete." };
}

/**
 * Run the purge now (admins only). Irreversibly deletes stale, unengaged data;
 * active/engaged records are always protected. Writes a COMPLETED audit record.
 */
export async function retentionPurgeAction(): Promise<FormState> {
  const guard = await ctxOrError(Role.ADMIN);
  if ("error" in guard) return guard.error;
  const { ctx } = guard;

  const org = await prisma.organization.findUnique({
    where: { id: ctx.orgId },
    select: { retentionDays: true },
  });
  if (!org) return fail("Organization not found.");

  try {
    const summary = await runRetentionForOrg(prisma, {
      orgId: ctx.orgId,
      retentionDays: org.retentionDays,
      now: new Date(),
      dryRun: false,
      actorId: ctx.userId,
      actorName: ctx.userName,
    });
    revalidatePath("/settings");
    revalidatePath("/leads");
    revalidatePath("/dashboard");
    return { ok: true, message: summary.message ?? "Purge complete." };
  } catch (e) {
    return fail(e instanceof Error ? e.message : "The purge failed. See retention history.");
  }
}
