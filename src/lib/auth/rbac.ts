import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { Role } from "@prisma/client";
import { auth } from "@/auth";
import { prisma } from "@/lib/db";
import { PermissionError, roleAtLeast } from "@/lib/auth/roles";

export const ACTIVE_ORG_COOKIE = "active_org";

// Re-exported from the pure (server-import-free) roles module so existing
// imports from "@/lib/auth/rbac" keep working.
export { PermissionError, roleAtLeast } from "@/lib/auth/roles";

export interface OrgContext {
  userId: string;
  userName: string | null;
  userEmail: string;
  orgId: string;
  orgName: string;
  role: Role;
  memberships: { orgId: string; orgName: string; role: Role }[];
}

/**
 * Ensures the user belongs to at least one organization, creating a personal
 * org + OWNER membership on first login. Returns the user's memberships.
 */
async function ensureMemberships(userId: string, userName: string | null) {
  let memberships = await prisma.membership.findMany({
    where: { userId },
    include: { organization: { select: { id: true, name: true } } },
    orderBy: { createdAt: "asc" },
  });

  if (memberships.length === 0) {
    const orgName = userName ? `${userName}'s Organization` : "My Organization";
    const org = await prisma.organization.create({ data: { name: orgName } });
    await prisma.membership.create({
      data: { userId, orgId: org.id, role: Role.OWNER },
    });
    memberships = await prisma.membership.findMany({
      where: { userId },
      include: { organization: { select: { id: true, name: true } } },
      orderBy: { createdAt: "asc" },
    });
  }

  return memberships;
}

/**
 * Resolves the current user and active organization. Returns null if the user
 * is not signed in. Bootstraps a personal org on first login. Does not set
 * cookies (only a Server Action or Route Handler may switch the active org).
 */
export async function getOrgContext(): Promise<OrgContext | null> {
  const session = await auth();
  const userId = session?.user?.id;
  if (!userId) return null;

  const user = await prisma.user.findUnique({ where: { id: userId } });
  if (!user) return null;

  const memberships = await ensureMemberships(user.id, user.name);

  const cookieStore = await cookies();
  const requestedOrgId = cookieStore.get(ACTIVE_ORG_COOKIE)?.value;
  const active =
    memberships.find((m) => m.orgId === requestedOrgId) ?? memberships[0]!;

  return {
    userId: user.id,
    userName: user.name,
    userEmail: user.email,
    orgId: active.orgId,
    orgName: active.organization.name,
    role: active.role,
    memberships: memberships.map((m) => ({
      orgId: m.orgId,
      orgName: m.organization.name,
      role: m.role,
    })),
  };
}

/** Redirects to /signin when not authenticated; otherwise returns the context. */
export async function requireOrgContext(): Promise<OrgContext> {
  const ctx = await getOrgContext();
  if (!ctx) redirect("/signin");
  return ctx;
}

/** Like requireOrgContext but throws PermissionError if role is below `min`. */
export async function requireRole(min: Role): Promise<OrgContext> {
  const ctx = await requireOrgContext();
  if (!roleAtLeast(ctx.role, min)) {
    throw new PermissionError();
  }
  return ctx;
}
