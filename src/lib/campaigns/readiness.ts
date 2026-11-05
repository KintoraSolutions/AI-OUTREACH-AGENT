import {
  DraftStatus,
  RecommendedService,
  type Clinic,
  type EmailDraft,
  type LeadScore,
} from "@prisma/client";
import { effectiveServiceOf } from "@/lib/leads/score-filter";
import { normalizeEmail } from "@/lib/integrations/gmail-guard";

/**
 * What stands between a campaign and a confident launch.
 *
 * The rules here mirror `PrismaDraftJobRepository.loadTargets` exactly — a lead
 * is drafted when it is scored, has an effective service other than NONE, and
 * is not marked do-not-contact. If the two ever drift, the review screen
 * promises a number of drafts the run will not produce, which is precisely the
 * surprise this screen exists to prevent.
 *
 * Kept pure and separate from Prisma so the classification is unit-tested
 * against fixtures rather than against a live database.
 */

export type IssueKind =
  | "missing_website"
  | "missing_email"
  | "not_researched"
  | "no_service_fit"
  | "draft_blocked"
  | "shared_recipient"
  | "do_not_contact";

/** How much an issue matters before launch. */
export type IssueSeverity = "blocking" | "attention" | "info";

export interface IssueDefinition {
  kind: IssueKind;
  severity: IssueSeverity;
  /** Singular/plural headline, e.g. "lead has no website". */
  title: (n: number) => string;
  /** What the run will do if this is left alone. Never vague. */
  consequence: string;
  /** The in-place control the review screen offers. */
  fix: "website" | "email" | "run-research" | "none" | "exclude";
}

export const ISSUE_DEFINITIONS: Record<IssueKind, IssueDefinition> = {
  missing_website: {
    kind: "missing_website",
    severity: "blocking",
    title: (n) => (n === 1 ? "1 lead has no website" : `${n} leads have no website`),
    consequence:
      "Research has nothing to audit, so these leads never get findings or a score and will not be drafted.",
    fix: "website",
  },
  missing_email: {
    kind: "missing_email",
    severity: "attention",
    title: (n) => (n === 1 ? "1 lead has no email address" : `${n} leads have no email address`),
    consequence:
      "A draft is still written and you can review it, but it cannot become a Gmail draft until there is an address to send it to.",
    fix: "email",
  },
  not_researched: {
    kind: "not_researched",
    severity: "blocking",
    title: (n) => (n === 1 ? "1 lead has not been scored" : `${n} leads have not been scored`),
    consequence:
      "Only scored leads are drafted. Run research to audit these, or add a finding by hand on the lead.",
    fix: "run-research",
  },
  no_service_fit: {
    kind: "no_service_fit",
    severity: "info",
    title: (n) => (n === 1 ? "1 lead is not a fit" : `${n} leads are not a fit`),
    consequence:
      "Scoring found nothing to offer these leads, so they are skipped. This is a normal outcome, not an error.",
    fix: "none",
  },
  draft_blocked: {
    kind: "draft_blocked",
    severity: "attention",
    title: (n) => (n === 1 ? "1 draft was held back" : `${n} drafts were held back`),
    consequence:
      "The evidence guard found a claim the findings could not support. These need an edit or a regeneration in the review queue.",
    fix: "none",
  },
  shared_recipient: {
    kind: "shared_recipient",
    severity: "attention",
    title: (n) =>
      n === 1 ? "1 lead shares an email address" : `${n} leads share an email address`,
    consequence:
      "These leads are different records but reach the same inbox, so approving them all would email one recipient more than once. Only the first will be allowed into Gmail — give the others their own address, or skip them.",
    fix: "email",
  },
  do_not_contact: {
    kind: "do_not_contact",
    severity: "info",
    title: (n) => (n === 1 ? "1 lead is marked do-not-contact" : `${n} leads are marked do-not-contact`),
    consequence: "These are excluded from drafting entirely, by design.",
    fix: "exclude",
  },
};

/** The order issues are presented in: what stops the run, then what degrades it. */
export const ISSUE_ORDER: IssueKind[] = [
  "not_researched",
  "missing_website",
  "missing_email",
  "shared_recipient",
  "draft_blocked",
  "no_service_fit",
  "do_not_contact",
];

export interface LeadIssueRow {
  clinicId: string;
  name: string;
  category: string | null;
  websiteUrl: string | null;
  email: string | null;
}

export interface IssueGroup {
  kind: IssueKind;
  severity: IssueSeverity;
  title: string;
  consequence: string;
  fix: IssueDefinition["fix"];
  count: number;
  /** Capped for rendering; `count` is the true total. */
  leads: LeadIssueRow[];
}

/** The minimum shape `classifyLead` needs — a subset of the Prisma row. */
export type ReadinessClinic = Pick<
  Clinic,
  "id" | "name" | "category" | "websiteUrl" | "publicEmail" | "doNotContact"
> & {
  contactEmails: (string | null)[];
  /** The six fields `loadTargets` selects, so the two stay comparable. */
  score: Pick<
    LeadScore,
    | "recommendedService"
    | "manualOverride"
    | "overrideOverall"
    | "overrideService"
    | "overallScore"
    | "confidence"
  > | null;
  draft: Pick<EmailDraft, "status"> | null;
};

export interface LeadVerdict {
  /** True when this lead will receive a model call on launch. */
  draftable: boolean;
  /** Every issue this lead carries; a lead can appear in more than one group. */
  issues: IssueKind[];
  email: string | null;
}

/**
 * Decide what happens to one lead on launch, and why.
 *
 * Note the ordering: do-not-contact wins over everything, because the run skips
 * it regardless of how complete its data is — reporting "no website" for a lead
 * that is excluded anyway would send someone off to fix something that changes
 * nothing.
 */
export function classifyLead(lead: ReadinessClinic): LeadVerdict {
  const email = lead.contactEmails.find((e) => e && e.trim().length > 0) ?? lead.publicEmail ?? null;

  if (lead.doNotContact) {
    return { draftable: false, issues: ["do_not_contact"], email };
  }

  const issues: IssueKind[] = [];
  const scored = lead.score != null;
  const service = lead.score ? effectiveServiceOf(lead.score) : RecommendedService.NONE;

  if (!scored) {
    issues.push("not_researched");
    // A missing website is why research cannot help this lead, so it is worth
    // surfacing alongside — fixing it is the actual unblock.
    if (!lead.websiteUrl) issues.push("missing_website");
    return { draftable: false, issues, email };
  }

  if (service === RecommendedService.NONE) {
    return { draftable: false, issues: ["no_service_fit"], email };
  }

  // From here the lead will be drafted. Remaining issues degrade the result
  // rather than prevent it.
  if (!email) issues.push("missing_email");
  if (lead.draft?.status === DraftStatus.BLOCKED) issues.push("draft_blocked");

  return { draftable: true, issues, email };
}

export interface CampaignReadiness {
  totalLeads: number;
  draftableLeads: number;
  /** Leads excluded for any reason. */
  skippedLeads: number;
  groups: IssueGroup[];
  /** True when nothing with `blocking` severity remains. */
  canLaunch: boolean;
  blockingCount: number;
  attentionCount: number;
}

/** Leads listed per group before the UI collapses the rest behind a count. */
export const LEADS_PER_GROUP = 8;

export function buildReadiness(leads: ReadinessClinic[]): CampaignReadiness {
  const buckets = new Map<IssueKind, LeadIssueRow[]>();
  const counts = new Map<IssueKind, number>();
  let draftable = 0;

  for (const lead of leads) {
    const verdict = classifyLead(lead);
    if (verdict.draftable) draftable += 1;

    for (const kind of verdict.issues) {
      counts.set(kind, (counts.get(kind) ?? 0) + 1);
      const rows = buckets.get(kind) ?? [];
      if (rows.length < LEADS_PER_GROUP) {
        rows.push({
          clinicId: lead.id,
          name: lead.name,
          category: lead.category,
          websiteUrl: lead.websiteUrl,
          email: verdict.email,
        });
      }
      buckets.set(kind, rows);
    }
  }

  // Shared recipients are a property of the SET, not of any one lead, so they
  // are found in a second pass. Lead records dedupe on domain and name, which
  // means the same clinic cannot appear twice — but two genuinely different
  // records can still reach one inbox, and nothing downstream would notice
  // until the recipient had two emails.
  const draftableByInbox = new Map<string, ReadinessClinic[]>();
  for (const lead of leads) {
    const verdict = classifyLead(lead);
    if (!verdict.draftable || !verdict.email) continue;
    const inbox = normalizeEmail(verdict.email);
    draftableByInbox.set(inbox, [...(draftableByInbox.get(inbox) ?? []), lead]);
  }

  for (const sharing of draftableByInbox.values()) {
    if (sharing.length < 2) continue;
    for (const lead of sharing) {
      counts.set("shared_recipient", (counts.get("shared_recipient") ?? 0) + 1);
      const rows = buckets.get("shared_recipient") ?? [];
      if (rows.length < LEADS_PER_GROUP) {
        rows.push({
          clinicId: lead.id,
          name: lead.name,
          category: lead.category,
          websiteUrl: lead.websiteUrl,
          email: classifyLead(lead).email,
        });
      }
      buckets.set("shared_recipient", rows);
    }
  }

  const groups: IssueGroup[] = ISSUE_ORDER.filter((k) => (counts.get(k) ?? 0) > 0).map((kind) => {
    const def = ISSUE_DEFINITIONS[kind];
    const count = counts.get(kind) ?? 0;
    return {
      kind,
      severity: def.severity,
      title: def.title(count),
      consequence: def.consequence,
      fix: def.fix,
      count,
      leads: buckets.get(kind) ?? [],
    };
  });

  const blockingCount = groups
    .filter((g) => g.severity === "blocking")
    .reduce((n, g) => n + g.count, 0);
  const attentionCount = groups
    .filter((g) => g.severity === "attention")
    .reduce((n, g) => n + g.count, 0);

  return {
    totalLeads: leads.length,
    draftableLeads: draftable,
    skippedLeads: leads.length - draftable,
    groups,
    // Blocking issues do not literally prevent the run — they mean those leads
    // are skipped. Launch stays available as long as *something* will be
    // drafted; the review screen states plainly what will be left behind.
    canLaunch: draftable > 0,
    blockingCount,
    attentionCount,
  };
}

// ---------------------------------------------------------------------------
// Campaign-wide configuration readiness
// ---------------------------------------------------------------------------

export type ConfigKind =
  | "company_name"
  | "sender_name"
  | "sender_email"
  | "company_profile"
  | "ai_provider"
  | "gmail";

export interface ConfigCheck {
  kind: ConfigKind;
  label: string;
  ok: boolean;
  /** Shown when `ok` is false. Says what breaks, not just what is missing. */
  detail: string;
  /** Severity if unmet. */
  severity: IssueSeverity;
}

export interface ConfigInput {
  companyName: string | null;
  senderName: string | null;
  senderEmail: string | null;
  hasCompanyProfile: boolean;
  aiConfigured: boolean;
  gmailConnected: boolean;
}

/**
 * The campaign-wide settings a draft depends on.
 *
 * Every one of these is fed to the model as sender context, which is why they
 * belong on the campaign screen rather than three clicks away in Settings: a
 * blank company name does not fail loudly, it quietly produces drafts signed by
 * nobody.
 */
export function buildConfigChecks(input: ConfigInput): ConfigCheck[] {
  return [
    {
      kind: "company_name",
      label: "Company name",
      ok: Boolean(input.companyName?.trim()),
      detail: "Drafts have no company to introduce, so the model invents phrasing around the gap.",
      severity: "blocking",
    },
    {
      kind: "sender_name",
      label: "Sender name",
      ok: Boolean(input.senderName?.trim()),
      detail: "Emails are signed off with no name.",
      severity: "attention",
    },
    {
      kind: "sender_email",
      label: "Reply-to address",
      ok: Boolean(input.senderEmail?.trim()),
      detail: "Recipients have no address to reply to other than the Gmail account you send from.",
      severity: "attention",
    },
    {
      kind: "company_profile",
      label: "What your company does",
      ok: input.hasCompanyProfile,
      detail:
        "Without it the model has no offer to make, and drafts fall back to generic outreach.",
      severity: "blocking",
    },
    {
      kind: "ai_provider",
      label: "AI drafting",
      ok: input.aiConfigured,
      detail: "Set ANTHROPIC_API_KEY. Research and scoring still run; drafting does not.",
      severity: "blocking",
    },
    {
      kind: "gmail",
      label: "Gmail connected",
      ok: input.gmailConnected,
      detail:
        "You can still review and approve drafts; connecting Gmail is what puts an approved draft in your Drafts folder.",
      severity: "info",
    },
  ];
}

export function configBlockers(checks: ConfigCheck[]): ConfigCheck[] {
  return checks.filter((c) => !c.ok && c.severity === "blocking");
}
