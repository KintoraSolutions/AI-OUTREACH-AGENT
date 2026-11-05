import { z } from "zod";
import type { AiProvider } from "@/lib/ai/types";
import type { CompanyProfile } from "@/lib/ai/company-profile";
import type { IndustryPreset } from "@/lib/ai/presets/types";
import { normalizeOfferings, OFFERING_SLOTS, type OrgAiProfile } from "@/lib/ai/org-ai-profile";
import { USE_CASE_VALUES } from "@/lib/ai/use-cases";

/**
 * Turns the free text captured at onboarding into a structured starting AI
 * configuration for the organization.
 *
 * Deliberately narrow: the model classifies the SENDER's business. It cannot
 * author guardrails — the tool schema has no such field, so an inferred config
 * can never be weaker than the industry preset's safety rules. It also cannot
 * invent facts about the sender beyond rephrasing what they told us.
 *
 * Returns null when the provider is unconfigured, so the caller falls back to
 * the preset with a visible notice. There is never a fake fallback.
 */

export const PROFILE_INFERENCE_PROMPT_VERSION = "profile-v1";
export const PROFILE_INFERENCE_TOOL_NAME = "propose_org_ai_profile";
export const PROFILE_INFERENCE_TOOL_DESCRIPTION =
  "Return a structured outreach configuration for the sender's business, based only on what they wrote about themselves.";

export const PROFILE_INFERENCE_TOOL_SCHEMA: Record<string, unknown> = {
  type: "object",
  properties: {
    useCase: {
      type: "string",
      enum: [...USE_CASE_VALUES],
      description:
        "patient_referral when the sender is a healthcare provider seeking referrals from other providers; service_pitch when the sender sells a product or service to other businesses.",
    },
    offerings: {
      type: "array",
      maxItems: 6,
      description: "What the sender offers, most important first.",
      items: {
        type: "object",
        properties: {
          name: { type: "string", description: "Short display name." },
          slot: {
            type: ["string", "null"],
            enum: [...OFFERING_SLOTS, null],
            description:
              "Link ONLY when the offering directly addresses that opportunity area in the RECIPIENT's business. Use null for the sender's own services (for example a clinical service).",
          },
          description: { type: "string" },
          pitchGuidance: { type: "string", description: "How to present it honestly." },
        },
        required: ["name", "slot", "description", "pitchGuidance"],
      },
    },
    terminology: {
      type: "array",
      items: { type: "string" },
      maxItems: 12,
      description: "Words this business uses for its customers and work.",
    },
    avoidTerms: { type: "array", items: { type: "string" }, maxItems: 12 },
    audienceNote: { type: "string", description: "Who the sender is trying to reach." },
    rationale: {
      type: "string",
      description: "One or two sentences explaining the choices, shown to the user for review.",
    },
  },
  required: ["useCase", "offerings", "terminology", "avoidTerms", "audienceNote", "rationale"],
};

const str = (max: number) =>
  z.preprocess((v) => {
    if (typeof v !== "string") return null;
    const t = v.trim();
    return t.length ? t.slice(0, max) : null;
  }, z.string().nullable());

export const profileInferenceOutputSchema = z.object({
  useCase: z.enum(USE_CASE_VALUES).catch("service_pitch"),
  offerings: z
    .array(
      z.object({
        name: z.string().trim().max(80).catch(""),
        slot: z
          .preprocess(
            (v) => (typeof v === "string" && (OFFERING_SLOTS as readonly string[]).includes(v) ? v : null),
            z.enum(OFFERING_SLOTS).nullable(),
          ),
        description: str(300),
        pitchGuidance: str(600),
      }),
    )
    .max(6)
    .catch([]),
  terminology: z.array(z.string().trim().max(60)).max(12).catch([]),
  avoidTerms: z.array(z.string().trim().max(60)).max(12).catch([]),
  audienceNote: str(600),
  rationale: str(600),
});

export type ProfileInferenceOutput = z.infer<typeof profileInferenceOutputSchema>;

export function parseProfileInference(raw: unknown): ProfileInferenceOutput {
  return profileInferenceOutputSchema.parse(raw);
}

export const PROFILE_INFERENCE_SYSTEM_PROMPT = [
  "You configure an outreach tool for a business, based only on how that business described itself.",
  "Rules:",
  "- Classify only. Do not invent services, credentials, results, or claims the sender did not state.",
  "- If something was not stated, leave it out rather than guessing.",
  "- You are not authoring safety rules. Safety rules are set elsewhere and are not your concern.",
  "- Link an offering to an opportunity area ONLY when the sender sells something that fixes that area for their recipients. A sender's own clinical or professional service is not an opportunity area; use null.",
  "- Keep every field short and plain. No marketing language.",
].join("\n");

export interface ProfileInferenceInput {
  companyName: string | null;
  company: CompanyProfile;
  objective: string | null;
  preset: IndustryPreset;
}

export function buildProfileInferencePrompt(input: ProfileInferenceInput): string {
  const { companyName, company, objective, preset } = input;
  const lines: string[] = [];
  lines.push(`Industry preset selected by the user: ${preset.label} (${preset.key}).`);
  lines.push(`Use cases available: ${preset.supportedUseCases.join(", ")}.`);
  lines.push("");
  lines.push("What the business told us about itself:");
  if (companyName) lines.push(`- Company name: ${companyName}`);
  if (company.companyDescription) lines.push(`- What they do: ${company.companyDescription}`);
  if (company.offer) lines.push(`- What they sell: ${company.offer}`);
  if (company.method) lines.push(`- How they do it: ${company.method}`);
  if (company.targetAudience) lines.push(`- Who they target: ${company.targetAudience}`);
  if (company.websiteUrl) lines.push(`- Website: ${company.websiteUrl}`);
  if (objective) lines.push(`- Goal for their emails: ${objective}`);
  lines.push("");
  lines.push("Propose the configuration now.");
  return lines.join("\n");
}

/** Map a model proposal onto the profile layer the resolver understands. */
export function toProfilePatch(out: ProfileInferenceOutput): Partial<OrgAiProfile> {
  const offerings = normalizeOfferings(
    out.offerings.map((o) => ({
      slot: o.slot,
      name: o.name,
      description: o.description,
      pitchGuidance: o.pitchGuidance,
      enabled: true,
    })),
  );
  return {
    useCase: out.useCase,
    offerings,
    primaryOfferingKey: offerings[0]?.key ?? null,
    terminology: out.terminology.filter(Boolean),
    avoidTerms: out.avoidTerms.filter(Boolean),
    audienceNote: out.audienceNote,
  };
}

export interface InferOrgProfileResult {
  patch: Partial<OrgAiProfile>;
  rationale: string | null;
  model: string;
}

/**
 * Run inference. Returns null when the AI provider is not configured so the
 * caller can fall back to the preset and say so plainly.
 */
export async function inferOrgAiProfile(
  input: ProfileInferenceInput & { provider: AiProvider },
): Promise<InferOrgProfileResult | null> {
  const { provider, ...rest } = input;
  if (!provider.isConfigured()) return null;

  const out = await provider.generateStructured({
    system: PROFILE_INFERENCE_SYSTEM_PROMPT,
    prompt: buildProfileInferencePrompt(rest),
    toolName: PROFILE_INFERENCE_TOOL_NAME,
    toolDescription: PROFILE_INFERENCE_TOOL_DESCRIPTION,
    schema: PROFILE_INFERENCE_TOOL_SCHEMA,
    parse: parseProfileInference,
    maxTokens: 900,
  });

  return { patch: toProfilePatch(out), rationale: out.rationale, model: provider.model };
}
