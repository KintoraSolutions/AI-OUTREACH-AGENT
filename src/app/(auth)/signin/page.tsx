import Link from "next/link";
import { ShieldCheck } from "lucide-react";
import { signIn } from "@/auth";
import { isDevLoginEnabled, isProviderConfigured } from "@/lib/env";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { SubmitButton } from "@/components/app/submit-button";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Separator } from "@/components/ui/separator";

export default async function SignInPage({
  searchParams,
}: {
  searchParams: Promise<{ callbackUrl?: string }>;
}) {
  const { callbackUrl } = await searchParams;
  const redirectTo = callbackUrl && callbackUrl.startsWith("/") ? callbackUrl : "/dashboard";
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
    <main className="flex min-h-screen items-center justify-center px-4">
      <div className="w-full max-w-sm">
        <div className="mb-6 flex items-center justify-center gap-2">
          <ShieldCheck className="size-6 text-foreground" strokeWidth={1.75} />
          <span className="text-[16px] font-semibold tracking-[-0.01em]">Outreach Agent</span>
        </div>

        <div className="glass-strong rounded-[12px] p-7">
          <h1 className="text-[22px] font-semibold tracking-[-0.02em]">Sign in</h1>
          <p className="mt-1.5 text-[15px] text-muted-foreground">
            Access your organization&apos;s lead research and outreach workspace.
          </p>

          <div className="mt-6 space-y-4">
            {googleConfigured ? (
              <form action={googleSignIn}>
                <SubmitButton className="w-full" variant="outline" pendingText="Redirecting...">
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
                    <span className="text-xs text-muted-foreground">or</span>
                    <Separator className="flex-1" />
                  </div>
                ) : null}
                <form action={devSignIn} className="space-y-3">
                  <div className="space-y-1.5">
                    <Label htmlFor="email">Development sign-in (test data)</Label>
                    <Input
                      id="email"
                      name="email"
                      type="email"
                      defaultValue="founder@example-clinic-sales.test"
                      autoComplete="off"
                    />
                    <p className="text-xs text-muted-foreground">
                      Development only. Uses a seeded test user. Disabled in production.
                    </p>
                  </div>
                  <SubmitButton className="w-full" pendingText="Signing in...">
                    Sign in as test user
                  </SubmitButton>
                </form>
              </>
            ) : null}

            {!googleConfigured && !devLogin ? (
              <p className="text-sm text-muted-foreground">
                No sign-in method is configured. Configure Google OAuth, or set{" "}
                <code>AUTH_DEV_LOGIN=true</code> in development.
              </p>
            ) : null}
          </div>
        </div>

        <p className="mt-4 text-center text-xs text-muted-foreground">
          You are responsible for ensuring outreach complies with laws applying to you and your
          recipients. <Link href="/signin" className="underline underline-offset-2">Learn more</Link>
        </p>
      </div>
    </main>
  );
}
