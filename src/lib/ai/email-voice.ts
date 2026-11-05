import { z } from "zod";
import { prisma } from "@/lib/db";

/**
 * Per-organization "email voice": the configurable parts of the outreach-email
 * prompt (tone, objective, signature, length, custom instructions). Stored as an
 * org-scoped `SystemSetting` row (key `email.voice`) — the same pattern the
 * scoring config uses (`scoring.weights`), so no schema migration is needed.
 *
 * These settings shape HOW the email reads and WHAT the sender is trying to
 * achieve. They never relax the evidence/grounding rules in the system prompt:
 * clinic-specific claims still have to map to real findings, and drafting stays
 * drafts-only.
 */

export const EMAIL_VOICE_SETTING_KEY = "email.voice";

export const EMAIL_TONE_VALUES = ["professional", "warm", "concise", "consultative", "formal"] as const;
export type EmailTone = (typeof EMAIL_TONE_VALUES)[number];
export const EMAIL_TONE_LABELS: Record<EmailTone, string> = {
  professional: "Professional",
  warm: "Warm & friendly",
  concise: "Concise & direct",
  consultative: "Consultative",
  formal: "Formal",
};

export const EMAIL_LENGTH_VALUES = ["short", "standard"] as const;
export type EmailLength = (typeof EMAIL_LENGTH_VALUES)[number];

export interface WordBand {
  min: number;
  max: number;
}

/**
 * The single source of truth for the target body length. The prompt guidance,
 * the structured-output tool schema, the UI labels, and the post-generation
 * word-count check all derive from this — previously four copies disagreed, so
 * every "short" draft warned about a length it had been asked to produce.
 */
export const LENGTH_WORD_BANDS: Record<EmailLength, WordBand> = {
  short: { min: 60, max: 100 },
  standard: { min: 90, max: 150 },
};

export const DEFAULT_WORD_BAND: WordBand = LENGTH_WORD_BANDS.standard;

export function wordBandFor(voice: Pick<EmailVoice, "length">): WordBand {
  return LENGTH_WORD_BANDS[voice.length] ?? DEFAULT_WORD_BAND;
}

export const EMAIL_LENGTH_LABELS: Record<EmailLength, string> = {
  short: `Short (~${LENGTH_WORD_BANDS.short.min}–${LENGTH_WORD_BANDS.short.max} words)`,
  standard: `Standard (~${LENGTH_WORD_BANDS.standard.min}–${LENGTH_WORD_BANDS.standard.max} words)`,
};

export const SIGN_OFF_PRESETS = [
  "Best,",
  "Warm regards,",
  "Kind regards,",
  "Thanks,",
  "All the best,",
] as const;

export interface EmailVoice {
  tone: EmailTone;
  length: EmailLength;
  /** The sender's goal for the email; steers the single call to action. */
  objective: string | null;
  /** One-line description of what the sender offers (the sender's own words). */
  valueProp: string | null;
  /** Append a sign-off + signature (sender name/title/company) to the email. */
  signatureEnabled: boolean;
  /** Sender title/role shown under the name, e.g. "ENT Specialist". */
  senderTitle: string | null;
  /** Closing line, e.g. "Best,". Falls back to "Best," when empty. */
  signOff: string | null;
  /** Freeform additional do's and don'ts (subordinate to the safety rules). */
  customInstructions: string | null;
}

/** Defaults that reproduce the pre-configuration behavior when nothing is set. */
export const DEFAULT_EMAIL_VOICE: EmailVoice = {
  tone: "professional",
  length: "standard",
  objective: null,
  valueProp: null,
  signatureEnabled: true,
  senderTitle: null,
  signOff: "Best,",
  customInstructions: null,
};

/** Trim + cap a free-text field to `max`, coercing empty/non-string to null. */
const text = (max: number) =>
  z.preprocess((v) => {
    if (typeof v !== "string") return null;
    const t = v.trim();
    return t.length ? t.slice(0, max) : null;
  }, z.string().nullable());

/** Accepts a stored boolean or an HTML checkbox value; missing → true (default). */
const signatureBool = z.preprocess(
  (v) => (v === undefined ? true : v === true || v === "on" || v === "true"),
  z.boolean(),
);

/**
 * Parses either a stored settings row (`value` JSON) or raw form fields into a
 * complete `EmailVoice`. `.catch` keeps loading resilient: a bad/legacy value
 * falls back to the default rather than throwing.
 */
export const emailVoiceSchema = z.object({
  tone: z.enum(EMAIL_TONE_VALUES).catch("professional"),
  length: z.enum(EMAIL_LENGTH_VALUES).catch("standard"),
  objective: text(600),
  valueProp: text(400),
  signatureEnabled: signatureBool,
  senderTitle: text(120),
  signOff: text(60),
  customInstructions: text(1000),
});

/** Read an org's stored email voice, or the defaults when unset/unparseable. */
export async function loadEmailVoice(orgId: string): Promise<EmailVoice> {
  const row = await prisma.systemSetting.findUnique({
    where: { orgId_key: { orgId, key: EMAIL_VOICE_SETTING_KEY } },
  });
  if (!row) return DEFAULT_EMAIL_VOICE;
  const parsed = emailVoiceSchema.safeParse(row.value);
  return parsed.success ? parsed.data : DEFAULT_EMAIL_VOICE;
}
