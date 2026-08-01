"use client";

import { useActionState, useEffect, useRef } from "react";
import { toast } from "sonner";
import { Input } from "@/components/ui/input";
import { Field } from "@/components/ui/field";
import { Checkbox } from "@/components/ui/checkbox";
import { SubmitButton } from "@/components/app/submit-button";
import { addContact, addLocation } from "@/app/(dashboard)/leads/actions";
import { initialFormState, type FormState } from "@/lib/actions/form";

function useResettableAction(
  action: (state: FormState, formData: FormData) => Promise<FormState>,
) {
  const [state, formAction] = useActionState<FormState, FormData>(action, initialFormState);
  const ref = useRef<HTMLFormElement>(null);
  useEffect(() => {
    if (state.ok && state.message) {
      toast.success(state.message);
      ref.current?.reset();
    } else if (state.error) {
      toast.error(state.error);
    }
  }, [state]);
  return { state, formAction, ref };
}

export function AddContactForm({ clinicId }: { clinicId: string }) {
  const { state, formAction, ref } = useResettableAction(addContact.bind(null, clinicId));
  const err = state.fieldErrors ?? {};
  return (
    <form ref={ref} action={formAction} className="grid gap-3 sm:grid-cols-2">
      <Field label="Name" htmlFor="c-name" error={err.name}>
        <Input id="c-name" name="name" />
      </Field>
      <Field label="Job title" htmlFor="c-title" error={err.jobTitle}>
        <Input id="c-title" name="jobTitle" placeholder="e.g. Clinic Manager" />
      </Field>
      <Field label="Email" htmlFor="c-email" error={err.email}>
        <Input id="c-email" name="email" type="email" />
      </Field>
      <Field label="Phone" htmlFor="c-phone" error={err.phone}>
        <Input id="c-phone" name="phone" />
      </Field>
      <label className="flex items-center gap-2 text-sm sm:col-span-2">
        <Checkbox name="isDecisionMaker" />
        Decision maker
      </label>
      <div className="sm:col-span-2">
        <SubmitButton size="sm" pendingText="Adding...">
          Add contact
        </SubmitButton>
      </div>
    </form>
  );
}

export function AddLocationForm({ clinicId }: { clinicId: string }) {
  const { state, formAction, ref } = useResettableAction(addLocation.bind(null, clinicId));
  const err = state.fieldErrors ?? {};
  return (
    <form ref={ref} action={formAction} className="grid gap-3 sm:grid-cols-2">
      <Field label="Label" htmlFor="l-label" error={err.label}>
        <Input id="l-label" name="label" placeholder="e.g. Downtown" />
      </Field>
      <Field label="Phone" htmlFor="l-phone" error={err.phone}>
        <Input id="l-phone" name="phone" />
      </Field>
      <Field label="Address" htmlFor="l-address" error={err.address} className="sm:col-span-2">
        <Input id="l-address" name="address" />
      </Field>
      <div className="sm:col-span-2">
        <SubmitButton size="sm" pendingText="Adding...">
          Add location
        </SubmitButton>
      </div>
    </form>
  );
}

