"use client";

import { useActionState, useEffect, useState } from "react";
import { toast } from "sonner";
import { Input } from "@/components/ui/input";
import { Field } from "@/components/ui/field";
import { Select } from "@/components/ui/select";
import { SubmitButton } from "@/components/app/submit-button";
import { CompanyProfileFields } from "@/components/app/company-profile-fields";
import { EmailVoiceFields } from "@/components/app/email-voice-fields";
import { completeOnboarding, skipOnboarding } from "@/app/onboarding/actions";
import { initialFormState, type FormState } from "@/lib/actions/form";
import type { CompanyProfile } from "@/lib/ai/company-profile";
import type { EmailVoice } from "@/lib/ai/email-voice";

interface OnboardingIdentity {
  senderName: string | null;
  companyName: string | null;
  senderEmail: string | null;
}

function StepHeading({ n, title, description }: { n: number; title: string; description: string }) {
  return (
    <div className="flex gap-3">
      {/* Brand-tinted, not `--surface-2`: that token is white in the light
          theme, so the marker vanished against the card behind it. */}
      <span
        aria-hidden="true"
        className="mt-0.5 flex size-6 shrink-0 items-center justify-center rounded-full bg-[var(--fl-brand-tint)] text-caption1 font-semibold text-[var(--fl-brand-text)]"
      >
        {n}
      </span>
      <div>
        <h2 className="text-subtitle2 font-semibold">{title}</h2>
        <p className="text-body1 text-[var(--fl-fg-2)]">{description}</p>
      </div>
    </div>
  );
}

export function OnboardingForm({
  identity,
  profile,
  voice,
}: {
  identity: OnboardingIdentity;
  profile: CompanyProfile;
  voice: EmailVoice;
}) {
  const [state, formAction] = useActionState<FormState, FormData>(completeOnboarding, initialFormState);
  const err = state.fieldErrors ?? {};

  // Live so the signature preview in the email-voice step reflects what is typed.
  const [senderName, setSenderName] = useState(identity.senderName ?? "");
  const [companyName, setCompanyName] = useState(identity.companyName ?? "");

  useEffect(() => {
    if (state.error) toast.error(state.error);
  }, [state]);

  return (
    <>
      <form action={formAction} className="space-y-10">
        <section className="space-y-5">
          <StepHeading
            n={1}
            title="About you and your company"
            description="This is how you appear in outreach emails."
          />
          <div className="grid gap-4 sm:grid-cols-2">
            <Field label="Your name" htmlFor="senderName" error={err.senderName}>
              <Input
                id="senderName"
                name="senderName"
                value={senderName}
                onChange={(e) => setSenderName(e.target.value)}
                maxLength={300}
                placeholder="Jordan Smith"
              />
            </Field>
            <Field label="Company name" htmlFor="companyName" error={err.companyName}>
              <Input
                id="companyName"
                name="companyName"
                value={companyName}
                onChange={(e) => setCompanyName(e.target.value)}
                maxLength={300}
                placeholder="Acme Studio"
              />
            </Field>
            <Field
              label="Your email"
              htmlFor="senderEmail"
              error={err.senderEmail}
              className="sm:col-span-2"
            >
              <Input
                id="senderEmail"
                name="senderEmail"
                type="email"
                defaultValue={identity.senderEmail ?? ""}
                maxLength={320}
                placeholder="you@yourcompany.com"
              />
            </Field>
          </div>
        </section>

        <section className="space-y-5">
          <StepHeading
            n={2}
            title="What your company does"
            description="This context is fed to the AI so emails reflect your real business. You can change it anytime in Settings."
          />
          <Field
            label="Industry"
            htmlFor="industry"
            hint="Picks your starting configuration, including the safety rules for your field."
          >
            <Select id="industry" name="industry" defaultValue="healthcare">
              <option value="healthcare">Healthcare</option>
              <option value="general">General business</option>
            </Select>
          </Field>
          <CompanyProfileFields defaults={profile} errors={err} />
        </section>

        <section className="space-y-5">
          <StepHeading
            n={3}
            title="Email preferences"
            description="How your outreach emails should read. Grounding and safety rules always still apply."
          />
          <EmailVoiceFields
            voice={voice}
            senderName={senderName}
            companyName={companyName}
            showValueProp={false}
          />
        </section>

        <div className="flex items-center gap-3 border-t border-[var(--fl-stroke-2)] pt-5">
          <SubmitButton pendingText="Analyzing your answers…">Continue</SubmitButton>
          <p className="text-caption1 text-[var(--fl-fg-3)]">
            Next: review the AI configuration we generate for you.
          </p>
        </div>
      </form>

      {/* Sibling form (not nested) so "Skip" discards input and just marks onboarding done. */}
      <form action={skipOnboarding} className="mt-4">
        <button
          type="submit"
          className="cursor-pointer rounded-sm text-caption1 text-[var(--fl-fg-3)] underline-offset-4 transition-colors hover:text-foreground hover:underline"
        >
          Skip for now
        </button>
      </form>
    </>
  );
}
