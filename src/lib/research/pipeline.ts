import { NonRecoverableError, ProviderNotConfiguredError } from "@/lib/research/errors";
import { runDiscovery } from "@/lib/research/discover";
import { enrichClinic } from "@/lib/research/enrich";
import { withRetry } from "@/lib/research/retry";
import { passthroughStepRunner } from "@/lib/research/steps";
import { scoreClinic } from "@/lib/scoring/engine";
import { toScorableFindings } from "@/lib/scoring/adapters";
import type { ScoringConfig } from "@/lib/scoring/types";
import type {
  DiscoveredClinic,
  JobRunStatus,
  JobStepRunner,
  ProviderBundle,
  ResearchRepository,
} from "@/lib/research/types";

/**
 * Campaign research orchestrator (runner-agnostic; plan.md Section 5).
 *
 * The database (via `ResearchRepository`) is the durable source of truth for
 * status, progress, partial results, and errors. Every unit of work is wrapped
 * in `steps.run(id, fn)` (decision 3): inline/test runs pass through, while the
 * Inngest runner memoizes each completed step. Because completed steps are never
 * repeated, the same function is safe to replay after a retry, restart, worker
 * interruption, or duplicate event delivery.
 *
 * Guarantees implemented here:
 *  - progress + counts persisted as work proceeds,
 *  - partial results saved (each clinic is committed as it completes),
 *  - recoverable failures retried, non-recoverable ones recorded and skipped,
 *  - one failing website never stops the campaign,
 *  - cancellation and pause honored between durable steps,
 *  - idempotent re-runs: a completed clinic step is not re-executed on replay,
 *    and the DB unique constraint blocks any duplicate that slips through,
 *  - a clear configuration state when discovery is unconfigured (no fake run).
 */
export interface RunOptions {
  retries?: number;
  sleep?: (ms: number) => Promise<void>;
  /**
   * Durable-step boundary. Defaults to a pass-through (inline/tests). The
   * Inngest runner supplies an adapter over `step.run` for memoized replay.
   */
  steps?: JobStepRunner;
}

export interface RunSummary {
  status: JobRunStatus;
  total: number;
  succeeded: number;
  failed: number;
  duplicates: number;
  message: string | null;
}

type DiscoveryStepResult =
  | {
      ok: true;
      candidates: { candidate: DiscoveredClinic; dedupeKey: string }[];
      filtered: number;
      duplicates: number;
    }
  | { ok: false; message: string; retryable: boolean };

type ClinicStepResult = { outcome: "created" | "duplicate" | "failed" };

export async function runCampaignResearch(
  campaignId: string,
  jobId: string,
  repo: ResearchRepository,
  providers: ProviderBundle,
  options: RunOptions = {},
): Promise<RunSummary> {
  const steps = options.steps ?? passthroughStepRunner;
  const retries = options.retries;
  const sleep = options.sleep;

  // Mark RUNNING. Wrapped in a step so `startedAt` is memoized and not reset on
  // every replay.
  await steps.run("start", () =>
    repo.updateJob(jobId, { status: "RUNNING", startedAt: new Date(), processed: 0, progress: 0 }),
  );

  const loaded = await repo.loadCriteria(campaignId);
  if (!loaded) {
    await repo.updateJob(jobId, {
      status: "FAILED",
      finishedAt: new Date(),
      message: "Campaign not found.",
    });
    return { status: "FAILED", total: 0, succeeded: 0, failed: 0, duplicates: 0, message: "Campaign not found." };
  }
  const { orgId, criteria } = loaded;

  // --- Discovery (durable step; recoverable failures retried inside) ---
  const discovery = await steps.run("discover", async (): Promise<DiscoveryStepResult> => {
    try {
      const existingKeys = await repo.existingDedupeKeys(orgId);
      const out = await withRetry(() => runDiscovery(providers.discovery, criteria, existingKeys), {
        retries: retries ?? 2,
        sleep,
      });
      return { ok: true, candidates: out.candidates, filtered: out.filtered, duplicates: out.duplicates };
    } catch (e) {
      const configIssue = e instanceof ProviderNotConfiguredError;
      return {
        ok: false,
        message: e instanceof Error ? e.message : "Discovery failed.",
        retryable: !configIssue && !(e instanceof NonRecoverableError),
      };
    }
  });

  if (!discovery.ok) {
    await repo.logError(jobId, { scope: "discovery", message: discovery.message, retryable: discovery.retryable });
    await repo.updateJob(jobId, { status: "FAILED", finishedAt: new Date(), message: discovery.message });
    await repo.setCampaignStatus(campaignId, "DRAFT");
    return { status: "FAILED", total: 0, succeeded: 0, failed: 0, duplicates: 0, message: discovery.message };
  }

  // Load the org's scoring configuration once, memoized, so every clinic in this
  // run is scored against the same ruleset version (deterministic).
  const config: ScoringConfig = await steps.run("scoring-config", () => repo.loadScoringConfig(orgId));

  const { candidates, filtered, duplicates: discoveryDuplicates } = discovery;
  const total = candidates.length;
  await repo.updateJob(jobId, {
    total,
    message:
      total === 0
        ? `No new clinics matched (filtered ${filtered}, ${discoveryDuplicates} already known).`
        : `Discovered ${total} clinic(s) to research.`,
  });

  if (total === 0) {
    await repo.updateJob(jobId, { status: "SUCCEEDED", finishedAt: new Date(), progress: 100 });
    await repo.setCampaignStatus(campaignId, "COMPLETED");
    return { status: "SUCCEEDED", total: 0, succeeded: 0, failed: 0, duplicates: discoveryDuplicates, message: null };
  }

  // --- Per-clinic enrichment ---
  let processed = 0;
  let succeeded = 0;
  let failed = 0;
  let duplicates = discoveryDuplicates;
  let stopStatus: JobRunStatus | null = null;

  for (let index = 0; index < candidates.length; index++) {
    const { candidate, dedupeKey } = candidates[index]!;

    // Control check is a durable step: on replay, already-checked iterations
    // return their memoized decision, while the first not-yet-run iteration
    // reads the current pause/cancel flag — so a pause or cancel requested during
    // a run (or before a resume) is honored between clinics.
    const control = await steps.run(`control-${index}`, () => repo.readControl(jobId));
    if (control.cancelRequested) {
      stopStatus = "CANCELLED";
      break;
    }
    if (control.pauseRequested) {
      stopStatus = "PAUSED";
      break;
    }

    // Enrich + persist one clinic as a single durable, idempotent step. It never
    // throws: a failing website is recorded as a soft error and the discovery
    // record is still saved (partial results); a hard failure is caught, logged,
    // and isolated so the campaign continues. Once this step completes it is
    // memoized, so a replay does not re-enrich or re-save the clinic.
    const { outcome } = await steps.run(`clinic-${index}-${dedupeKey}`, async (): Promise<ClinicStepResult> => {
      try {
        const result = await enrichClinic(
          candidate,
          dedupeKey,
          { fetcher: providers.fetcher, performance: providers.performance, browser: providers.browser },
          { retries: retries ?? 1, sleep },
        );

        // Deterministic scoring from the audit findings (evidence). Persisted with
        // the clinic in one transaction so a saved lead is always scored.
        const score = scoreClinic(toScorableFindings(result.findings), config);
        const saved = await repo.saveClinic(orgId, campaignId, result, score);

        // Record non-fatal problems (e.g. website unreachable) without failing.
        for (const soft of result.softErrors) {
          await repo.logError(jobId, {
            scope: "enrich",
            targetUrl: soft.targetUrl,
            message: `${candidate.name}: ${soft.message}`,
            retryable: soft.retryable,
          });
        }
        return { outcome: saved };
      } catch (e) {
        // Hard failure for this clinic only: record and continue the campaign.
        await repo.logError(jobId, {
          scope: "enrich",
          targetUrl: candidate.websiteUrl,
          message: `${candidate.name}: ${e instanceof Error ? e.message : String(e)}`,
          stack: e instanceof Error ? e.stack : null,
          retryable: false,
        });
        return { outcome: "failed" };
      }
    });

    if (outcome === "duplicate") duplicates++;
    else if (outcome === "created") succeeded++;
    else failed++;

    processed++;
    // Progress is an idempotent absolute write (safe to repeat on replay).
    await repo.updateJob(jobId, {
      processed,
      succeeded,
      failed,
      progress: Math.round((processed / total) * 100),
    });
  }

  // --- Finalize ---
  const status: JobRunStatus =
    stopStatus === "CANCELLED"
      ? "CANCELLED"
      : stopStatus === "PAUSED"
        ? "PAUSED"
        : failed > 0 && succeeded > 0
          ? "PARTIAL"
          : failed > 0 && succeeded === 0
            ? "FAILED"
            : "SUCCEEDED";

  const message =
    status === "PAUSED"
      ? `Paused after ${processed} of ${total}. Resume to continue.`
      : status === "CANCELLED"
        ? `Cancelled after ${processed} of ${total}.`
        : `Researched ${succeeded} clinic(s), ${failed} failed, ${duplicates} duplicate(s) skipped.`;

  await repo.updateJob(jobId, {
    status,
    processed,
    succeeded,
    failed,
    progress: Math.round((processed / total) * 100),
    message,
    finishedAt: status === "PAUSED" ? undefined : new Date(),
  });

  await repo.setCampaignStatus(
    campaignId,
    status === "CANCELLED"
      ? "CANCELLED"
      : status === "PAUSED"
        ? "PAUSED"
        : status === "FAILED"
          ? "DRAFT"
          : "COMPLETED",
  );

  return { status, total, succeeded, failed, duplicates, message };
}
