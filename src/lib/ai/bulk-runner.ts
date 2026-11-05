import { JobStatus } from "@prisma/client";
import { prisma } from "@/lib/db";
import { env, isProviderConfigured } from "@/lib/env";
import {
  chooseRunner,
  RunnerNotConfiguredError,
  type JobRunner,
} from "@/lib/research/runner";
import { runBulkDrafting } from "@/lib/ai/bulk-draft";
import { PrismaDraftJobRepository } from "@/lib/ai/draft-repository";
import { BULK_DRAFT_EVENT, inngest } from "@/inngest/client";

/**
 * Runner for the bulk-drafting job. Reuses the research runner-selection policy
 * (`chooseRunner`): production REQUIRES Inngest (durable, resumable) and never
 * silently falls back to the inline runner; local development uses the in-process
 * runner when Inngest is not configured. Callers depend only on `JobRunner`.
 */

function bulkDelayMs(): number {
  const n = Number.parseInt(env.DRAFT_BULK_DELAY_MS ?? "", 10);
  return Number.isFinite(n) && n >= 0 ? n : 750;
}

/**
 * Bulk drafting narrows JobRunner: the campaign is optional, because an
 * org-wide run has none and the job row is what drives targeting either way.
 */
export interface BulkDraftRunner extends Omit<JobRunner, "start"> {
  start(jobId: string, campaignId?: string): Promise<void>;
}

export class InlineBulkDraftRunner implements BulkDraftRunner {
  readonly name = "inline";
  readonly durable = false;

  async start(jobId: string): Promise<void> {
    const repo = new PrismaDraftJobRepository();
    void runBulkDrafting(jobId, repo, { delayMs: bulkDelayMs() }).catch(async (error) => {
      try {
        await prisma.researchJob.update({
          where: { id: jobId },
          data: {
            status: JobStatus.FAILED,
            finishedAt: new Date(),
            message: error instanceof Error ? error.message.slice(0, 500) : "Unexpected error.",
          },
        });
        await prisma.errorLog.create({
          data: {
            jobId,
            scope: "runner",
            message: error instanceof Error ? error.message : String(error),
            stack: error instanceof Error ? (error.stack ?? null) : null,
            retryable: false,
          },
        });
      } catch {
        // Nothing more we can do if the DB is unreachable.
      }
    });
  }
}

export class InngestBulkDraftRunner implements BulkDraftRunner {
  readonly name = "inngest";
  readonly durable = true;

  async start(jobId: string, campaignId?: string): Promise<void> {
    await inngest.send({
      name: BULK_DRAFT_EVENT,
      data: campaignId ? { jobId, campaignId } : { jobId },
      id: `bulk-drafting-${jobId}`,
    });
  }
}

let inlineRunner: InlineBulkDraftRunner | null = null;
let inngestRunner: InngestBulkDraftRunner | null = null;

export function getBulkDraftRunner(): BulkDraftRunner {
  const selection = chooseRunner({
    nodeEnv: env.NODE_ENV,
    inngestConfigured: isProviderConfigured("background_jobs"),
    override: env.JOB_RUNNER,
  });
  if ("error" in selection) throw new RunnerNotConfiguredError(selection.error);
  if (selection.kind === "inngest") return (inngestRunner ??= new InngestBulkDraftRunner());
  return (inlineRunner ??= new InlineBulkDraftRunner());
}
