import { z } from "zod";
import type {
  DraftClinic,
  EvidenceItem,
  OrgIdentity,
  OutreachStrategy,
} from "@/lib/ai/draft-types";

/**
 * Prompt templates + versioning for Stage B (draft generation). Bump
 * DRAFT_PROMPT_VERSION whenever the wording/rules change; every draft stores the
 * version that produced it, so drafts remain traceable and reproducible.
 *
 * Structured output is enforced with a forced tool call; the tool schema below
 * (`DRAFT_TOOL_SCHEMA` / `draftOutputSchema`) is the exact shape the model must
 * return, including a claim-to-evidence mapping the hallucination guard verifies.
 */

export const DRAFT_PROMPT_VERSION = "draft-v1";
export const DRAFT_TOOL_NAME = "compose_outreach_email";
export const DRAFT_TOOL_DESCRIPTION =
  "Return a short, evidence-grounded outreach email and the claim-to-evidence mapping for every factual statement it makes about the clinic.";

export const DRAFT_TOOL_SCHEMA: Record<string, unknown> = {
  type: "object",
  properties: {
    subject: { type: "string", description: "Concise, specific subject line. No clickbait or urgency." },
    body: {
      type: "string",
      description:
        "The email body, roughly 80-150 words. Plain text. No em dashes. Uses the exact clinic name.",
    },
    observationsUsed: {
      type: "array",
      items: { type: "string" },
      description: "Evidence codes (from the provided observations) referenced in the body.",
    },
    claims: {
      type: "array",
      description:
        "Every factual statement the body makes ABOUT THE CLINIC, each mapped to the evidence code that supports it. Generic benefit statements or the call to action use null.",
      items: {
        type: "object",
        properties: {
          text: { type: "string" },
          evidenceCode: { type: ["string", "null"] },
        },
        required: ["text", "evidenceCode"],
      },
    },
  },
  required: ["subject", "body", "observationsUsed", "claims"],
};

export const draftOutputSchema = z.object({
  subject: z.string().trim().min(1).max(200),
  body: z.string().trim().min(1).max(4000),
  observationsUsed: z.array(z.string()).default([]),
  claims: z
    .array(
      z.object({
        text: z.string(),
        evidenceCode: z.string().nullable().default(null),
      }),
    )
    .default([]),
});

export type DraftOutput = z.infer<typeof draftOutputSchema>;

export function parseDraftOutput(raw: unknown): DraftOutput {
  return draftOutputSchema.parse(raw);
}

// ---------------------------------------------------------------------------
// Prompt construction
// ---------------------------------------------------------------------------

const STRATEGY_GUIDANCE: Record<Exclude<OutreachStrategy, "INSUFFICIENT">, string> = {
  WEBSITE:
    "Pitch a website redesign. Focus on how a clearer, faster, more usable site helps prospective patients take the next step. Include the portfolio link.",
  SOFTWARE:
    "Pitch custom software. Focus on reducing manual or repeated administrative work implied by the evidence. Do not include the portfolio link unless website work is also pitched.",
  KLEARQ:
    "Pitch KlearQ phone management. Use careful wording such as 'may make call routing and callback visibility more difficult.' Never assert the clinic is losing calls or revenue. Do not include the portfolio link.",
  COMBINED:
    "Pitch the two strongest opportunity areas together, briefly. Lead with the strongest. Include the portfolio link only if website work is one of the areas.",
};

export const DRAFT_SYSTEM_PROMPT = [
  "You write short, professional B2B outreach emails for an agency that helps healthcare clinics.",
  "You may ONLY state observations that are given to you as evidence. Never invent facts about the clinic.",
  "Rules for every email:",
  "- Use the clinic's exact name as provided.",
  "- Mention only one or two of the provided observations, the most relevant ones.",
  "- Focus on a clear business benefit, not criticism. Neutral, respectful tone.",
  "- Keep the body roughly 80 to 150 words.",
  "- Use a single, low-pressure call to action.",
  "- Do not use em dashes. Use plain sentences.",
  "- Do not use generic AI filler, fake compliments, false familiarity, or manufactured urgency.",
  "- Never pretend to be a patient. Never mention how the clinic's information was gathered.",
  "- Never claim the clinic is losing calls, losing revenue, or failing operationally unless an observation explicitly and verifiably says so.",
  "- For every factual statement you make about the clinic, map it to the evidence code that supports it. If you cannot map a clinic-specific claim to a provided observation, do not make that claim.",
].join("\n");

function evidenceBlock(evidence: EvidenceItem[]): string {
  return evidence
    .map(
      (e, i) =>
        `${i + 1}. [code: ${e.code}] ${e.observation} (supporting detail: ${e.detail}; confidence: ${e.confidence})`,
    )
    .join("\n");
}

export interface DraftPromptInput {
  strategy: Exclude<OutreachStrategy, "INSUFFICIENT">;
  org: OrgIdentity;
  clinic: DraftClinic;
  evidence: EvidenceItem[];
}

export function buildDraftUserPrompt(input: DraftPromptInput): string {
  const { strategy, org, clinic, evidence } = input;
  const lines: string[] = [];

  lines.push(`Clinic name (use exactly): ${clinic.name}`);
  if (clinic.recipientName) lines.push(`Recipient name: ${clinic.recipientName}`);
  lines.push("");
  lines.push(`Agency / sender: ${org.companyName ?? "our agency"}`);
  if (org.senderName) lines.push(`Sender name: ${org.senderName}`);
  if (strategy === "WEBSITE" || strategy === "COMBINED") {
    lines.push(`Portfolio link (include in the body): ${org.portfolioUrl ?? "(not configured)"}`);
  }
  if (strategy === "KLEARQ" || strategy === "COMBINED") {
    const kq = org.klearqProductName ?? "KlearQ";
    lines.push(`Product: ${kq}${org.klearqTagline ? ` — ${org.klearqTagline}` : ""}`);
  }
  lines.push(`Contact / booking link: ${org.contactUrl ?? org.portfolioUrl ?? "(not configured)"}`);
  lines.push("");
  lines.push(`Strategy: ${STRATEGY_GUIDANCE[strategy]}`);
  lines.push("");
  lines.push("Observations you may use (cite by code; do not state anything not listed here):");
  lines.push(evidenceBlock(evidence));
  lines.push("");
  lines.push(
    "Write the subject and body now, then list observationsUsed and the claim-to-evidence mapping.",
  );

  return lines.join("\n");
}
