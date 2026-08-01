import { prisma } from "@/lib/db";
import { JobStatus } from "@prisma/client";
import { env, isProviderConfigured } from "@/lib/env";
import { getProviderBundle } from "@/lib/research/providers";
import { PrismaResearchRepository } from "@/lib/research/repository";
import { runCampaignResearch } from "@/lib/research/pipeline";
import {
  CAMPAIGN_RESEARCH_EVENT,
  inngest,
} from "@/inngest/client";

/**
 * Job runner abstraction (plan.md Section 5, decision 3). Callers depend only on
 * this interface, so the execution backend can change without touching the
 * research engine or the dashboard — the database is the source of truth for
 * status, progress, and results.
 *
 * Two runners ship:
 *  - `InngestJobRunner` (durable): the production runner. It emits an event; an
 *    Inngest function drives the pipeline through memoized, durable steps with
 *    retries, concurrency, and resume. Selected whenever Inngest is configured,
 *    and REQUIRED in production.
 *  - `InlineJobRunner` (non-durable): runs the pipeline in-process. Real and
 *    useful for local development and controlled tests, but not reliable for
 *    long-running jobs on serverless, so it is never used in production.
 */
export interface JobRunner {
  readonly name: string;
  readonly durable: boolean;
  /** Begin executing a previously-created, QUEUED research job. */
  start(jobId: string, campaignId: string): Promise<void>;
}

/** Thrown when no valid job runner is available for the current environment. */
export class RunnerNotConfiguredError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "RunnerNotConfiguredError";
  }
}

// ---------------------------------------------------------------------------
// Inline runner (development / tests only)
// ---------------------------------------------------------------------------

export class InlineJobRunner implements JobRunner {
  readonly name = "inline";
  readonly durable = false;

  async start(jobId: string, campaignId: string): Promise<void> {
    const repo = new PrismaResearchRepository();
    const providers = getProviderBundle();
    // Fire-and-forget: the request that enqueued the job should not block on the
    // full crawl. Progress is polled from the DB by the dashboard.
    void runCampaignResearch(campaignId, jobId, repo, providers).catch(async (error) => {
      // Unexpected top-level failure: preserve any partial results already saved
      // and move the job out of RUNNING so the dashboard reflects reality.
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

// ---------------------------------------------------------------------------
// Inngest runner (durable; production default)
// ---------------------------------------------------------------------------

export class InngestJobRunner implements JobRunner {
  readonly name = "inngest";
  readonly durable = true;

  async start(jobId: string, campaignId: string): Promise<void> {
    // A stable event id gives event-level idempotency: if this send is retried
    // or delivered twice, Inngest de-duplicates it before a run starts. The
    // function's `idempotency` key is a second guard at the run level.
    await inngest.send({
      name: CAMPAIGN_RESEARCH_EVENT,
      data: { jobId, campaignId },
      id: `campaign-research-${jobId}`,
    });
  }
}

// ---------------------------------------------------------------------------
// Selection
// ---------------------------------------------------------------------------

export type RunnerKind = "inline" | "inngest";

export interface RunnerSelectionInput {
  nodeEnv: "development" | "test" | "production";
  inngestConfigured: boolean;
  /** Optional `JOB_RUNNER` override; honored outside production only. */
  override?: "inline" | "inngest";
}

/**
 * Pure runner-selection policy (unit-tested directly, no env gymnastics):
 *  - production REQUIRES Inngest; if it is not configured we refuse rather than
 *    silently fall back to the inline runner (decision 3 / item 4). A `JOB_RUNNER`
 *    override cannot force the inline runner in production.
 *  - outside production, an explicit override wins; otherwise Inngest is used
 *    when configured, falling back to the inline runner for local development.
 */
export function chooseRunner(
  input: RunnerSelectionInput,
): { kind: RunnerKind } | { error: string } {
  const { nodeEnv, inngestConfigured, override } = input;

  if (nodeEnv === "production") {
    if (!inngestConfigured) {
      return {
        error:
          "Background job processing is not configured for production. Set INNGEST_EVENT_KEY and INNGEST_SIGNING_KEY to enable durable research jobs. The inline runner is disabled in production because serverless functions cannot reliably finish long-running research.",
      };
    }
    return { kind: "inngest" };
  }

  if (override) return { kind: override };
  if (inngestConfigured) return { kind: "inngest" };
  return { kind: "inline" };
}

let inlineRunner: InlineJobRunner | null = null;
let inngestRunner: InngestJobRunner | null = null;

function runnerFor(kind: RunnerKind): JobRunner {
  if (kind === "inngest") return (inngestRunner ??= new InngestJobRunner());
  return (inlineRunner ??= new InlineJobRunner());
}

/**
 * Returns the job runner for the current environment. Throws
 * `RunnerNotConfiguredError` when production background-job credentials are
 * missing so the caller can surface a clear configuration error (item 4).
 */
export function getJobRunner(): JobRunner {
  const selection = chooseRunner({
    nodeEnv: env.NODE_ENV,
    inngestConfigured: isProviderConfigured("background_jobs"),
    override: env.JOB_RUNNER,
  });
  if ("error" in selection) throw new RunnerNotConfiguredError(selection.error);
  return runnerFor(selection.kind);
}
