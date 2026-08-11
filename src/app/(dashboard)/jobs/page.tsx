import * as React from "react";
import { JobStatus } from "@prisma/client";
import { Activity } from "lucide-react";
import { prisma } from "@/lib/db";
import { requireOrgContext } from "@/lib/auth/rbac";
import { PageHeader } from "@/components/app/page-header";
import { EmptyState } from "@/components/app/empty-state";
import { AutoRefresh } from "@/components/app/auto-refresh";
import { JobList, type JobRow } from "@/components/app/job-list";
import { Sparkline, Gauge, MiniBars } from "@/components/app/charts";

export const dynamic = "force-dynamic";

/** Monday 00:00 (local) of the week containing `d`. */
function startOfWeek(d: Date): Date {
  const x = new Date(d);
  x.setHours(0, 0, 0, 0);
  const day = (x.getDay() + 6) % 7;
  x.setDate(x.getDate() - day);
  return x;
}

function KpiCard({
  label,
  value,
  viz,
}: {
  label: string;
  value: string | number;
  viz: React.ReactNode;
}) {
  return (
    <div className="glass rounded-[8px] p-4">
      <p className="text-[12px] text-muted-foreground">{label}</p>
      <div className="mt-1.5 flex items-end justify-between gap-3">
        <span className="text-[30px] font-semibold leading-none tabular-nums text-foreground">
          {value}
        </span>
        <div className="shrink-0">{viz}</div>
      </div>
    </div>
  );
}

export default async function JobsPage() {
  const ctx = await requireOrgContext();

  const [jobs, totalJobs, totals] = await Promise.all([
    prisma.researchJob.findMany({
      where: { orgId: ctx.orgId },
      orderBy: { createdAt: "desc" },
      take: 100,
      include: {
        errors: { orderBy: { createdAt: "desc" }, take: 50 },
        campaign: { select: { name: true } },
      },
    }),
    prisma.researchJob.count({ where: { orgId: ctx.orgId } }),
    prisma.researchJob.aggregate({
      where: { orgId: ctx.orgId },
      _sum: { processed: true, succeeded: true, failed: true },
    }),
  ]);

  const hasActive = jobs.some(
    (j) => j.status === JobStatus.RUNNING || j.status === JobStatus.QUEUED,
  );

  // ---- KPIs (real, org-scoped) ----------------------------------------------
  const totalProcessed = totals._sum.processed ?? 0;
  const totalSucceeded = totals._sum.succeeded ?? 0;
  const successRate = totalProcessed > 0 ? Math.round((totalSucceeded / totalProcessed) * 100) : 100;

  // Total Jobs sparkline: cumulative jobs created per week over the last 8 weeks.
  const WEEKS = 8;
  const windowStart = startOfWeek(new Date());
  windowStart.setDate(windowStart.getDate() - 7 * (WEEKS - 1));
  const weekStarts: number[] = [];
  for (let i = 0; i < WEEKS; i++) {
    const w = new Date(windowStart);
    w.setDate(w.getDate() + 7 * i);
    weekStarts.push(w.getTime());
  }
  const weekly = new Array(WEEKS).fill(0) as number[];
  for (const j of jobs) {
    const idx = weekStarts.indexOf(startOfWeek(new Date(j.createdAt)).getTime());
    if (idx >= 0) weekly[idx] = (weekly[idx] ?? 0) + 1;
  }
  let run = 0;
  const jobSeries = weekly.map((n) => (run += n));

  // Entries-processed mini bars: processed count for the last 6 jobs (oldest→newest).
  const processedBars = jobs
    .slice(0, 6)
    .reverse()
    .map((j) => j.processed);

  const rows: JobRow[] = jobs.map((j) => ({
    id: j.id,
    status: j.status,
    progress: j.progress,
    processed: j.processed,
    total: j.total,
    succeeded: j.succeeded,
    failed: j.failed,
    message: j.message,
    startedAt: j.startedAt,
    finishedAt: j.finishedAt,
    createdAt: j.createdAt,
    campaignId: j.campaignId,
    campaignName: j.campaign?.name ?? null,
    errors: j.errors,
  }));

  return (
    <div className="space-y-4">
      <AutoRefresh active={hasActive} />
      <PageHeader
        title="Research jobs"
        description="Progress and errors for every research run in this organization."
      />

      {rows.length === 0 ? (
        <EmptyState
          icon={Activity}
          title="No research jobs yet"
          description="When you run a campaign, its research job appears here with live progress and any errors."
        />
      ) : (
        <>
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
            <KpiCard
              label="Total Jobs"
              value={totalJobs}
              viz={<Sparkline points={jobSeries} width={120} height={40} className="h-10 w-[120px]" />}
            />
            <KpiCard
              label="Global Success Rate"
              value={`${successRate}%`}
              viz={<Gauge value={successRate} size={48} />}
            />
            <KpiCard
              label="Total Entries Processed"
              value={totalProcessed}
              viz={<MiniBars values={processedBars} />}
            />
          </div>

          <JobList jobs={rows} showCampaign />
        </>
      )}
    </div>
  );
}
