"use server";

import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/db";
import { requireOrgContext } from "@/lib/auth/rbac";
import { fail, type FormState } from "@/lib/actions/form";

/**
 * Saved views are per-user lead-table filter presets, scoped to the active org.
 * Any signed-in member (including VIEWER) may manage their OWN views; a user can
 * never see or delete another user's views.
 */

const MAX_NAME = 60;
const MAX_PARAMS = 2000;
const MAX_VIEWS_PER_USER = 50;

/** Save (or update) the current lead-table filters under a name. */
export async function saveViewAction(name: string, params: string): Promise<FormState> {
  const ctx = await requireOrgContext();

  const trimmed = (name ?? "").trim();
  if (!trimmed) return fail("Enter a name for this view.");
  if (trimmed.length > MAX_NAME) return fail(`Name must be ${MAX_NAME} characters or fewer.`);
  const cleanParams = (params ?? "").slice(0, MAX_PARAMS);

  const isNew = !(await prisma.savedView.findUnique({
    where: { orgId_userId_name: { orgId: ctx.orgId, userId: ctx.userId, name: trimmed } },
    select: { id: true },
  }));
  if (isNew) {
    const count = await prisma.savedView.count({ where: { orgId: ctx.orgId, userId: ctx.userId } });
    if (count >= MAX_VIEWS_PER_USER) {
      return fail(`You can save up to ${MAX_VIEWS_PER_USER} views. Delete one first.`);
    }
  }

  await prisma.savedView.upsert({
    where: { orgId_userId_name: { orgId: ctx.orgId, userId: ctx.userId, name: trimmed } },
    create: { orgId: ctx.orgId, userId: ctx.userId, name: trimmed, params: cleanParams },
    update: { params: cleanParams },
  });

  revalidatePath("/leads");
  return { ok: true, message: `Saved view "${trimmed}".` };
}

/** Delete one of the current user's saved views. */
export async function deleteViewAction(id: string): Promise<FormState> {
  const ctx = await requireOrgContext();
  // Scoped by userId AND orgId so a user can only delete their own view.
  const res = await prisma.savedView.deleteMany({
    where: { id, orgId: ctx.orgId, userId: ctx.userId },
  });
  revalidatePath("/leads");
  return res.count > 0 ? { ok: true, message: "View deleted." } : fail("View not found.");
}
