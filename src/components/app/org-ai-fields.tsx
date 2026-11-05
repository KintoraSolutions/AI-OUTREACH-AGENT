"use client";

import { useState } from "react";
import { Plus, Trash2 } from "lucide-react";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Select } from "@/components/ui/select";
import { Field } from "@/components/ui/field";
import { Button } from "@/components/ui/button";
import {
  DEFAULT_SLOT_LABELS,
  MAX_OFFERINGS,
  OFFERING_SLOTS,
  type Offering,
  type OrgAiProfile,
} from "@/lib/ai/org-ai-profile";
import { INDUSTRY_VALUES } from "@/lib/ai/org-ai-profile";
import { USE_CASE_LABELS, USE_CASE_VALUES } from "@/lib/ai/use-cases";

const INDUSTRY_LABELS: Record<(typeof INDUSTRY_VALUES)[number], string> = {
  healthcare: "Healthcare",
  general: "General business",
};

const blankOffering = (i: number): Offering => ({
  key: `offering-${i + 1}`,
  slot: null,
  name: "",
  shortLabel: "",
  description: null,
  pitchGuidance: null,
  proofUrl: null,
  enabled: true,
});

/**
 * The organization's AI configuration editor. Shared verbatim by Settings and
 * the onboarding review step. Because offerings repeat, the whole configuration
 * is submitted as one JSON field (the pattern the scoring rules form uses),
 * which the server action re-parses with `orgAiProfileSchema`.
 *
 * Guardrails supplied by the industry preset and the use case are shown read
 * only: they can be added to, never edited away.
 */
export function OrgAiFields({
  profile,
  presetGuardrails,
  disabled,
}: {
  profile: OrgAiProfile;
  presetGuardrails: string[];
  disabled?: boolean;
}) {
  const [industry, setIndustry] = useState(profile.industry);
  const [useCase, setUseCase] = useState(profile.useCase);
  const [offerings, setOfferings] = useState<Offering[]>(
    profile.offerings.length ? profile.offerings : [blankOffering(0)],
  );
  const [primaryKey, setPrimaryKey] = useState(profile.primaryOfferingKey ?? "");
  const [terminology, setTerminology] = useState(profile.terminology.join("\n"));
  const [avoidTerms, setAvoidTerms] = useState(profile.avoidTerms.join("\n"));
  const [customGuardrails, setCustomGuardrails] = useState(profile.customGuardrails.join("\n"));
  const [audienceNote, setAudienceNote] = useState(profile.audienceNote ?? "");

  const patch = (i: number, next: Partial<Offering>) =>
    setOfferings((list) => list.map((o, idx) => (idx === i ? { ...o, ...next } : o)));

  const payload = JSON.stringify({
    ...profile,
    industry,
    // The preset follows the industry so the right guardrails always apply.
    presetKey: industry,
    useCase,
    offerings,
    primaryOfferingKey: primaryKey || null,
    terminology,
    avoidTerms,
    customGuardrails,
    audienceNote,
  });

  return (
    <div className="space-y-6">
      <input type="hidden" name="profile" value={payload} />

      <div className="grid gap-4 sm:grid-cols-2">
        <Field label="Industry" htmlFor="industry" hint="Sets the starting preset and its safety rules.">
          <Select
            id="industry"
            value={industry}
            onChange={(e) => setIndustry(e.target.value as typeof industry)}
            disabled={disabled}
          >
            {INDUSTRY_VALUES.map((v) => (
              <option key={v} value={v}>
                {INDUSTRY_LABELS[v]}
              </option>
            ))}
          </Select>
        </Field>
        <Field label="What are these emails for?" htmlFor="useCase" hint="Sets who you are writing to.">
          <Select
            id="useCase"
            value={useCase}
            onChange={(e) => setUseCase(e.target.value as typeof useCase)}
            disabled={disabled}
          >
            {USE_CASE_VALUES.map((v) => (
              <option key={v} value={v}>
                {USE_CASE_LABELS[v]}
              </option>
            ))}
          </Select>
        </Field>
      </div>

      {/* Offerings */}
      <div className="space-y-3">
        <div>
          <h3 className="text-sm font-semibold">What you offer</h3>
          <p className="text-sm text-muted-foreground">
            Used to write the pitch. Linking an offering to an opportunity area also renames that
            area everywhere in the app.
          </p>
        </div>

        {offerings.map((o, i) => (
          <div key={i} className="space-y-3 rounded-lg border p-3">
            <div className="grid gap-3 sm:grid-cols-[1fr_180px_auto]">
              <Field label="Name" htmlFor={`off-name-${i}`}>
                <Input
                  id={`off-name-${i}`}
                  value={o.name}
                  onChange={(e) => patch(i, { name: e.target.value })}
                  maxLength={80}
                  placeholder="Physiotherapy"
                  disabled={disabled}
                />
              </Field>
              <Field label="Opportunity area" htmlFor={`off-slot-${i}`} hint="Optional.">
                <Select
                  id={`off-slot-${i}`}
                  value={o.slot ?? ""}
                  onChange={(e) => patch(i, { slot: (e.target.value || null) as Offering["slot"] })}
                  disabled={disabled}
                >
                  <option value="">Not linked</option>
                  {OFFERING_SLOTS.map((s) => (
                    <option key={s} value={s}>
                      {DEFAULT_SLOT_LABELS[s].name}
                    </option>
                  ))}
                </Select>
              </Field>
              <div className="flex items-end pb-1">
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  disabled={disabled || offerings.length <= 1}
                  onClick={() => setOfferings((l) => l.filter((_, idx) => idx !== i))}
                  aria-label={`Remove ${o.name || "offering"}`}
                >
                  <Trash2 className="size-4" />
                </Button>
              </div>
            </div>
            <Field label="Description" htmlFor={`off-desc-${i}`}>
              <Input
                id={`off-desc-${i}`}
                value={o.description ?? ""}
                onChange={(e) => patch(i, { description: e.target.value || null })}
                maxLength={300}
                placeholder="What it is, in one line."
                disabled={disabled}
              />
            </Field>
            <Field label="How to pitch it" htmlFor={`off-pitch-${i}`}>
              <Textarea
                id={`off-pitch-${i}`}
                rows={2}
                value={o.pitchGuidance ?? ""}
                onChange={(e) => patch(i, { pitchGuidance: e.target.value || null })}
                maxLength={600}
                placeholder="Lead with the outcome, not the feature."
                disabled={disabled}
              />
            </Field>
            <div className="grid gap-3 sm:grid-cols-2">
              <Field label="Supporting link" htmlFor={`off-url-${i}`}>
                <Input
                  id={`off-url-${i}`}
                  value={o.proofUrl ?? ""}
                  onChange={(e) => patch(i, { proofUrl: e.target.value || null })}
                  maxLength={300}
                  placeholder="https://"
                  disabled={disabled}
                />
              </Field>
              <div className="flex items-end gap-4 pb-2">
                <label className="flex cursor-pointer items-center gap-2 text-sm">
                  <input
                    type="checkbox"
                    checked={o.enabled}
                    onChange={(e) => patch(i, { enabled: e.target.checked })}
                    className="size-4 accent-[var(--mint)]"
                    disabled={disabled}
                  />
                  Active
                </label>
                <label className="flex cursor-pointer items-center gap-2 text-sm">
                  <input
                    type="radio"
                    name="primaryOffering"
                    checked={primaryKey === o.key}
                    onChange={() => setPrimaryKey(o.key)}
                    className="size-4 accent-[var(--mint)]"
                    disabled={disabled}
                  />
                  Lead with this
                </label>
              </div>
            </div>
          </div>
        ))}

        {offerings.length < MAX_OFFERINGS && !disabled ? (
          <Button
            type="button"
            variant="secondary"
            size="sm"
            onClick={() => setOfferings((l) => [...l, blankOffering(l.length)])}
          >
            <Plus className="mr-1.5 size-4" /> Add an offering
          </Button>
        ) : null}
      </div>

      <div className="grid gap-4 sm:grid-cols-2">
        <Field label="Preferred wording (one per line)" htmlFor="terminology">
          <Textarea
            id="terminology"
            rows={3}
            value={terminology}
            onChange={(e) => setTerminology(e.target.value)}
            placeholder={"practice\npatients"}
            disabled={disabled}
          />
        </Field>
        <Field label="Words to avoid (one per line)" htmlFor="avoidTerms">
          <Textarea
            id="avoidTerms"
            rows={3}
            value={avoidTerms}
            onChange={(e) => setAvoidTerms(e.target.value)}
            placeholder={"customer\ndeal"}
            disabled={disabled}
          />
        </Field>
      </div>

      <Field
        label="Who you are trying to reach"
        htmlFor="audienceNote"
        hint="Background context for the AI. Never stated to the recipient."
      >
        <Textarea
          id="audienceNote"
          rows={2}
          value={audienceNote}
          onChange={(e) => setAudienceNote(e.target.value)}
          maxLength={600}
          placeholder="Family physicians within 20km who don't offer physiotherapy in house."
          disabled={disabled}
        />
      </Field>

      <Field
        label="Your own rules (one per line)"
        htmlFor="customGuardrails"
        hint="Extra restrictions for every email. These are added to the built-in rules, never replacing them."
      >
        <Textarea
          id="customGuardrails"
          rows={3}
          value={customGuardrails}
          onChange={(e) => setCustomGuardrails(e.target.value)}
          placeholder={"Never mention pricing.\nAlways note we report back to the referrer."}
          disabled={disabled}
        />
      </Field>

      {presetGuardrails.length ? (
        <div className="rounded-lg border bg-[var(--surface-2)] p-3">
          <p className="text-xs font-medium text-muted-foreground">
            Always applied for this industry and use case
          </p>
          <ul className="mt-1.5 list-disc space-y-1 pl-4 text-xs text-muted-foreground">
            {presetGuardrails.map((g) => (
              <li key={g}>{g}</li>
            ))}
          </ul>
        </div>
      ) : null}
    </div>
  );
}
