import Link from "next/link";
import { JobStatus } from "@prisma/client";
import { Check, Copy, Ban, X } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { JOB_STATUS_LABELS, JOB_STATUS_TONES } from "@/lib/leads/constants";
import { formatDateTime } from "@/lib/format";
import { cn } from "@/lib/utils";
import { JobIssues } from "@/components/app/job-issues";
import { toOperatorMessage } from "@/lib/research/failure-reasons";

export interface JobErrorRow {
  id: string;
  scope: string;
  targetUrl: string | null;
  message: string;
  retryable: boolean;
  createdAt: Date;
}

export interface JobRow {
  id: string;
  status: JobStatus;
  progress: number;
  processed: number;
  total: number | null;
  succeeded: number;
  failed: number;
  message: string | null;
  startedAt: Date | null;
  finishedAt: Date | null;
  createdAt: Date;
  campaignId: string | null;
  campaignName?: string | null;
  /** Total number of logged errors for this job. */
  errorCount: number;
  /** Only the first few errors, for the preview list (bounded fetch). */
  errors: JobErrorRow[];
}

function isActive(status: JobStatus): boolean {
  return status === JobStatus.RUNNING || status === JobStatus.QUEUED;
}

/** Progress-bar fill color keyed to job status. */
function barColor(status: JobStatus): string {
  switch (status) {
    case JobStatus.PAUSED:
    case JobStatus.PARTIAL:
      return "var(--fl-warning-fg)";
    case JobStatus.FAILED:
    case JobStatus.CANCELLED:
      return "var(--fl-danger-fg)";
    default:
      return "var(--fl-brand)"; // queued / running / succeeded
  }
}

/**
 * The bar is decorative: the same numbers are written out beside it and in the
 * live region above the list, so exposing 100 `progressbar` roles on a busy
 * jobs page would only add noise for a screen-reader user.
 */
function ProgressBar({ value, status }: { value: number; status: JobStatus }) {
  const pct = Math.min(100, Math.max(0, value));
  return (
    <span
      aria-hidden="true"
      className="block h-1.5 w-full overflow-hidden rounded-full bg-[var(--fl-bg-4)]"
    >
      <span
        className="block h-full rounded-full transition-[width] duration-500 ease-[var(--ease-decelerate)]"
        style={{ width: `${pct}%`, background: barColor(status) }}
      />
    </span>
  );
}

/** One compact metric chip with a small icon. */
function Metric({
  icon: Icon,
  label,
  value,
  tone = "muted",
}: {
  icon: typeof Check;
  label: string;
  value: number;
  tone?: "muted" | "brand" | "warning" | "danger";
}) {
  const active = value > 0;
  const color =
    tone === "brand" && active
      ? "text-[var(--fl-brand-text)]"
      : tone === "warning" && active
        ? "text-[var(--fl-warning-fg)]"
        : tone === "danger" && active
          ? "text-[var(--fl-danger-fg)]"
          : "text-[var(--fl-fg-3)]";
  return (
    <span className="inline-flex items-center gap-1.5 text-caption1 text-[var(--fl-fg-3)]">
      <Icon aria-hidden="true" className={cn("size-3.5 shrink-0", color)} />
      <span
        className={cn(
          "stat font-semibold",
          active ? "text-[var(--fl-fg-1)]" : "text-[var(--fl-fg-3)]",
        )}
      >
        {value}
      </span>
      <span>{label}</span>
    </span>
  );
}

/** One plain-language sentence describing where a job stands. */
function summarize(job: JobRow): string {
  const name = job.campaignName ? `${job.campaignName}: ` : "";
  const label = JOB_STATUS_LABELS[job.status].toLowerCase();
  const outOf = job.total !== null ? ` of ${job.total}` : "";
  const pct = job.total ? ` (${Math.round((job.processed / job.total) * 100)}%)` : "";
  return `${name}research ${label}. ${job.processed}${outOf} leads processed${pct}. ${job.succeeded} researched, ${job.failed} failed.`;
}

/**
 * Live status for the newest job.
 *
 * The jobs page polls itself while a job runs, so the numbers used to change
 * under a screen-reader user with nothing announced. Keeping one polite live
 * region that always describes the newest job means every poll that actually
 * changes something is spoken, including the transition to "completed", while
 * an unchanged poll stays silent.
 */
function JobStatusLive({ job }: { job: JobRow | undefined }) {
  if (!job) return null;
  const summary = summarize(job);
  const running = isActive(job.status);

  return (
    <div aria-live="polite" aria-atomic="true">
      {running ? (
        <p className="flex items-center gap-2 rounded-md border border-[var(--fl-info-stroke)] bg-[var(--fl-info-bg)] px-3 py-2 text-body1 text-[var(--fl-info-fg)]">
          <span
            aria-hidden="true"
            className="size-3.5 shrink-0 animate-spin rounded-full border-2 border-[var(--fl-info-stroke)] border-t-[var(--fl-info-fg)]"
          />
          {summary} Updating automatically.
        </p>
      ) : (
        <p className="sr-only">{summary}</p>
      )}
    </div>
  );
}

export function JobList({
  jobs,
  showCampaign = false,
}: {
  jobs: JobRow[];
  showCampaign?: boolean;
}) {
  // Prefer a job that is actually moving; otherwise describe the newest one.
  const tracked = jobs.find((j) => isActive(j.status)) ?? jobs[0];

  return (
    <div className="space-y-2.5">
      <JobStatusLive job={tracked} />

      <ul className="space-y-2.5">
        {jobs.map((job) => {
          const active = isActive(job.status);
          const pct = job.total ? Math.min(100, (job.processed / job.total) * 100) : job.progress;
          const showBar =
            job.status === JobStatus.SUCCEEDED || active || job.progress > 0 || !!job.total;
          const dupMatch = job.message?.match(/(\d+)\s+duplicate/i);
          const duplicates = dupMatch ? Number.parseInt(dupMatch[1]!, 10) : 0;

          return (
            <li
              key={job.id}
              className="rounded-md border border-[var(--fl-stroke-2)] bg-[var(--fl-bg-1)] p-4 shadow-2 transition-shadow duration-150 ease-[var(--ease-easy)] hover:shadow-8"
            >
              {/* Top row: status + name + processed | timestamp */}
              <div className="flex flex-wrap items-center justify-between gap-x-3 gap-y-1.5">
                <div className="flex min-w-0 flex-wrap items-center gap-2">
                  <Badge tone={JOB_STATUS_TONES[job.status]}>{JOB_STATUS_LABELS[job.status]}</Badge>
                  {showCampaign && job.campaignId ? (
                    <Link
                      href={`/campaigns/${job.campaignId}`}
                      className="truncate rounded-sm text-body1 font-semibold text-[var(--fl-fg-1)] hover:text-[var(--fl-brand-text)] hover:underline"
                    >
                      {job.campaignName ?? "Campaign"}
                    </Link>
                  ) : null}
                  <span className="stat text-caption1 text-[var(--fl-fg-3)]">
                    {job.processed}
                    {job.total !== null ? ` / ${job.total}` : ""} processed
                  </span>
                </div>
                <span className="shrink-0 text-caption1 text-[var(--fl-fg-3)]">
                  {job.finishedAt
                    ? `Finished ${formatDateTime(job.finishedAt)}`
                    : job.startedAt
                      ? `Started ${formatDateTime(job.startedAt)}`
                      : `Queued ${formatDateTime(job.createdAt)}`}
                </span>
              </div>

              {showBar ? (
                <div className="mt-3">
                  <ProgressBar
                    value={job.status === JobStatus.SUCCEEDED ? 100 : pct}
                    status={job.status}
                  />
                </div>
              ) : null}

              {/* Metric chips */}
              <div className="mt-3 flex flex-wrap items-center gap-x-4 gap-y-1.5">
                <Metric icon={Check} label="researched" value={job.succeeded} tone="brand" />
                <Metric icon={X} label="failed" value={job.failed} tone="danger" />
                <Metric icon={Ban} label="issues" value={job.errorCount} tone="warning" />
                {duplicates > 0 ? (
                  <Metric icon={Copy} label="duplicates" value={duplicates} tone="muted" />
                ) : null}
              </div>

              {/* Passed through the classifier at render time, so jobs logged
                  before this existed also read as prose rather than as a
                  serialized driver error. */}
              {job.message ? (
                <p className="mt-2 text-caption1 leading-relaxed text-[var(--fl-fg-2)]">
                  {toOperatorMessage(job.message)}
                </p>
              ) : null}

              {/* Issues, grouped into plain-language reasons rather than a
                  dump of raw provider and database messages. */}
              {job.errorCount > 0 ? (
                <JobIssues
                  failures={job.errors.map((e) => ({
                    id: e.id,
                    scope: e.scope,
                    message: e.message,
                    targetUrl: e.targetUrl,
                  }))}
                  totalCount={job.errorCount}
                />
              ) : null}
            </li>
          );
        })}
      </ul>
    </div>
  );
}

