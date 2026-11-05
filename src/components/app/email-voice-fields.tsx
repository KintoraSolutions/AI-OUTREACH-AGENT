"use client";

import { useState } from "react";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Select } from "@/components/ui/select";
import { Field } from "@/components/ui/field";
import {
  EMAIL_LENGTH_LABELS,
  EMAIL_LENGTH_VALUES,
  EMAIL_TONE_LABELS,
  EMAIL_TONE_VALUES,
  SIGN_OFF_PRESETS,
  type EmailVoice,
} from "@/lib/ai/email-voice";

/**
 * The email-voice form controls (tone, length, objective, optional value prop,
 * signature, custom instructions) with a live signature preview. Presentational
 * only — it renders inputs with `name`s the `emailVoiceSchema` expects; the
 * enclosing <form> owns submission. Shared by the Settings email-voice card and
 * the first-run onboarding form.
 *
 * `senderName`/`companyName` drive the preview. In Settings they are the saved
 * org values (static); in onboarding they are the values being typed right now,
 * so the preview stays live. `showValueProp` is false in onboarding, where the
 * company profile's "what you sell" already captures the offer.
 */
export function EmailVoiceFields({
  voice,
  senderName,
  companyName,
  showValueProp = true,
}: {
  voice: EmailVoice;
  senderName: string | null;
  companyName: string | null;
  showValueProp?: boolean;
}) {
  const [sigEnabled, setSigEnabled] = useState(voice.signatureEnabled);
  const [title, setTitle] = useState(voice.senderTitle ?? "");
  const [signOff, setSignOff] = useState(voice.signOff ?? "Best,");

  const name = senderName?.trim() ?? "";
  const nameLine = name ? `${name}${title.trim() ? `, ${title.trim()}` : ""}` : "";
  const previewLines = [signOff.trim() || "Best,"];
  if (nameLine) previewLines.push(nameLine);
  if (companyName && companyName !== name) previewLines.push(companyName);
  const hasSignature = Boolean(nameLine || companyName);

  return (
    <div className="space-y-6">
      <div className="grid gap-4 sm:grid-cols-2">
        <Field label="Tone" htmlFor="tone" hint="How the email should read.">
          <Select id="tone" name="tone" defaultValue={voice.tone}>
            {EMAIL_TONE_VALUES.map((t) => (
              <option key={t} value={t}>
                {EMAIL_TONE_LABELS[t]}
              </option>
            ))}
          </Select>
        </Field>
        <Field label="Length" htmlFor="length" hint="Target body length.">
          <Select id="length" name="length" defaultValue={voice.length}>
            {EMAIL_LENGTH_VALUES.map((l) => (
              <option key={l} value={l}>
                {EMAIL_LENGTH_LABELS[l]}
              </option>
            ))}
          </Select>
        </Field>
      </div>

      <Field
        label="Objective"
        htmlFor="objective"
        hint="What each email should drive toward. Shapes the single call to action."
      >
        <Textarea
          id="objective"
          name="objective"
          rows={2}
          defaultValue={voice.objective ?? ""}
          maxLength={600}
          placeholder="Introduce us as a local referral partner and offer a short intro call."
        />
      </Field>

      {showValueProp ? (
        <Field
          label="What you offer"
          htmlFor="valueProp"
          hint="One line describing your service, in your own words. Kept as the sender's offer, never attributed to the clinic."
        >
          <Textarea
            id="valueProp"
            name="valueProp"
            rows={2}
            defaultValue={voice.valueProp ?? ""}
            maxLength={400}
            placeholder="We build fast, modern clinic websites that make booking effortless for patients."
          />
        </Field>
      ) : null}

      {/* Signature */}
      <div className="space-y-4 rounded-lg border p-4">
        <label className="flex cursor-pointer items-center gap-2.5">
          <input
            type="checkbox"
            name="signatureEnabled"
            checked={sigEnabled}
            onChange={(e) => setSigEnabled(e.target.checked)}
            className="size-4 accent-[var(--mint)]"
          />
          <span className="text-sm font-medium">Add a sign-off and signature to every email</span>
        </label>

        {sigEnabled ? (
          <>
            <div className="grid gap-4 sm:grid-cols-2">
              <Field label="Sign-off" htmlFor="signOff" hint="The closing line.">
                <Input
                  id="signOff"
                  name="signOff"
                  value={signOff}
                  onChange={(e) => setSignOff(e.target.value)}
                  list="signoff-presets"
                  maxLength={60}
                  placeholder="Best,"
                />
              </Field>
              {/* Sibling of Field (not a child): a second child would drop Field's aria wiring. */}
              <datalist id="signoff-presets">
                {SIGN_OFF_PRESETS.map((p) => (
                  <option key={p} value={p} />
                ))}
              </datalist>
              <Field label="Your title / role" htmlFor="senderTitle" hint="Shown under your name (optional).">
                <Input
                  id="senderTitle"
                  name="senderTitle"
                  value={title}
                  onChange={(e) => setTitle(e.target.value)}
                  maxLength={120}
                  placeholder="ENT Specialist"
                />
              </Field>
            </div>

            <div>
              <p className="mb-1.5 text-xs font-medium text-muted-foreground">Signature preview</p>
              {hasSignature ? (
                <pre className="whitespace-pre-line rounded-md border bg-[var(--surface-2)] px-3 py-2.5 font-sans text-sm text-foreground">
                  {previewLines.join("\n")}
                </pre>
              ) : (
                <p className="text-xs text-muted-foreground">
                  Add your <span className="font-medium">name</span> above to include it in the signature.
                </p>
              )}
            </div>
          </>
        ) : (
          // Keep the fields in the form (unmounted inputs would drop from FormData),
          // but hidden, so an unchecked box still submits the stored values.
          <>
            <input type="hidden" name="signOff" value={signOff} />
            <input type="hidden" name="senderTitle" value={title} />
          </>
        )}
      </div>

      <Field
        label="Custom instructions"
        htmlFor="customInstructions"
        hint="Extra do's and don'ts. Followed unless they conflict with the built-in safety rules (which always win)."
      >
        <Textarea
          id="customInstructions"
          name="customInstructions"
          rows={3}
          defaultValue={voice.customInstructions ?? ""}
          maxLength={1000}
          placeholder={"Never mention pricing.\nAlways note we send patients back with clear notes."}
        />
      </Field>
    </div>
  );
}
