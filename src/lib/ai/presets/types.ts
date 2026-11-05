import type { EmailLength, EmailTone } from "@/lib/ai/email-voice";
import type { UseCaseKey } from "@/lib/ai/use-cases";
import type { IndustryKey, Offering } from "@/lib/ai/org-ai-profile";

/**
 * An industry preset: the strong starting point an organization gets before it
 * has told us anything specific. Presets seed the org's AI profile and are then
 * overlaid by inference and the org's own edits (see `resolveOrgAiProfile`).
 *
 * Presets shape the AI / email side only. Lead scoring keeps its documented
 * defaults, which are already tunable per org in Settings.
 *
 * Adding an industry is one file here plus one line in `presets/index.ts`.
 */
export interface IndustryPreset {
  key: string;
  industry: IndustryKey;
  label: string;
  description: string;
  /** Use case selected by default for a new org in this industry. */
  defaultUseCase: UseCaseKey;
  /** Use cases that make sense for this industry, in display order. */
  supportedUseCases: UseCaseKey[];
  /** Starting offerings. May be slot-bound, slot-free, or a mix. */
  offerings: Offering[];
  /** Which offering leads for use cases not driven by opportunity areas. */
  primaryOfferingKey: string | null;
  /** Words this industry prefers. */
  terminology: string[];
  /** Words to avoid. */
  avoidTerms: string[];
  /** Additive restrictions applied on top of the fixed safety contract. */
  guardrails: string[];
  /** Voice defaults suggested at onboarding. */
  voice: { tone: EmailTone; length: EmailLength };
}
