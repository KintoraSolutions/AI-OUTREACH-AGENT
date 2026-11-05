import { describe, expect, it } from "vitest";
import { DraftStatus, RecommendedService, ScoreConfidence } from "@prisma/client";
import {
  buildConfigChecks,
  buildReadiness,
  classifyLead,
  configBlockers,
  LEADS_PER_GROUP,
  type ReadinessClinic,
} from "@/lib/campaigns/readiness";

/**
 * These lock the rule that the review screen and the drafting run agree on who
 * gets drafted. If `classifyLead` drifts from `loadTargets`, the screen promises
 * a lead count the run will not deliver — the exact surprise it exists to stop.
 */

function score(
  recommendedService: RecommendedService,
  over: Partial<NonNullable<ReadinessClinic["score"]>> = {},
): NonNullable<ReadinessClinic["score"]> {
  return {
    recommendedService,
    manualOverride: false,
    overrideOverall: null,
    overrideService: null,
    overallScore: 62,
    confidence: ScoreConfidence.MEDIUM,
    ...over,
  };
}

function lead(over: Partial<ReadinessClinic> = {}): ReadinessClinic {
  return {
    id: "c1",
    name: "Riverbend Family Optometry",
    category: "Medical Clinic",
    websiteUrl: "https://riverbend.example",
    publicEmail: "hello@riverbend.example",
    doNotContact: false,
    contactEmails: [],
    score: score(RecommendedService.WEBSITE),
    draft: null,
    ...over,
  };
}

describe("classifyLead", () => {
  it("drafts a scored, contactable lead with a service fit", () => {
    const v = classifyLead(lead());
    expect(v.draftable).toBe(true);
    expect(v.issues).toEqual([]);
  });

  it("skips a lead with no score and points at the website as the unblock", () => {
    const v = classifyLead(lead({ score: null, websiteUrl: null }));
    expect(v.draftable).toBe(false);
    expect(v.issues).toEqual(["not_researched", "missing_website"]);
  });

  it("does not report a missing website when the lead is already scored", () => {
    // Research can be satisfied by a manual finding, so a scored lead with no
    // website is not broken — telling someone to add one would be busywork.
    const v = classifyLead(lead({ websiteUrl: null }));
    expect(v.draftable).toBe(true);
    expect(v.issues).not.toContain("missing_website");
  });

  it("skips a scored lead whose effective service is NONE", () => {
    const v = classifyLead(
      lead({
        score: score(RecommendedService.NONE),
      }),
    );
    expect(v.draftable).toBe(false);
    expect(v.issues).toEqual(["no_service_fit"]);
  });

  it("honours a manual override, exactly as loadTargets does", () => {
    // Overridden up: a computed NONE still gets drafted.
    expect(
      classifyLead(
        lead({
          score: score(RecommendedService.NONE, {
            manualOverride: true,
            overrideService: RecommendedService.KLEARQ,
          }),
        }),
      ).draftable,
    ).toBe(true);

    // Overridden down: a computed fit is skipped.
    expect(
      classifyLead(
        lead({
          score: score(RecommendedService.WEBSITE, {
            manualOverride: true,
            overrideService: RecommendedService.NONE,
          }),
        }),
      ).draftable,
    ).toBe(false);
  });

  it("still drafts a lead with no email, but flags it", () => {
    const v = classifyLead(lead({ publicEmail: null, contactEmails: [] }));
    expect(v.draftable).toBe(true);
    expect(v.issues).toEqual(["missing_email"]);
    expect(v.email).toBeNull();
  });

  it("prefers a contact email over the clinic's public address", () => {
    const v = classifyLead(lead({ contactEmails: ["dr@riverbend.example"] }));
    expect(v.email).toBe("dr@riverbend.example");
  });

  it("ignores blank and null contact emails", () => {
    const v = classifyLead(lead({ contactEmails: [null, "   "], publicEmail: "x@y.example" }));
    expect(v.email).toBe("x@y.example");
  });

  it("flags a blocked draft without un-drafting the lead", () => {
    const v = classifyLead(lead({ draft: { status: DraftStatus.BLOCKED } }));
    expect(v.draftable).toBe(true);
    expect(v.issues).toEqual(["draft_blocked"]);
  });

  it("reports do-not-contact alone, even when other data is missing", () => {
    // Otherwise the review screen sends someone off to add a website for a lead
    // that is excluded no matter what.
    const v = classifyLead(
      lead({ doNotContact: true, websiteUrl: null, publicEmail: null, score: null }),
    );
    expect(v.draftable).toBe(false);
    expect(v.issues).toEqual(["do_not_contact"]);
  });
});

describe("buildReadiness", () => {
  it("counts an empty campaign as not launchable", () => {
    const r = buildReadiness([]);
    expect(r.totalLeads).toBe(0);
    expect(r.draftableLeads).toBe(0);
    expect(r.canLaunch).toBe(false);
    expect(r.groups).toEqual([]);
  });

  it("separates draftable from skipped and keeps the totals consistent", () => {
    const r = buildReadiness([
      lead({ id: "a" }),
      lead({ id: "b" }),
      lead({ id: "c", score: null }),
      lead({ id: "d", doNotContact: true }),
    ]);
    expect(r.totalLeads).toBe(4);
    expect(r.draftableLeads).toBe(2);
    expect(r.skippedLeads).toBe(2);
    expect(r.draftableLeads + r.skippedLeads).toBe(r.totalLeads);
    expect(r.canLaunch).toBe(true);
  });

  it("orders groups so what stops the run comes first", () => {
    const r = buildReadiness([
      lead({ id: "a", doNotContact: true }),
      lead({ id: "b", publicEmail: null }),
      lead({ id: "c", score: null, websiteUrl: null }),
    ]);
    expect(r.groups.map((g) => g.kind)).toEqual([
      "not_researched",
      "missing_website",
      "missing_email",
      "do_not_contact",
    ]);
  });

  it("omits groups with no members", () => {
    const r = buildReadiness([lead({ id: "a" })]);
    expect(r.groups).toEqual([]);
  });

  it("caps the listed leads but keeps the true count", () => {
    const many = Array.from({ length: LEADS_PER_GROUP + 5 }, (_, i) =>
      lead({ id: `c${i}`, score: null }),
    );
    const group = buildReadiness(many).groups.find((g) => g.kind === "not_researched");
    expect(group?.count).toBe(LEADS_PER_GROUP + 5);
    expect(group?.leads).toHaveLength(LEADS_PER_GROUP);
  });

  it("lets a campaign launch while blocking issues remain, since those leads are only skipped", () => {
    const r = buildReadiness([lead({ id: "a" }), lead({ id: "b", score: null })]);
    expect(r.blockingCount).toBe(1);
    expect(r.canLaunch).toBe(true);
  });

  it("refuses launch when every lead is skipped", () => {
    const r = buildReadiness([lead({ id: "a", score: null }), lead({ id: "b", doNotContact: true })]);
    expect(r.draftableLeads).toBe(0);
    expect(r.canLaunch).toBe(false);
  });

  it("counts a lead once per issue it carries", () => {
    const r = buildReadiness([lead({ id: "a", publicEmail: null, draft: { status: DraftStatus.BLOCKED } })]);
    expect(r.draftableLeads).toBe(1);
    expect(r.attentionCount).toBe(2);
  });
});

describe("buildConfigChecks", () => {
  const complete = {
    companyName: "Kintora Solutions",
    senderName: "Aymen",
    senderEmail: "aymen@example.com",
    hasCompanyProfile: true,
    aiConfigured: true,
    gmailConnected: true,
  };

  it("passes every check when configuration is complete", () => {
    expect(buildConfigChecks(complete).every((c) => c.ok)).toBe(true);
    expect(configBlockers(buildConfigChecks(complete))).toEqual([]);
  });

  it("treats whitespace as missing", () => {
    const checks = buildConfigChecks({ ...complete, companyName: "   " });
    expect(checks.find((c) => c.kind === "company_name")?.ok).toBe(false);
  });

  it("blocks on company name, profile and the AI key, but not on Gmail", () => {
    const checks = buildConfigChecks({
      companyName: null,
      senderName: null,
      senderEmail: null,
      hasCompanyProfile: false,
      aiConfigured: false,
      gmailConnected: false,
    });
    expect(configBlockers(checks).map((c) => c.kind).sort()).toEqual([
      "ai_provider",
      "company_name",
      "company_profile",
    ]);
  });

  it("keeps Gmail informational — approving without it is still useful work", () => {
    const checks = buildConfigChecks({ ...complete, gmailConnected: false });
    expect(checks.find((c) => c.kind === "gmail")?.severity).toBe("info");
    expect(configBlockers(checks)).toEqual([]);
  });
});

/**
 * Shared recipients.
 *
 * Lead records dedupe on domain and name, so the same clinic cannot be created
 * twice. What slipped through is two *different* records reaching one inbox —
 * a practice group answering for several sites, or an owner listing the same
 * address on two domains — which would send one recipient two emails.
 */
describe("buildReadiness — shared recipients", () => {
  it("flags every lead in a sharing group, not just the extras", () => {
    // Naming only the "duplicate" implies the first one is the right one, which
    // the data does not say.
    const r = buildReadiness([
      lead({ id: "a", name: "Riverbend", publicEmail: "info@group.example" }),
      lead({ id: "b", name: "Northgate", publicEmail: "info@group.example" }),
    ]);
    const group = r.groups.find((g) => g.kind === "shared_recipient");
    expect(group?.count).toBe(2);
    expect(group?.leads.map((l) => l.name).sort()).toEqual(["Northgate", "Riverbend"]);
  });

  it("leaves distinct addresses alone", () => {
    const r = buildReadiness([
      lead({ id: "a", publicEmail: "a@x.example" }),
      lead({ id: "b", publicEmail: "b@x.example" }),
    ]);
    expect(r.groups.find((g) => g.kind === "shared_recipient")).toBeUndefined();
  });

  it("sees through plus tags and Gmail dots", () => {
    const r = buildReadiness([
      lead({ id: "a", publicEmail: "dr.smith@gmail.com" }),
      lead({ id: "b", publicEmail: "drsmith+leads@gmail.com" }),
    ]);
    expect(r.groups.find((g) => g.kind === "shared_recipient")?.count).toBe(2);
  });

  it("ignores leads that will not be drafted anyway", () => {
    // A do-not-contact or unscored lead never reaches the recipient, so pairing
    // it with a live lead is not a duplicate-send risk.
    const r = buildReadiness([
      lead({ id: "a", publicEmail: "info@group.example" }),
      lead({ id: "b", publicEmail: "info@group.example", doNotContact: true }),
      lead({ id: "c", publicEmail: "info@group.example", score: null }),
    ]);
    expect(r.groups.find((g) => g.kind === "shared_recipient")).toBeUndefined();
  });

  it("does not treat leads with no email as sharing one", () => {
    const r = buildReadiness([
      lead({ id: "a", publicEmail: null, contactEmails: [] }),
      lead({ id: "b", publicEmail: null, contactEmails: [] }),
    ]);
    expect(r.groups.find((g) => g.kind === "shared_recipient")).toBeUndefined();
    expect(r.groups.find((g) => g.kind === "missing_email")?.count).toBe(2);
  });

  it("prefers a contact email over the public one when deciding the inbox", () => {
    const r = buildReadiness([
      lead({ id: "a", contactEmails: ["owner@group.example"], publicEmail: "a@x.example" }),
      lead({ id: "b", contactEmails: [], publicEmail: "owner@group.example" }),
    ]);
    expect(r.groups.find((g) => g.kind === "shared_recipient")?.count).toBe(2);
  });

  it("still counts those leads as draftable — the draft is written, the send is not", () => {
    const r = buildReadiness([
      lead({ id: "a", publicEmail: "info@group.example" }),
      lead({ id: "b", publicEmail: "info@group.example" }),
    ]);
    expect(r.draftableLeads).toBe(2);
  });

  it("groups three sharing leads together rather than pairwise", () => {
    const r = buildReadiness([
      lead({ id: "a", publicEmail: "info@group.example" }),
      lead({ id: "b", publicEmail: "info@group.example" }),
      lead({ id: "c", publicEmail: "info@group.example" }),
    ]);
    expect(r.groups.find((g) => g.kind === "shared_recipient")?.count).toBe(3);
  });
});
