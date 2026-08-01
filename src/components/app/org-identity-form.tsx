"use client";

import { useActionState, useEffect } from "react";
import { toast } from "sonner";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Field } from "@/components/ui/field";
import { SubmitButton } from "@/components/app/submit-button";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { updateOrgIdentity } from "@/app/(dashboard)/settings/actions";
import { initialFormState, type FormState } from "@/lib/actions/form";

export interface OrgIdentityDefaults {
  name: string;
  companyName: string | null;
  portfolioUrl: string | null;
  contactUrl: string | null;
  senderName: string | null;
  senderEmail: string | null;
  klearqProductName: string | null;
  klearqTagline: string | null;
  klearqUrl: string | null;
  klearqCapabilities: string[];
}

export function OrgIdentityForm({
  defaults,
  canEdit,
}: {
  defaults: OrgIdentityDefaults;
  canEdit: boolean;
}) {
  const [state, formAction] = useActionState<FormState, FormData>(updateOrgIdentity, initialFormState);
  const err = state.fieldErrors ?? {};

  useEffect(() => {
    if (state.ok && state.message) toast.success(state.message);
    else if (state.error) toast.error(state.error);
  }, [state]);

  return (
    <form action={formAction} className="space-y-8">
      {!canEdit ? (
        <Alert variant="warning">
          <AlertDescription>
            You have read-only access. Only Admins and Owners can edit organization settings.
          </AlertDescription>
        </Alert>
      ) : null}

      <fieldset disabled={!canEdit} className="space-y-8">
        <section className="space-y-4">
          <div>
            <h2 className="text-sm font-semibold">Organization &amp; sender identity</h2>
            <p className="text-sm text-muted-foreground">
              Used in outreach emails. Not hardcoded anywhere.
            </p>
          </div>
          <div className="grid gap-4 sm:grid-cols-2">
            <Field label="Organization name" htmlFor="name" required error={err.name}>
              <Input id="name" name="name" defaultValue={defaults.name} required />
            </Field>
            <Field label="Company name (shown to clinics)" htmlFor="companyName" error={err.companyName}>
              <Input id="companyName" name="companyName" defaultValue={defaults.companyName ?? ""} />
            </Field>
            <Field label="Portfolio URL" htmlFor="portfolioUrl" error={err.portfolioUrl}>
              <Input id="portfolioUrl" name="portfolioUrl" type="url" defaultValue={defaults.portfolioUrl ?? ""} placeholder="https://" />
            </Field>
            <Field label="Contact / booking URL" htmlFor="contactUrl" error={err.contactUrl}>
              <Input id="contactUrl" name="contactUrl" type="url" defaultValue={defaults.contactUrl ?? ""} placeholder="https://" />
            </Field>
            <Field label="Sender name" htmlFor="senderName" error={err.senderName}>
              <Input id="senderName" name="senderName" defaultValue={defaults.senderName ?? ""} />
            </Field>
            <Field label="Sender email" htmlFor="senderEmail" error={err.senderEmail}>
              <Input id="senderEmail" name="senderEmail" type="email" defaultValue={defaults.senderEmail ?? ""} />
            </Field>
          </div>
        </section>

        <section className="space-y-4">
          <div>
            <h2 className="text-sm font-semibold">KlearQ product</h2>
            <p className="text-sm text-muted-foreground">
              Details used when the AI recommends KlearQ (used in later phases).
            </p>
          </div>
          <div className="grid gap-4 sm:grid-cols-2">
            <Field label="Product name" htmlFor="klearqProductName" error={err.klearqProductName}>
              <Input id="klearqProductName" name="klearqProductName" defaultValue={defaults.klearqProductName ?? ""} />
            </Field>
            <Field label="Tagline" htmlFor="klearqTagline" error={err.klearqTagline}>
              <Input id="klearqTagline" name="klearqTagline" defaultValue={defaults.klearqTagline ?? ""} />
            </Field>
            <Field label="Product URL" htmlFor="klearqUrl" error={err.klearqUrl} className="sm:col-span-2">
              <Input id="klearqUrl" name="klearqUrl" type="url" defaultValue={defaults.klearqUrl ?? ""} placeholder="https://" />
            </Field>
            <Field
              label="Capabilities (one per line)"
              htmlFor="klearqCapabilities"
              error={err.klearqCapabilities}
              className="sm:col-span-2"
            >
              <Textarea
                id="klearqCapabilities"
                name="klearqCapabilities"
                rows={5}
                defaultValue={defaults.klearqCapabilities.join("\n")}
                placeholder={"Centralized call queues\nMissed-call tracking\nCallback lists"}
              />
            </Field>
          </div>
        </section>

        {canEdit ? (
          <div className="border-t pt-4">
            <SubmitButton pendingText="Saving...">Save settings</SubmitButton>
          </div>
        ) : null}
      </fieldset>
    </form>
  );
}
