import Link from "next/link";
import { Users, Sparkles, Send, MessageSquare, CalendarClock, FileCheck2, Star } from "lucide-react";
import { DraftStatus, PipelineStage, RecommendedService } from "@prisma/client";
import { prisma } from "@/lib/db";
import { requireOrgContext } from "@/lib/auth/rbac";
import { STAGE_LABELS, SERVICE_LABELS } from "@/lib/leads/constants";
import { buildEffectiveScoreWhere } from "@/lib/leads/score-filter";
import { PageHeader } from "@/components/app/page-header";
import { MetricTile } from "@/components/app/metric-tile";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { EmptyState } from "@/components/app/empty-state";
import { Button } from "@/components/ui/button";

const CONTACTED_STAGES = [PipelineStage.CONTACTED, PipelineStage.REPLIED, PipelineStage.MEETING_BOOKED];
const RESPONSE_STAGES = [PipelineStage.REPLIED, PipelineStage.MEETING_BOOKED];
// A lead is "high priority" when its effective overall score (honoring a manual
// override) is at or above this threshold. Documented so the tile is explainable.
const HIGH_PRIORITY_THRESHOLD = 70;
// Draft statuses that still need a human decision before outreach.
const REVIEW_DRAFT_STATUSES = [DraftStatus.GENERATED, DraftStatus.EDITED];
// Effective-score histogram buckets (inclusive ranges over 0-100).
const SCORE_BUCKETS: { label: string; min: number; max: number }[] = [
  { label: "0-19", min: 0, max: 19 },
  { label: "20-39", min: 20, max: 39 },
  { label: "40-59", min: 40, max: 59 },
  { label: "60-79", min: 60, max: 79 },
  { label: "80-100", min: 80, max: 100 },
];
const SERVICE_ORDER: RecommendedService[] = [
  RecommendedService.WEBSITE,
  RecommendedService.SOFTWARE,
  RecommendedService.KLEARQ,
  RecommendedService.COMBINED,
  RecommendedService.NONE,
];

function BreakdownList({
  rows,
  emptyLabel = "No data.",
}: {
  rows: { label: string; count: number }[];
  emptyLabel?: string;
}) {
  const nonZero = rows.filter((r) => r.count > 0);
  if (nonZero.length === 0) {
    return <p className="text-sm text-muted-foreground">{emptyLabel}</p>;
  }
  const max = Math.max(1, ...rows.map((r) => r.count));
  return (
    <ul className="space-y-2">
      {rows.map((r) => (
        <li key={r.label} className="flex items-center gap-3 text-sm">
          <span className="w-40 shrink-0 truncate text-muted-foreground">{r.label}</span>
          <span className="h-2 flex-1 overflow-hidden rounded-full bg-muted">
            <span
              className="block h-full rounded-full bg-primary/70"
              style={{ width: `${(r.count / max) * 100}%` }}
            />
          </span>
          <span className="w-8 shrink-0 text-right tabular-nums">{r.count}</span>
        </li>
      ))}
    </ul>
  );
}

export default async function DashboardPage() {
  const ctx = await requireOrgContext();
  const now = new Date();
  const where = { orgId: ctx.orgId };

  // Score-bucket and service-mix counts use EFFECTIVE values (an active manual
  // override wins over the computed score/service), matching the lead table.
  const bucketWhere = SCORE_BUCKETS.map((b) => ({
    orgId: ctx.orgId,
    scores: { some: buildEffectiveScoreWhere({ minScore: b.min, maxScore: b.max })! },
  }));
  const serviceWhere = SERVICE_ORDER.map((s) => ({
    orgId: ctx.orgId,
    scores: { some: buildEffectiveScoreWhere({ service: s })! },
  }));

  const [
    total,
    newLeads,
    highPriority,
    needsReview,
    draftsAwaitingReview,
    contacted,
    responses,
    followUpsDue,
    scoredCount,
    followUpReminders,
    byCategory,
    byStage,
    bucketCounts,
    serviceCounts,
  ] = await Promise.all([
    prisma.clinic.count({ where }),
    prisma.clinic.count({ where: { ...where, stage: PipelineStage.DISCOVERED } }),
    prisma.clinic.count({
      where: { ...where, scores: { some: buildEffectiveScoreWhere({ minScore: HIGH_PRIORITY_THRESHOLD })! } },
    }),
    prisma.clinic.count({ where: { ...where, stage: PipelineStage.NEEDS_REVIEW } }),
    prisma.emailDraft.count({
      where: { clinic: { orgId: ctx.orgId }, status: { in: REVIEW_DRAFT_STATUSES } },
    }),
    prisma.clinic.count({ where: { ...where, stage: { in: CONTACTED_STAGES } } }),
    prisma.clinic.count({ where: { ...where, stage: { in: RESPONSE_STAGES } } }),
    prisma.followUpTask.count({
      where: { orgId: ctx.orgId, status: "PENDING", dueDate: { lte: now } },
    }),
    prisma.clinic.count({ where: { ...where, scores: { some: {} } } }),
    prisma.followUpTask.findMany({
      where: { orgId: ctx.orgId, status: "PENDING" },
      orderBy: { dueDate: "asc" },
      take: 8,
      include: {
        clinic: { select: { id: true, name: true } },
        assignee: { select: { name: true, email: true } },
      },
    }),
    prisma.clinic.groupBy({ by: ["category"], where, _count: { _all: true } }),
    prisma.clinic.groupBy({ by: ["stage"], where, _count: { _all: true } }),
    Promise.all(bucketWhere.map((w) => prisma.clinic.count({ where: w }))),
    Promise.all(serviceWhere.map((w) => prisma.clinic.count({ where: w }))),
  ]);

  const reminderRows = followUpReminders.map((f) => ({
    id: f.id,
    clinicId: f.clinic.id,
    clinicName: f.clinic.name,
    title: f.title,
    dueDate: f.dueDate,
    priority: f.priority,
    assignee: f.assignee?.name ?? f.assignee?.email ?? "Unassigned",
    overdue: f.dueDate < now,
  }));

  const categoryRows = byCategory
    .map((r) => ({ label: r.category ?? "Uncategorized", count: r._count._all }))
    .sort((a, b) => b.count - a.count)
    .slice(0, 8);

  const stageRows = byStage
    .map((r) => ({ label: STAGE_LABELS[r.stage], count: r._count._all }))
    .sort((a, b) => b.count - a.count);

  const scoreRows = SCORE_BUCKETS.map((b, i) => ({ label: b.label, count: bucketCounts[i] ?? 0 }));
  const serviceRows = SERVICE_ORDER.map((s, i) => ({ label: SERVICE_LABELS[s], count: serviceCounts[i] ?? 0 }));

  return (
    <div className="space-y-6">
      <PageHeader
        title="Dashboard"
        description={`Pipeline overview for ${ctx.orgName}.`}
        actions={
          <Button asChild size="sm">
            <Link href="/leads/new">New lead</Link>
          </Button>
        }
      />

      {total === 0 ? (
        <EmptyState
          icon={Users}
          title="Your pipeline is empty"
          description="Add clinics manually or import a CSV, or run a research campaign to discover and score clinics automatically."
          action={
            <div className="flex gap-2">
              <Button asChild size="sm">
                <Link href="/leads/new">New lead</Link>
              </Button>
              <Button asChild size="sm" variant="outline">
                <Link href="/leads/import">Import CSV</Link>
              </Button>
            </div>
          }
        />
      ) : (
        <>
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
            <MetricTile label="Total leads" value={total} icon={Users} />
            <MetricTile label="New leads" value={newLeads} icon={Sparkles} hint="Stage: Discovered" />
            <MetricTile
              label="High priority"
              value={highPriority}
              icon={Star}
              hint={`Score ≥ ${HIGH_PRIORITY_THRESHOLD}`}
            />
            <MetricTile label="Needs review" value={needsReview} icon={FileCheck2} hint="Stage: Needs review" />
            <MetricTile
              label="Drafts awaiting review"
              value={draftsAwaitingReview}
              icon={FileCheck2}
              hint="Generated or edited"
            />
            <MetricTile label="Contacted" value={contacted} icon={Send} />
            <MetricTile label="Responses" value={responses} icon={MessageSquare} />
            <MetricTile label="Follow-ups due" value={followUpsDue} icon={CalendarClock} />
          </div>

          <div className="grid gap-6 lg:grid-cols-2">
            <Card>
              <CardHeader>
                <CardTitle>Leads by category</CardTitle>
              </CardHeader>
              <CardContent>
                <BreakdownList rows={categoryRows} />
              </CardContent>
            </Card>
            <Card>
              <CardHeader>
                <CardTitle>Leads by stage</CardTitle>
              </CardHeader>
              <CardContent>
                <BreakdownList rows={stageRows} />
              </CardContent>
            </Card>
          </div>

          <div className="grid gap-6 lg:grid-cols-2">
            <Card>
              <CardHeader>
                <CardTitle>Recommended service mix</CardTitle>
              </CardHeader>
              <CardContent>
                {scoredCount > 0 ? (
                  <BreakdownList rows={serviceRows} />
                ) : (
                  <p className="text-sm text-muted-foreground">
                    No leads scored yet. Run a research campaign or score leads to populate this.
                  </p>
                )}
              </CardContent>
            </Card>
            <Card>
              <CardHeader>
                <CardTitle>Lead-score distribution</CardTitle>
              </CardHeader>
              <CardContent>
                {scoredCount > 0 ? (
                  <BreakdownList rows={scoreRows} />
                ) : (
                  <p className="text-sm text-muted-foreground">
                    No leads scored yet. Scores appear here once the research engine or a manual audit runs.
                  </p>
                )}
              </CardContent>
            </Card>
          </div>

          <Card>
            <CardHeader>
              <CardTitle>Follow-up reminders</CardTitle>
            </CardHeader>
            <CardContent>
              {reminderRows.length > 0 ? (
                <ul className="divide-y">
                  {reminderRows.map((r) => (
                    <li key={r.id} className="flex flex-wrap items-center justify-between gap-2 py-2 text-sm">
                      <span className="flex items-center gap-2">
                        <CalendarClock className="h-4 w-4 text-muted-foreground" />
                        <Link href={`/leads/${r.clinicId}`} className="font-medium text-primary hover:underline">
                          {r.clinicName}
                        </Link>
                        {r.title ? <span className="text-muted-foreground">— {r.title}</span> : null}
                        {r.overdue ? (
                          <span className="rounded bg-red-100 px-1.5 py-0.5 text-xs text-red-800 dark:bg-red-950 dark:text-red-300">
                            Overdue
                          </span>
                        ) : null}
                      </span>
                      <span className="text-xs text-muted-foreground">
                        {r.priority.toLowerCase()} · {r.assignee} ·{" "}
                        {r.dueDate.toLocaleDateString(undefined, { month: "short", day: "numeric" })}
                      </span>
                    </li>
                  ))}
                </ul>
              ) : (
                <p className="text-sm text-muted-foreground">No pending follow-ups.</p>
              )}
            </CardContent>
          </Card>
        </>
      )}
    </div>
  );
}
