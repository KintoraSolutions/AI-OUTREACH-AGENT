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
  FileText,
  BarChart3,
  TrendingUp,
  PieChart,
  Tags,
  Target,
  Gauge as GaugeIcon,
  AlertCircle,
  Compass,
  Clock,
} from "lucide-react";
import { DraftStatus, PipelineStage, Prisma, RecommendedService } from "@prisma/client";
import { prisma } from "@/lib/db";
import { requireOrgContext } from "@/lib/auth/rbac";
import { loadChecklistState } from "@/lib/onboarding/checklist";
import { STAGE_LABELS, SERVICE_LABELS } from "@/lib/leads/constants";
import { PageHeader } from "@/components/app/page-header";
import { MetricTile } from "@/components/app/metric-tile";
import { GettingStarted } from "@/components/app/getting-started";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { EmptyState } from "@/components/app/empty-state";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { BarChart, StackedBarChart, DonutChart, ChartLegend } from "@/components/app/charts";

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

/**
 * Chart palette.
 *
 * `charts.tsx` ships a fixed set of green hex values that do not theme-switch,
 * so every series here passes its own color instead. One brand hue stepped down
 * toward a neutral fill is the right treatment for ordered categories (pipeline
 * stage, lead source): it reads as a single scale rather than as five unrelated
 * things, and because every step is expressed in `--fl-*` tokens it re-derives
 * itself in dark mode. Category is never the only signal — every chart here is
 * paired with a labelled legend carrying the values.
 */
const SERIES_COLORS = [
  "var(--fl-brand-text)",
  "color-mix(in srgb, var(--fl-brand-text) 70%, var(--fl-bg-4))",
  "color-mix(in srgb, var(--fl-brand-text) 45%, var(--fl-bg-4))",
  "color-mix(in srgb, var(--fl-brand-text) 25%, var(--fl-bg-4))",
] as const;
const OTHER_COLOR = "var(--fl-fg-4)";

/** Horizontal bar list for a labelled count breakdown. */
function BreakdownList({ rows }: { rows: { label: string; count: number }[] }) {
  const max = Math.max(1, ...rows.map((r) => r.count));
  return (
    <ul className="space-y-2.5">
      {rows.map((r) => (
        <li
          key={r.label}
          className="grid grid-cols-[minmax(0,7.5rem)_1fr_2rem] items-center gap-3 text-body1"
        >
          <span className="truncate text-[var(--fl-fg-2)]">{r.label}</span>
          {/* The bar restates the number beside it, so it is decoration. */}
          <span
            aria-hidden="true"
            className="h-2 overflow-hidden rounded-sm bg-[var(--fl-bg-4)]"
          >
            <span
              className="block h-full rounded-sm bg-[var(--fl-brand)]"
              style={{ width: `${(r.count / max) * 100}%` }}
            />
          </span>
          <span className="stat text-right font-semibold text-[var(--fl-fg-1)]">{r.count}</span>
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

  // Score-bucket, service-mix, high-priority, and scored counts all use EFFECTIVE
  // values (an active manual override wins over the computed score/service),
  // matching the lead table. These are computed in ONE grouped query over
  // Clinic⋈LeadScore below (scoreAggSql) instead of 12 correlated COUNT
  // subqueries. LeadScore is 1:1 with Clinic (@@unique clinicId), so the INNER
  // JOIN cannot fan out, and the CASE expressions mirror effectiveOverallOf /
  // effectiveServiceOf exactly (override wins only when active AND set).
  const bucketCols = SCORE_BUCKETS.map(
    (b, i) =>
      Prisma.sql`count(*) FILTER (WHERE eff_overall BETWEEN ${b.min} AND ${b.max}) AS ${Prisma.raw(`bucket_${i}`)}`,
  );
  const serviceCols = SERVICE_ORDER.map(
    (s, i) => Prisma.sql`count(*) FILTER (WHERE eff_service = ${s}) AS ${Prisma.raw(`svc_${i}`)}`,
  );
  const scoreAggSql = Prisma.sql`
    SELECT
      count(*) AS scored,
      count(*) FILTER (WHERE eff_overall >= ${HIGH_PRIORITY_THRESHOLD}) AS high_priority,
      ${Prisma.join(bucketCols, ", ")},
      ${Prisma.join(serviceCols, ", ")}
    FROM (
      SELECT
        (CASE WHEN s."manualOverride" AND s."overrideOverall" IS NOT NULL
              THEN s."overrideOverall" ELSE s."overallScore" END) AS eff_overall,
        (CASE WHEN s."manualOverride" AND s."overrideService" IS NOT NULL
              THEN s."overrideService" ELSE s."recommendedService" END)::text AS eff_service
      FROM "Clinic" c
      JOIN "LeadScore" s ON s."clinicId" = c.id
      WHERE c."orgId" = ${ctx.orgId}
    ) t
  `;

  const [
    total,
    newLeads,
    needsReview,
    draftsAwaitingReview,
    contacted,
    responses,
    followUpsDue,
    followUpReminders,
    byCategory,
    byStage,
    convGroups,
    campaignsList,
    weeklyRows,
    scoreAggRows,
    // The setup checklist joins this batch rather than loading inside
    // <GettingStarted/>, which would put its seven counts in a second
    // round-trip serialized after everything above.
    checklist,
  ] = await Promise.all([
    prisma.clinic.count({ where }),
    prisma.clinic.count({ where: { ...where, stage: PipelineStage.DISCOVERED } }),
    prisma.clinic.count({ where: { ...where, stage: PipelineStage.NEEDS_REVIEW } }),
    prisma.emailDraft.count({
      where: { clinic: { orgId: ctx.orgId }, status: { in: REVIEW_DRAFT_STATUSES } },
    }),
    prisma.clinic.count({ where: { ...where, stage: { in: CONTACTED_STAGES } } }),
    prisma.clinic.count({ where: { ...where, stage: { in: RESPONSE_STAGES } } }),
    prisma.followUpTask.count({
      where: { orgId: ctx.orgId, status: "PENDING", dueDate: { lte: now } },
    }),
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
    prisma.$queryRaw<Array<Record<string, bigint>>>(scoreAggSql),
    loadChecklistState(ctx.orgId),
  ]);

  // Derive the four score aggregates from the single grouped query. Column order
  // matches SCORE_BUCKETS / SERVICE_ORDER; Postgres count() returns bigint.
  const aggRow = scoreAggRows[0];
  const highPriority = Number(aggRow?.high_priority ?? 0);
  const scoredCount = Number(aggRow?.scored ?? 0);
  const bucketCounts = SCORE_BUCKETS.map((_b, i) => Number(aggRow?.[`bucket_${i}`] ?? 0));
  const serviceCounts = SERVICE_ORDER.map((_s, i) => Number(aggRow?.[`svc_${i}`] ?? 0));

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
  const serviceRows = SERVICE_ORDER.map((s, i) => ({
    label: SERVICE_LABELS[s],
    count: serviceCounts[i] ?? 0,
  }));

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
    { label: "Research", color: SERIES_COLORS[0] },
    { label: "CSV import", color: SERIES_COLORS[1] },
    { label: "Manual", color: SERIES_COLORS[2] },
  ];
  const hasWeekly = weekly.some((w) => w.values.some((v) => v > 0));

  // Lead distribution by stage (top 4 stages + Other) for the donut. This is now
  // the ONLY stage visualization on the page: it previously rendered twice, once
  // as this donut and again as a "Leads by stage" bar list directly below it.
  const stageTop = stageRows.filter((r) => r.count > 0).slice(0, 4);
  const stageRest = stageRows.slice(4).reduce((a, r) => a + r.count, 0);
  const stageDist: { label: string; value: number; color: string }[] = stageTop.map((r, i) => ({
    label: r.label,
    value: r.count,
    color: SERIES_COLORS[i] ?? OTHER_COLOR,
  }));
  if (stageRest > 0) stageDist.push({ label: "Other", value: stageRest, color: OTHER_COLOR });

  const updatedLabel = now.toLocaleTimeString(undefined, { hour: "numeric", minute: "2-digit" });

  return (
    <div className="space-y-5">
      <PageHeader
        title="Dashboard"
        description={`Pipeline overview for ${ctx.orgName}.`}
        actions={
          <>
            <Button asChild variant="outline">
              <Link href="/tutorial">
                <Compass aria-hidden="true" />
                Guided tour
              </Link>
            </Button>
            <Button asChild>
              <Link href="/leads/new">
                <Plus aria-hidden="true" />
                New lead
              </Link>
            </Button>
          </>
        }
      />

      {/* What to do next comes before how things are going: a brand-new org has
          no pipeline to report on, and even a busy one benefits from the next
          unfinished setup step sitting above the numbers. */}
      <GettingStarted state={checklist} />

      {total === 0 ? (
        <EmptyState
          icon={Users}
          title="Your pipeline is empty"
          description="Add clinics manually or import a CSV, then run a research campaign to score them. Manually added leads have no findings and no score until a campaign researches them."
          action={
            <div className="flex flex-wrap justify-center gap-2">
              <Button asChild size="sm">
                <Link href="/leads/new">New lead</Link>
              </Button>
              <Button asChild size="sm" variant="outline">
                <Link href="/leads/import">Import CSV</Link>
              </Button>
              <Button asChild size="sm" variant="outline">
                <Link href="/campaigns/new">Create a campaign</Link>
              </Button>
            </div>
          }
        />
      ) : (
        <>
          <section aria-labelledby="kpi-heading" className="space-y-3">
            <div className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1">
              <h2 id="kpi-heading" className="text-subtitle2 font-semibold text-[var(--fl-fg-1)]">
                Pipeline at a glance
              </h2>
              <p className="flex items-center gap-1.5 text-caption1 text-[var(--fl-fg-3)]">
                <Clock aria-hidden="true" className="size-3.5" strokeWidth={1.75} />
                Last updated{" "}
                <time dateTime={now.toISOString()} className="stat">
                  {updatedLabel}
                </time>
              </p>
            </div>

            {/* Four leading numbers, four-up on a wide screen. The other four are
                secondary and get a dense strip rather than equal billing. */}
            <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
              <MetricTile label="Total leads" value={total} icon={Users} href="/leads" accent />
              <MetricTile
                label="High priority"
                value={highPriority}
                icon={Star}
                hint={`Score ${HIGH_PRIORITY_THRESHOLD} or higher`}
                href={`/leads?minScore=${HIGH_PRIORITY_THRESHOLD}`}
                accent
              />
              <MetricTile
                label="Drafts awaiting review"
                value={draftsAwaitingReview}
                icon={FileText}
                hint="Nothing sends on its own"
                href="/review"
                accent
              />
              <MetricTile
                label="Follow-ups due"
                value={followUpsDue}
                icon={CalendarClock}
                hint="See the list below"
                href="#follow-ups"
              />
            </div>

            {/* The secondary strip goes four-up only at xl. A compact tile packs
                its icon, label, value and chevron onto one row, and at the lg
                breakpoint exactly (1024px) that leaves ~173px, which clipped
                "New leads" and "Needs review". Two-up holds them intact. */}
            <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
              <MetricTile
                label="New leads"
                value={newLeads}
                icon={Sparkles}
                hint="Discovered"
                href={`/leads?stage=${PipelineStage.DISCOVERED}`}
                compact
              />
              <MetricTile
                label="Needs review"
                value={needsReview}
                icon={Search}
                hint="Needs review"
                href={`/leads?stage=${PipelineStage.NEEDS_REVIEW}`}
                compact
              />
              <MetricTile label="Contacted" value={contacted} icon={Send} compact />
              <MetricTile label="Responses" value={responses} icon={MessageSquare} compact />
            </div>
          </section>

          <section aria-labelledby="analytics-heading" className="space-y-3">
            <h2 id="analytics-heading" className="sr-only">
              Analytics
            </h2>
            <div className="grid gap-3 lg:grid-cols-3">
              <Card className="lg:col-span-2">
                <CardHeader className="flex-row items-start justify-between gap-3">
                  <div className="space-y-1">
                    <CardTitle>Campaign conversion</CardTitle>
                    <CardDescription>
                      Share of each campaign&apos;s leads that replied or booked a meeting.
                    </CardDescription>
                  </div>
                  <BarChart3
                    aria-hidden="true"
                    className="size-4 shrink-0 text-[var(--fl-fg-3)]"
                    strokeWidth={1.75}
                  />
                </CardHeader>
                <CardContent>
                  {campaignConv.length > 0 ? (
                    <BarChart data={campaignConv} />
                  ) : (
                    <EmptyState
                      size="sm"
                      icon={Target}
                      title="No campaigns yet"
                      description="A research campaign is the only way to research and score a clinic."
                      action={
                        <Button asChild size="sm">
                          <Link href="/campaigns/new">Create a campaign</Link>
                        </Button>
                      }
                    />
                  )}
                </CardContent>
              </Card>

              <div className="flex flex-col gap-3">
                <Card>
                  <CardHeader className="flex-row items-start justify-between gap-3">
                    <div className="space-y-1">
                      <CardTitle>Weekly lead intake</CardTitle>
                      <CardDescription>New leads per week, by source.</CardDescription>
                    </div>
                    <TrendingUp
                      aria-hidden="true"
                      className="size-4 shrink-0 text-[var(--fl-fg-3)]"
                      strokeWidth={1.75}
                    />
                  </CardHeader>
                  <CardContent className="space-y-2">
                    {hasWeekly ? (
                      <>
                        <StackedBarChart data={weekly} series={sourceSeries} />
                        <ChartLegend items={sourceSeries} />
                      </>
                    ) : (
                      <EmptyState
                        size="sm"
                        icon={TrendingUp}
                        title="No leads in the last 6 weeks"
                        description="Add or import leads and this fills in week by week."
                      />
                    )}
                  </CardContent>
                </Card>

                <Card>
                  <CardHeader className="flex-row items-start justify-between gap-3">
                    <div className="space-y-1">
                      <CardTitle>Leads by stage</CardTitle>
                      <CardDescription>Where your pipeline currently sits.</CardDescription>
                    </div>
                    <PieChart
                      aria-hidden="true"
                      className="size-4 shrink-0 text-[var(--fl-fg-3)]"
                      strokeWidth={1.75}
                    />
                  </CardHeader>
                  <CardContent className="flex items-center gap-4">
                    <DonutChart data={stageDist} />
                    <ChartLegend items={stageDist} vertical showValues />
                  </CardContent>
                </Card>
              </div>
            </div>
          </section>

          <section aria-labelledby="breakdown-heading" className="space-y-3">
            <h2
              id="breakdown-heading"
              className="text-subtitle2 font-semibold text-[var(--fl-fg-1)]"
            >
              Breakdowns
            </h2>
            <div className="grid gap-3 lg:grid-cols-3">
              <Card>
                <CardHeader className="flex-row items-start justify-between gap-3">
                  <CardTitle>Leads by category</CardTitle>
                  <Tags
                    aria-hidden="true"
                    className="size-4 shrink-0 text-[var(--fl-fg-3)]"
                    strokeWidth={1.75}
                  />
                </CardHeader>
                <CardContent>
                  {categoryRows.length > 0 ? (
                    <BreakdownList rows={categoryRows} />
                  ) : (
                    <EmptyState
                      size="sm"
                      icon={Tags}
                      title="No categories yet"
                      description="Categories come from research, or from the category field on a lead."
                    />
                  )}
                </CardContent>
              </Card>

              <Card>
                <CardHeader className="flex-row items-start justify-between gap-3">
                  <CardTitle>Recommended service</CardTitle>
                  <Target
                    aria-hidden="true"
                    className="size-4 shrink-0 text-[var(--fl-fg-3)]"
                    strokeWidth={1.75}
                  />
                </CardHeader>
                <CardContent>
                  {scoredCount > 0 ? (
                    <BreakdownList rows={serviceRows} />
                  ) : (
                    <EmptyState
                      size="sm"
                      icon={Target}
                      title="Nothing scored yet"
                      description="A recommendation is produced when a lead is scored."
                      action={
                        <Button asChild size="sm" variant="outline">
                          <Link href="/help/how-scoring-works">How scoring works</Link>
                        </Button>
                      }
                    />
                  )}
                </CardContent>
              </Card>

              <Card>
                <CardHeader className="flex-row items-start justify-between gap-3">
                  <CardTitle>Score distribution</CardTitle>
                  <GaugeIcon
                    aria-hidden="true"
                    className="size-4 shrink-0 text-[var(--fl-fg-3)]"
                    strokeWidth={1.75}
                  />
                </CardHeader>
                <CardContent>
                  {scoredCount > 0 ? (
                    <BreakdownList rows={scoreRows} />
                  ) : (
                    <EmptyState
                      size="sm"
                      icon={GaugeIcon}
                      title="Nothing scored yet"
                      description="Leads are scored by a research campaign. Adding a lead by hand or by CSV does not score it."
                      action={
                        <Button asChild size="sm">
                          <Link href="/campaigns/new">Create a campaign</Link>
                        </Button>
                      }
                    />
                  )}
                </CardContent>
              </Card>
            </div>
          </section>

          <section aria-labelledby="followups-heading" id="follow-ups" className="scroll-mt-20">
            <h2 id="followups-heading" className="sr-only">
              Follow-ups
            </h2>
            <Card>
            <CardHeader className="flex-row items-start justify-between gap-3">
              <div className="space-y-1">
                <CardTitle>Follow-up reminders</CardTitle>
                <CardDescription>The next eight pending tasks, soonest first.</CardDescription>
              </div>
              <CalendarClock
                aria-hidden="true"
                className="size-4 shrink-0 text-[var(--fl-fg-3)]"
                strokeWidth={1.75}
              />
            </CardHeader>
            <CardContent>
              {reminderRows.length > 0 ? (
                <ul className="divide-y divide-[var(--hairline)]">
                  {reminderRows.map((r) => (
                    <li
                      key={r.id}
                      className="flex flex-wrap items-center justify-between gap-x-3 gap-y-1 py-2.5 text-body1 first:pt-0 last:pb-0"
                    >
                      <span className="flex min-w-0 flex-wrap items-center gap-2">
                        <Link
                          href={`/leads/${r.clinicId}`}
                          className="rounded-md font-semibold text-[var(--fl-brand-text)] hover:underline"
                        >
                          {r.clinicName}
                        </Link>
                        {r.title ? (
                          <span className="truncate text-[var(--fl-fg-2)]">{r.title}</span>
                        ) : null}
                        {r.overdue ? (
                          <Badge tone="danger">
                            <AlertCircle aria-hidden="true" />
                            Overdue
                          </Badge>
                        ) : null}
                      </span>
                      <span className="stat shrink-0 text-caption1 text-[var(--fl-fg-3)]">
                        {r.priority.toLowerCase()} · {r.assignee} ·{" "}
                        <time dateTime={r.dueDate.toISOString()}>
                          {r.dueDate.toLocaleDateString(undefined, {
                            month: "short",
                            day: "numeric",
                          })}
                        </time>
                      </span>
                    </li>
                  ))}
                </ul>
              ) : (
                <EmptyState
                  size="sm"
                  icon={CalendarClock}
                  title="No pending follow-ups"
                  description="Schedule a follow-up from a lead's page to see it here."
                />
              )}
            </CardContent>
            </Card>
          </section>
        </>
      )}
    </div>
  );
}
