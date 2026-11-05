import { describe, expect, it } from "vitest";
import { decideSignIn, type SignInPolicyInput } from "@/lib/auth/sign-in-policy";

/**
 * Before this policy existed there was no `signIn` callback, so any Google
 * account on the internet could sign in and — via the first-login bootstrap —
 * receive its own organization with an OWNER membership. These lock the two
 * properties that matter: a stranger cannot get in, and the operator cannot be
 * locked out of their own deployment by a forgotten variable.
 */
function input(over: Partial<SignInPolicyInput> = {}): SignInPolicyInput {
  return {
    email: "owner@kintora.example",
    allowList: [],
    isExistingUser: true,
    isProduction: true,
    ...over,
  };
}

describe("decideSignIn — development", () => {
  it("never restricts outside production, so local dev-login is untouched", () => {
    const d = decideSignIn(input({ isProduction: false, isExistingUser: false, email: null }));
    expect(d.allowed).toBe(true);
  });
});

describe("decideSignIn — with an allowlist", () => {
  const allowList = ["owner@kintora.example", "ops@kintora.example"];

  it("admits an allowlisted address", () => {
    const d = decideSignIn(input({ allowList }));
    expect(d).toEqual({ allowed: true, reason: "allowlisted" });
  });

  it("admits an allowlisted address that has never signed in before", () => {
    // The allowlist is how a NEW operator is onboarded, so it must not also
    // require an existing row.
    const d = decideSignIn(input({ allowList, email: "ops@kintora.example", isExistingUser: false }));
    expect(d.allowed).toBe(true);
  });

  it("refuses anyone not on it, even an existing user", () => {
    // An allowlist that existing users could bypass would not be an allowlist.
    const d = decideSignIn(input({ allowList, email: "stranger@elsewhere.example" }));
    expect(d).toEqual({ allowed: false, reason: "not_allowlisted" });
  });

  it("ignores case and surrounding whitespace", () => {
    const d = decideSignIn(input({ allowList, email: "  Owner@Kintora.Example " }));
    expect(d.allowed).toBe(true);
  });
});

describe("decideSignIn — without an allowlist", () => {
  it("keeps existing users working, so a forgotten variable cannot lock the operator out", () => {
    const d = decideSignIn(input({ allowList: [], isExistingUser: true }));
    expect(d).toEqual({ allowed: true, reason: "existing_user" });
  });

  it("refuses a brand-new account — registration is closed by default", () => {
    // This is the whole point: a stranger finding the URL gets nothing.
    const d = decideSignIn(input({ allowList: [], isExistingUser: false }));
    expect(d).toEqual({ allowed: false, reason: "registration_closed" });
  });
});

describe("decideSignIn — missing email", () => {
  it("refuses rather than waving through an account it cannot check", () => {
    for (const email of [null, undefined, "", "   "]) {
      expect(decideSignIn(input({ email })).allowed).toBe(false);
    }
  });

  it("still allows it in development, where no policy applies", () => {
    expect(decideSignIn(input({ email: null, isProduction: false })).allowed).toBe(true);
  });
});
