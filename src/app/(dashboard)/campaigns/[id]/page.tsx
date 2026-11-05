import Link from "next/link";
import { notFound } from "next/navigation";
import { JobStatus, Role } from "@prisma/client";
import { ArrowRight, ExternalLink } from "lucide-react";
import { prisma } from "@/lib/db";
import { requireOrgContext, roleAtLeast } from "@/lib/auth/rbac";
import { env, isProviderConfigured } from "@/lib/env";
import {
  CAMPAIGN_STATUS_LABELS,
  CAMPAIGN_STATUS_TONES,
} from "@/lib/leads/constants";
import { formatDate } from "@/lib/format";
import { PageHeader } from "@/components/app/page-header";
import { ConfigWarning } from "@/components/app/config-warning";
import { CampaignControls } from "@/components/app/campaign-controls";
import { RescoreCampaignButton } from "@/components/app/rescore-campaign-button";
import { AutoRefresh } from "@/components/app/auto-refresh";
import { JobList, type JobRow } from "@/components/app/job-list";
import { EmptyState } from "@/components/app/empty-state";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { buildReadiness, type ReadinessClinic } from "@/lib/campaigns/readiness";

export const dynamic = "force-dynamic";

function Detail({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div className="space-y-0.5">
      <dt className="text-xs text-muted-foreground">{label}</dt>
      <dd className="text-sm">{value}</dd>
    </div>
  );
}

export default async function CampaignDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const ctx = await requireOrgContext();

  const campaign = await prisma.searchCampaign.findFirst({
    where: { id, orgId: ctx.orgId },
    include: {
      jobs: {
        orderBy: { createdAt: "desc" },
        take: 20,
        include: {
          errors: { orderBy: { createdAt: "desc" }, take: 5 },
          _count: { select: { errors: true } },
        },
      },
      clinics: {
        orderBy: { collectedAt: "desc" },
        take: 50,
        include: { _count: { select: { sources: true } } },
      },
      _count: { select: { clinics: true } },
    },
  });

  if (!campaign) notFound();

  // Readiness is computed over every lead in the campaign, not just the 50
  // listed below, so the headline count is the real one.
  const readinessRows = await prisma.clinic.findMany({
    where: { campaignId: campaign.id, orgId: ctx.orgId },
    select: {
      id: true,
      name: true,
      category: true,
      websiteUrl: true,
      publicEmail: true,
      doNotContact: true,
      contacts: { select: { email: true }, orderBy: { isDecisionMaker: "desc" } },
      scores: {
        take: 1,
        orderBy: { computedAt: "desc" },
        select: {
          recommendedService: true,
          manualOverride: true,
          overrideOverall: true,
          overrideService: true,
          overallScore: true,
          confidence: true,
        },
      },
      drafts: { select: { status: true } },
    },
  });
  const readiness = buildReadiness(
    readinessRows.map(
      (c): ReadinessClinic => ({
        id: c.id,
        name: c.name,
        category: c.category,
        websiteUrl: c.websiteUrl,
        publicEmail: c.publicEmail,
        doNotContact: c.doNotContact,
        contactEmails: c.contacts.map((x) => x.email),
        score: c.scores[0] ?? null,
        draft: c.drafts[0] ?? null,
      }),
    ),
  );
  const openIssues = readiness.groups
    .filter((g) => g.severity !== "info")
    .reduce((n, g) => n + g.count, 0);

  const discoveryConfigured = isProviderConfigured("discovery");
  const canManage = roleAtLeast(ctx.role, Role.ADMIN);
  const hasActiveJob = campaign.jobs.some(
    (j) => j.status === JobStatus.RUNNING || j.status === JobStatus.QUEUED,
  );

  const location = [campaign.city, campaign.region, campaign.country].filter(Boolean).join(", ");

  const jobRows: JobRow[] = campaign.jobs.map((j) => ({
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
    errorCount: j._count.errors,
    errors: j.errors,
  }));

  return (
    <div className="space-y-6">
      <AutoRefresh active={hasActiveJob} />
      <PageHeader
        title={campaign.name}
        description="Discovery criteria, research runs, and the leads this campaign found."
        actions={
          <Badge tone={CAMPAIGN_STATUS_TONES[campaign.status]}>
            {CAMPAIGN_STATUS_LABELS[campaign.status]}
          </Badge>
        }
      />

      {!discoveryConfigured ? <ConfigWarning providerKey="discovery" /> : null}
      {/* In production, research runs on Inngest; surface a clear config state if
          its credentials are missing. In development the in-process runner is
          used, so no warning is needed. */}
      {env.NODE_ENV === "production" ? <ConfigWarning providerKey="background_jobs" /> : null}

      {/* The campaign's own controls stay here; the path to actually sending
          work out now runs through the review screen, which is the only place
          that can say what the run will cost and what it will skip. */}
      <Card elevation="raised">
        <CardContent className="space-y-4 pt-6">
          <div className="flex flex-wrap items-start justify-between gap-4">
            <div className="min-w-0">
              <h2 className="font-display text-subtitle2 font-semibold">
                {campaign._count.clinics === 0
                  ? "No leads yet"
                  : readiness.draftableLeads > 0
                    ? `${readiness.draftableLeads} of ${readiness.totalLeads} leads ready to draft`
                    : `${readiness.totalLeads} leads found, none scored yet`}
              </h2>
              <p className="mt-1 text-body1 text-[var(--fl-fg-3)]">
                {campaign._count.clinics === 0
                  ? "Run research to discover clinics matching the criteria below."
                  : openIssues > 0
                    ? `${openIssues} lead${openIssues === 1 ? "" : "s"} need${openIssues === 1 ? "s" : ""} attention before launching. You can fix them all on the review screen.`
                    : "Everything checks out. Review the cost and launch when you are ready."}
              </p>
            </div>

            {campaign._count.clinics > 0 ? (
              <Button asChild size="lg" className="shrink-0">
                <Link href={`/campaigns/${campaign.id}/review`}>
                  Review and launch
                  <ArrowRight aria-hidden="true" />
                </Link>
              </Button>
            ) : null}
          </div>

          <div className="flex flex-wrap items-center gap-2 border-t border-[var(--fl-stroke-2)] pt-4">
            <CampaignControls
              campaignId={campaign.id}
              status={campaign.status}
              discoveryConfigured={discoveryConfigured}
              canManage={canManage}
            />
            {canManage && campaign._count.clinics > 0 ? (
              <RescoreCampaignButton campaignId={campaign.id} />
            ) : null}
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Criteria</CardTitle>
        </CardHeader>
        <CardContent>
          <dl className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            <Detail label="Categories" value={campaign.categories.join(", ") || "—"} />
            <Detail label="Location" value={location || "Any"} />
            <Detail
              label="Search radius"
              value={campaign.radiusMeters ? `${Math.round(campaign.radiusMeters / 1000)} km` : "—"}
            />
            <Detail label="Maximum leads" value={campaign.maxLeads} />
            <Detail label="Minimum locations" value={campaign.minLocations} />
            <Detail
              label="Required keywords"
              value={campaign.requiredKeywords.join(", ") || "—"}
            />
            <Detail
              label="Excluded keywords"
              value={campaign.excludedKeywords.join(", ") || "—"}
            />
          </dl>
        </CardContent>
      </Card>

      <section className="space-y-3">
        <h2 className="text-sm font-semibold">Research runs</h2>
        {jobRows.length === 0 ? (
          <p className="rounded-lg border border-dashed px-4 py-8 text-center text-sm text-muted-foreground">
            No research has run yet.{" "}
            {discoveryConfigured
              ? "Run research to discover clinics."
              : "Automated discovery is unavailable until configured."}
          </p>
        ) : (
          <JobList jobs={jobRows} />
        )}
      </section>

      <section className="space-y-3">
        <div className="flex items-center justify-between">
          <h2 className="text-sm font-semibold">
            Discovered leads ({campaign._count.clinics})
          </h2>
          {campaign._count.clinics > campaign.clinics.length ? (
            <Link href="/leads" className="text-xs text-muted-foreground hover:underline">
              View all in Leads
            </Link>
          ) : null}
        </div>
        {campaign.clinics.length === 0 ? (
          <EmptyState
            title="No leads from this campaign yet"
            description="Leads discovered by this campaign will appear here with their sources and collection date."
          />
        ) : (
          <ul className="divide-y rounded-lg border">
            {campaign.clinics.map((clinic) => (
              <li key={clinic.id}>
                <Link
                  href={`/leads/${clinic.id}`}
                  className="flex items-center justify-between gap-4 px-4 py-3 transition-colors hover:bg-muted/50"
                >
                  <div className="min-w-0 space-y-0.5">
                    <p className="truncate text-sm font-medium">{clinic.name}</p>
                    <p className="truncate text-xs text-muted-foreground">
                      {clinic.category ?? "Uncategorized"}
                      {clinic.websiteUrl ? (
                        <>
                          {" · "}
                          <span className="inline-flex items-center gap-1">
                            {new URL(clinic.websiteUrl).hostname.replace(/^www\./, "")}
                            <ExternalLink className="size-3" />
                          </span>
                        </>
                      ) : null}
                    </p>
                  </div>
                  <div className="flex shrink-0 items-center gap-4 text-xs text-muted-foreground">
                    <span>{clinic._count.sources} sources</span>
                    <span>{formatDate(clinic.collectedAt)}</span>
                  </div>
                </Link>
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}
