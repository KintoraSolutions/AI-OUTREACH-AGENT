import Link from "next/link";
import {
  Users,
  Sparkles,
  Send,
  MessageSquare,
  CalendarClock,
  Star,
  Plus,
  Search,
  LayoutGrid,
  BarChart3,
  TrendingUp,
  PieChart,
} from "lucide-react";
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
import {
  BarChart,
  StackedBarChart,
  DonutChart,
  ChartLegend,
  GREEN_SHADES,
  NEUTRAL_SHADE,
} from "@/components/app/charts";

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
    <ul className="space-y-2.5">
      {rows.map((r) => (
        <li key={r.label} className="flex items-center gap-3 text-sm">
          <span className="w-40 shrink-0 truncate text-muted-foreground">{r.label}</span>
          <span className="h-2 flex-1 overflow-hidden rounded-full bg-[var(--surface-3)]">
            <span
              className="block h-full rounded-full bg-[var(--mint)]"
              style={{ width: `${(r.count / max) * 100}%` }}
            />
          </span>
          <span className="stat w-8 shrink-0 text-right text-foreground">{r.count}</span>
        </li>
      ))}
    </ul>
  );
}

export default async function DashboardPage() {
  const ctx = await requireOrgContext();
  const now = new Date();
  const where = { orgId: ctx.orgId };
  // Analytics window: the last 6 ISO weeks of lead intake.
  const weekCutoff = new Date(now.getTime() - 6 * 7 * 24 * 60 * 60 * 1000);

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
    convGroups,
    campaignsList,
    weeklyRows,
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
    // Campaign conversion: per-campaign lead counts by stage (real pipeline).
    prisma.clinic.groupBy({
      by: ["campaignId", "stage"],
      where: { orgId: ctx.orgId, campaignId: { not: null } },
      _count: { _all: true },
    }),
    prisma.searchCampaign.findMany({
      where: { orgId: ctx.orgId },
      select: { id: true, name: true },
      orderBy: { createdAt: "asc" },
      take: 8,
    }),
    // Weekly lead intake by source (real), bucketed by ISO week in Postgres.
    prisma.$queryRaw<{ week: Date; source: string; c: bigint }[]>`
      SELECT date_trunc('week', "createdAt") AS week, "leadSource"::text AS source, count(*) AS c
      FROM "Clinic"
      WHERE "orgId" = ${ctx.orgId} AND "createdAt" >= ${weekCutoff}
      GROUP BY 1, 2
      ORDER BY 1
    `,
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

  // --- Analytics strip (all real, org-scoped) ---------------------------------
  // Campaign conversion = share of a campaign's leads that reached a response stage.
  const responseStageSet = new Set<PipelineStage>(RESPONSE_STAGES);
  const perCampaign = new Map<string, { total: number; responded: number }>();
  for (const g of convGroups) {
    if (!g.campaignId) continue;
    const cur = perCampaign.get(g.campaignId) ?? { total: 0, responded: 0 };
    cur.total += g._count._all;
    if (responseStageSet.has(g.stage)) cur.responded += g._count._all;
    perCampaign.set(g.campaignId, cur);
  }
  const campaignConv = campaignsList.map((c) => {
    const agg = perCampaign.get(c.id);
    const value = agg && agg.total > 0 ? Math.round((agg.responded / agg.total) * 100) : 0;
    return { label: c.name, value };
  });

  // Weekly lead intake by source (Research / CSV / Manual).
  const weekMap = new Map<string, [number, number, number]>();
  for (const r of weeklyRows) {
    const key = new Date(r.week).toISOString().slice(0, 10);
    const cur = weekMap.get(key) ?? [0, 0, 0];
    const n = Number(r.c);
    if (r.source === "RESEARCH") cur[0] += n;
    else if (r.source === "CSV_IMPORT") cur[1] += n;
    else cur[2] += n;
    weekMap.set(key, cur);
  }
  const weekly = [...weekMap.entries()]
    .sort(([a], [b]) => (a < b ? -1 : 1))
    .map(([k, values]) => ({
      period: new Date(k).toLocaleDateString(undefined, { month: "short", day: "numeric" }),
      values,
    }));
  const sourceSeries = [
    { label: "Research", color: GREEN_SHADES[0] },
    { label: "CSV import", color: GREEN_SHADES[1] },
    { label: "Manual", color: GREEN_SHADES[2] },
  ];

  // Lead distribution by stage (top 4 stages + Other) for the donut.
  const stageTop = stageRows.filter((r) => r.count > 0).slice(0, 4);
  const stageRest = stageRows.slice(4).reduce((a, r) => a + r.count, 0);
  const stageDist: { label: string; value: number; color: string }[] = stageTop.map((r, i) => ({
    label: r.label,
    value: r.count,
    color: GREEN_SHADES[i] ?? NEUTRAL_SHADE,
  }));
  if (stageRest > 0) stageDist.push({ label: "Other", value: stageRest, color: NEUTRAL_SHADE });

  return (
    <div className="space-y-6">
      <PageHeader
        title="Dashboard"
        description={`Pipeline overview for ${ctx.orgName}.`}
        actions={
          <Button asChild>
            <Link href="/leads/new">
              <Plus />
              New lead
            </Link>
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
          <div className="grid gap-3 sm:grid-cols-2">
            <MetricTile label="Total leads" value={total} icon={Users} accent />
            <MetricTile
              label="New leads"
              value={newLeads}
              icon={Sparkles}
              hint="Stage: Discovered"
              accent
            />
            <MetricTile
              label="High priority"
              value={highPriority}
              icon={Star}
              hint={`Score ≥ ${HIGH_PRIORITY_THRESHOLD}`}
            />
            <MetricTile label="Needs review" value={needsReview} icon={Search} hint="Stage: Needs review" />
            <MetricTile
              label="Drafts awaiting review"
              value={draftsAwaitingReview}
              icon={LayoutGrid}
              hint="Generated or edited"
              accent
            />
            <MetricTile label="Contacted" value={contacted} icon={Send} />
            <MetricTile label="Responses" value={responses} icon={MessageSquare} />
            <MetricTile label="Follow-ups due" value={followUpsDue} icon={CalendarClock} />
          </div>

          <section aria-label="Analytics" className="grid gap-3 lg:grid-cols-3">
            <Card className="rounded-[7px] lg:col-span-2">
              <div className="flex items-center justify-between px-4 pb-1 pt-4">
                <h3 className="text-[13px] font-semibold tracking-[-0.01em]">
                  Campaign Conversion over Time
                </h3>
                <BarChart3 className="size-4 shrink-0 text-[var(--faint-foreground)]" strokeWidth={1.75} />
              </div>
              <div className="px-3 pb-3">
                <BarChart data={campaignConv} emptyLabel="No campaigns to compare yet." />
              </div>
            </Card>

            <div className="flex flex-col gap-3">
              <Card className="rounded-[7px]">
                <div className="flex items-center justify-between px-4 pb-1 pt-4">
                  <h3 className="text-[13px] font-semibold leading-tight tracking-[-0.01em]">
                    Weekly Lead Intake
                  </h3>
                  <TrendingUp className="size-4 shrink-0 text-[var(--faint-foreground)]" strokeWidth={1.75} />
                </div>
                <div className="space-y-2 px-3 pb-3">
                  <StackedBarChart data={weekly} series={sourceSeries} />
                  <div className="px-1">
                    <ChartLegend items={sourceSeries} />
                  </div>
                </div>
              </Card>

              <Card className="rounded-[7px]">
                <div className="flex items-center justify-between px-4 pb-1 pt-4">
                  <h3 className="text-[13px] font-semibold leading-tight tracking-[-0.01em]">
                    Lead Distribution by Stage
                  </h3>
                  <PieChart className="size-4 shrink-0 text-[var(--faint-foreground)]" strokeWidth={1.75} />
                </div>
                <div className="flex items-center gap-3 px-4 pb-4 pt-1">
                  <DonutChart data={stageDist} />
                  <ChartLegend items={stageDist} vertical showValues />
                </div>
              </Card>
            </div>
          </section>

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
                          <span className="rounded-[5px] border border-[color-mix(in_srgb,var(--red)_35%,transparent)] bg-[var(--red-dim)] px-1.5 py-0.5 font-mono text-[10.5px] uppercase tracking-[0.08em] text-[var(--red-bright)]">
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
