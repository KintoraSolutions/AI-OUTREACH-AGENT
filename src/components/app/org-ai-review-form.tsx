"use client";

import { useActionState, useEffect } from "react";
import { toast } from "sonner";
import { SubmitButton } from "@/components/app/submit-button";
import { OrgAiFields } from "@/components/app/org-ai-fields";
import { confirmOrgAiProfile } from "@/app/onboarding/actions";
import { initialFormState, type FormState } from "@/lib/actions/form";
import type { OrgAiProfile } from "@/lib/ai/org-ai-profile";

export function OrgAiReviewForm({
  profile,
  presetGuardrails,
}: {
  profile: OrgAiProfile;
  presetGuardrails: string[];
}) {
  const [state, formAction] = useActionState<FormState, FormData>(confirmOrgAiProfile, initialFormState);

  useEffect(() => {
    if (state.error) toast.error(state.error);
  }, [state]);

  return (
    <form action={formAction} className="space-y-6">
      <OrgAiFields profile={profile} presetGuardrails={presetGuardrails} />
      <div className="flex items-center gap-3 border-t pt-5">
        <SubmitButton pendingText="Saving...">Looks right, finish setup</SubmitButton>
        <p className="text-xs text-muted-foreground">You can change any of this later in Settings.</p>
      </div>
    </form>
  );
}
