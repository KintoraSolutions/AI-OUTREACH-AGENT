import { Confidence, FindingCategory } from "@prisma/client";
import { CLINIC_CATEGORIES } from "@/lib/leads/constants";
import type {
  ExtractedSiteInfo,
  PerformanceResult,
  ResearchFinding,
} from "@/lib/research/types";

/**
 * Deterministic website + business audit (plan.md Section 6). Turns the publicly
 * collected evidence — fetched HTML structure, HTTP/metadata, PageSpeed (when
 * configured), and discovery facts — into neutral, evidence-backed findings
 * across all five opportunity areas. No hosted browser is required; rendered
 * screenshots and console checks stay behind the deferred BrowserProvider.
 *
 * Every finding carries its confidence and a fact/inference flag; a finding is a
 * VERIFIED fact only when directly observed (e.g. no HTTPS, a measured PageSpeed
 * score, a present email). Inferences are labelled as such and never overstated.
 * This produces evidence only; points are assigned by the scoring engine.
 */

export interface AuditInput {
  discoverySourceUrl: string;
  websiteUrl: string | null;
  siteReachable: boolean;
  site: ExtractedSiteInfo | null;
  performance: PerformanceResult | null;
  category: string | null;
  locationCount: number;
  phones: string[];
  mainPhone: string | null;
  publicEmail: string | null;
  hasDecisionMakerEmail: boolean;
  bookingMethod: string | null;
  /** Whether the clinic is within the campaign's target area (from discovery). */
  withinGeography: boolean;
}

const C = Confidence;
const F = FindingCategory;

export function buildAuditFindings(input: AuditInput): ResearchFinding[] {
  const findings: ResearchFinding[] = [];
  const siteUrl = input.websiteUrl ?? input.discoverySourceUrl;

  const add = (
    category: FindingCategory,
    code: string,
    finding: string,
    evidence: string,
    confidence: Confidence,
    opts?: { sourceUrl?: string; subarea?: string },
  ) => {
    findings.push({
      category,
      code,
      finding,
      evidence,
      sourceUrl: opts?.sourceUrl ?? siteUrl,
      confidence,
      isFact: confidence === C.VERIFIED,
      subarea: opts?.subarea ?? null,
    });
  };

  const site = input.site;
  const online = input.bookingMethod === "Online booking";

  // --- Business fit (evaluable from discovery data alone) ---
  if (input.category) {
    const known = CLINIC_CATEGORIES.some(
      (c) => c.toLowerCase() === input.category!.toLowerCase(),
    );
    add(
      F.BUSINESS_FIT,
      "fit_is_healthcare",
      "Matches a target clinic category.",
      `Category "${input.category}" is a target healthcare clinic type.`,
      known ? C.VERIFIED : C.STRONG_INFERENCE,
      { sourceUrl: input.discoverySourceUrl },
    );
  }
  if (input.withinGeography) {
    add(
      F.BUSINESS_FIT,
      "fit_geography",
      "Located in the target area.",
      "The clinic is within the campaign's target geography.",
      C.STRONG_INFERENCE,
      { sourceUrl: input.discoverySourceUrl },
    );
  }
  if (input.siteReachable) {
    add(
      F.BUSINESS_FIT,
      "fit_active_business",
      "Active business.",
      "The clinic website responded successfully, indicating an active business.",
      C.STRONG_INFERENCE,
    );
  }
  if (input.locationCount >= 1 && input.locationCount <= 20) {
    add(
      F.BUSINESS_FIT,
      "fit_reasonable_size",
      "Reasonable size for outreach.",
      `Detected ${input.locationCount} location(s), within the target size range.`,
      C.WEAK_INFERENCE,
      { sourceUrl: input.discoverySourceUrl },
    );
  }

  // --- Contactability ---
  if (input.hasDecisionMakerEmail) {
    add(
      F.CONTACTABILITY,
      "contact_decision_maker_email",
      "Decision-maker email available.",
      "A public email for a decision-maker contact is available.",
      C.VERIFIED,
    );
  }
  if (input.publicEmail) {
    add(
      F.CONTACTABILITY,
      "contact_general_email",
      "General business email available.",
      `A public business email (${input.publicEmail}) is available.`,
      C.VERIFIED,
    );
  }
  if (input.phones.length > 0 || input.mainPhone) {
    add(
      F.CONTACTABILITY,
      "contact_phone_present",
      "Public phone number available.",
      "A public phone number is available for contact.",
      C.VERIFIED,
    );
  }
  if (site?.hasContactForm) {
    add(
      F.CONTACTABILITY,
      "contact_form_present",
      "Contact form present.",
      "A contact form was detected on the website.",
      C.STRONG_INFERENCE,
    );
  }
  if (input.websiteUrl && input.mainPhone) {
    add(
      F.CONTACTABILITY,
      "contact_verified_site_phone",
      "Website and phone both known.",
      "Both a website and a phone number were confirmed for this clinic.",
      C.STRONG_INFERENCE,
    );
  }

  // --- Website opportunity (needs a reachable site) ---
  if (input.siteReachable && site) {
    if (!site.isHttps) {
      add(F.WEBSITE, "web_missing_https", "Website is not served over HTTPS.",
        "The site URL uses http:// rather than https://.", C.VERIFIED, { subarea: "technical" });
    }
    if (!site.hasViewportMeta) {
      add(F.WEBSITE, "web_poor_mobile", "Weak mobile readiness.",
        'No responsive viewport meta tag (<meta name="viewport">) was found, a common sign the site is not mobile-optimized.',
        C.STRONG_INFERENCE, { subarea: "design" });
    } else if (input.performance?.mobileFriendly === false) {
      add(F.WEBSITE, "web_poor_mobile", "Weak mobile readiness.",
        "PageSpeed Insights flagged mobile-friendliness issues.", C.VERIFIED, { subarea: "design" });
    }
    if (input.performance && input.performance.performanceScore !== null && input.performance.performanceScore < 50) {
      add(F.WEBSITE, "web_poor_performance", `Low performance score (${input.performance.performanceScore}/100).`,
        `PageSpeed Insights reported a performance score of ${input.performance.performanceScore}.`,
        C.VERIFIED, { subarea: "technical" });
    }
    if (!site.title || !site.metaDescription) {
      const missing = [!site.title ? "page title" : null, !site.metaDescription ? "meta description" : null]
        .filter(Boolean)
        .join(" and ");
      add(F.WEBSITE, "web_missing_metadata", "Missing page metadata.",
        `No ${missing} was found in the page <head>.`, C.STRONG_INFERENCE, { subarea: "technical" });
    }
    if (!online) {
      add(F.WEBSITE, "web_no_booking_cta", "No clear online booking action.",
        site.bookingMethod
          ? `The primary booking method appears to be "${site.bookingMethod}"; no online booking link or platform was found.`
          : "No booking link, booking platform, or contact form was found on the page.",
        C.WEAK_INFERENCE, { subarea: "conversion" });
    }
    if (site.locations.length === 0) {
      add(F.WEBSITE, "web_missing_location", "No location information on the site.",
        "No recognizable street address was present in the fetched HTML.", C.WEAK_INFERENCE, { subarea: "conversion" });
    }
    if (site.services.length === 0) {
      add(F.WEBSITE, "web_missing_service_pages", "No clear service pages.",
        "No recognizable service pages or service keywords were detected.", C.WEAK_INFERENCE, { subarea: "conversion" });
    }
    if (!input.publicEmail && input.phones.length === 0 && !site.contactPageUrl) {
      add(F.WEBSITE, "web_poor_contact_info", "Poor contact information.",
        "No public email, phone number, or contact page was found on the site.", C.WEAK_INFERENCE, { subarea: "conversion" });
    }
  }

  // --- Custom software opportunity ---
  if (input.locationCount > 1) {
    add(F.SOFTWARE, "sw_multiple_locations", "Multiple locations.",
      `${input.locationCount} locations were detected, which typically adds coordination overhead.`,
      C.STRONG_INFERENCE, { sourceUrl: input.discoverySourceUrl });
  }
  if (site?.mentionsDepartments) {
    add(F.SOFTWARE, "sw_multiple_departments", "Multiple departments.",
      'The site text references "department(s)", suggesting multiple service lines.', C.WEAK_INFERENCE);
  }
  if (input.bookingMethod === "Call to book") {
    add(F.SOFTWARE, "sw_call_first_intake", "Manual / call-first intake.",
      "The primary booking method is calling, which suggests a manual intake process.", C.STRONG_INFERENCE);
  } else if (!online) {
    add(F.SOFTWARE, "sw_call_first_intake", "Manual / call-first intake.",
      "No online booking was found, suggesting a manual or call-first intake process.", C.WEAK_INFERENCE);
  }
  if (site?.hasDownloadableForms) {
    add(F.SOFTWARE, "sw_downloadable_forms", "Downloadable / printable forms.",
      "Downloadable intake or referral form links (PDF) were detected.", C.STRONG_INFERENCE);
  }
  if (site?.mentionsReferral) {
    add(F.SOFTWARE, "sw_referral_workflow", "Referral workflow.",
      'The site text references "referral(s)", suggesting a manual referral workflow.', C.WEAK_INFERENCE);
  }
  if ((site?.bookingPlatforms.length ?? 0) > 1) {
    add(F.SOFTWARE, "sw_disconnected_systems", "Disconnected booking systems.",
      `More than one booking system was detected (${site!.bookingPlatforms.join(", ")}).`, C.STRONG_INFERENCE);
  }
  if ((site?.linkCount ?? 0) > 40) {
    add(F.SOFTWARE, "sw_complex_navigation", "Complex site navigation.",
      `The site has ${site!.linkCount} links, suggesting deep or complex navigation.`, C.WEAK_INFERENCE);
  }

  // --- KlearQ opportunity ---
  if (input.locationCount > 1) {
    add(F.KLEARQ, "kq_multiple_locations", "Multiple locations.",
      `${input.locationCount} locations were detected, increasing call-routing complexity.`,
      C.STRONG_INFERENCE, { sourceUrl: input.discoverySourceUrl });
  }
  if (input.phones.length > 1) {
    add(F.KLEARQ, "kq_multiple_phones", "Multiple public phone numbers.",
      `${input.phones.length} distinct public phone numbers were detected.`, C.STRONG_INFERENCE);
  }
  if (input.bookingMethod === "Call to book") {
    add(F.KLEARQ, "kq_call_first", "Call-first booking.",
      "Calling is the primary way to book, concentrating volume on the phone.", C.STRONG_INFERENCE);
  }
  if (!online) {
    add(F.KLEARQ, "kq_no_online_booking", "No online booking channel.",
      "No online booking channel was found to offload volume from the phone.",
      input.siteReachable ? C.STRONG_INFERENCE : C.WEAK_INFERENCE);
  }
  if (site?.mentionsDepartments) {
    add(F.KLEARQ, "kq_multiple_departments", "Multiple departments / providers.",
      'The site text references "department(s)", which complicates call routing.', C.WEAK_INFERENCE);
  }
  if (input.locationCount > 1 && input.phones.length <= 1) {
    add(F.KLEARQ, "kq_centralized_reception", "Centralized reception.",
      "Multiple locations appear to share a single public phone line.", C.WEAK_INFERENCE, { sourceUrl: input.discoverySourceUrl });
  }

  return findings;
}
