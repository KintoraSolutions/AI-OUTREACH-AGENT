import { describe, expect, it } from "vitest";
import { Confidence, FindingCategory, RecommendedService } from "@prisma/client";
import { scoreClinic } from "@/lib/scoring/engine";
import { defaultScoringConfig } from "@/lib/scoring/rules";
import { resolveScoringConfig } from "@/lib/scoring/config";
import type { ScorableFinding } from "@/lib/scoring/types";

const C = Confidence;
const F = FindingCategory;

function mk(
  code: string,
  category: FindingCategory,
  confidence: Confidence,
  extra: Partial<ScorableFinding> = {},
): ScorableFinding {
  return {
    code,
    category,
    confidence,
    finding: code,
    evidence: "evidence",
    sourceUrl: "https://clinic.example",
    isFact: confidence === C.VERIFIED,
    manual: false,
    ...extra,
  };
}

const config = defaultScoringConfig();

describe("scoreClinic", () => {
  it("is deterministic for the same findings and config", () => {
    const findings = [
      mk("web_no_booking_cta", F.WEBSITE, C.WEAK_INFERENCE),
      mk("sw_multiple_locations", F.SOFTWARE, C.STRONG_INFERENCE),
      mk("contact_general_email", F.CONTACTABILITY, C.VERIFIED),
    ];
    const a = scoreClinic(findings, config);
    const b = scoreClinic(findings, config);
    expect(a).toEqual(b);
  });

  it("applies the confidence multiplier to a rule's points", () => {
    // web_no_booking_cta = 8 base, minConfidence WEAK.
    expect(scoreClinic([mk("web_no_booking_cta", F.WEBSITE, C.VERIFIED)], config).websiteScore).toBe(8);
    expect(scoreClinic([mk("web_no_booking_cta", F.WEBSITE, C.WEAK_INFERENCE)], config).websiteScore).toBe(4);
  });

  it("caps each category subtotal", () => {
    // All website rules VERIFIED sum to 35 base > the 30 cap.
    const all = config.rules
      .filter((r) => r.category === F.WEBSITE)
      .map((r) => mk(r.id, F.WEBSITE, C.VERIFIED));
    expect(scoreClinic(all, config).websiteScore).toBe(30);
  });

  it("never produces an overall score above 100 or below 0", () => {
    // A huge manual finding under a raised cap; overall must still clamp to 100.
    const raised = resolveScoringConfig({
      revision: 1,
      ruleWeights: {},
      categoryCaps: { WEBSITE: 1000 },
      confidenceMultipliers: {},
      recommendation: {},
    });
    const big = scoreClinic(
      [mk("manual:x", F.WEBSITE, C.VERIFIED, { manual: true, manualPoints: 500 })],
      raised,
    );
    expect(big.overallScore).toBe(100);
    expect(scoreClinic([], config).overallScore).toBe(0);
  });

  it("honors configurable rule weights", () => {
    const custom = resolveScoringConfig({
      revision: 2,
      ruleWeights: { web_no_booking_cta: 12 },
      categoryCaps: {},
      confidenceMultipliers: {},
      recommendation: {},
    });
    expect(scoreClinic([mk("web_no_booking_cta", F.WEBSITE, C.VERIFIED)], custom).websiteScore).toBe(12);
    expect(custom.version).toBe("custom-r2");
  });

  it("honors configurable confidence multipliers", () => {
    const custom = resolveScoringConfig({
      revision: 3,
      ruleWeights: {},
      categoryCaps: {},
      confidenceMultipliers: { WEAK_INFERENCE: 0.25 },
      recommendation: {},
    });
    // 8 * 0.25 = 2
    expect(scoreClinic([mk("web_no_booking_cta", F.WEBSITE, C.WEAK_INFERENCE)], custom).websiteScore).toBe(2);
  });

  it("rejects a rule whose evidence is below its minimum confidence (no strong claim from weak evidence)", () => {
    // web_missing_https requires VERIFIED; a WEAK finding must contribute nothing.
    const result = scoreClinic([mk("web_missing_https", F.WEBSITE, C.WEAK_INFERENCE)], config);
    expect(result.websiteScore).toBe(0);
    expect(result.breakdown.rejected.some((r) => r.ruleId === "web_missing_https")).toBe(true);
    expect(result.contributionByCode["web_missing_https"]).toBe(0);
  });

  it("excludes dismissed findings", () => {
    const result = scoreClinic(
      [mk("web_no_booking_cta", F.WEBSITE, C.VERIFIED, { dismissed: true })],
      config,
    );
    expect(result.websiteScore).toBe(0);
  });

  it("reflects fact vs inference in the overall confidence", () => {
    const verified = scoreClinic([mk("web_missing_https", F.WEBSITE, C.VERIFIED)], config);
    expect(verified.confidence).toBe("HIGH");
    const weak = scoreClinic([mk("web_no_booking_cta", F.WEBSITE, C.WEAK_INFERENCE)], config);
    expect(weak.confidence).toBe("LOW");
  });

  it("recommends a single strongest service", () => {
    const result = scoreClinic(
      [
        mk("sw_multiple_locations", F.SOFTWARE, C.VERIFIED), // 6
        mk("sw_call_first_intake", F.SOFTWARE, C.VERIFIED), // 4
        mk("sw_downloadable_forms", F.SOFTWARE, C.VERIFIED), // 4  => software 14
        mk("kq_call_first", F.KLEARQ, C.WEAK_INFERENCE), // 2.5 -> 3, below floor
      ],
      config,
    );
    expect(result.recommendedService).toBe(RecommendedService.SOFTWARE);
  });

  it("recommends COMBINED only when two areas both clear the floor and are close", () => {
    const result = scoreClinic(
      [
        mk("sw_multiple_locations", F.SOFTWARE, C.VERIFIED), // 6
        mk("sw_call_first_intake", F.SOFTWARE, C.VERIFIED), // 4 => software 10
        mk("kq_multiple_locations", F.KLEARQ, C.VERIFIED), // 6
        mk("kq_call_first", F.KLEARQ, C.VERIFIED), // 5 => klearq 11
      ],
      config,
    );
    expect(result.recommendedService).toBe(RecommendedService.COMBINED);
    expect(result.breakdown.recommendation.alternatives.length).toBeGreaterThanOrEqual(0);
  });

  it("does NOT recommend COMBINED merely because a second area is nonzero", () => {
    const result = scoreClinic(
      [
        mk("web_no_booking_cta", F.WEBSITE, C.VERIFIED), // 8
        mk("web_poor_mobile", F.WEBSITE, C.VERIFIED), // 6 => website 14
        mk("kq_call_first", F.KLEARQ, C.WEAK_INFERENCE), // ~3 (nonzero, below floor)
      ],
      config,
    );
    expect(result.recommendedService).toBe(RecommendedService.WEBSITE);
  });

  it("returns NONE (insufficient evidence) when no opportunity area clears the floor", () => {
    const result = scoreClinic(
      [
        mk("contact_general_email", F.CONTACTABILITY, C.VERIFIED),
        mk("fit_is_healthcare", F.BUSINESS_FIT, C.VERIFIED),
        mk("web_missing_location", F.WEBSITE, C.WEAK_INFERENCE), // ~1, below floor
      ],
      config,
    );
    expect(result.recommendedService).toBe(RecommendedService.NONE);
    expect(result.recommendationReason.toLowerCase()).toContain("insufficient");
  });

  it("attaches evidence to every contribution", () => {
    const result = scoreClinic([mk("web_no_booking_cta", F.WEBSITE, C.VERIFIED)], config);
    const contrib = result.breakdown.categories.WEBSITE.contributions[0]!;
    expect(contrib.evidence).toBe("evidence");
    expect(contrib.sourceUrl).toBe("https://clinic.example");
    expect(contrib.ruleId).toBe("web_no_booking_cta");
    expect(contrib.points).toBe(8);
  });

  it("scores manual findings by their explicit points and category", () => {
    const result = scoreClinic(
      [mk("manual:1", F.KLEARQ, C.VERIFIED, { manual: true, manualPoints: 7 })],
      config,
    );
    expect(result.klearqScore).toBe(7);
  });
});
