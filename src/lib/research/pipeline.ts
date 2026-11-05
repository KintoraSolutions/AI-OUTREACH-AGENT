import { NonRecoverableError, ProviderNotConfiguredError } from "@/lib/research/errors";
import { toOperatorMessage } from "@/lib/research/failure-reasons";
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
 * Campaign research orchestrator (runner-agnostic; docs/planning/build-plan.md Section 5).
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
  /** Reserve clinics researched to make up for ones that failed. */
  replaced: number;
  message: string | null;
}

type Candidate = { candidate: DiscoveredClinic; dedupeKey: string };

type DiscoveryStepResult =
  | {
      ok: true;
      candidates: Candidate[];
      reserves: Candidate[];
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
    return { status: "FAILED", total: 0, succeeded: 0, failed: 0, duplicates: 0, replaced: 0, message: "Campaign not found." };
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
      return {
        ok: true,
        candidates: out.candidates,
        reserves: out.reserves,
        filtered: out.filtered,
        duplicates: out.duplicates,
      };
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
    // The raw text goes to the error log; the job message, which an operator
    // reads on the dashboard, gets the readable form.
    await repo.logError(jobId, { scope: "discovery", message: discovery.message, retryable: discovery.retryable });
    const operatorMessage = toOperatorMessage(discovery.message);
    await repo.updateJob(jobId, { status: "FAILED", finishedAt: new Date(), message: operatorMessage });
    await repo.setCampaignStatus(campaignId, "DRAFT");
    return { status: "FAILED", total: 0, succeeded: 0, failed: 0, duplicates: 0, replaced: 0, message: operatorMessage };
  }

  // Load the org's scoring configuration once, memoized, so every clinic in this
  // run is scored against the same ruleset version (deterministic).
  const config: ScoringConfig = await steps.run("scoring-config", () => repo.loadScoringConfig(orgId));

  const { candidates, reserves, filtered, duplicates: discoveryDuplicates } = discovery;
  let total = candidates.length;
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
    return { status: "SUCCEEDED", total: 0, succeeded: 0, failed: 0, duplicates: discoveryDuplicates, replaced: 0, message: null };
  }

  /**
   * Enrich + persist one clinic. Never throws: a failing website is recorded as
   * a soft error and the discovery record is still saved (partial results); a
   * hard failure is caught, logged, and isolated so the campaign continues.
   *
   * Shared by the main pass and the replacement pass so a replacement is
   * researched, scored and logged exactly like any other clinic.
   */
  async function processOne(
    candidate: DiscoveredClinic,
    dedupeKey: string,
  ): Promise<ClinicStepResult> {
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
      await repo.logError(jobId, {
        scope: "enrich",
        targetUrl: candidate.websiteUrl,
        message: `${candidate.name}: ${e instanceof Error ? e.message : String(e)}`,
        stack: e instanceof Error ? e.stack : null,
        retryable: false,
      });
      return { outcome: "failed" };
    }
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

    const { outcome } = await steps.run(
      `clinic-${index}-${dedupeKey}`,
      () => processOne(candidate, dedupeKey),
    );

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

  // --- Replace failures from the reserve pool ---
  //
  // Discovery over-fetches, so the surplus beyond maxLeads is sitting unused.
  // A campaign asked for 40 leads should not quietly finish with 36 because
  // four sites were unreachable: pull reserves in until the original target is
  // met or the pool runs dry. A replacement that itself fails simply draws the
  // next one, bounded by the pool size.
  let replaced = 0;
  const target = candidates.length;

  for (let r = 0; r < reserves.length && succeeded < target && !stopStatus; r++) {
    const control = await steps.run(`replace-control-${r}`, () => repo.readControl(jobId));
    if (control.cancelRequested) {
      stopStatus = "CANCELLED";
      break;
    }
    if (control.pauseRequested) {
      stopStatus = "PAUSED";
      break;
    }

    const { candidate, dedupeKey } = reserves[r]!;
    const { outcome } = await steps.run(
      `replacement-${r}-${dedupeKey}`,
      () => processOne(candidate, dedupeKey),
    );

    // The replacement is extra work, so the denominator grows with it; progress
    // would otherwise exceed 100%.
    total++;
    processed++;
    replaced++;
    if (outcome === "duplicate") duplicates++;
    else if (outcome === "created") succeeded++;
    else failed++;

    await repo.updateJob(jobId, {
      total,
      processed,
      succeeded,
      failed,
      progress: Math.round((processed / total) * 100),
      message: `Replacing ${Math.min(target - succeeded + replaced, reserves.length)} clinic(s) that could not be researched.`,
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
        : [
            `Researched ${succeeded} clinic(s)`,
            failed > 0 ? `${failed} could not be researched` : null,
            replaced > 0 ? `${replaced} replaced from reserves` : null,
            duplicates > 0 ? `${duplicates} duplicate(s) skipped` : null,
          ]
            .filter(Boolean)
            .join(", ") + ".";

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

  return { status, total, succeeded, failed, duplicates, replaced, message };
}
