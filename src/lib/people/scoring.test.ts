import { describe, expect, it } from "vitest";
import { Confidence } from "@prisma/client";
import {
  DEFAULT_PERSON_CATEGORY_CAPS,
  DEFAULT_PERSON_RULES,
  defaultPersonScoringConfig,
  rankPeople,
  scorePerson,
  type ScorablePersonFinding,
} from "./scoring";
import { PERSON_FINDING_CODES } from "./findings";

const verified = (code: string): ScorablePersonFinding => ({
  code,
  confidence: Confidence.VERIFIED,
  isFact: true,
});
const strong = (code: string): ScorablePersonFinding => ({
  code,
  confidence: Confidence.STRONG_INFERENCE,
  isFact: false,
});
const weak = (code: string): ScorablePersonFinding => ({
  code,
  confidence: Confidence.WEAK_INFERENCE,
  isFact: false,
});

describe("scorePerson", () => {
  it("is deterministic", () => {
    const findings = [verified("person_role_owner"), strong("person_multi_clinic")];
    expect(scorePerson(findings)).toEqual(scorePerson(findings));
  });

  it("scores an owner with reach and a direct address near the top", () => {
    const score = scorePerson([
      verified("person_role_owner"),
      strong("person_multi_clinic"),
      verified("person_direct_email"),
    ]);
    // Authority 50 (capped), reach round(30 * 0.75) = 23, contactability 20.
    expect(score.authorityScore).toBe(50);
    expect(score.reachScore).toBe(23);
    expect(score.contactabilityScore).toBe(20);
    expect(score.overallScore).toBe(93);
    expect(score.confidence).toBe("HIGH");
  });

  it("scores a listed associate far below a stated owner", () => {
    const associate = scorePerson([weak("person_role_physician")]);
    const owner = scorePerson([verified("person_role_owner")]);
    expect(associate.overallScore).toBeLessThan(owner.overallScore / 4);
  });

  it("ranks practice leadership above a listed physician", () => {
    // A practice manager who can sign beats an associate who cannot.
    const manager = scorePerson([strong("person_role_admin_leader")]);
    const physician = scorePerson([weak("person_role_physician")]);
    expect(manager.overallScore).toBeGreaterThan(physician.overallScore);
  });

  it("refuses to let weak evidence fire a rule that needs a fact", () => {
    // An owner role inferred rather than stated earns nothing, and says so.
    const score = scorePerson([weak("person_role_owner")]);
    expect(score.authorityScore).toBe(0);
    expect(score.breakdown.rejected).toHaveLength(1);
    expect(score.breakdown.rejected[0]?.ruleId).toBe("person_role_owner");
  });

  it("scales points by confidence", () => {
    const strongScore = scorePerson([strong("person_multi_clinic")]).reachScore;
    const config = defaultPersonScoringConfig();
    const rule = config.rules.find((r) => r.id === "person_multi_clinic");
    expect(strongScore).toBe(Math.round(rule!.points * 0.75));
  });

  it("caps each category", () => {
    const score = scorePerson([
      verified("person_role_owner"),
      verified("person_role_medical_director"),
    ]);
    // 50 + 40 would be 90 uncapped; authority is capped at 50.
    expect(score.authorityScore).toBe(DEFAULT_PERSON_CATEGORY_CAPS.AUTHORITY);
    expect(score.breakdown.categories.AUTHORITY.contributions).toHaveLength(2);
  });

  it("never exceeds 100 or drops below 0", () => {
    const score = scorePerson(DEFAULT_PERSON_RULES.map((r) => verified(r.id)));
    expect(score.overallScore).toBeLessThanOrEqual(100);
    expect(scorePerson([]).overallScore).toBe(0);
  });

  it("ignores dismissed findings and unknown codes", () => {
    const dismissed = scorePerson([
      { ...verified("person_role_owner"), dismissed: true },
      verified("not_a_real_rule"),
    ]);
    expect(dismissed.overallScore).toBe(0);
  });

  it("reports low confidence when the points rest on inference", () => {
    const score = scorePerson([strong("person_multi_clinic"), weak("person_role_physician")]);
    expect(score.confidence).toBe("LOW");
  });

  it("honours an org override of a rule weight", () => {
    const config = defaultPersonScoringConfig();
    config.ruleWeights = { person_direct_email: 5 };
    const score = scorePerson([verified("person_direct_email")], config);
    expect(score.contactabilityScore).toBe(5);
  });

  it("every emitted finding code has a rule, and every rule has a code", () => {
    // A finding with no rule scores nothing; a rule with no finding is dead
    // weight. This is the check that keeps findings.ts and scoring.ts honest.
    const ruleIds = new Set(DEFAULT_PERSON_RULES.map((r) => r.id));
    for (const code of PERSON_FINDING_CODES) {
      expect(ruleIds.has(code), `no rule for emitted code ${code}`).toBe(true);
    }
    for (const id of ruleIds) {
      expect(PERSON_FINDING_CODES.includes(id), `no finding emits rule ${id}`).toBe(true);
    }
  });

  it("caps sum to 100, so the overall is a real percentage", () => {
    const total = Object.values(DEFAULT_PERSON_CATEGORY_CAPS).reduce((a, b) => a + b, 0);
    expect(total).toBe(100);
  });
});

describe("rankPeople", () => {
  const person = (fullName: string, findings: ScorablePersonFinding[]) => ({
    fullName,
    score: scorePerson(findings),
  });

  it("orders by score, then confidence, then name", () => {
    const ranked = rankPeople([
      person("Zoe Associate", [weak("person_role_physician")]),
      person("Sarah Owner", [verified("person_role_owner"), verified("person_direct_email")]),
      person("Pat Manager", [strong("person_role_admin_leader")]),
    ]);
    expect(ranked.map((p) => p.fullName)).toEqual([
      "Sarah Owner",
      "Pat Manager",
      "Zoe Associate",
    ]);
  });

  it("breaks an exact tie by name, so the order is stable", () => {
    const ranked = rankPeople([
      person("Bob Same", [verified("person_role_owner")]),
      person("Alice Same", [verified("person_role_owner")]),
    ]);
    expect(ranked.map((p) => p.fullName)).toEqual(["Alice Same", "Bob Same"]);
  });

  it("does not mutate the input", () => {
    const input = [person("B", [weak("person_role_physician")]), person("A", [verified("person_role_owner")])];
    const before = input.map((p) => p.fullName);
    rankPeople(input);
    expect(input.map((p) => p.fullName)).toEqual(before);
  });
});
