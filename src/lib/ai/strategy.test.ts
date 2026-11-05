import { describe, expect, it } from "vitest";
import { Confidence, FindingCategory, RecommendedService, ScoreConfidence } from "@prisma/client";
import { selectStrategy } from "@/lib/ai/strategy";
import { getUseCase } from "@/lib/ai/use-cases";
import type { DraftScoreSummary, EvidenceItem } from "@/lib/ai/draft-types";

function ev(code: string, category: FindingCategory, isFact = false): EvidenceItem {
  return {
    findingId: `${code}-id`,
    code,
    category,
    observation: `Observation ${code}`,
    detail: `Detail ${code}`,
    sourceUrl: "https://clinic.example/page",
    confidence: isFact ? Confidence.VERIFIED : Confidence.STRONG_INFERENCE,
    isFact,
  };
}

function score(partial: Partial<DraftScoreSummary>): DraftScoreSummary {
  return {
    effectiveService: RecommendedService.WEBSITE,
    computedService: RecommendedService.WEBSITE,
    confidence: ScoreConfidence.MEDIUM,
    websiteScore: 0,
    softwareScore: 0,
    klearqScore: 0,
    manualOverride: false,
    ...partial,
  };
}

describe("selectStrategy — relationship outreach (referral use case)", () => {
  const referral = getUseCase("patient_referral").evidencePolicy;

  it("grounds an introduction in verified context rather than opportunity findings", () => {
    const sel = selectStrategy(
      score({ effectiveService: RecommendedService.NONE }),
      [ev("fit_is_healthcare", FindingCategory.BUSINESS_FIT, true)],
      { policy: referral, primarySlot: null },
    );
    expect(sel.strategy).not.toBe("INSUFFICIENT");
    expect(sel.supportingEvidence.map((e) => e.code)).toContain("fit_is_healthcare");
  });

  it("allows a claim-free introduction instead of blocking when nothing is citable", () => {
    // The whole point: a referral intro that claims nothing about the recipient
    // is a legitimate email, not an insufficient-evidence failure.
    const sel = selectStrategy(score({ effectiveService: RecommendedService.NONE }), [], {
      policy: referral,
      primarySlot: null,
    });
    expect(sel.strategy).not.toBe("INSUFFICIENT");
    expect(sel.supportingEvidence).toHaveLength(0);
    expect(sel.reason).toMatch(/makes no claim about the recipient/i);
  });

  it("ignores opportunity findings outside the use case's citable categories", () => {
    const sel = selectStrategy(
      score({ effectiveService: RecommendedService.NONE }),
      [ev("sw_multiple_locations", FindingCategory.SOFTWARE, true)],
      { policy: referral, primarySlot: null },
    );
    expect(sel.supportingEvidence).toHaveLength(0);
  });

  it("still blocks when the policy requires context and none exists", () => {
    const strict = { ...referral, allowClaimFreeIntro: false };
    const sel = selectStrategy(score({ effectiveService: RecommendedService.NONE }), [], {
      policy: strict,
      primarySlot: null,
    });
    expect(sel.strategy).toBe("INSUFFICIENT");
  });
});

describe("selectStrategy (Stage A)", () => {
  it("selects the recommended single service when it has citable evidence", () => {
    const sel = selectStrategy(score({ effectiveService: RecommendedService.SOFTWARE, softwareScore: 12 }), [
      ev("sw_multiple_locations", FindingCategory.SOFTWARE, true),
    ]);
    expect(sel.strategy).toBe("SOFTWARE");
    expect(sel.service).toBe(RecommendedService.SOFTWARE);
    expect(sel.supportingEvidence).toHaveLength(1);
    expect(sel.overrideApplied).toBe(false);
  });

  it("returns INSUFFICIENT when the score recommends nothing", () => {
    const sel = selectStrategy(score({ effectiveService: RecommendedService.NONE }), []);
    expect(sel.strategy).toBe("INSUFFICIENT");
    expect(sel.service).toBe(RecommendedService.NONE);
    expect(sel.supportingEvidence).toHaveLength(0);
  });

  it("honors a manual override that has citable evidence", () => {
    const sel = selectStrategy(
      score({
        effectiveService: RecommendedService.KLEARQ,
        computedService: RecommendedService.WEBSITE,
        manualOverride: true,
        klearqScore: 10,
      }),
      [ev("kq_multiple_locations", FindingCategory.KLEARQ, true)],
    );
    expect(sel.strategy).toBe("KLEARQ");
    expect(sel.overrideApplied).toBe(true);
  });

  it("does NOT treat a manual override as evidence: blocks when the override has no citable evidence", () => {
    // Override selects KlearQ, but the only evidence is a website fact.
    const sel = selectStrategy(
      score({
        effectiveService: RecommendedService.KLEARQ,
        computedService: RecommendedService.WEBSITE,
        manualOverride: true,
      }),
      [ev("web_missing_https", FindingCategory.WEBSITE, true)],
    );
    expect(sel.strategy).toBe("INSUFFICIENT");
    expect(sel.reason).toMatch(/override does not by itself create evidence/i);
  });

  it("recommends COMBINED only when two areas both have supported evidence", () => {
    const sel = selectStrategy(
      score({ effectiveService: RecommendedService.COMBINED, websiteScore: 12, softwareScore: 10 }),
      [
        ev("web_no_booking_cta", FindingCategory.WEBSITE),
        ev("sw_multiple_locations", FindingCategory.SOFTWARE, true),
      ],
    );
    expect(sel.strategy).toBe("COMBINED");
    expect(sel.supportingEvidence.map((e) => e.category).sort()).toEqual(["SOFTWARE", "WEBSITE"]);
  });

  it("degrades COMBINED to a single area when only one has evidence (no forced combined)", () => {
    const sel = selectStrategy(
      score({ effectiveService: RecommendedService.COMBINED, websiteScore: 12, softwareScore: 10 }),
      [ev("web_no_booking_cta", FindingCategory.WEBSITE)],
    );
    expect(sel.strategy).toBe("WEBSITE");
    expect(sel.supportingEvidence).toHaveLength(1);
  });

  it("flags onlyInference when no supporting evidence is a verified fact", () => {
    const sel = selectStrategy(score({ effectiveService: RecommendedService.WEBSITE, websiteScore: 8 }), [
      ev("web_no_booking_cta", FindingCategory.WEBSITE, false),
    ]);
    expect(sel.strategy).toBe("WEBSITE");
    expect(sel.onlyInference).toBe(true);
  });
});
