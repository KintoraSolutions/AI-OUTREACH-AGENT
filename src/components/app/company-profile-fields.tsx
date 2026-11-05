"use client";

import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Field } from "@/components/ui/field";
import type { CompanyProfile } from "@/lib/ai/company-profile";
import type { FieldErrors } from "@/lib/actions/form";

/**
 * The company-profile form controls (what you do, what you sell, how, who you
 * target, and links). Presentational only — it renders inputs with the `name`s
 * `companyProfileSchema` expects; the enclosing <form> owns submission. Shared
 * by the Settings company-profile card and the first-run onboarding form.
 */
export function CompanyProfileFields({
  defaults,
  errors = {},
}: {
  defaults: CompanyProfile;
  errors?: FieldErrors;
}) {
  return (
    <div className="space-y-6">
      <Field
        label="What does your company do?"
        htmlFor="companyDescription"
        hint="A sentence or two about your business. Used as context so emails sound like you."
        error={errors.companyDescription}
      >
        <Textarea
          id="companyDescription"
          name="companyDescription"
          rows={2}
          defaultValue={defaults.companyDescription ?? ""}
          maxLength={600}
          placeholder="We're a small studio helping healthcare clinics win more patients online."
        />
      </Field>

      <Field
        label="What are you selling?"
        htmlFor="offer"
        hint="The product or service you offer. Presented as your offer, never attributed to the recipient."
        error={errors.offer}
      >
        <Textarea
          id="offer"
          name="offer"
          rows={2}
          defaultValue={defaults.offer ?? ""}
          maxLength={600}
          placeholder="Modern clinic websites and custom booking software."
        />
      </Field>

      <Field
        label="How do you do it?"
        htmlFor="method"
        hint="Your approach or what makes it work."
        error={errors.method}
      >
        <Textarea
          id="method"
          name="method"
          rows={2}
          defaultValue={defaults.method ?? ""}
          maxLength={600}
          placeholder="We audit each clinic's site and phone setup, then propose the highest-impact fix."
        />
      </Field>

      <Field
        label="Who do you want to target?"
        htmlFor="targetAudience"
        hint="Your ideal customer or market. Context only; it is never stated to the recipient."
        error={errors.targetAudience}
      >
        <Textarea
          id="targetAudience"
          name="targetAudience"
          rows={2}
          defaultValue={defaults.targetAudience ?? ""}
          maxLength={400}
          placeholder="Independent and small-group healthcare clinics in North America."
        />
      </Field>

      <div className="grid gap-4 sm:grid-cols-2">
        <Field label="Company website" htmlFor="websiteUrl" error={errors.websiteUrl}>
          <Input
            id="websiteUrl"
            name="websiteUrl"
            defaultValue={defaults.websiteUrl ?? ""}
            maxLength={300}
            placeholder="https://yourcompany.com"
          />
        </Field>
        <Field label="LinkedIn" htmlFor="linkedinUrl" error={errors.linkedinUrl}>
          <Input
            id="linkedinUrl"
            name="linkedinUrl"
            defaultValue={defaults.linkedinUrl ?? ""}
            maxLength={300}
            placeholder="linkedin.com/company/yourcompany"
          />
        </Field>
      </div>

      <Field
        label="Other social links (one per line)"
        htmlFor="socialLinks"
        hint="Optional. Instagram, X, Facebook, etc. Kept as context."
        error={errors.socialLinks}
      >
        <Textarea
          id="socialLinks"
          name="socialLinks"
          rows={3}
          defaultValue={defaults.socialLinks.join("\n")}
          placeholder={"instagram.com/yourcompany\nx.com/yourcompany"}
        />
      </Field>
    </div>
  );
}
