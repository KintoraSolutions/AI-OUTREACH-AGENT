import type { IndustryPreset } from "@/lib/ai/presets/types";

/**
 * Healthcare preset.
 *
 * Supports both directions healthcare organizations actually send outreach in:
 *  - `patient_referral` — a provider introducing their practice to other
 *    providers who may refer patients to them (the common case).
 *  - `service_pitch` — selling a product or service to clinics.
 *
 * The offerings below are written for the referral case (clinical services a
 * practice wants referrals for) because that is the default use case; an org
 * pitching services to clinics edits them at onboarding or in Settings.
 *
 * The guardrails are the important part: healthcare outreach must never touch
 * protected health information, and must never characterize another provider's
 * clinical judgment. These ADD to the fixed safety contract; they never relax it.
 */
export const healthcarePreset: IndustryPreset = {
  key: "healthcare",
  industry: "healthcare",
  label: "Healthcare",
  description:
    "Clinics, practices, and healthcare providers. Supports referral outreach between providers as well as selling services to practices.",
  defaultUseCase: "patient_referral",
  supportedUseCases: ["patient_referral", "service_pitch"],
  // Slot-FREE on purpose. A clinical service is not a "website opportunity";
  // binding it to a slot would rename the recipient-facing scoring categories in
  // the leads UI. Slots stay on their neutral area names for referral orgs.
  offerings: [
    {
      key: "clinical-service",
      slot: null,
      name: "Primary clinical service",
      shortLabel: "CARE",
      description: "The main service you want referrals for.",
      pitchGuidance:
        "Describe the service plainly and factually: what you treat, who it suits, and what a referred patient can expect. Do not promise outcomes.",
      proofUrl: null,
      enabled: true,
    },
    {
      key: "referral-access",
      slot: null,
      name: "Referral access",
      shortLabel: "ACCESS",
      description: "How referrals reach you: availability, intake process, coverage.",
      pitchGuidance:
        "Make referring easy and concrete: how to refer, typical availability, and who to contact. State only what you know to be true.",
      proofUrl: null,
      enabled: false,
    },
  ],
  primaryOfferingKey: "clinical-service",
  terminology: ["practice", "patients", "referral", "provider", "intake"],
  avoidTerms: ["customer", "client", "deal", "prospect", "buy"],
  guardrails: [
    "Never include protected health information: no patient names, identifiers, conditions, treatments, or visit details.",
    "Write provider to provider, as a professional peer. Do not write to the recipient as if they were a patient.",
    "Do not give medical advice and do not promise clinical outcomes.",
    "Do not claim any accreditation, credential, affiliation, or insurance coverage that is not explicitly provided in the sender's own details.",
  ],
  voice: { tone: "professional", length: "standard" },
};
