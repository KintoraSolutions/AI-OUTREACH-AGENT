"use client";

import { useActionState, useEffect } from "react";
import { toast } from "sonner";
import { SubmitButton } from "@/components/app/submit-button";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { EmailVoiceFields } from "@/components/app/email-voice-fields";
import { updateEmailVoice } from "@/app/(dashboard)/settings/actions";
import { initialFormState, type FormState } from "@/lib/actions/form";
import { type EmailVoice } from "@/lib/ai/email-voice";

export function EmailVoiceForm({
  voice,
  senderName,
  companyName,
  canEdit,
}: {
  voice: EmailVoice;
  senderName: string | null;
  companyName: string | null;
  canEdit: boolean;
}) {
  const [state, formAction] = useActionState<FormState, FormData>(updateEmailVoice, initialFormState);

  useEffect(() => {
    if (state.ok && state.message) toast.success(state.message);
    else if (state.error) toast.error(state.error);
  }, [state]);

  return (
    <form action={formAction} className="space-y-6">
      {!canEdit ? (
        <Alert variant="warning">
          <AlertDescription>
            You have read-only access. Only Admins and Owners can edit the email voice.
          </AlertDescription>
        </Alert>
      ) : null}

      <fieldset disabled={!canEdit} className="space-y-6">
        <EmailVoiceFields voice={voice} senderName={senderName} companyName={companyName} />

        {canEdit ? (
          <div className="border-t pt-4">
            <SubmitButton pendingText="Saving...">Save email voice</SubmitButton>
          </div>
        ) : null}
      </fieldset>
    </form>
  );
}
