import { describe, expect, it } from "vitest";
import { FindingCategory } from "@prisma/client";
import { buildAuditFindings } from "@/lib/scoring/audit";
import { toScorableFindings } from "@/lib/scoring/adapters";
import { scoreClinic } from "@/lib/scoring/engine";
import { defaultScoringConfig } from "@/lib/scoring/rules";
import { CLINIC_CATEGORIES } from "@/lib/leads/constants";
import {
  SAMPLE_AUDIT_INPUT,
  SAMPLE_CAPS,
  SAMPLE_FINDINGS,
  SAMPLE_SCORE,
} from "./sample-lead";

/**
 * The landing page claims the score is deterministic and inspectable, and then
 * prints a worked example of it. A QA pass found the previous, hand-written
 * example disagreed with the engine in four places at once: two findings were
 * shown at a confidence `buildAuditFindings` never assigns, a rejected row
 * described a rule that cannot be rejected, the recommendation did not match
 * the subtotals beside it, and two categories showed totals the listed
 * observations made impossible.
 *
 * The figures now derive everything from the engine, so that class of defect
 * cannot recur by editing a component. It can still recur by changing a rule
 * and not noticing the marketing page moved, which is what these tests are for.
 */
describe("landing page sample lead", () => {
  it("is derived from the real engine, not from hand-written values", () => {
    const findings = buildAuditFindings(SAMPLE_AUDIT_INPUT);
    const score = scoreClinic(toScorableFindings(findings), defaultScoringConfig());

    expect(SAMPLE_FINDINGS).toEqual(findings);
    expect(SAMPLE_SCORE).toEqual(score);
  });

  it("uses a category the campaign form can actually hold", () => {
    // Spelling this "Optometrist" silently downgraded fit_is_healthcare from
    // Verified to Strong inference, which moved the score the page prints.
    expect(CLINIC_CATEGORIES).toContain(SAMPLE_AUDIT_INPUT.category);
  });

  it("produces a lead worth showing: several findings across several categories", () => {
    expect(SAMPLE_FINDINGS.length).toBeGreaterThanOrEqual(8);
    const categories = new Set(SAMPLE_FINDINGS.map((f) => f.category));
    expect(categories.size).toBeGreaterThanOrEqual(4);
    // The page's point is that weak evidence scores differently from fact, so
    // the example has to contain both kinds.
    expect(SAMPLE_FINDINGS.some((f) => f.isFact)).toBe(true);
    expect(SAMPLE_FINDINGS.some((f) => !f.isFact)).toBe(true);
  });

  it("every finding carries the source the page prints beside it", () => {
    for (const f of SAMPLE_FINDINGS) {
      expect(f.sourceUrl, f.code).toMatch(/^https?:\/\//);
    }
  });

  it("subtotals sum to the overall and none exceeds its cap", () => {
    const subtotals: Record<FindingCategory, number> = {
      WEBSITE: SAMPLE_SCORE.websiteScore,
      SOFTWARE: SAMPLE_SCORE.softwareScore,
      KLEARQ: SAMPLE_SCORE.klearqScore,
      CONTACTABILITY: SAMPLE_SCORE.contactabilityScore,
      BUSINESS_FIT: SAMPLE_SCORE.businessFitScore,
    };
    const sum = Object.values(subtotals).reduce((a, b) => a + b, 0);
    expect(SAMPLE_SCORE.overallScore).toBe(Math.min(100, sum));

    for (const category of Object.keys(subtotals) as FindingCategory[]) {
      expect(subtotals[category], category).toBeLessThanOrEqual(SAMPLE_CAPS[category]);
    }
  });

  it("the breakdown accounts for every point the meters show", () => {
    for (const category of Object.keys(SAMPLE_SCORE.breakdown.categories) as FindingCategory[]) {
      const group = SAMPLE_SCORE.breakdown.categories[category];
      const contributed = group.contributions.reduce((a, c) => a + c.points, 0);
      expect(group.subtotal, category).toBe(Math.min(group.cap, contributed));
    }
  });

  /**
   * A change to a rule's points, its minimum confidence, a multiplier or a cap
   * will move this. That is allowed; it just must not happen silently, because
   * the number is published on the public page. Update it deliberately.
   */
  it("still scores 43, Combined, Low confidence", () => {
    expect(SAMPLE_SCORE.overallScore).toBe(43);
    expect(SAMPLE_SCORE.recommendedService).toBe("COMBINED");
    expect(SAMPLE_SCORE.confidence).toBe("LOW");
  });
});
