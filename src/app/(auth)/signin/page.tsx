import Link from "next/link";
import { redirect } from "next/navigation";
import { auth, signIn } from "@/auth";
import { isDevLoginEnabled, isProviderConfigured } from "@/lib/env";
import { SIGN_IN_REFUSAL_MESSAGES } from "@/lib/auth/sign-in-policy";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { SubmitButton } from "@/components/app/submit-button";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Separator } from "@/components/ui/separator";
import { KatalystMark } from "@/components/brand/katalyst-mark";

/**
 * Fluent sign-in.
 *
 * Previously this page was hardcoded dark with inline `style` objects
 * (`background: "#0f100f"`, gradient card, `#2f7d55` button), so it ignored the
 * theme entirely and shared no design language with the app behind it. It is
 * now a plain themed card on the app canvas, in the shape of a Microsoft
 * sign-in page.
 */

/** Official multi-color Google "G". */
function GoogleLogo() {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true" className="fl-keep-color">
      <path
        fill="#4285F4"
        d="M23.52 12.27c0-.79-.07-1.54-.2-2.27H12v4.51h6.47a5.53 5.53 0 0 1-2.4 3.63v3h3.88c2.27-2.09 3.57-5.17 3.57-8.87Z"
      />
      <path
        fill="#34A853"
        d="M12 24c3.24 0 5.95-1.08 7.93-2.91l-3.88-3c-1.08.72-2.45 1.16-4.05 1.16-3.11 0-5.75-2.1-6.69-4.93H1.29v3.09A12 12 0 0 0 12 24Z"
      />
      <path
        fill="#FBBC05"
        d="M5.31 14.32a7.2 7.2 0 0 1 0-4.63V6.6H1.29a12 12 0 0 0 0 10.81l4.02-3.09Z"
      />
      <path
        fill="#EA4335"
        d="M12 4.75c1.77 0 3.35.61 4.6 1.8l3.42-3.42C17.95 1.19 15.24 0 12 0A12 12 0 0 0 1.29 6.6l4.02 3.09C6.25 6.85 8.89 4.75 12 4.75Z"
      />
    </svg>
  );
}

/**
 * What to tell a visitor whose sign-in did not complete.
 *
 * Two different vocabularies arrive in `?error=`:
 *
 *  - the policy reasons from `SIGN_IN_REFUSAL_MESSAGES` (`not_allowlisted`,
 *    `registration_closed`, `no_email`), should a refusal ever be surfaced by
 *    reason; and
 *  - Auth.js's own codes. Returning `false` from the `signIn` callback — which
 *    is what every policy refusal does today — arrives here as `AccessDenied`,
 *    and a misconfigured deployment arrives as `Configuration`.
 *
 * Anything unrecognised falls through to one generic sentence. A raw code is
 * never rendered: it means nothing to the visitor and it leaks internals.
 */
const GENERIC_SIGN_IN_ERROR =
  "Sign-in could not be completed. Try again, and if it keeps failing ask a workspace owner to check your access.";

const AUTHJS_ERROR_MESSAGES: Record<string, string> = {
  // The policy refuses by returning false, which Auth.js reports as AccessDenied.
  AccessDenied:
    "That account cannot sign in to this workspace. Access is limited to addresses an owner has allowed.",
  Configuration:
    "Sign-in is not configured correctly on this deployment. A workspace owner needs to check the server configuration.",
  Verification: "That sign-in link is no longer valid. Start again from this page.",
  OAuthAccountNotLinked:
    "That email is already registered with a different sign-in method. Use the method you signed up with.",
};

/**
 * `code` comes straight off the query string, so it can be any string at all,
 * including the name of something on `Object.prototype`. A plain index lookup
 * on an object literal answers `?error=__proto__` with an object and
 * `?error=toString` with a function, neither of which is null, so a `??`
 * fallback does not catch them and React is handed a non-renderable value:
 * `/signin?error=__proto__` returned a 500 rather than the generic message.
 *
 * Both maps are therefore read through an own-property check, and the result
 * is confirmed to be a string before it is returned.
 */
function ownMessage(map: Record<string, string>, code: string): string | null {
  if (!Object.prototype.hasOwnProperty.call(map, code)) return null;
  const message = map[code];
  return typeof message === "string" ? message : null;
}

function signInErrorMessage(code: string | undefined): string | null {
  if (!code) return null;
  return (
    ownMessage(SIGN_IN_REFUSAL_MESSAGES, code) ??
    ownMessage(AUTHJS_ERROR_MESSAGES, code) ??
    GENERIC_SIGN_IN_ERROR
  );
}

export default async function SignInPage({
  searchParams,
}: {
  searchParams: Promise<{ callbackUrl?: string; error?: string }>;
}) {
  const { callbackUrl, error } = await searchParams;

  /**
   * `startsWith("/")` is not sufficient to prove a path is local. A browser
   * resolves a protocol-relative `//evil.com` as `https://evil.com`, and
   * treats a backslash the same way `/\evil.com`, so either would turn the
   * signed-in redirect below into an open redirect off this origin. Require a
   * single leading slash that is not followed by another slash or a backslash.
   */
  const isLocalPath =
    typeof callbackUrl === "string" &&
    /^\/(?![/\\])/.test(callbackUrl);
  const redirectTo = isLocalPath && callbackUrl ? callbackUrl : "/dashboard";

  /**
   * Mirror of `src/app/page.tsx`, which sends a signed-in visitor to
   * /dashboard. Without this, someone with a live session who lands here (a
   * stale tab, a bookmark, a link in an email) is shown a sign-in form for an
   * account they are already using. Guard only — it does not change who may
   * sign in.
   */
  const session = await auth();
  if (session?.user) {
    // Never bounce back to this page, which would loop.
    redirect(redirectTo.startsWith("/signin") ? "/dashboard" : redirectTo);
  }

  const errorMessage = signInErrorMessage(error);
  const googleConfigured = isProviderConfigured("auth_google");
  const devLogin = isDevLoginEnabled;

  async function googleSignIn() {
    "use server";
    await signIn("google", { redirectTo });
  }

  async function devSignIn(formData: FormData) {
    "use server";
    const email = String(formData.get("email") ?? "").trim();
    await signIn("dev-login", { email, redirectTo });
  }

  return (
    <main className="flex min-h-screen items-center justify-center bg-[var(--fl-bg-3)] px-4 py-10">
      <div className="w-full max-w-[420px]">
        <Link
          href="/"
          className="mb-6 flex items-center justify-center gap-2.5 rounded-md transition-opacity hover:opacity-80"
        >
          <KatalystMark />
          <span className="font-display text-title3 font-semibold text-foreground">Katalyst</span>
        </Link>

        <div className="rounded-xl border border-[var(--fl-stroke-2)] bg-[var(--fl-bg-1)] p-7 shadow-16 sm:p-8">
          <h1 className="font-display text-title3 font-semibold text-foreground">Sign in</h1>
          <p className="mt-1.5 text-body1 text-[var(--fl-fg-2)]">
            Access your Katalyst workspace.
          </p>

          <div className="mt-6 space-y-5">
            {errorMessage ? (
              <Alert variant="destructive">
                <AlertTitle>Could not sign you in</AlertTitle>
                <AlertDescription>{errorMessage}</AlertDescription>
              </Alert>
            ) : null}

            {googleConfigured ? (
              <form action={googleSignIn}>
                <SubmitButton
                  variant="outline"
                  size="lg"
                  pendingText="Redirecting…"
                  className="w-full [&_svg]:size-[18px]"
                >
                  <GoogleLogo />
                  Continue with Google
                </SubmitButton>
              </form>
            ) : (
              <Alert variant="warning">
                <AlertTitle>Google sign-in not configured</AlertTitle>
                <AlertDescription>
                  Set <code>GOOGLE_CLIENT_ID</code> and <code>GOOGLE_CLIENT_SECRET</code> to enable
                  Google sign-in.
                </AlertDescription>
              </Alert>
            )}

            {devLogin ? (
              <>
                {googleConfigured ? (
                  <div className="flex items-center gap-3">
                    <Separator className="flex-1" />
                    <span className="text-caption1 text-[var(--fl-fg-3)]">or</span>
                    <Separator className="flex-1" />
                  </div>
                ) : null}

                <form action={devSignIn} className="space-y-2">
                  <Label htmlFor="email" className="text-body1 font-semibold">
                    Development email
                  </Label>
                  <Input
                    id="email"
                    name="email"
                    type="email"
                    defaultValue="founder@example-clinic-sales.test"
                    autoComplete="off"
                    aria-describedby="dev-login-hint"
                  />
                  <p id="dev-login-hint" className="text-caption1 text-[var(--fl-fg-3)]">
                    Uses seeded test account data for development. Disabled in production.
                  </p>
                  <SubmitButton pendingText="Signing in…" size="lg" className="mt-1 w-full">
                    Proceed with test user access
                  </SubmitButton>
                </form>
              </>
            ) : null}

            {!googleConfigured && !devLogin ? (
              <p className="text-body1 text-[var(--fl-fg-2)]">
                No sign-in method is configured. Configure Google OAuth, or set{" "}
                <code>AUTH_DEV_LOGIN=true</code> in development.
              </p>
            ) : null}
          </div>
        </div>

        {/* Compliance note. The old "Learn more" here linked to /signin — this
            page — so it was a dead link. The help centre sits behind auth, so
            there is nothing to point a signed-out visitor at; the sentence
            stands on its own rather than promising a page that does not exist. */}
        <p className="mt-5 text-center text-caption1 text-[var(--fl-fg-3)]">
          Ensuring outreach compliance is your responsibility. This tool prepares drafts for your
          review and never sends email on your behalf.
        </p>
      </div>
    </main>
  );
}
