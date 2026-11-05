import Link from "next/link";
import { Plus, Upload, Download, Users } from "lucide-react";
import {
  Prisma,
  PipelineStage,
  Role,
  RecommendedService,
  ScoreConfidence,
  LeadSource,
} from "@prisma/client";
import { prisma } from "@/lib/db";
import { requireOrgContext, roleAtLeast } from "@/lib/auth/rbac";
import { loadOrgAiProfile, slotShortLabel } from "@/lib/ai/org-ai-profile";
import { buildEffectiveScoreWhere } from "@/lib/leads/score-filter";
import { PageHeader } from "@/components/app/page-header";
import { Button } from "@/components/ui/button";
import { EmptyState } from "@/components/app/empty-state";
import { HelpTip } from "@/components/app/help-tip";
import { LeadFilters } from "@/components/app/lead-filters";
import { SavedViews } from "@/components/app/saved-views";
import { LeadTable, type LeadRow } from "@/components/app/lead-table";
import { PipelineHealth, type PipelineHealthData } from "@/components/app/pipeline-health";

const PAGE_SIZE = 25;
const CONTACTED_STAGES: PipelineStage[] = [
  PipelineStage.CONTACTED,
  PipelineStage.REPLIED,
  PipelineStage.MEETING_BOOKED,
];

interface SearchParams {
  q?: string;
  category?: string;
  stage?: string;
  sort?: string;
  test?: string;
  page?: string;
  minScore?: string;
  maxScore?: string;
  service?: string;
  confidence?: string;
  finding?: string;
  audit?: string;
  auditedSince?: string;
  range?: string;
  leadSource?: string;
}

/** Every param that narrows the result set (`sort` is an ordering, not a filter). */
const FILTER_KEYS: (keyof SearchParams)[] = [
  "q",
  "category",
  "stage",
  "test",
  "minScore",
  "maxScore",
  "service",
  "confidence",
  "finding",
  "audit",
  "auditedSince",
  "range",
  "leadSource",
];

/** Map a date-range preset to a `createdAt >=` lower bound (null = all time). */
function rangeSince(range?: string): Date | null {
  if (!range) return null;
  const d = new Date();
  switch (range) {
    case "7d":
      d.setDate(d.getDate() - 7);
      return d;
    case "30d":
      d.setDate(d.getDate() - 30);
      return d;
    case "90d":
      d.setDate(d.getDate() - 90);
      return d;
    case "12m":
      d.setMonth(d.getMonth() - 12);
      return d;
    default:
      return null;
  }
}

/** Monday 00:00 (local) of the week containing `d`. */
function startOfWeek(d: Date): Date {
  const x = new Date(d);
  x.setHours(0, 0, 0, 0);
  const day = (x.getDay() + 6) % 7; // Monday = 0
  x.setDate(x.getDate() - day);
  return x;
}

/**
 * `audited.*` backs the sortable "Audited" column head. Never-audited leads are
 * pushed to the end in both directions: a wall of blank cells at the top is not
 * what anyone means by "sort by audited".
 */
function buildOrderBy(sort?: string): Prisma.ClinicOrderByWithRelationInput {
  switch (sort) {
    case "createdAt.asc":
      return { createdAt: "asc" };
    case "name.asc":
      return { name: "asc" };
    case "name.desc":
      return { name: "desc" };
    case "audited.asc":
      return { lastAuditedAt: { sort: "asc", nulls: "last" } };
    case "audited.desc":
      return { lastAuditedAt: { sort: "desc", nulls: "last" } };
    case "stage.asc":
      return { stage: "asc" };
    case "createdAt.desc":
    default:
      return { createdAt: "desc" };
  }
}

export default async function LeadsPage({
  searchParams,
}: {
  searchParams: Promise<SearchParams>;
}) {
  const ctx = await requireOrgContext();
  const sp = await searchParams;
  const canEdit = roleAtLeast(ctx.role, Role.MEMBER);
  const page = Math.max(1, Number.parseInt(sp.page ?? "1", 10) || 1);

  const where: Prisma.ClinicWhereInput = { orgId: ctx.orgId };
  if (!sp.test) where.isTestData = false;
  if (sp.category) where.category = sp.category;
  if (sp.leadSource && (LEAD_SOURCE_VALUES as string[]).includes(sp.leadSource)) {
    where.leadSource = sp.leadSource as LeadSource;
  }
  if (sp.stage && (STAGE_VALUES as string[]).includes(sp.stage)) {
    where.stage = sp.stage as PipelineStage;
  }
  if (sp.q) {
    const q = sp.q.trim();
    where.OR = [
      { name: { contains: q, mode: "insensitive" } },
      { websiteUrl: { contains: q, mode: "insensitive" } },
      { mainPhone: { contains: q, mode: "insensitive" } },
      { publicEmail: { contains: q, mode: "insensitive" } },
    ];
  }

  // Score filters use EFFECTIVE values (an active manual override wins over the
  // computed score/service), matching what the table shows. LeadScore is
  // one-per-clinic, so `some` selects that single score. Conditions are
  // accumulated into `where.AND` so score, finding, and audit-status filters
  // compose instead of overwriting one another.
  const and: Prisma.ClinicWhereInput[] = [];
  const min = Number.parseInt(sp.minScore ?? "", 10);
  const max = Number.parseInt(sp.maxScore ?? "", 10);
  const scoreWhere = buildEffectiveScoreWhere({
    minScore: Number.isFinite(min) ? min : null,
    maxScore: Number.isFinite(max) ? max : null,
    service:
      sp.service && (SERVICE_VALUES as string[]).includes(sp.service)
        ? (sp.service as RecommendedService)
        : null,
    confidence:
      sp.confidence && (CONFIDENCE_VALUES as string[]).includes(sp.confidence)
        ? (sp.confidence as ScoreConfidence)
        : null,
  });
  if (scoreWhere) and.push({ scores: { some: scoreWhere } });

  if (sp.finding) and.push({ audits: { some: { findings: { some: { code: sp.finding, dismissed: false } } } } });

  if (sp.audit === "scored") and.push({ scores: { some: {} } });
  else if (sp.audit === "audited") and.push({ audits: { some: {} } });
  else if (sp.audit === "unaudited") and.push({ audits: { none: {} } });

  if (sp.auditedSince) {
    const since = new Date(sp.auditedSince);
    if (!Number.isNaN(since.getTime())) where.lastAuditedAt = { gte: since };
  }

  const createdSince = rangeSince(sp.range);
  if (createdSince) where.createdAt = { gte: createdSince };

  if (and.length > 0) where.AND = and;

  // Pipeline Health KPIs are scoped to the org + test-data toggle only (NOT the
  // search/score filters), so they reflect overall health, not the current query.
  // The strip says so in its own header rather than leaving the reader to notice
  // that it disagrees with the table.
  const baseWhere: Prisma.ClinicWhereInput = { orgId: ctx.orgId };
  if (!sp.test) baseWhere.isTestData = false;
  const WEEKS = 8;
  const windowStart = startOfWeek(new Date());
  windowStart.setDate(windowStart.getDate() - 7 * (WEEKS - 1));
  const strongWhere = buildEffectiveScoreWhere({ minScore: 70 });

  // One parallel batch: the page list/count/views AND the KPI aggregates. Only
  // the duplicate scan below depends on this batch (it needs the page's names),
  // so the KPIs no longer wait for a second serial round-trip.
  const [total, clinics, savedViews, kpiTotal, kpiStrong, kpiContacted, recentCreated, aiProfile] =
    await Promise.all([
      prisma.clinic.count({ where }),
      prisma.clinic.findMany({
        where,
        orderBy: buildOrderBy(sp.sort),
        skip: (page - 1) * PAGE_SIZE,
        take: PAGE_SIZE,
        include: {
          locations: { take: 1, orderBy: { collectedAt: "asc" } },
          scores: { take: 1, orderBy: { computedAt: "desc" } },
          audits: {
            take: 1,
            orderBy: { checkedAt: "desc" },
            select: { _count: { select: { findings: { where: { dismissed: false } } } } },
          },
        },
      }),
      prisma.savedView.findMany({
        where: { orgId: ctx.orgId, userId: ctx.userId },
        orderBy: { name: "asc" },
        select: { id: true, name: true, params: true },
      }),
      prisma.clinic.count({ where: baseWhere }),
      prisma.clinic.count({
        where: strongWhere ? { ...baseWhere, scores: { some: strongWhere } } : baseWhere,
      }),
      prisma.clinic.count({ where: { ...baseWhere, stage: { in: CONTACTED_STAGES } } }),
      prisma.clinic.findMany({
        where: { ...baseWhere, createdAt: { gte: windowStart } },
        select: { createdAt: true },
      }),
      loadOrgAiProfile(ctx.orgId),
    ]);

  // Opportunity-area abbreviations come from the org's own offering names.
  const areaLabels = {
    website: slotShortLabel(aiProfile, "WEBSITE"),
    software: slotShortLabel(aiProfile, "SOFTWARE"),
    phone: slotShortLabel(aiProfile, "KLEARQ"),
  };

  // Soft duplicate detection, bounded to the current page: group only the page's
  // stored normalized names (indexed by [orgId, normalizedName]) so this is never
  // a full-table scan into memory. A name is a duplicate candidate when >1 lead
  // in the org shares it.
  const pageNormNames = [...new Set(clinics.map((c) => c.normalizedName).filter(Boolean))];
  const dupeGroups =
    pageNormNames.length > 0
      ? await prisma.clinic.groupBy({
          by: ["normalizedName"],
          where: { orgId: ctx.orgId, normalizedName: { in: pageNormNames } },
          _count: { _all: true },
        })
      : [];
  const duplicateNames = new Set(
    dupeGroups.filter((g) => g._count._all > 1).map((g) => g.normalizedName),
  );

  const rows: LeadRow[] = clinics.map((c) => {
    const s = c.scores[0];
    const overall = s ? (s.manualOverride && s.overrideOverall !== null ? s.overrideOverall : s.overallScore) : null;
    const service = s ? (s.manualOverride && s.overrideService ? s.overrideService : s.recommendedService) : null;
    return {
      id: c.id,
      name: c.name,
      category: c.category,
      location: c.locations[0]?.address ?? null,
      overallScore: overall,
      websiteScore: s?.websiteScore ?? null,
      softwareScore: s?.softwareScore ?? null,
      klearqScore: s?.klearqScore ?? null,
      contactabilityScore: s?.contactabilityScore ?? null,
      businessFitScore: s?.businessFitScore ?? null,
      recommendedService: service,
      confidence: s?.confidence ?? null,
      manualOverride: s?.manualOverride ?? false,
      findingCount: c.audits[0]?._count.findings ?? 0,
      lastAuditedAt: c.lastAuditedAt?.toISOString() ?? null,
      stage: c.stage,
      contacted: CONTACTED_STAGES.includes(c.stage),
      leadSource: c.leadSource,
      isTestData: c.isTestData,
      duplicateCandidate: c.normalizedName ? duplicateNames.has(c.normalizedName) : false,
    };
  });

  // ---- Pipeline Health KPIs (queried in the batch above) --------------------
  // Bucket the last 8 weeks of new leads (bounded query) into a weekly series.
  const weekStarts: number[] = [];
  for (let i = 0; i < WEEKS; i++) {
    const w = new Date(windowStart);
    w.setDate(w.getDate() + 7 * i);
    weekStarts.push(w.getTime());
  }
  const newSeries = new Array(WEEKS).fill(0) as number[];
  for (const c of recentCreated) {
    const idx = weekStarts.indexOf(startOfWeek(new Date(c.createdAt)).getTime());
    if (idx >= 0) newSeries[idx] = (newSeries[idx] ?? 0) + 1;
  }
  const before = kpiTotal - recentCreated.length;
  let running = before;
  const totalSeries = newSeries.map((n) => (running += n));
  const newThisWeek = newSeries[WEEKS - 1] ?? 0;
  const newTrend = newThisWeek - (newSeries[WEEKS - 2] ?? 0);

  const health: PipelineHealthData = {
    totalLeads: kpiTotal,
    totalSeries,
    strongLeads: kpiStrong,
    strongShare: kpiTotal > 0 ? (kpiStrong / kpiTotal) * 100 : 0,
    conversion: kpiTotal > 0 ? (kpiContacted / kpiTotal) * 100 : 0,
    newThisWeek,
    newSeries,
    newTrend,
  };

  const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE));
  const exportParams = new URLSearchParams();
  for (const [k, v] of Object.entries(sp)) if (v && k !== "page") exportParams.set(k, v);
  const isFiltered = FILTER_KEYS.some((k) => Boolean(sp[k]));

  return (
    <div className="space-y-3">
      <PageHeader
        title="Leads"
        description="Clinics in your outreach pipeline."
        actions={
          canEdit ? (
            <>
              <Button asChild size="sm">
                <Link href="/leads/new">
                  <Plus className="size-4" aria-hidden="true" />
                  New lead
                </Link>
              </Button>
              <Button asChild variant="outline" size="sm">
                <Link href={`/api/leads/export?${exportParams.toString()}`}>
                  <Download className="size-4" aria-hidden="true" />
                  Export
                </Link>
              </Button>
              <Button asChild variant="outline" size="sm">
                <Link href="/leads/import">
                  <Upload className="size-4" aria-hidden="true" />
                  Import
                </Link>
              </Button>
            </>
          ) : null
        }
      />

      <PipelineHealth data={health} />

      <LeadFilters viewsSlot={<SavedViews views={savedViews} />} />

      {rows.length === 0 ? (
        isFiltered ? (
          <EmptyState
            icon={Users}
            title="No leads match these filters"
            description="Remove a filter chip above, or clear them all, to widen the search."
          />
        ) : (
          <EmptyState
            icon={Users}
            title="No leads yet"
            description="Add a clinic by hand or import a CSV. A lead added this way has no findings and no score until a campaign researches it."
            action={
              <div className="flex flex-wrap items-center justify-center gap-2">
                {canEdit ? (
                  <>
                    <Button asChild size="sm">
                      <Link href="/leads/new">New lead</Link>
                    </Button>
                    <Button asChild size="sm" variant="outline">
                      <Link href="/leads/import">Import CSV</Link>
                    </Button>
                  </>
                ) : null}
                <HelpTip slug="adding-leads" label="How to add leads" />
              </div>
            }
          />
        )
      ) : (
        <>
          <LeadTable rows={rows} canEdit={canEdit} areaLabels={areaLabels} />
          <nav
            aria-label="Lead pages"
            className="flex flex-wrap items-center justify-between gap-2 pb-1"
          >
            <p aria-live="polite" className="text-body1 text-[var(--fl-fg-2)]">
              <span className="font-semibold tabular-nums text-[var(--fl-fg-1)]">{total}</span>{" "}
              {total === 1 ? "lead" : "leads"}
              {isFiltered ? " matching your filters" : ""} · page{" "}
              <span className="tabular-nums">{page}</span> of{" "}
              <span className="tabular-nums">{totalPages}</span>
            </p>
            <div className="flex gap-2">
              <PagerLink disabled={page <= 1} sp={sp} page={page - 1} label="Previous" />
              <PagerLink disabled={page >= totalPages} sp={sp} page={page + 1} label="Next" />
            </div>
          </nav>
        </>
      )}
    </div>
  );
}

const STAGE_VALUES = Object.values(PipelineStage);
const SERVICE_VALUES = Object.values(RecommendedService);
const CONFIDENCE_VALUES = Object.values(ScoreConfidence);
const LEAD_SOURCE_VALUES = Object.values(LeadSource);

function PagerLink({
  disabled,
  sp,
  page,
  label,
}: {
  disabled: boolean;
  sp: SearchParams;
  page: number;
  label: string;
}) {
  if (disabled) {
    return (
      <Button variant="outline" size="sm" disabled>
        {label}
      </Button>
    );
  }
  const params = new URLSearchParams();
  for (const [k, v] of Object.entries(sp)) if (v && k !== "page") params.set(k, v);
  params.set("page", String(page));
  return (
    <Button asChild variant="outline" size="sm">
      <Link href={`/leads?${params.toString()}`}>
        {label}
        <span className="sr-only"> page, page {page}</span>
      </Link>
    </Button>
  );
}
