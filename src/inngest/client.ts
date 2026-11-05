import { Inngest } from "inngest";
import { env } from "@/lib/env";

/**
 * Inngest client (docs/planning/build-plan.md Section 5, decision 3). This is the ONLY place the app
 * constructs the Inngest client; the research engine in `src/lib/research/` never
 * imports Inngest, so the job runner stays swappable.
 *
 * `eventKey` / `signingKey` are required to talk to Inngest Cloud in production;
 * both are omitted in local development, where the Inngest Dev Server
 * auto-discovers the `/api/inngest` endpoint and needs no keys.
 */

export const CAMPAIGN_RESEARCH_EVENT = "campaign/research.requested";

export interface CampaignResearchEventData {
  jobId: string;
  campaignId: string;
}

export const BULK_DRAFT_EVENT = "campaign/drafts.requested";

export interface BulkDraftEventData {
  jobId: string;
  /**
   * Present only for a campaign-scoped run. The bulk-drafting function targets
   * from the job row (PrismaDraftJobRepository.loadTargets), not from this, so
   * an org-wide run carries none.
   */
  campaignId?: string;
}

export const inngest = new Inngest({
  id: "healthcare-outreach-agent",
  eventKey: env.INNGEST_EVENT_KEY,
  signingKey: env.INNGEST_SIGNING_KEY,
});
