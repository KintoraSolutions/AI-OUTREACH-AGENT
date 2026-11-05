import { redirect } from "next/navigation";
import { Role } from "@prisma/client";
import { ShieldCheck } from "lucide-react";
import { prisma } from "@/lib/db";
import { requireOrgContext, roleAtLeast } from "@/lib/auth/rbac";
import { ROLE_LABELS } from "@/lib/leads/constants";
import { isOrgOnboarded, loadCompanyProfile } from "@/lib/ai/company-profile";
import { loadEmailVoice } from "@/lib/ai/email-voice";
import { OnboardingForm } from "@/components/app/onboarding-form";
import { Stepper, ONBOARDING_STEPS } from "@/components/app/stepper";
import { UserMenu } from "@/components/app/user-menu";
import { ThemeToggle } from "@/components/ui/theme-toggle";

/**
 * First-run setup. Reached when the active org has not completed onboarding (the
 * dashboard layout redirects here). Once done it is skipped, so this page always
 * redirects onboarded orgs back to the dashboard.
 */
export default async function OnboardingPage() {
  const ctx = await requireOrgContext();
  if (await isOrgOnboarded(ctx.orgId)) redirect("/dashboard");

  const canEdit = roleAtLeast(ctx.role, Role.ADMIN);

  const [org, profile, voice] = await Promise.all([
    prisma.organization.findUnique({ where: { id: ctx.orgId } }),
    loadCompanyProfile(ctx.orgId),
    loadEmailVoice(ctx.orgId),
  ]);

  return (
    <div className="min-h-screen bg-[var(--background)]">
      <header className="flex items-center justify-between border-b border-[var(--fl-stroke-2)] bg-[var(--fl-bg-1)] px-4 py-2.5 md:px-8">
        <div className="flex items-center gap-2">
          <ShieldCheck className="size-5 shrink-0 text-[var(--fl-brand-text)]" strokeWidth={1.75} />
          <span className="font-display text-body2 font-semibold">Katalyst</span>
        </div>
        <div className="flex items-center gap-1.5">
          <ThemeToggle />
          <UserMenu name={ctx.userName} email={ctx.userEmail} role={ROLE_LABELS[ctx.role]} />
        </div>
      </header>

      <main className="mx-auto w-full max-w-2xl px-4 py-10 md:py-14">
        <Stepper steps={ONBOARDING_STEPS} currentIndex={0} className="mb-7" />

        <div className="mb-8 space-y-2">
          <h1 className="font-display text-title2 font-semibold">Let&apos;s set up your account</h1>
          <p className="text-body2 text-[var(--fl-fg-2)]">
            A few quick questions about your company. We feed this to the AI so every outreach email
            sounds like you and pitches what you actually sell. Nothing is ever sent automatically.
          </p>
        </div>

        {canEdit ? (
          <OnboardingForm
            identity={{
              senderName: org?.senderName ?? ctx.userName ?? null,
              companyName: org?.companyName ?? null,
              senderEmail: org?.senderEmail ?? ctx.userEmail ?? null,
            }}
            profile={profile}
            voice={voice}
          />
        ) : (
          <div className="rounded-md border border-[var(--fl-stroke-2)] bg-[var(--fl-bg-1)] p-5 shadow-2">
            <p className="text-body1 font-semibold">Your organization is still being set up</p>
            <p className="mt-1 text-body1 text-[var(--fl-fg-2)]">
              An owner or admin needs to finish the initial setup for{" "}
              <span className="font-medium text-foreground">{ctx.orgName}</span> before you can start.
              Please check back shortly.
            </p>
          </div>
        )}
      </main>
    </div>
  );
}
