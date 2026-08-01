import Link from "next/link";
import { Radar } from "lucide-react";
import { CampaignStatus } from "@prisma/client";
import { prisma } from "@/lib/db";
import { requireOrgContext } from "@/lib/auth/rbac";
import { CAMPAIGN_STATUS_LABELS, CAMPAIGN_STATUS_TONES } from "@/lib/leads/constants";
import { PageHeader } from "@/components/app/page-header";
import { EmptyState } from "@/components/app/empty-state";
import { ConfigWarning } from "@/components/app/config-warning";
import { AutoRefresh } from "@/components/app/auto-refresh";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { formatDate } from "@/lib/format";

export const dynamic = "force-dynamic";

function locationSummary(c: {
  city: string | null;
  region: string | null;
  country: string | null;
}): string {
  const parts = [c.city, c.region, c.country].filter(Boolean);
  return parts.length ? parts.join(", ") : "Any location";
}

export default async function CampaignsPage() {
  const ctx = await requireOrgContext();

  const campaigns = await prisma.searchCampaign.findMany({
    where: { orgId: ctx.orgId },
    orderBy: { createdAt: "desc" },
    include: { _count: { select: { clinics: true, jobs: true } } },
  });

  const hasActive = campaigns.some((c) => c.status === CampaignStatus.RUNNING);

  return (
    <div className="space-y-6">
      <AutoRefresh active={hasActive} />
      <PageHeader
        title="Campaigns"
        description="Discover healthcare clinics and research their public websites."
        actions={
          <Button asChild size="sm">
            <Link href="/campaigns/new">New campaign</Link>
          </Button>
        }
      />

      <ConfigWarning providerKey="discovery" />

      {campaigns.length === 0 ? (
        <EmptyState
          icon={Radar}
          title="No campaigns yet"
          description="Create a campaign to discover clinics by category and location, then research their public websites."
          action={
            <Button asChild size="sm">
              <Link href="/campaigns/new">New campaign</Link>
            </Button>
          }
        />
      ) : (
        <ul className="divide-y rounded-lg border">
          {campaigns.map((c) => (
            <li key={c.id}>
              <Link
                href={`/campaigns/${c.id}`}
                className="flex flex-col gap-2 px-4 py-3 transition-colors hover:bg-muted/50 sm:flex-row sm:items-center sm:justify-between"
              >
                <div className="min-w-0 space-y-1">
                  <div className="flex items-center gap-2">
                    <span className="truncate text-sm font-medium">{c.name}</span>
                    <Badge tone={CAMPAIGN_STATUS_TONES[c.status]}>
                      {CAMPAIGN_STATUS_LABELS[c.status]}
                    </Badge>
                  </div>
                  <p className="truncate text-xs text-muted-foreground">
                    {locationSummary(c)} · {c.categories.length} categor
                    {c.categories.length === 1 ? "y" : "ies"} · up to {c.maxLeads} leads
                  </p>
                </div>
                <div className="flex shrink-0 items-center gap-4 text-xs text-muted-foreground">
                  <span>{c._count.clinics} leads</span>
                  <span>{c._count.jobs} runs</span>
                  <span>{formatDate(c.createdAt)}</span>
                </div>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
