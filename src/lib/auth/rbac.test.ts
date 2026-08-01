import { describe, it, expect } from "vitest";
import { Role } from "@prisma/client";
import { roleAtLeast, PermissionError } from "@/lib/auth/roles";

/**
 * Negative-access policy: the role hierarchy is VIEWER < MEMBER < ADMIN < OWNER.
 * These assertions pin the exact allow/deny matrix that `requireRole(min)` uses
 * to gate every server action, so a weakening of the policy fails the suite.
 */
describe("roleAtLeast — role hierarchy", () => {
  const cases: [Role, Role, boolean][] = [
    // VIEWER can only read (never meets MEMBER/ADMIN/OWNER).
    [Role.VIEWER, Role.VIEWER, true],
    [Role.VIEWER, Role.MEMBER, false],
    [Role.VIEWER, Role.ADMIN, false],
    [Role.VIEWER, Role.OWNER, false],
    // MEMBER can create/edit but never approve/run/settings (ADMIN+).
    [Role.MEMBER, Role.VIEWER, true],
    [Role.MEMBER, Role.MEMBER, true],
    [Role.MEMBER, Role.ADMIN, false],
    [Role.MEMBER, Role.OWNER, false],
    // ADMIN can do everything except owner-only actions.
    [Role.ADMIN, Role.MEMBER, true],
    [Role.ADMIN, Role.ADMIN, true],
    [Role.ADMIN, Role.OWNER, false],
    // OWNER meets every requirement.
    [Role.OWNER, Role.VIEWER, true],
    [Role.OWNER, Role.MEMBER, true],
    [Role.OWNER, Role.ADMIN, true],
    [Role.OWNER, Role.OWNER, true],
  ];

  it.each(cases)("role %s meeting min %s -> %s", (role, min, expected) => {
    expect(roleAtLeast(role, min)).toBe(expected);
  });

  it("VIEWER is denied every mutating tier", () => {
    for (const min of [Role.MEMBER, Role.ADMIN, Role.OWNER]) {
      expect(roleAtLeast(Role.VIEWER, min)).toBe(false);
    }
  });

  it("MEMBER is denied every admin-only tier", () => {
    for (const min of [Role.ADMIN, Role.OWNER]) {
      expect(roleAtLeast(Role.MEMBER, min)).toBe(false);
    }
  });
});

describe("PermissionError", () => {
  it("carries a name and a default message", () => {
    const e = new PermissionError();
    expect(e.name).toBe("PermissionError");
    expect(e.message.length).toBeGreaterThan(0);
  });
});
