/**
 * Who is allowed to sign in.
 *
 * Until now there was no `signIn` callback at all, so any Google account on the
 * internet could sign in — and because first login bootstraps a personal
 * organization with an OWNER membership, a stranger landing on the deployed URL
 * would be handed their own tenant. Fine while the only URL was localhost;
 * unacceptable the moment the app is public.
 *
 * The policy is deliberately two-tier so that going live cannot lock the
 * operator out of their own app:
 *
 *  - With `AUTH_ALLOWED_EMAILS` set, only those addresses may sign in. This is
 *    the explicit, recommended configuration.
 *  - Without it, production falls back to "existing users only" — anyone
 *    already in the `User` table keeps working, nobody new can register. The
 *    operator's own account already exists, so a forgotten variable costs them
 *    nothing, while a stranger still cannot get in.
 *
 * Development is unrestricted so the local dev-login flow is unaffected.
 */

export type SignInDecision =
  | { allowed: true; reason: "development" | "allowlisted" | "existing_user" }
  | { allowed: false; reason: "not_allowlisted" | "registration_closed" | "no_email" };

export interface SignInPolicyInput {
  /** The email the provider returned. */
  email: string | null | undefined;
  /** Lowercased allowlist; empty means no explicit allowlist is configured. */
  allowList: string[];
  /** True when a `User` row already exists for this email. */
  isExistingUser: boolean;
  /** Restrictions only apply outside development. */
  isProduction: boolean;
}

export function decideSignIn(input: SignInPolicyInput): SignInDecision {
  if (!input.isProduction) return { allowed: true, reason: "development" };

  const email = input.email?.trim().toLowerCase();
  // A provider that returns no email cannot be checked against any policy, so
  // it is refused rather than waved through.
  if (!email) return { allowed: false, reason: "no_email" };

  if (input.allowList.length > 0) {
    return input.allowList.includes(email)
      ? { allowed: true, reason: "allowlisted" }
      : { allowed: false, reason: "not_allowlisted" };
  }

  return input.isExistingUser
    ? { allowed: true, reason: "existing_user" }
    : { allowed: false, reason: "registration_closed" };
}

/** Message shown on the sign-in page when a decision refuses. */
export const SIGN_IN_REFUSAL_MESSAGES: Record<
  Extract<SignInDecision, { allowed: false }>["reason"],
  string
> = {
  no_email: "That account did not share an email address, so it cannot be used to sign in.",
  not_allowlisted: "That address is not on this workspace's sign-in list.",
  registration_closed:
    "This workspace is not open for new sign-ups. Ask an owner to add your address.",
};
