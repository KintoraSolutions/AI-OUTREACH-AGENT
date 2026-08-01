"use client";

import { useActionState, useEffect } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { PipelineStage } from "@prisma/client";
import { Input } from "@/components/ui/input";
import { Select } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { Checkbox } from "@/components/ui/checkbox";
import { Field } from "@/components/ui/field";
import { Button } from "@/components/ui/button";
import { SubmitButton } from "@/components/app/submit-button";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { initialFormState, type FormState } from "@/lib/actions/form";
import { BOOKING_METHODS, CLINIC_CATEGORIES, STAGE_LABELS, STAGE_ORDER } from "@/lib/leads/constants";

export interface LeadFormDefaults {
  name?: string;
  category?: string | null;
  websiteUrl?: string | null;
  mainPhone?: string | null;
  publicEmail?: string | null;
  contactPageUrl?: string | null;
  bookingMethod?: string | null;
  onlineBookingUrl?: string | null;
  locationCount?: number;
  stage?: PipelineStage;
  doNotContact?: boolean;
  followUpDate?: string | null;
}

interface LeadFormProps {
  action: (state: FormState, formData: FormData) => Promise<FormState>;
  mode: "create" | "edit";
  defaults?: LeadFormDefaults;
  cancelHref: string;
}

export function LeadForm({ action, mode, defaults = {}, cancelHref }: LeadFormProps) {
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
        <h2 className="text-sm font-semibold">Clinic</h2>
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="Clinic name" htmlFor="name" required error={err.name} className="sm:col-span-2">
            <Input id="name" name="name" defaultValue={defaults.name} required maxLength={200} />
          </Field>
          <Field label="Category" htmlFor="category" error={err.category}>
            <Select id="category" name="category" defaultValue={defaults.category ?? ""}>
              <option value="">Not set</option>
              {CLINIC_CATEGORIES.map((c) => (
                <option key={c} value={c}>
                  {c}
                </option>
              ))}
            </Select>
          </Field>
          <Field label="Website URL" htmlFor="websiteUrl" error={err.websiteUrl} hint="Include https://">
            <Input id="websiteUrl" name="websiteUrl" type="url" defaultValue={defaults.websiteUrl ?? ""} placeholder="https://" />
          </Field>
          <Field label="Main phone" htmlFor="mainPhone" error={err.mainPhone}>
            <Input id="mainPhone" name="mainPhone" defaultValue={defaults.mainPhone ?? ""} />
          </Field>
          <Field label="Public business email" htmlFor="publicEmail" error={err.publicEmail}>
            <Input id="publicEmail" name="publicEmail" type="email" defaultValue={defaults.publicEmail ?? ""} />
          </Field>
          <Field label="Contact page URL" htmlFor="contactPageUrl" error={err.contactPageUrl}>
            <Input id="contactPageUrl" name="contactPageUrl" type="url" defaultValue={defaults.contactPageUrl ?? ""} placeholder="https://" />
          </Field>
          <Field label="Booking method" htmlFor="bookingMethod" error={err.bookingMethod}>
            <Select id="bookingMethod" name="bookingMethod" defaultValue={defaults.bookingMethod ?? ""}>
              <option value="">Not set</option>
              {BOOKING_METHODS.map((b) => (
                <option key={b} value={b}>
                  {b}
                </option>
              ))}
            </Select>
          </Field>
          <Field label="Online booking URL" htmlFor="onlineBookingUrl" error={err.onlineBookingUrl}>
            <Input id="onlineBookingUrl" name="onlineBookingUrl" type="url" defaultValue={defaults.onlineBookingUrl ?? ""} placeholder="https://" />
          </Field>
          <Field label="Number of locations" htmlFor="locationCount" error={err.locationCount}>
            <Input id="locationCount" name="locationCount" type="number" min={1} defaultValue={defaults.locationCount ?? 1} />
          </Field>
        </div>
      </section>

      <section className="space-y-4">
        <h2 className="text-sm font-semibold">Pipeline</h2>
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="Stage" htmlFor="stage" error={err.stage}>
            <Select id="stage" name="stage" defaultValue={defaults.stage ?? PipelineStage.DISCOVERED}>
              {STAGE_ORDER.map((s) => (
                <option key={s} value={s}>
                  {STAGE_LABELS[s]}
                </option>
              ))}
            </Select>
          </Field>
          {mode === "edit" ? (
            <Field label="Follow-up date" htmlFor="followUpDate" error={err.followUpDate}>
              <Input id="followUpDate" name="followUpDate" type="date" defaultValue={defaults.followUpDate ?? ""} />
            </Field>
          ) : null}
          <label className="flex items-center gap-2 self-end pb-2 text-sm">
            <Checkbox name="doNotContact" defaultChecked={defaults.doNotContact} />
            Do not contact
          </label>
        </div>
      </section>

      {mode === "create" ? (
        <>
          <section className="space-y-4">
            <h2 className="text-sm font-semibold">Primary contact (optional)</h2>
            <div className="grid gap-4 sm:grid-cols-2">
              <Field label="Contact name" htmlFor="contactName" error={err.contactName}>
                <Input id="contactName" name="contactName" />
              </Field>
              <Field label="Job title" htmlFor="contactTitle" error={err.contactTitle}>
                <Input id="contactTitle" name="contactTitle" placeholder="e.g. Clinic Manager" />
              </Field>
              <Field label="Contact email" htmlFor="contactEmail" error={err.contactEmail}>
                <Input id="contactEmail" name="contactEmail" type="email" />
              </Field>
              <Field label="Contact phone" htmlFor="contactPhone" error={err.contactPhone}>
                <Input id="contactPhone" name="contactPhone" />
              </Field>
            </div>
          </section>

          <section className="space-y-4">
            <h2 className="text-sm font-semibold">Additional</h2>
            <Field label="Primary address" htmlFor="primaryAddress" error={err.primaryAddress}>
              <Input id="primaryAddress" name="primaryAddress" />
            </Field>
            <Field label="Initial note" htmlFor="note" error={err.note}>
              <Textarea id="note" name="note" rows={3} />
            </Field>
            <label className="flex items-center gap-2 text-sm">
              <Checkbox name="isTestData" defaultChecked={defaults.doNotContact ? false : undefined} />
              Mark as test data
            </label>
          </section>
        </>
      ) : null}

      <div className="flex items-center gap-2 border-t pt-4">
        <SubmitButton pendingText="Saving...">
          {mode === "create" ? "Create lead" : "Save changes"}
        </SubmitButton>
        <Button type="button" variant="ghost" onClick={() => router.push(cancelHref)}>
          Cancel
        </Button>
      </div>
    </form>
  );
}
