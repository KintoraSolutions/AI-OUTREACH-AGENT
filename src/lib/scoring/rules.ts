import { Confidence, FindingCategory } from "@prisma/client";
import type { ScoringConfig, ScoringRule } from "@/lib/scoring/types";

/**
 * The documented DEFAULT scoring model (plan.md Section 6A). Every point value,
 * cap, confidence multiplier, and recommendation threshold below is a default
 * that an org admin can override in Settings; the effective config is resolved in
 * `config.ts`. Rule ids are stable and prefixed by area so a code maps to exactly
 * one scoring category and stays unique within an audit.
 *
 * Bump this when the DEFAULT rule set changes so previously-stored scores keep
 * the version that produced them.
 */
export const DEFAULT_RULESET_VERSION = "default-v1";

const F = FindingCategory;
const C = Confidence;

export const DEFAULT_RULES: ScoringRule[] = [
  // --- Website opportunity (cap 30) ---
  { id: "web_no_booking_cta", category: F.WEBSITE, points: 8, minConfidence: C.WEAK_INFERENCE, label: "No clear online booking", description: "No prominent online booking action was detected." },
  { id: "web_poor_mobile", category: F.WEBSITE, points: 6, minConfidence: C.WEAK_INFERENCE, label: "Weak mobile readiness", description: "Missing responsive viewport or a failed mobile-friendly check." },
  { id: "web_poor_performance", category: F.WEBSITE, points: 5, minConfidence: C.STRONG_INFERENCE, label: "Poor performance", description: "PageSpeed performance score is low." },
  { id: "web_broken_links", category: F.WEBSITE, points: 3, minConfidence: C.STRONG_INFERENCE, label: "Broken internal links", description: "One or more internal links appear broken." },
  { id: "web_missing_https", category: F.WEBSITE, points: 3, minConfidence: C.VERIFIED, label: "No HTTPS", description: "The site is not served over HTTPS." },
  { id: "web_missing_metadata", category: F.WEBSITE, points: 2, minConfidence: C.STRONG_INFERENCE, label: "Missing page metadata", description: "No page title or meta description was found." },
  { id: "web_missing_location", category: F.WEBSITE, points: 2, minConfidence: C.WEAK_INFERENCE, label: "Missing location info", description: "No address / location information was found on the site." },
  { id: "web_missing_service_pages", category: F.WEBSITE, points: 2, minConfidence: C.WEAK_INFERENCE, label: "Missing service pages", description: "No recognizable service pages were detected." },
  { id: "web_poor_contact_info", category: F.WEBSITE, points: 2, minConfidence: C.WEAK_INFERENCE, label: "Poor contact information", description: "No public email, phone, or contact page was found." },
  { id: "web_confusing_appointments", category: F.WEBSITE, points: 2, minConfidence: C.WEAK_INFERENCE, label: "Confusing appointment steps", description: "Appointment instructions appear multi-step or unclear." },

  // --- Custom software opportunity (cap 25) ---
  { id: "sw_multiple_locations", category: F.SOFTWARE, points: 6, minConfidence: C.STRONG_INFERENCE, label: "Multiple locations", description: "More than one location suggests coordination overhead." },
  { id: "sw_call_first_intake", category: F.SOFTWARE, points: 4, minConfidence: C.WEAK_INFERENCE, label: "Manual / call-first intake", description: "Intake appears to be call-first or manual." },
  { id: "sw_downloadable_forms", category: F.SOFTWARE, points: 4, minConfidence: C.STRONG_INFERENCE, label: "Downloadable / printable forms", description: "Downloadable intake or referral forms were detected." },
  { id: "sw_referral_workflow", category: F.SOFTWARE, points: 4, minConfidence: C.WEAK_INFERENCE, label: "Referral workflow", description: "Referral instructions or forms suggest a manual workflow." },
  { id: "sw_multiple_departments", category: F.SOFTWARE, points: 4, minConfidence: C.WEAK_INFERENCE, label: "Multiple departments", description: "Multiple departments or service lines were detected." },
  { id: "sw_disconnected_systems", category: F.SOFTWARE, points: 4, minConfidence: C.STRONG_INFERENCE, label: "Disconnected booking systems", description: "More than one distinct booking system was detected." },
  { id: "sw_complex_navigation", category: F.SOFTWARE, points: 3, minConfidence: C.WEAK_INFERENCE, label: "Complex service navigation", description: "Deep or complex navigation suggests intricate workflows." },

  // --- KlearQ opportunity (cap 25) ---
  { id: "kq_multiple_locations", category: F.KLEARQ, points: 6, minConfidence: C.STRONG_INFERENCE, label: "Multiple locations", description: "Multiple locations increase call-routing complexity." },
  { id: "kq_multiple_phones", category: F.KLEARQ, points: 5, minConfidence: C.STRONG_INFERENCE, label: "Multiple phone numbers", description: "Several public phone numbers suggest fragmented call handling." },
  { id: "kq_call_first", category: F.KLEARQ, points: 5, minConfidence: C.WEAK_INFERENCE, label: "Call-first booking", description: "Calling is the primary way to book." },
  { id: "kq_no_online_booking", category: F.KLEARQ, points: 4, minConfidence: C.WEAK_INFERENCE, label: "No online booking", description: "No online booking channel offloads volume from the phone." },
  { id: "kq_multiple_departments", category: F.KLEARQ, points: 3, minConfidence: C.WEAK_INFERENCE, label: "Multiple departments / providers", description: "Multiple departments or providers complicate routing." },
  { id: "kq_centralized_reception", category: F.KLEARQ, points: 2, minConfidence: C.WEAK_INFERENCE, label: "Centralized reception", description: "Multiple locations behind a single phone line." },
  // Supported but never auto-fires: requires reliable public evidence we do not
  // scrape. Available for manual findings with VERIFIED evidence only.
  { id: "kq_phone_response_complaints", category: F.KLEARQ, points: 3, minConfidence: C.VERIFIED, label: "Phone / callback complaints", description: "Reliable public evidence of unanswered calls, hold times, or callback problems." },

  // --- Contactability (cap 10) ---
  { id: "contact_decision_maker_email", category: F.CONTACTABILITY, points: 4, minConfidence: C.VERIFIED, label: "Decision-maker email", description: "A public decision-maker email is available." },
  { id: "contact_general_email", category: F.CONTACTABILITY, points: 2, minConfidence: C.VERIFIED, label: "General business email", description: "A general public business email is available." },
  { id: "contact_form_present", category: F.CONTACTABILITY, points: 2, minConfidence: C.STRONG_INFERENCE, label: "Contact form", description: "A working contact form appears to be present." },
  { id: "contact_phone_present", category: F.CONTACTABILITY, points: 1, minConfidence: C.VERIFIED, label: "Public phone", description: "A public phone number is available." },
  { id: "contact_verified_site_phone", category: F.CONTACTABILITY, points: 1, minConfidence: C.STRONG_INFERENCE, label: "Website and phone both known", description: "Both a website and a phone number were confirmed." },

  // --- Business fit (cap 10) ---
  { id: "fit_is_healthcare", category: F.BUSINESS_FIT, points: 4, minConfidence: C.VERIFIED, label: "Target clinic category", description: "Matches a target healthcare clinic category." },
  { id: "fit_geography", category: F.BUSINESS_FIT, points: 3, minConfidence: C.STRONG_INFERENCE, label: "In target area", description: "Located within the campaign's target area." },
  { id: "fit_active_business", category: F.BUSINESS_FIT, points: 2, minConfidence: C.STRONG_INFERENCE, label: "Active business", description: "The site is reachable and shows current activity." },
  { id: "fit_reasonable_size", category: F.BUSINESS_FIT, points: 1, minConfidence: C.WEAK_INFERENCE, label: "Reasonable size", description: "Size appears within the target range." },
];

export const DEFAULT_CATEGORY_CAPS: Record<FindingCategory, number> = {
  WEBSITE: 30,
  SOFTWARE: 25,
  KLEARQ: 25,
  CONTACTABILITY: 10,
  BUSINESS_FIT: 10,
};

/** Multiplier applied to a rule's points based on the evidence confidence. */
export const DEFAULT_CONFIDENCE_MULTIPLIERS: Record<Confidence, number> = {
  VERIFIED: 1,
  STRONG_INFERENCE: 0.75,
  WEAK_INFERENCE: 0.5,
  UNKNOWN: 0,
};

export const DEFAULT_RECOMMENDATION = {
  /** An opportunity area must reach this subtotal to be recommended. */
  floor: 8,
  /** Two areas within this many points (both >= floor) => COMBINED. */
  combinedMargin: 4,
};

export function defaultScoringConfig(): ScoringConfig {
  return {
    version: DEFAULT_RULESET_VERSION,
    ruleWeights: {},
    categoryCaps: { ...DEFAULT_CATEGORY_CAPS },
    confidenceMultipliers: { ...DEFAULT_CONFIDENCE_MULTIPLIERS },
    recommendation: { ...DEFAULT_RECOMMENDATION },
    rules: DEFAULT_RULES,
  };
}
