import Link from "next/link";
import { JobStatus } from "@prisma/client";
import { AlertTriangle } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { JOB_STATUS_LABELS, JOB_STATUS_TONES } from "@/lib/leads/constants";
import { formatDateTime } from "@/lib/format";

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

function ProgressBar({ value }: { value: number }) {
  const pct = Math.min(100, Math.max(0, value));
  return (
    <span className="block h-2 w-full overflow-hidden rounded-full bg-muted">
      <span className="block h-full rounded-full bg-primary/70" style={{ width: `${pct}%` }} />
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
    <ul className="space-y-3">
      {jobs.map((job) => {
        const active = job.status === JobStatus.RUNNING || job.status === JobStatus.QUEUED;
        return (
          <li key={job.id} className="rounded-lg border p-4">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <div className="flex items-center gap-2">
                <Badge tone={JOB_STATUS_TONES[job.status]}>{JOB_STATUS_LABELS[job.status]}</Badge>
                {showCampaign && job.campaignId ? (
                  <Link href={`/campaigns/${job.campaignId}`} className="text-sm font-medium hover:underline">
                    {job.campaignName ?? "Campaign"}
                  </Link>
                ) : null}
                <span className="text-xs text-muted-foreground">
                  {job.processed}
                  {job.total !== null ? ` / ${job.total}` : ""} processed
                </span>
              </div>
              <span className="text-xs text-muted-foreground">
                {job.finishedAt
                  ? `Finished ${formatDateTime(job.finishedAt)}`
                  : job.startedAt
                    ? `Started ${formatDateTime(job.startedAt)}`
                    : `Queued ${formatDateTime(job.createdAt)}`}
              </span>
            </div>

            {(active || job.progress > 0) && job.total ? (
              <div className="mt-3">
                <ProgressBar value={job.progress} />
              </div>
            ) : null}

            {job.message ? (
              <p className="mt-2 text-sm text-muted-foreground">{job.message}</p>
            ) : null}

            <div className="mt-2 flex flex-wrap gap-x-4 gap-y-1 text-xs text-muted-foreground">
              <span>{job.succeeded} researched</span>
              <span>{job.failed} failed</span>
            </div>

            {job.errors.length > 0 ? (
              <div className="mt-3 space-y-1 rounded-md border border-amber-200 bg-amber-50 p-3 dark:border-amber-900 dark:bg-amber-950/40">
                <p className="flex items-center gap-1.5 text-xs font-medium text-amber-800 dark:text-amber-300">
                  <AlertTriangle className="size-3.5" />
                  {job.errors.length} issue{job.errors.length === 1 ? "" : "s"} logged
                </p>
                <ul className="space-y-0.5">
                  {job.errors.slice(0, MAX_ERRORS_SHOWN).map((e) => (
                    <li key={e.id} className="truncate text-xs text-amber-900/90 dark:text-amber-200/90">
                      <span className="font-medium">[{e.scope}]</span> {e.message}
                    </li>
                  ))}
                </ul>
                {job.errors.length > MAX_ERRORS_SHOWN ? (
                  <p className="text-xs text-amber-800/80 dark:text-amber-300/80">
                    +{job.errors.length - MAX_ERRORS_SHOWN} more
                  </p>
                ) : null}
              </div>
            ) : null}
          </li>
        );
      })}
    </ul>
  );
}
