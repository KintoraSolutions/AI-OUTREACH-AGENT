import { passthroughStepRunner } from "@/lib/research/steps";
import type {
  JobControl,
  JobPatch,
  JobRunStatus,
  JobStepRunner,
  LoggedError,
} from "@/lib/research/types";

/**
 * Durable, resumable, idempotent, rate-limited bulk drafting (plan.md Section 7).
 * Mirrors the research orchestrator: every unit of work is wrapped in
 * `steps.run(id, fn)` so under Inngest each completed clinic is memoized (safe
 * replay after retries/restarts/duplicate delivery), while inline/test runs pass
 * through. The database (via `DraftJobRepository`) is the source of truth for
 * status, progress, and errors.
 *
 * Guarantees:
 *  - one failing clinic never stops the batch (each is isolated + logged),
 *  - a completed clinic is not re-drafted on replay (step memoization) and the
 *    one-draft-per-clinic unique constraint blocks any duplicate that slips
 *    through,
 *  - rate limiting via a configurable delay between clinics (AI RPM safety),
 *  - pause/cancel honored between clinics.
 */

export type DraftOutcome = "generated" | "blocked" | "failed";

export interface DraftJobRepository {
  /** Resolve the target clinics for this job (deterministic, so resume is safe). */
  loadTargets(jobId: string): Promise<{ orgId: string; clinicIds: string[] } | null>;
  readControl(jobId: string): Promise<JobControl>;
  updateJob(jobId: string, patch: JobPatch): Promise<void>;
  logError(jobId: string, error: LoggedError): Promise<void>;
  /** Load context, run the drafting engine, and persist. Idempotent per clinic. */
  draftClinic(orgId: string, clinicId: string): Promise<DraftOutcome>;
}

export interface BulkDraftOptions {
  steps?: JobStepRunner;
  /** Delay between clinics for AI rate limiting. */
  delayMs?: number;
  sleep?: (ms: number) => Promise<void>;
}

export interface BulkDraftSummary {
  status: JobRunStatus;
  total: number;
  generated: number;
  blocked: number;
  failed: number;
  message: string | null;
}

const defaultSleep = (ms: number) => new Promise<void>((r) => setTimeout(r, ms));

export async function runBulkDrafting(
  jobId: string,
  repo: DraftJobRepository,
  options: BulkDraftOptions = {},
): Promise<BulkDraftSummary> {
  const steps = options.steps ?? passthroughStepRunner;
  const delayMs = options.delayMs ?? 0;
  const sleep = options.sleep ?? defaultSleep;

  await steps.run("start", () =>
    repo.updateJob(jobId, { status: "RUNNING", startedAt: new Date(), processed: 0, progress: 0 }),
  );

  const targets = await steps.run("targets", () => repo.loadTargets(jobId));
  if (!targets) {
    await repo.updateJob(jobId, { status: "FAILED", finishedAt: new Date(), message: "Job not found." });
    return { status: "FAILED", total: 0, generated: 0, blocked: 0, failed: 0, message: "Job not found." };
  }

  const { orgId, clinicIds } = targets;
  const total = clinicIds.length;
  await repo.updateJob(jobId, {
    total,
    message: total === 0 ? "No qualified leads to draft." : `Drafting ${total} lead(s).`,
  });

  if (total === 0) {
    await repo.updateJob(jobId, { status: "SUCCEEDED", finishedAt: new Date(), progress: 100 });
    return { status: "SUCCEEDED", total: 0, generated: 0, blocked: 0, failed: 0, message: null };
  }

  let processed = 0;
  let generated = 0;
  let blocked = 0;
  let failed = 0;
  let stopStatus: JobRunStatus | null = null;

  for (let index = 0; index < clinicIds.length; index++) {
    const clinicId = clinicIds[index]!;

    const control = await steps.run(`draft-control-${index}`, () => repo.readControl(jobId));
    if (control.cancelRequested) {
      stopStatus = "CANCELLED";
      break;
    }
    if (control.pauseRequested) {
      stopStatus = "PAUSED";
      break;
    }

    const outcome = await steps.run(`draft-${index}-${clinicId}`, async (): Promise<DraftOutcome> => {
      try {
        return await repo.draftClinic(orgId, clinicId);
      } catch (e) {
        await repo.logError(jobId, {
          scope: "ai",
          message: `Drafting failed for clinic ${clinicId}: ${e instanceof Error ? e.message : String(e)}`,
          stack: e instanceof Error ? e.stack : null,
          retryable: false,
        });
        return "failed";
      }
    });

    if (outcome === "generated") generated++;
    else if (outcome === "blocked") blocked++;
    else failed++;

    processed++;
    await repo.updateJob(jobId, {
      processed,
      succeeded: generated,
      failed,
      progress: Math.round((processed / total) * 100),
    });

    // Rate limit between clinics (skip the wait after the last one).
    if (delayMs > 0 && index < clinicIds.length - 1) await sleep(delayMs);
  }

  const status: JobRunStatus =
    stopStatus === "CANCELLED"
      ? "CANCELLED"
      : stopStatus === "PAUSED"
        ? "PAUSED"
        : failed > 0 && generated + blocked > 0
          ? "PARTIAL"
          : failed > 0
            ? "FAILED"
            : "SUCCEEDED";

  const message =
    status === "PAUSED"
      ? `Paused after ${processed} of ${total}. Resume to continue.`
      : status === "CANCELLED"
        ? `Cancelled after ${processed} of ${total}.`
        : `Drafted ${generated}, blocked ${blocked}, failed ${failed} of ${total}.`;

  await repo.updateJob(jobId, {
    status,
    processed,
    succeeded: generated,
    failed,
    progress: Math.round((processed / total) * 100),
    message,
    finishedAt: status === "PAUSED" ? undefined : new Date(),
  });

  return { status, total, generated, blocked, failed, message };
}
