/**
 * Where an access request should go.
 *
 * Production sign-in is not self-serve. `decideSignIn` in
 * `src/lib/auth/sign-in-policy.ts` works two ways: with `AUTH_ALLOWED_EMAILS`
 * set, only listed addresses pass; with it unset, production falls back to
 * existing users only. Either way a stranger cannot create a workspace.
 *
 * The page used to say "Get started" three times and offer, at the very end, a
 * "seeded development workspace" that only exists when `AUTH_DEV_LOGIN=true` on
 * a development build. So the final promise on the page was the one thing a
 * visitor could immediately disprove.
 *
 * The honest version needs somewhere to send a person who wants in, and no
 * such address exists anywhere in this codebase. Rather than invent one, it
 * lives here as a single null constant: while it is null the access section
 * states the position and offers sign-in only; set it and a request button
 * appears, with no other edit required.
 */
export const ACCESS_CONTACT: string | null = null;
