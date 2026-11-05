import type { IndustryPreset } from "@/lib/ai/presets/types";

/**
 * The neutral fallback preset. No industry assumptions, no product names — just
 * the three generic opportunity areas the scoring engine already measures.
 */
export const generalPreset: IndustryPreset = {
  key: "general",
  industry: "general",
  label: "General business",
  description: "A neutral starting point with no industry-specific assumptions.",
  defaultUseCase: "service_pitch",
  supportedUseCases: ["service_pitch"],
  offerings: [
    {
      key: "website",
      slot: "WEBSITE",
      name: "Website",
      shortLabel: "WEB",
      description: "Website design and rebuilds.",
      pitchGuidance:
        "Focus on how a clearer, faster, more usable site helps visitors take the next step.",
      proofUrl: null,
      enabled: true,
    },
    {
      key: "custom-software",
      slot: "SOFTWARE",
      name: "Custom software",
      shortLabel: "SW",
      description: "Custom tools and workflow automation.",
      pitchGuidance:
        "Focus on reducing the manual or repeated administrative work the evidence implies.",
      proofUrl: null,
      enabled: true,
    },
    {
      key: "phone-operations",
      slot: "KLEARQ",
      name: "Phone operations",
      shortLabel: "PHONE",
      description: "Call handling, routing, and callback visibility.",
      pitchGuidance:
        "Use careful wording such as 'may make call routing and callback visibility more difficult.' Never assert the recipient is losing calls or revenue.",
      proofUrl: null,
      enabled: true,
    },
  ],
  primaryOfferingKey: "website",
  terminology: [],
  avoidTerms: [],
  guardrails: [],
  voice: { tone: "professional", length: "standard" },
};
