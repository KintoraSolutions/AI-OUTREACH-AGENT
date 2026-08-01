"use client";

import { useActionState, useEffect, useRef } from "react";
import { toast } from "sonner";
import { Textarea } from "@/components/ui/textarea";
import { SubmitButton } from "@/components/app/submit-button";
import { addNote } from "@/app/(dashboard)/leads/actions";
import { initialFormState, type FormState } from "@/lib/actions/form";

export function NotesEditor({ clinicId, canEdit }: { clinicId: string; canEdit: boolean }) {
  const bound = addNote.bind(null, clinicId);
  const [state, formAction] = useActionState<FormState, FormData>(bound, initialFormState);
  const ref = useRef<HTMLFormElement>(null);

  useEffect(() => {
    if (state.ok && state.message) {
      toast.success(state.message);
      ref.current?.reset();
    } else if (state.error) {
      toast.error(state.error);
    }
  }, [state]);

  if (!canEdit) {
    return <p className="text-sm text-muted-foreground">You do not have permission to add notes.</p>;
  }

  return (
    <form ref={ref} action={formAction} className="space-y-2">
      <Textarea name="note" rows={3} placeholder="Add an internal note..." maxLength={2000} />
      {state.fieldErrors?.note?.[0] ? (
        <p className="text-xs text-destructive">{state.fieldErrors.note[0]}</p>
      ) : null}
      <SubmitButton size="sm" pendingText="Saving...">
        Add note
      </SubmitButton>
    </form>
  );
}
