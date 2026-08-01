"use server";

import { revalidatePath } from "next/cache";
import { Role } from "@prisma/client";
import { OrgContext, PermissionError, requireRole } from "@/lib/auth/rbac";
import { fail, type FormState } from "@/lib/actions/form";
import {
  disconnectConnection,
  setDefaultSender,
} from "@/lib/integrations/google-connections";

async function ctxOrError(min: Role): Promise<{ ctx: OrgContext } | { error: FormState }> {
  try {
    return { ctx: await requireRole(min) };
  } catch (e) {
    if (e instanceof PermissionError) return { error: fail(e.message) };
    throw e;
  }
}

/** Disconnect the signed-in user's own Google account (revoke + delete tokens). */
export async function disconnectGoogleAction(): Promise<FormState> {
  const guard = await ctxOrError(Role.MEMBER);
  if ("error" in guard) return guard.error;
  const { ctx } = guard;

  const removed = await disconnectConnection(ctx.orgId, ctx.userId);
  revalidatePath("/settings");
  return removed
    ? { ok: true, message: "Google account disconnected." }
    : fail("No Google account was connected.");
}

/** Set an org-wide authorized default sender (admins only). */
export async function setDefaultSenderAction(connectionId: string): Promise<FormState> {
  const guard = await ctxOrError(Role.ADMIN);
  if ("error" in guard) return guard.error;
  const { ctx } = guard;

  const ok = await setDefaultSender(ctx.orgId, connectionId);
  revalidatePath("/settings");
  return ok
    ? { ok: true, message: "Default sender updated." }
    : fail("That connection is not available to set as default sender.");
}
