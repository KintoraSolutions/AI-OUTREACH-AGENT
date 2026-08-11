import Link from "next/link";
import { JobStatus } from "@prisma/client";
import { AlertTriangle, Check, Copy, Ban, X, ChevronDown } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { JOB_STATUS_LABELS, JOB_STATUS_TONES } from "@/lib/leads/constants";
import { formatDateTime } from "@/lib/format";
import { cn } from "@/lib/utils";

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
  errors: JobErrorRow[];
}

const MAX_ERRORS_SHOWN = 5;

/** Progress-bar fill color keyed to job status. */
function barColor(status: JobStatus): string {
  switch (status) {
    case JobStatus.PAUSED:
    case JobStatus.PARTIAL:
      return "var(--amber)";
    case JobStatus.FAILED:
    case JobStatus.CANCELLED:
      return "var(--red)";
    default:
      return "var(--mint)"; // queued / running / succeeded
  }
}

function ProgressBar({ value, status }: { value: number; status: JobStatus }) {
  const pct = Math.min(100, Math.max(0, value));
  return (
    <span className="block h-1.5 w-full overflow-hidden rounded-full bg-[var(--surface-3)]">
      <span
        className="block h-full rounded-full"
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
  tone?: "muted" | "mint" | "amber" | "red";
}) {
  const active = value > 0;
  const color =
    tone === "mint" && active
      ? "text-[var(--mint)]"
      : tone === "amber" && active
        ? "text-[var(--amber)]"
        : tone === "red" && active
          ? "text-[var(--red)]"
          : "text-muted-foreground";
  return (
    <span className="inline-flex items-center gap-1.5 text-[12px] text-muted-foreground">
      <Icon className={cn("size-3.5 shrink-0", color)} />
      <span className={cn("tabular-nums font-medium", active ? "text-foreground" : "text-muted-foreground")}>
        {value}
      </span>
      <span>{label}</span>
    </span>
  );
}

export function JobList({
  jobs,
  showCampaign = false,
}: {
  jobs: JobRow[];
  showCampaign?: boolean;
}) {
  return (
    <ul className="space-y-2.5">
      {jobs.map((job) => {
        const active = job.status === JobStatus.RUNNING || job.status === JobStatus.QUEUED;
        const pct = job.total ? Math.min(100, (job.processed / job.total) * 100) : job.progress;
        const showBar = job.status === JobStatus.SUCCEEDED || active || job.progress > 0 || !!job.total;
        const dupMatch = job.message?.match(/(\d+)\s+duplicate/i);
        const duplicates = dupMatch ? Number.parseInt(dupMatch[1]!, 10) : 0;

        return (
          <li
            key={job.id}
            className="glass rounded-[10px] p-3.5 transition-colors hover:border-[var(--hairline-strong)]"
          >
            {/* Top row: status + name + processed | timestamp */}
            <div className="flex flex-wrap items-center justify-between gap-x-3 gap-y-1">
              <div className="flex min-w-0 flex-wrap items-center gap-2">
                <Badge tone={JOB_STATUS_TONES[job.status]}>{JOB_STATUS_LABELS[job.status]}</Badge>
                {showCampaign && job.campaignId ? (
                  <Link
                    href={`/campaigns/${job.campaignId}`}
                    className="truncate text-[14px] font-medium hover:underline"
                  >
                    {job.campaignName ?? "Campaign"}
                  </Link>
                ) : null}
                <span className="text-[12px] tabular-nums text-muted-foreground">
                  {job.processed}
                  {job.total !== null ? ` / ${job.total}` : ""} processed
                </span>
              </div>
              <span className="shrink-0 text-[12px] text-muted-foreground">
                {job.finishedAt
                  ? `Finished ${formatDateTime(job.finishedAt)}`
                  : job.startedAt
                    ? `Started ${formatDateTime(job.startedAt)}`
                    : `Queued ${formatDateTime(job.createdAt)}`}
              </span>
            </div>

            {showBar ? (
              <div className="mt-2.5">
                <ProgressBar value={job.status === JobStatus.SUCCEEDED ? 100 : pct} status={job.status} />
              </div>
            ) : null}

            {/* Metric chips */}
            <div className="mt-2.5 flex flex-wrap items-center gap-x-4 gap-y-1.5">
              <Metric icon={Check} label="researched" value={job.succeeded} tone="mint" />
              <Metric icon={X} label="failed" value={job.failed} tone="red" />
              <Metric icon={Ban} label="issues" value={job.errors.length} tone="amber" />
              {duplicates > 0 ? (
                <Metric icon={Copy} label="duplicates" value={duplicates} tone="muted" />
              ) : null}
            </div>

            {job.message ? (
              <p className="mt-2 text-[12.5px] text-muted-foreground">{job.message}</p>
            ) : null}

            {/* Error / issue alert — collapsible (collapsed by default) */}
            {job.errors.length > 0 ? (
              <details className="group mt-2.5 rounded-[8px] border border-[color-mix(in_srgb,var(--red)_35%,transparent)] bg-[var(--red-dim)]">
                <summary className="flex cursor-pointer list-none items-center gap-1.5 p-2.5 text-[12px] font-medium text-[var(--red-bright)] outline-none focus-visible:ring-2 focus-visible:ring-[var(--red)] [&::-webkit-details-marker]:hidden">
                  <AlertTriangle className="size-3.5 shrink-0" />
                  {job.errors.length} issue{job.errors.length === 1 ? "" : "s"} logged
                  <ChevronDown className="ml-auto size-3.5 shrink-0 transition-transform duration-150 group-[[open]]:rotate-180" />
                </summary>
                <div className="px-2.5 pb-2.5">
                  <ul className="space-y-0.5">
                    {job.errors.slice(0, MAX_ERRORS_SHOWN).map((e) => (
                      <li key={e.id} className="truncate text-[12px] text-[color-mix(in_srgb,var(--red-bright)_85%,white)]">
                        <span className="font-medium">[{e.scope}]</span> {e.message}
                        {e.targetUrl ? (
                          <span className="text-[var(--faint-foreground)]"> at {hostOf(e.targetUrl)}</span>
                        ) : null}
                      </li>
                    ))}
                  </ul>
                  {job.errors.length > MAX_ERRORS_SHOWN ? (
                    <p className="mt-0.5 text-[12px] text-[var(--faint-foreground)]">
                      +{job.errors.length - MAX_ERRORS_SHOWN} more
                    </p>
                  ) : null}
                </div>
              </details>
            ) : null}
          </li>
        );
      })}
    </ul>
  );
}

/** Show a bare hostname (or the raw string) for a logged error's target URL. */
function hostOf(url: string): string {
  try {
    return new URL(url).host;
  } catch {
    return url;
  }
}
