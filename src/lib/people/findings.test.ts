import { describe, expect, it } from "vitest";
import { Confidence, DecisionRole } from "@prisma/client";
import { buildPersonFindings, type PersonAffiliationView } from "./findings";

const riverbend: PersonAffiliationView = {
  clinicName: "Riverbend Family Optometry",
  role: DecisionRole.OWNER,
  roleTitle: "Founder & Medical Director",
  isOwner: true,
  confidence: Confidence.VERIFIED,
  sourceUrl: "https://riverbend.example/our-team",
};

const northgate: PersonAffiliationView = {
  clinicName: "Northgate Eye Care",
  role: DecisionRole.PHYSICIAN,
  roleTitle: "Optometrist",
  isOwner: false,
  confidence: Confidence.WEAK_INFERENCE,
  sourceUrl: "https://northgate.example/team",
};

describe("buildPersonFindings", () => {
  it("cites the role from the page that printed it", () => {
    const [role] = buildPersonFindings("Sarah Chen", [riverbend]);
    expect(role?.code).toBe("person_role_owner");
    expect(role?.finding).toContain("Founder & Medical Director");
    expect(role?.sourceUrl).toBe("https://riverbend.example/our-team");
    expect(role?.confidence).toBe(Confidence.VERIFIED);
    expect(role?.isFact).toBe(true);
  });

  it("marks an inferred role as not a fact", () => {
    const [role] = buildPersonFindings("Michael O'Brien", [northgate]);
    expect(role?.confidence).toBe(Confidence.WEAK_INFERENCE);
    // Only VERIFIED is a fact, matching the rule used across the codebase.
    expect(role?.isFact).toBe(false);
  });

  it("uses a role-specific code so the engine can weight authority", () => {
    // One generic code could not express that an owner outranks an associate.
    expect(buildPersonFindings("Sarah Chen", [riverbend]).map((f) => f.code)).toContain(
      "person_role_owner",
    );
    expect(buildPersonFindings("Michael O'Brien", [northgate]).map((f) => f.code)).toContain(
      "person_role_physician",
    );
  });

  it("does not claim ownership when none was stated", () => {
    const codes = buildPersonFindings("Michael O'Brien", [northgate]).map((f) => f.code);
    expect(codes).not.toContain("person_role_owner");
  });

  it("records a published address as verified evidence", () => {
    const codes = buildPersonFindings("Sarah Chen", [riverbend], "s.chen@riverbend.example").map(
      (f) => f.code,
    );
    expect(codes).toContain("person_direct_email");
  });

  it("records no address finding when none was published", () => {
    const codes = buildPersonFindings("Sarah Chen", [riverbend], null).map((f) => f.code);
    expect(codes).not.toContain("person_direct_email");
  });

  it("reports multiple affiliations as an inference, never a fact", () => {
    const findings = buildPersonFindings("Sarah Chen", [riverbend, northgate]);
    const multi = findings.find((f) => f.code === "person_multi_clinic");
    expect(multi?.finding).toContain("2 clinics");
    expect(multi?.evidence).toContain("Northgate Eye Care");
    expect(multi?.evidence).toContain("Riverbend Family Optometry");
    // No single page states this; we assembled it across sources.
    expect(multi?.confidence).toBe(Confidence.STRONG_INFERENCE);
    expect(multi?.isFact).toBe(false);
  });

  it("does not report multi-clinic for a single affiliation", () => {
    const codes = buildPersonFindings("Sarah Chen", [riverbend]).map((f) => f.code);
    expect(codes).not.toContain("person_multi_clinic");
  });

  it("cites the strongest affiliation when they disagree", () => {
    // Ordering must not decide which role we are willing to stand behind.
    const findings = buildPersonFindings("Sarah Chen", [northgate, riverbend]);
    const role = findings.find((f) => f.code === "person_role_owner");
    expect(role?.finding).toContain("Riverbend Family Optometry");
    expect(role?.isFact).toBe(true);
  });

  it("counts distinct clinics, not duplicate rows", () => {
    const findings = buildPersonFindings("Sarah Chen", [riverbend, riverbend, northgate]);
    expect(findings.find((f) => f.code === "person_multi_clinic")?.finding).toContain("2 clinics");
  });

  it("emits no role finding when the role is unknown", () => {
    const unknown: PersonAffiliationView = {
      ...northgate,
      role: DecisionRole.OTHER,
      roleTitle: null,
    };
    const codes = buildPersonFindings("Someone", [unknown]).map((f) => f.code);
    expect(codes.some((c) => c.startsWith("person_role_"))).toBe(false);
  });

  it("returns nothing for a person with no affiliations", () => {
    expect(buildPersonFindings("Nobody", [])).toEqual([]);
  });

  it("emits unique codes, which the (personId, code) constraint requires", () => {
    const codes = buildPersonFindings("Sarah Chen", [riverbend, northgate]).map((f) => f.code);
    expect(new Set(codes).size).toBe(codes.length);
  });

  it("gives every finding a source URL", () => {
    for (const finding of buildPersonFindings("Sarah Chen", [riverbend, northgate])) {
      expect(finding.sourceUrl, finding.code).toMatch(/^https?:\/\//);
    }
  });
});
