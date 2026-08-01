import { JobStatus } from "@prisma/client";
import { Activity } from "lucide-react";
import { prisma } from "@/lib/db";
import { requireOrgContext } from "@/lib/auth/rbac";
import { PageHeader } from "@/components/app/page-header";
import { EmptyState } from "@/components/app/empty-state";
import { AutoRefresh } from "@/components/app/auto-refresh";
import { JobList, type JobRow } from "@/components/app/job-list";

export const dynamic = "force-dynamic";

export default async function JobsPage() {
  const ctx = await requireOrgContext();

  const jobs = await prisma.researchJob.findMany({
    where: { orgId: ctx.orgId },
    orderBy: { createdAt: "desc" },
    take: 100,
    include: {
      errors: { orderBy: { createdAt: "desc" }, take: 50 },
      campaign: { select: { name: true } },
    },
  });

  const hasActive = jobs.some(
    (j) => j.status === JobStatus.RUNNING || j.status === JobStatus.QUEUED,
  );

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
    <div className="space-y-6">
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
        <JobList jobs={rows} showCampaign />
      )}
    </div>
  );
}
