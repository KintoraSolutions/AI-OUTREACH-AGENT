import { DraftStatus } from "@prisma/client";
import { prisma } from "@/lib/db";
import { loadOrgAiProfile } from "@/lib/ai/org-ai-profile";

/**
 * Real setup state for an organization.
 *
 * Shared by the dashboard's getting-started checklist and the tutorial, so
 * both show the SAME truth. Everything here is a live query against the org's
 * own rows — nothing is remembered in localStorage, because a "you've done
 * this" tick that survives the data being deleted is a lie.
 *
 * Deliberately cheap: six `count`/`findFirst` calls with `take: 1` semantics,
 * run in one `Promise.all`, all org-scoped.
 */

export interface ChecklistState {
  /** The user reviewed and confirmed the AI profile at onboarding step 2. */
  aiConfirmed: boolean;
  /** A Google account is connected and not revoked. */
  googleConnected: boolean;
  /** At least one lead exists (any source). */
  hasLeads: boolean;
  /** At least one discovery campaign exists. */
  hasCampaign: boolean;
  /** At least one lead has been scored, i.e. research or a manual finding ran. */
  hasScoredLead: boolean;
  /** At least one email draft has been generated. */
  hasDraft: boolean;
  /** At least one draft has been approved. */
  hasApprovedDraft: boolean;
}

export const CHECKLIST_KEYS = [
  "aiConfirmed",
  "googleConnected",
  "hasLeads",
  "hasCampaign",
  "hasScoredLead",
  "hasDraft",
  "hasApprovedDraft",
] as const satisfies readonly (keyof ChecklistState)[];

export async function loadChecklistState(orgId: string): Promise<ChecklistState> {
  const [profile, google, leads, campaigns, scored, drafts, approved] = await Promise.all([
    loadOrgAiProfile(orgId),
    prisma.googleConnection.count({ where: { orgId, revokedAt: null } }),
    prisma.clinic.count({ where: { orgId } }),
    prisma.searchCampaign.count({ where: { orgId } }),
    prisma.leadScore.count({ where: { clinic: { orgId } } }),
    prisma.emailDraft.count({ where: { clinic: { orgId } } }),
    prisma.emailDraft.count({
      where: { clinic: { orgId }, status: DraftStatus.APPROVED },
    }),
  ]);

  return {
    aiConfirmed: Boolean(profile.confirmedAt),
    googleConnected: google > 0,
    hasLeads: leads > 0,
    hasCampaign: campaigns > 0,
    hasScoredLead: scored > 0,
    hasDraft: drafts > 0,
    hasApprovedDraft: approved > 0,
  };
}

/** How many steps are done, for a progress read-out. */
export function checklistProgress(state: ChecklistState): {
  done: number;
  total: number;
  complete: boolean;
} {
  const done = CHECKLIST_KEYS.filter((k) => state[k]).length;
  return { done, total: CHECKLIST_KEYS.length, complete: done === CHECKLIST_KEYS.length };
}
