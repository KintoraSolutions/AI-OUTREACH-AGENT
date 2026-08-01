"use server";

import { revalidatePath } from "next/cache";
import { Role } from "@prisma/client";
import { prisma } from "@/lib/db";
import { PermissionError, requireRole } from "@/lib/auth/rbac";
import { fail, fieldErrorsFromZod, type FormState } from "@/lib/actions/form";
import { orgIdentitySchema } from "@/lib/validation/settings";

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
    klearqProductName: formData.get("klearqProductName"),
    klearqTagline: formData.get("klearqTagline"),
    klearqUrl: formData.get("klearqUrl"),
    klearqCapabilities: formData.get("klearqCapabilities"),
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
      klearqProductName: d.klearqProductName ?? null,
      klearqTagline: d.klearqTagline ?? null,
      klearqUrl: d.klearqUrl ?? null,
      klearqCapabilities: d.klearqCapabilities,
    },
  });

  revalidatePath("/settings");
  revalidatePath("/", "layout");
  return { ok: true, message: "Settings saved." };
}

export async function acknowledgeCompliance(): Promise<void> {
  const ctx = await requireRole(Role.ADMIN);
  await prisma.organization.update({
    where: { id: ctx.orgId },
    data: { complianceAckAt: new Date() },
  });
  revalidatePath("/settings");
}
