import { Role } from "@prisma/client";

/**
 * Pure role-hierarchy helpers, deliberately free of any server-only imports
 * (no next/headers, next-auth, or Prisma client) so they can be unit-tested and
 * reused from anywhere. rbac.ts re-exports these alongside its session helpers.
 *
 * Hierarchy: VIEWER < MEMBER < ADMIN < OWNER.
 */
const ROLE_RANK: Record<Role, number> = {
  VIEWER: 0,
  MEMBER: 1,
  ADMIN: 2,
  OWNER: 3,
};

export function roleAtLeast(role: Role, min: Role): boolean {
  return ROLE_RANK[role] >= ROLE_RANK[min];
}

export class PermissionError extends Error {
  constructor(message = "You do not have permission to perform this action.") {
    super(message);
    this.name = "PermissionError";
  }
}
