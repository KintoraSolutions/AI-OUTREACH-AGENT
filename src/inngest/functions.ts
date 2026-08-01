import { JobStatus } from "@prisma/client";
import { prisma } from "@/lib/db";
import { env } from "@/lib/env";
import { getProviderBundle } from "@/lib/research/providers";
import { PrismaResearchRepository } from "@/lib/research/repository";
import { runCampaignResearch } from "@/lib/research/pipeline";
import { runBulkDrafting } from "@/lib/ai/bulk-draft";
import { runRetentionForAllOrgs } from "@/lib/retention/retention";
import { PrismaDraftJobRepository } from "@/lib/ai/draft-repository";
import type { JobStepRunner } from "@/lib/research/types";
import {
  BULK_DRAFT_EVENT,
  CAMPAIGN_RESEARCH_EVENT,
  inngest,
  type BulkDraftEventData,
  type CampaignResearchEventData,
} from "@/inngest/client";

function bulkDraftDelayMs(): number {
  const n = Number.parseInt(env.DRAFT_BULK_DELAY_MS ?? "", 10);
  return Number.isFinite(n) && n >= 0 ? n : 750;
}

function failJob(jobId: string | undefined, message: string, stack: string | null) {
  if (!jobId) return Promise.resolve();
  return (async () => {
    try {
      await prisma.researchJob.update({
        where: { id: jobId },
        data: { status: JobStatus.FAILED, finishedAt: new Date(), message: message.slice(0, 500) },
      });
      await prisma.errorLog.create({
        data: { jobId, scope: "runner", message, stack, retryable: false },
      });
    } catch {
      // Nothing more we can do if the DB is unreachable.
    }
  })();
}

/**
 * Durable campaign-research function (plan.md Section 5). It adapts Inngest's
 * `step.run` onto the runner-agnostic `JobStepRunner` the pipeline expects, so
 * the exact same orchestrator that runs inline also runs here — only now each
 * step is memoized for durable resume.
 *
 * Idempotency is layered:
 *  - event level: `InngestJobRunner` sends with a stable event id, so a duplicate
 *    send is de-duplicated by Inngest before a run ever starts;
 *  - function level: `idempotency` keyed on the jobId guarantees at most one live
 *    run per job even if two distinct events arrive;
 *  - step level: `step.run` memoizes each completed unit, so retries, restarts,
 *    and duplicate delivery never re-enrich or re-save a clinic;
 *  - database level: the `@@unique([orgId, dedupeKey])` constraint on Clinic is
 *    the final backstop, so a clinic (with its sources/findings, written in one
 *    transaction) cannot be duplicated even if a step is interrupted mid-write
 *    and later replayed.
 */
export const campaignResearch = inngest.createFunction(
  {
    id: "campaign-research",
    name: "Campaign research",
    triggers: [{ event: CAMPAIGN_RESEARCH_EVENT }],
    // At most one live run per research job (dedupes distinct duplicate events).
    idempotency: "event.data.jobId",
    // Bound concurrent campaigns so discovery/crawl stay within provider limits.
    concurrency: 5,
    retries: 3,
    onFailure: async ({ event, error }) => {
      // Reached only if the function throws past its retries (e.g. the database
      // is unreachable). Mirror InlineJobRunner's catch: move the job out of
      // RUNNING so the dashboard reflects reality and record the error. The
      // original triggering event is nested at `data.event` on the failure event.
      const data = (
        event as unknown as { data?: { event?: { data?: CampaignResearchEventData } } }
      ).data?.event?.data;
      if (!data?.jobId) return;
      try {
        await prisma.researchJob.update({
          where: { id: data.jobId },
          data: {
            status: JobStatus.FAILED,
            finishedAt: new Date(),
            message: error.message ? error.message.slice(0, 500) : "Background job failed.",
          },
        });
        await prisma.errorLog.create({
          data: {
            jobId: data.jobId,
            scope: "runner",
            message: error.message ?? String(error),
            stack: error.stack ?? null,
            retryable: false,
          },
        });
      } catch {
        // Nothing more we can do if the DB is unreachable.
      }
    },
  },
  async ({ event, step }) => {
    const { jobId, campaignId } = event.data as CampaignResearchEventData;
    const repo = new PrismaResearchRepository();
    const providers = getProviderBundle();

    // Adapt Inngest's memoized step runner onto the pipeline's interface. Our
    // return values are plain JSON, so the Jsonify<T> Inngest produces matches T.
    const steps: JobStepRunner = {
      run: <T>(id: string, fn: () => Promise<T>) => step.run(id, fn) as Promise<T>,
    };

    return runCampaignResearch(campaignId, jobId, repo, providers, { steps });
  },
);

/**
 * Durable bulk email-drafting function. Same durability model as
 * `campaignResearch`: layered idempotency (stable event id, per-job idempotency
 * key, memoized steps) plus the one-draft-per-clinic unique constraint means
 * retries, restarts, and duplicate delivery never create duplicate drafts, and
 * one failing clinic never stops the batch.
 */
export const bulkDrafting = inngest.createFunction(
  {
    id: "bulk-drafting",
    name: "Bulk email drafting",
    triggers: [{ event: BULK_DRAFT_EVENT }],
    idempotency: "event.data.jobId",
    // A single campaign's drafts run one job at a time; AI rate limiting is the
    // delay between clinics inside the pipeline.
    concurrency: 3,
    retries: 3,
    onFailure: async ({ event, error }) => {
      const data = (
        event as unknown as { data?: { event?: { data?: BulkDraftEventData } } }
      ).data?.event?.data;
      await failJob(data?.jobId, error.message ?? String(error), error.stack ?? null);
    },
  },
  async ({ event, step }) => {
    const { jobId } = event.data as BulkDraftEventData;
    const repo = new PrismaDraftJobRepository();
    const steps: JobStepRunner = {
      run: <T>(id: string, fn: () => Promise<T>) => step.run(id, fn) as Promise<T>,
    };
    return runBulkDrafting(jobId, repo, { steps, delayMs: bulkDraftDelayMs() });
  },
);

/**
 * Scheduled data-retention purge (plan.md Section 12). Runs daily and purges
 * each org's stale, unengaged research data using that org's own `retentionDays`
 * (0 disables it). Active/engaged records are always protected, the purge is
 * idempotent and batched, and every run appends an immutable `RetentionRun`
 * audit record. Admins can also trigger a dry run or an immediate purge from
 * Settings. Scheduled runs only fire where Inngest is configured (production).
 */
export const retentionPurge = inngest.createFunction(
  {
    id: "retention-purge",
    name: "Data retention purge",
    triggers: [{ cron: "0 3 * * *" }],
    // At most one retention run at a time.
    concurrency: 1,
    retries: 2,
  },
  async ({ step }) => {
    const summaries = await step.run("purge-all-orgs", () =>
      runRetentionForAllOrgs(prisma, new Date(), false),
    );
    return {
      orgs: summaries.length,
      clinicsPurged: summaries.reduce((n, s) => n + s.clinicsPurged, 0),
      jobsPurged: summaries.reduce((n, s) => n + s.jobsPurged, 0),
    };
  },
);

export const functions = [campaignResearch, bulkDrafting, retentionPurge];
