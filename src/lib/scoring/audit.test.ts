import { describe, expect, it } from "vitest";
import { RecommendedService } from "@prisma/client";
import { buildAuditFindings, type AuditInput } from "@/lib/scoring/audit";
import { scoreClinic } from "@/lib/scoring/engine";
import { defaultScoringConfig } from "@/lib/scoring/rules";
import { toScorableFindings } from "@/lib/scoring/adapters";
import type { ExtractedSiteInfo } from "@/lib/research/types";

const config = defaultScoringConfig();

function site(partial: Partial<ExtractedSiteInfo> = {}): ExtractedSiteInfo {
  return {
    title: "Clinic",
    metaDescription: "A clinic",
    publicEmails: [],
    phones: [],
    contactPageUrl: null,
    onlineBookingUrl: null,
    bookingMethod: null,
    socialLinks: {},
    services: [],
    locations: [],
    hasViewportMeta: true,
    hasContactForm: false,
    isHttps: true,
    bookingPlatform: null,
    bookingPlatforms: [],
    hasDownloadableForms: false,
    mentionsReferral: false,
    mentionsDepartments: false,
    linkCount: 12,
    ...partial,
  };
}

function auditInput(partial: Partial<AuditInput>): AuditInput {
  return {
    discoverySourceUrl: "https://provider.example/x",
    websiteUrl: "https://clinic.example",
    siteReachable: true,
    site: site(),
    performance: null,
    category: "Dental",
    locationCount: 1,
    phones: [],
    mainPhone: null,
    publicEmail: null,
    hasDecisionMakerEmail: false,
    bookingMethod: null,
    withinGeography: true,
    ...partial,
  };
}

function run(input: AuditInput) {
  const findings = buildAuditFindings(input);
  const codes = findings.map((f) => f.code);
  const score = scoreClinic(toScorableFindings(findings), config);
  return { findings, codes, score };
}

describe("audit + scoring fixtures", () => {
  it("outdated call-first, multi-location clinic scores high on software + KlearQ", () => {
    const { codes, score } = run(
      auditInput({
        locationCount: 3,
        phones: ["+1-416-555-0001", "+1-416-555-0002"],
        mainPhone: "+1-416-555-0001",
        bookingMethod: "Call to book",
        site: site({
          isHttps: false,
          hasViewportMeta: false,
          bookingMethod: "Call to book",
          phones: ["+1-416-555-0001", "+1-416-555-0002"],
        }),
      }),
    );

    expect(codes).toEqual(
      expect.arrayContaining([
        "sw_multiple_locations",
        "kq_multiple_locations",
        "kq_multiple_phones",
        "kq_call_first",
        "sw_call_first_intake",
        "kq_no_online_booking",
        "web_missing_https",
        "web_poor_mobile",
        "web_no_booking_cta",
      ]),
    );
    expect(score.klearqScore).toBeGreaterThanOrEqual(8);
    expect(score.softwareScore).toBeGreaterThanOrEqual(8);
    expect([RecommendedService.KLEARQ, RecommendedService.SOFTWARE, RecommendedService.COMBINED]).toContain(
      score.recommendedService,
    );
  });

  it("modern clinic with effective online booking has few opportunities => NONE", () => {
    const { codes, score } = run(
      auditInput({
        locationCount: 1,
        phones: ["+1-416-555-0001"],
        mainPhone: "+1-416-555-0001",
        publicEmail: "hello@clinic.example",
        bookingMethod: "Online booking",
        site: site({
          bookingMethod: "Online booking",
          onlineBookingUrl: "https://clinic.janeapp.com",
          bookingPlatform: "Jane",
          bookingPlatforms: ["Jane"],
          services: ["Dental", "Orthodontics"],
          locations: [{ label: null, address: "1 Main St", phone: null }],
          hasContactForm: true,
          publicEmails: ["hello@clinic.example"],
          phones: ["+1-416-555-0001"],
        }),
      }),
    );

    // No call-first / no-online-booking opportunities.
    expect(codes).not.toContain("kq_call_first");
    expect(codes).not.toContain("kq_no_online_booking");
    expect(codes).not.toContain("web_no_booking_cta");
    // Strong contactability + business fit, but opportunity areas stay low.
    expect(score.contactabilityScore).toBeGreaterThan(0);
    expect(score.recommendedService).toBe(RecommendedService.NONE);
  });

  it("multi-location clinic with custom-workflow signals => software strongest", () => {
    const { codes, score } = run(
      auditInput({
        locationCount: 4,
        phones: ["+1-416-555-0001"],
        mainPhone: "+1-416-555-0001",
        bookingMethod: "Online booking",
        site: site({
          bookingMethod: "Online booking",
          onlineBookingUrl: "https://clinic.janeapp.com",
          bookingPlatforms: ["Jane", "Acuity"],
          mentionsDepartments: true,
          mentionsReferral: true,
          hasDownloadableForms: true,
          services: ["Physiotherapy"],
          locations: [{ label: null, address: "1 Main St", phone: null }],
        }),
      }),
    );

    expect(codes).toEqual(
      expect.arrayContaining([
        "sw_multiple_locations",
        "sw_multiple_departments",
        "sw_referral_workflow",
        "sw_downloadable_forms",
        "sw_disconnected_systems",
      ]),
    );
    expect(score.softwareScore).toBeGreaterThanOrEqual(score.websiteScore);
    expect(score.softwareScore).toBeGreaterThanOrEqual(8);
  });

  it("clinic with insufficient evidence => NONE", () => {
    const { score } = run(
      auditInput({
        websiteUrl: null,
        siteReachable: false,
        site: null,
        category: null,
        locationCount: 1,
        phones: [],
        mainPhone: null,
        withinGeography: false,
      }),
    );
    expect(score.recommendedService).toBe(RecommendedService.NONE);
    expect(score.overallScore).toBeLessThan(config.recommendation.floor);
  });

  it("conflicting signals: modern booking but multi-location/multi-phone", () => {
    const { codes, score } = run(
      auditInput({
        locationCount: 3,
        phones: ["+1-416-555-0001", "+1-416-555-0002"],
        mainPhone: "+1-416-555-0001",
        bookingMethod: "Online booking",
        site: site({
          bookingMethod: "Online booking",
          onlineBookingUrl: "https://clinic.janeapp.com",
          bookingPlatform: "Jane",
          bookingPlatforms: ["Jane"],
          phones: ["+1-416-555-0001", "+1-416-555-0002"],
          services: ["Dental"],
          locations: [{ label: null, address: "1 Main St", phone: null }],
        }),
      }),
    );

    // KlearQ still fires on locations/phones, but not the online-booking rules.
    expect(codes).toEqual(expect.arrayContaining(["kq_multiple_locations", "kq_multiple_phones", "sw_multiple_locations"]));
    expect(codes).not.toContain("kq_call_first");
    expect(codes).not.toContain("kq_no_online_booking");
    expect(codes).not.toContain("web_no_booking_cta");
    // Website is not the recommendation given the modern site.
    expect(score.recommendedService).not.toBe(RecommendedService.WEBSITE);
  });
});
