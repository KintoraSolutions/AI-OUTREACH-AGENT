import Link from "next/link";
import { Plus, Upload, Download, Users } from "lucide-react";
import {
  Prisma,
  PipelineStage,
  Role,
  RecommendedService,
  ScoreConfidence,
} from "@prisma/client";
import { prisma } from "@/lib/db";
import { requireOrgContext, roleAtLeast } from "@/lib/auth/rbac";
import { buildEffectiveScoreWhere } from "@/lib/leads/score-filter";
import { PageHeader } from "@/components/app/page-header";
import { Button } from "@/components/ui/button";
import { EmptyState } from "@/components/app/empty-state";
import { LeadFilters } from "@/components/app/lead-filters";
import { SavedViews } from "@/components/app/saved-views";
import { LeadTable, type LeadRow } from "@/components/app/lead-table";

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
}

function buildOrderBy(sort?: string): Prisma.ClinicOrderByWithRelationInput {
  switch (sort) {
    case "createdAt.asc":
      return { createdAt: "asc" };
    case "name.asc":
      return { name: "asc" };
    case "name.desc":
      return { name: "desc" };
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

  if (and.length > 0) where.AND = and;

  const [total, clinics, savedViews] = await Promise.all([
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
  ]);

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

  const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE));
  const exportParams = new URLSearchParams();
  for (const [k, v] of Object.entries(sp)) if (v && k !== "page") exportParams.set(k, v);
  const hasAnyLeads = total > 0 || Boolean(sp.q || sp.category || sp.stage);

  return (
    <div className="space-y-6">
      <PageHeader
        title="Leads"
        description="Clinics in your outreach pipeline."
        actions={
          canEdit ? (
            <>
              <Button asChild variant="outline" size="sm">
                <Link href={`/api/leads/export?${exportParams.toString()}`}>
                  <Download className="size-4" />
                  Export
                </Link>
              </Button>
              <Button asChild variant="outline" size="sm">
                <Link href="/leads/import">
                  <Upload className="size-4" />
                  Import
                </Link>
              </Button>
              <Button asChild size="sm">
                <Link href="/leads/new">
                  <Plus className="size-4" />
                  New lead
                </Link>
              </Button>
            </>
          ) : null
        }
      />

      <SavedViews views={savedViews} />

      <LeadFilters />

      {rows.length === 0 ? (
        hasAnyLeads ? (
          <EmptyState
            icon={Users}
            title="No leads match your filters"
            description="Try clearing the search or filters."
          />
        ) : (
          <EmptyState
            icon={Users}
            title="No leads yet"
            description="Create a lead manually or import a CSV to get started."
            action={
              canEdit ? (
                <div className="flex gap-2">
                  <Button asChild size="sm">
                    <Link href="/leads/new">New lead</Link>
                  </Button>
                  <Button asChild size="sm" variant="outline">
                    <Link href="/leads/import">Import CSV</Link>
                  </Button>
                </div>
              ) : null
            }
          />
        )
      ) : (
        <>
          <LeadTable rows={rows} canEdit={canEdit} />
          <div className="flex items-center justify-between text-sm text-muted-foreground">
            <span>
              {total} lead{total === 1 ? "" : "s"} · page {page} of {totalPages}
            </span>
            <div className="flex gap-2">
              <PagerLink disabled={page <= 1} sp={sp} page={page - 1} label="Previous" />
              <PagerLink disabled={page >= totalPages} sp={sp} page={page + 1} label="Next" />
            </div>
          </div>
        </>
      )}
    </div>
  );
}

const STAGE_VALUES = Object.values(PipelineStage);
const SERVICE_VALUES = Object.values(RecommendedService);
const CONFIDENCE_VALUES = Object.values(ScoreConfidence);

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
      <Link href={`/leads?${params.toString()}`}>{label}</Link>
    </Button>
  );
}
