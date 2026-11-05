import { redirect } from "next/navigation";
import { Role } from "@prisma/client";
import { ShieldCheck, Sparkles } from "lucide-react";
import { requireOrgContext, roleAtLeast } from "@/lib/auth/rbac";
import { ROLE_LABELS } from "@/lib/leads/constants";
import { effectiveGuardrails, loadOrgAiProfile } from "@/lib/ai/org-ai-profile";
import { getUseCase } from "@/lib/ai/use-cases";
import { isProviderConfigured } from "@/lib/env";
import { OrgAiReviewForm } from "@/components/app/org-ai-review-form";
import { Stepper, ONBOARDING_STEPS } from "@/components/app/stepper";
import { UserMenu } from "@/components/app/user-menu";
import { ThemeToggle } from "@/components/ui/theme-toggle";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";

/**
 * Onboarding step 2: review the AI configuration inferred from the answers.
 * Read-only on GET — inference already ran when step 1 was submitted, so
 * refreshing this page never re-runs a model call.
 */
export default async function OnboardingReviewPage() {
  const ctx = await requireOrgContext();
  if (!roleAtLeast(ctx.role, Role.ADMIN)) redirect("/dashboard");

  const profile = await loadOrgAiProfile(ctx.orgId);
  if (profile.confirmedAt) redirect("/dashboard");

  const useCase = getUseCase(profile.useCase);
  const presetGuardrails = effectiveGuardrails(profile, useCase).filter(
    (g) => !profile.customGuardrails.includes(g),
  );
  const aiConfigured = isProviderConfigured("ai");
  const wasInferred = Boolean(profile.inferred.at && profile.inferred.model);

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
        <Stepper steps={ONBOARDING_STEPS} currentIndex={1} className="mb-7" />

        <div className="mb-6 space-y-2">
          <h1 className="flex items-center gap-2 font-display text-title2 font-semibold">
            <Sparkles className="size-5 shrink-0 text-[var(--fl-brand-text)]" aria-hidden="true" />
            Here is the AI we set up for {ctx.orgName}
          </h1>
          <p className="text-body2 text-[var(--fl-fg-2)]">
            {wasInferred
              ? "We built this from your answers. Check it over and change anything that is not quite right."
              : "We started you off with the preset for your industry. Fill in the details that matter to you."}
          </p>
        </div>

        {!aiConfigured ? (
          <Alert variant="warning" className="mb-6">
            <AlertTitle>AI is not configured on this server</AlertTitle>
            <AlertDescription>
              Set ANTHROPIC_API_KEY to have your answers analyzed automatically. We applied your
              industry preset instead, and nothing below was invented.
            </AlertDescription>
          </Alert>
        ) : null}

        <OrgAiReviewForm profile={profile} presetGuardrails={presetGuardrails} />
      </main>
    </div>
  );
}
