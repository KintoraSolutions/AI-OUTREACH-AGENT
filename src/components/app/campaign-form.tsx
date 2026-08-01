"use client";

import { useActionState, useEffect } from "react";
import { toast } from "sonner";
import { useRouter } from "next/navigation";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Field } from "@/components/ui/field";
import { Button } from "@/components/ui/button";
import { SubmitButton } from "@/components/app/submit-button";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { initialFormState, type FormState } from "@/lib/actions/form";
import { CLINIC_CATEGORIES } from "@/lib/leads/constants";

interface CampaignFormProps {
  action: (state: FormState, formData: FormData) => Promise<FormState>;
  cancelHref: string;
}

export function CampaignForm({ action, cancelHref }: CampaignFormProps) {
  const [state, formAction] = useActionState(action, initialFormState);
  const router = useRouter();
  const err = state.fieldErrors ?? {};

  useEffect(() => {
    if (state.error) toast.error(state.error);
  }, [state]);

  return (
    <form action={formAction} className="space-y-8">
      {state.error ? (
        <Alert variant="destructive">
          <AlertDescription>{state.error}</AlertDescription>
        </Alert>
      ) : null}

      <section className="space-y-4">
        <h2 className="text-sm font-semibold">Campaign</h2>
        <Field label="Campaign name" htmlFor="name" required error={err.name}>
          <Input id="name" name="name" required maxLength={120} placeholder="e.g. Toronto physiotherapy clinics" />
        </Field>

        <Field label="Clinic categories" htmlFor="categories" required error={err.categories}
          hint="Select one or more categories to search for.">
          <div className="grid gap-2 rounded-md border p-3 sm:grid-cols-2 lg:grid-cols-3">
            {CLINIC_CATEGORIES.map((c) => (
              <label key={c} className="flex items-center gap-2 text-sm">
                <input type="checkbox" name="categories" value={c} className="size-4 rounded border-input" />
                {c}
              </label>
            ))}
          </div>
        </Field>
      </section>

      <section className="space-y-4">
        <h2 className="text-sm font-semibold">Location</h2>
        <div className="grid gap-4 sm:grid-cols-3">
          <Field label="City" htmlFor="city" error={err.city}>
            <Input id="city" name="city" placeholder="e.g. Toronto" />
          </Field>
          <Field label="Province / state" htmlFor="region" error={err.region}>
            <Input id="region" name="region" placeholder="e.g. Ontario" />
          </Field>
          <Field label="Country" htmlFor="country" error={err.country}>
            <Input id="country" name="country" placeholder="e.g. Canada" />
          </Field>
          <Field label="Search radius (km)" htmlFor="radiusKm" error={err.radiusKm}
            hint="Optional. Biases results toward the city center.">
            <Input id="radiusKm" name="radiusKm" type="number" min={1} max={500} placeholder="e.g. 25" />
          </Field>
        </div>
      </section>

      <section className="space-y-4">
        <h2 className="text-sm font-semibold">Limits &amp; filters</h2>
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="Maximum leads" htmlFor="maxLeads" required error={err.maxLeads}
            hint="Caps how many clinics this campaign will research (1-200).">
            <Input id="maxLeads" name="maxLeads" type="number" min={1} max={200} defaultValue={25} required />
          </Field>
          <Field label="Minimum locations" htmlFor="minLocations" error={err.minLocations}
            hint="Only keep clinics with at least this many locations.">
            <Input id="minLocations" name="minLocations" type="number" min={1} max={100} defaultValue={1} />
          </Field>
          <Field label="Required keywords" htmlFor="requiredKeywords" error={err.requiredKeywords}
            hint="Comma or newline separated. A clinic must match all of these.">
            <Textarea id="requiredKeywords" name="requiredKeywords" rows={2} placeholder="e.g. physiotherapy, sports" />
          </Field>
          <Field label="Excluded keywords" htmlFor="excludedKeywords" error={err.excludedKeywords}
            hint="Comma or newline separated. Any match excludes the clinic.">
            <Textarea id="excludedKeywords" name="excludedKeywords" rows={2} placeholder="e.g. hospital, veterinary" />
          </Field>
        </div>
      </section>

      <div className="flex items-center gap-2 border-t pt-4">
        <SubmitButton pendingText="Creating...">Create campaign</SubmitButton>
        <Button type="button" variant="ghost" onClick={() => router.push(cancelHref)}>
          Cancel
        </Button>
      </div>
    </form>
  );
}
