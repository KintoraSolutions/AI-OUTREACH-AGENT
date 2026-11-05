"use client";

import { useActionState, useEffect } from "react";
import { toast } from "sonner";
import { SubmitButton } from "@/components/app/submit-button";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { CompanyProfileFields } from "@/components/app/company-profile-fields";
import { updateCompanyProfile } from "@/app/(dashboard)/settings/actions";
import { initialFormState, type FormState } from "@/lib/actions/form";
import type { CompanyProfile } from "@/lib/ai/company-profile";

export function CompanyProfileForm({
  profile,
  canEdit,
}: {
  profile: CompanyProfile;
  canEdit: boolean;
}) {
  const [state, formAction] = useActionState<FormState, FormData>(updateCompanyProfile, initialFormState);

  useEffect(() => {
    if (state.ok && state.message) toast.success(state.message);
    else if (state.error) toast.error(state.error);
  }, [state]);

  return (
    <form action={formAction} className="space-y-6">
      {!canEdit ? (
        <Alert variant="warning">
          <AlertDescription>
            You have read-only access. Only Admins and Owners can edit the company profile.
          </AlertDescription>
        </Alert>
      ) : null}

      <fieldset disabled={!canEdit} className="space-y-6">
        <CompanyProfileFields defaults={profile} errors={state.fieldErrors} />

        {canEdit ? (
          <div className="border-t pt-4">
            <SubmitButton pendingText="Saving...">Save company profile</SubmitButton>
          </div>
        ) : null}
      </fieldset>
    </form>
  );
}
