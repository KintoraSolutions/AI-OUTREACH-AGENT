"use client";

import { useActionState, useEffect } from "react";
import { toast } from "sonner";
import { SubmitButton } from "@/components/app/submit-button";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { OrgAiFields } from "@/components/app/org-ai-fields";
import { updateOrgAiProfile } from "@/app/(dashboard)/settings/actions";
import { initialFormState, type FormState } from "@/lib/actions/form";
import type { OrgAiProfile } from "@/lib/ai/org-ai-profile";

export function OrgAiForm({
  profile,
  presetGuardrails,
  canEdit,
}: {
  profile: OrgAiProfile;
  presetGuardrails: string[];
  canEdit: boolean;
}) {
  const [state, formAction] = useActionState<FormState, FormData>(updateOrgAiProfile, initialFormState);

  useEffect(() => {
    if (state.ok && state.message) toast.success(state.message);
    else if (state.error) toast.error(state.error);
  }, [state]);

  return (
    <form action={formAction} className="space-y-6">
      {!canEdit ? (
        <Alert variant="warning">
          <AlertDescription>
            You have read-only access. Only Admins and Owners can edit the AI configuration.
          </AlertDescription>
        </Alert>
      ) : null}

      <OrgAiFields profile={profile} presetGuardrails={presetGuardrails} disabled={!canEdit} />

      {canEdit ? (
        <div className="border-t pt-4">
          <SubmitButton pendingText="Saving...">Save AI configuration</SubmitButton>
        </div>
      ) : null}
    </form>
  );
}
