import { describe, expect, it } from "vitest";
import { Confidence, DecisionRole } from "@prisma/client";
import { classifyRole, isDecisionMakerRole } from "./roles";

describe("classifyRole", () => {
  it("treats explicit ownership as verified", () => {
    for (const title of [
      "Owner",
      "Co-Owner",
      "Founder",
      "Co-founder & Optometrist",
      "Founding Physician",
      "Practice Proprietor",
    ]) {
      const result = classifyRole(title);
      expect(result, title).not.toBeNull();
      expect(result!.role, title).toBe(DecisionRole.OWNER);
      expect(result!.confidence, title).toBe(Confidence.VERIFIED);
      expect(result!.isOwner, title).toBe(true);
    }
  });

  it("treats a stated directorship as verified but not ownership", () => {
    const result = classifyRole("Medical Director");
    expect(result?.role).toBe(DecisionRole.MEDICAL_DIRECTOR);
    expect(result?.confidence).toBe(Confidence.VERIFIED);
    expect(result?.isOwner).toBe(false);
  });

  it("takes the strongest role from a combined title", () => {
    // "Founder & Medical Director" must not classify as merely a director:
    // ownership is the stronger claim and the one the draft may rely on.
    const result = classifyRole("Founder & Medical Director");
    expect(result?.role).toBe(DecisionRole.OWNER);
    expect(result?.isOwner).toBe(true);
    expect(result?.roleTitle).toBe("Founder & Medical Director");
  });

  it("rates leadership language as a strong inference, not a fact", () => {
    for (const title of ["Lead Physician", "Managing Partner", "Senior Partner"]) {
      const result = classifyRole(title);
      expect(result?.confidence, title).toBe(Confidence.STRONG_INFERENCE);
    }
  });

  it("recognises non-clinical practice leadership", () => {
    // A practice manager often holds the purchasing decision, which is exactly
    // the kind of person the clinic inbox hides.
    const result = classifyRole("Practice Manager");
    expect(result?.role).toBe(DecisionRole.ADMIN_LEADER);
    expect(isDecisionMakerRole(result!.role)).toBe(true);
  });

  it("rates a bare physician listing as a weak inference", () => {
    for (const title of ["Dr. Jane Smith", "Optometrist", "Chiropractor", "MD"]) {
      const result = classifyRole(title);
      expect(result, title).not.toBeNull();
      expect(result!.role, title).toBe(DecisionRole.PHYSICIAN);
      expect(result!.confidence, title).toBe(Confidence.WEAK_INFERENCE);
      // Being listed is not authority, so this must not count as a decision maker.
      expect(isDecisionMakerRole(result!.role), title).toBe(false);
    }
  });

  it("rejects staff who are not decision makers", () => {
    for (const title of [
      "Receptionist",
      "Front Desk",
      "Medical Office Assistant",
      "Administrative Assistant",
      "Dental Hygienist",
      "Resident",
      "Medical Student",
      "Billing Coordinator",
      "Registered Massage Therapist Assistant",
    ]) {
      expect(classifyRole(title), title).toBeNull();
    }
  });

  it("does not let an exclusion be smuggled past by a clinical word", () => {
    // "Clinic Receptionist" contains "clinic"; the exclusion must win.
    expect(classifyRole("Clinic Receptionist")).toBeNull();
    expect(classifyRole("Assistant to the Medical Director")).toBeNull();
  });

  it("returns null for empty, missing or implausible input", () => {
    expect(classifyRole(null)).toBeNull();
    expect(classifyRole(undefined)).toBeNull();
    expect(classifyRole("")).toBeNull();
    expect(classifyRole("   ")).toBeNull();
    expect(classifyRole("Welcome to our practice, where we have served")).toBeNull();
    expect(classifyRole("x".repeat(200))).toBeNull();
  });

  it("normalises whitespace but keeps the title verbatim otherwise", () => {
    const result = classifyRole("  Medical   Director\n ");
    expect(result?.roleTitle).toBe("Medical Director");
  });
});

describe("isDecisionMakerRole", () => {
  it("includes authority roles and excludes the rest", () => {
    expect(isDecisionMakerRole(DecisionRole.OWNER)).toBe(true);
    expect(isDecisionMakerRole(DecisionRole.MEDICAL_DIRECTOR)).toBe(true);
    expect(isDecisionMakerRole(DecisionRole.LEAD_PHYSICIAN)).toBe(true);
    expect(isDecisionMakerRole(DecisionRole.ADMIN_LEADER)).toBe(true);
    expect(isDecisionMakerRole(DecisionRole.PHYSICIAN)).toBe(false);
    expect(isDecisionMakerRole(DecisionRole.OTHER)).toBe(false);
  });
});
