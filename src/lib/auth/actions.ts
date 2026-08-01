"use server";

import { cookies } from "next/headers";
import { revalidatePath } from "next/cache";
import { signOut } from "@/auth";
import { ACTIVE_ORG_COOKIE, getOrgContext } from "@/lib/auth/rbac";

/** Sign the current user out and return to the sign-in page. */
export async function signOutAction(): Promise<void> {
  await signOut({ redirectTo: "/signin" });
}

/** Switch the active organization for the current user. */
export async function switchOrg(orgId: string): Promise<void> {
  const ctx = await getOrgContext();
  if (!ctx) return;
  const isMember = ctx.memberships.some((m) => m.orgId === orgId);
  if (!isMember) return;

  const cookieStore = await cookies();
  cookieStore.set(ACTIVE_ORG_COOKIE, orgId, {
    httpOnly: true,
    sameSite: "lax",
    path: "/",
    maxAge: 60 * 60 * 24 * 365,
  });
  revalidatePath("/", "layout");
}
