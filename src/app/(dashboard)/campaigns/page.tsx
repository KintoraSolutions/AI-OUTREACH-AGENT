import Link from "next/link";
import { Radar, MapPin, Tag, Settings, CalendarDays } from "lucide-react";
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
import { Sparkline, ProgressRing } from "@/components/app/charts";
import { formatDate } from "@/lib/format";

export const dynamic = "force-dynamic";

const HISTORICAL_STATUSES: CampaignStatus[] = [
  CampaignStatus.COMPLETED,
  CampaignStatus.PAUSED,
  CampaignStatus.CANCELLED,
];

function locationSummary(c: {
  city: string | null;
  region: string | null;
  country: string | null;
}): string {
  const parts = [c.city, c.region, c.country].filter(Boolean);
  return parts.length ? parts.join(", ") : "Any location";
}

/** Monday 00:00 (local) of the week containing `d`. */
function startOfWeek(d: Date): Date {
  const x = new Date(d);
  x.setHours(0, 0, 0, 0);
  const day = (x.getDay() + 6) % 7;
  x.setDate(x.getDate() - day);
  return x;
}

function bucketWeeks(dates: Date[], weekStarts: number[]): number[] {
  const b = new Array(weekStarts.length).fill(0) as number[];
  for (const d of dates) {
    const idx = weekStarts.indexOf(startOfWeek(new Date(d)).getTime());
    if (idx >= 0) b[idx] = (b[idx] ?? 0) + 1;
  }
  return b;
}

function cumulative(arr: number[]): number[] {
  let s = 0;
  return arr.map((v) => (s += v));
}

function KpiCard({
  label,
  value,
  sub,
  series,
}: {
  label: string;
  value: number | string;
  sub: string;
  series: number[];
}) {
  return (
    <div className="rounded-md border border-[var(--hairline)] bg-[var(--surface-2)] p-4">
      <p className="text-caption1 text-muted-foreground">{label}</p>
      <div className="mt-1.5 flex items-end justify-between gap-3">
        <span className="text-title2 font-semibold leading-none tabular-nums text-foreground">
          {value}
        </span>
        <Sparkline points={series} width={120} height={40} className="h-10 w-[120px]" />
      </div>
      <p className="mt-2 text-caption1 text-muted-foreground">{sub}</p>
    </div>
  );
}

export default async function CampaignsPage() {
  const ctx = await requireOrgContext();

  // ---- Weekly window for the overview sparklines (bounded, real data) -------
  const WEEKS = 8;
  const windowStart = startOfWeek(new Date());
  windowStart.setDate(windowStart.getDate() - 7 * (WEEKS - 1));
  const weekStarts: number[] = [];
  for (let i = 0; i < WEEKS; i++) {
    const w = new Date(windowStart);
    w.setDate(w.getDate() + 7 * i);
    weekStarts.push(w.getTime());
  }

  // Both queries are independent — run them in parallel (was a serial waterfall).
  // `take` bounds the card list; orgs don't approach 50 campaigns.
  const [campaigns, recentLeads] = await Promise.all([
    prisma.searchCampaign.findMany({
      where: { orgId: ctx.orgId },
      orderBy: { createdAt: "desc" },
      take: 50,
      include: { _count: { select: { clinics: true, jobs: true } } },
    }),
    prisma.clinic.findMany({
      where: { orgId: ctx.orgId, campaignId: { not: null }, createdAt: { gte: windowStart } },
      select: { createdAt: true },
    }),
  ]);

  const leadsSeries = cumulative(bucketWeeks(recentLeads.map((c) => c.createdAt), weekStarts));
  const campaignSeries = cumulative(
    bucketWeeks(campaigns.map((c) => c.createdAt), weekStarts),
  );
  const avgSeries = leadsSeries.map((l, i) => {
    const cc = campaignSeries[i] ?? 0;
    return cc > 0 ? l / cc : 0;
  });

  // ---- KPIs (real, org-scoped) ----------------------------------------------
  const running = campaigns.filter((c) => c.status === CampaignStatus.RUNNING).length;
  const paused = campaigns.filter((c) => c.status === CampaignStatus.PAUSED).length;
  const activeCount = running + paused;
  const totalLeads = campaigns.reduce((a, c) => a + c._count.clinics, 0);
  const historicalCount = campaigns.filter((c) => HISTORICAL_STATUSES.includes(c.status)).length;
  const avgDenom = historicalCount > 0 ? historicalCount : campaigns.length;
  const avgLeads = avgDenom > 0 ? Math.round(totalLeads / avgDenom) : 0;

  const hasActive = running > 0;

  return (
    <div className="space-y-4">
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
        <>
          {/* Campaign Overview */}
          <section className="glass rounded-lg p-4">
            <h2 className="mb-3 text-body1 font-semibold tracking-[-0.01em]">Campaign Overview</h2>
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
              <KpiCard
                label="Active Campaigns"
                value={activeCount}
                sub={`${running} running · ${paused} paused`}
                series={campaignSeries}
              />
              <KpiCard
                label="Total Leads Generated"
                value={totalLeads}
                sub={`across ${avgDenom} campaign${avgDenom === 1 ? "" : "s"}`}
                series={leadsSeries}
              />
              <KpiCard
                label="Avg. Leads per Campaign"
                value={avgLeads}
                sub={historicalCount > 0 ? "per completed/paused campaign" : "per campaign"}
                series={avgSeries}
              />
            </div>
          </section>

          {/* Campaign cards */}
          <div className="space-y-3">
            {campaigns.map((c) => {
              const captured = c._count.clinics;
              const target = c.maxLeads;
              const pct = target > 0 ? Math.min(100, (captured / target) * 100) : captured > 0 ? 100 : 0;
              const isCompleted = c.status === CampaignStatus.COMPLETED;
              const description = c.requiredKeywords.length
                ? `Keywords: ${c.requiredKeywords.join(", ")}`
                : "Discover clinics and research their public websites.";

              return (
                <Link
                  key={c.id}
                  href={`/campaigns/${c.id}`}
                  className="glass group block rounded-lg p-4 transition-colors hover:border-[var(--hairline-strong)] hover:bg-[var(--surface-2)]"
                >
                  <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
                    {/* Left */}
                    <div className="min-w-0 space-y-1.5">
                      <div className="flex flex-wrap items-center gap-2">
                        <span className="truncate text-body2 font-medium">{c.name}</span>
                        <Badge tone={CAMPAIGN_STATUS_TONES[c.status]}>
                          {CAMPAIGN_STATUS_LABELS[c.status]}
                        </Badge>
                      </div>
                      <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-caption1 text-muted-foreground">
                        <span className="inline-flex items-center gap-1">
                          <MapPin className="size-3.5 shrink-0 text-[var(--faint-foreground)]" />
                          {locationSummary(c)}
                        </span>
                        <span className="inline-flex items-center gap-1">
                          <Tag className="size-3.5 shrink-0 text-[var(--faint-foreground)]" />
                          {c.categories.length} categor{c.categories.length === 1 ? "y" : "ies"}
                        </span>
                      </div>
                    </div>

                    {/* Right */}
                    <div className="flex shrink-0 items-center gap-5">
                      <div className="text-right">
                        <div className="text-title3 font-semibold leading-none tabular-nums">
                          {captured}
                        </div>
                        <div className="mt-1 text-caption2 text-muted-foreground">Leads Captured</div>
                      </div>

                      {isCompleted ? (
                        <ProgressRing pct={pct} label={`${captured}/${target}`} />
                      ) : (
                        <div className="w-[120px]">
                          <div className="mb-1 text-right text-caption2 tabular-nums text-muted-foreground">
                            {captured}/{target}
                          </div>
                          <div className="h-1.5 w-full overflow-hidden rounded-full bg-[var(--surface-3)]">
                            <div
                              className="h-full rounded-full bg-[var(--mint)]"
                              style={{ width: `${pct}%` }}
                            />
                          </div>
                        </div>
                      )}

                      <div className="inline-flex items-center gap-1.5 text-caption1 text-muted-foreground">
                        Runs: {c._count.jobs}
                        <Settings className="size-4 text-[var(--faint-foreground)] transition-colors group-hover:text-foreground" />
                      </div>
                    </div>
                  </div>

                  {/* Bottom row: description + date */}
                  <div className="mt-3 flex flex-wrap items-center justify-between gap-2 border-t border-[var(--hairline)] pt-2.5 text-caption1 text-muted-foreground">
                    <span className="truncate">{description}</span>
                    <span className="inline-flex shrink-0 items-center gap-1">
                      <CalendarDays className="size-3.5 text-[var(--faint-foreground)]" />
                      {formatDate(c.createdAt)}
                    </span>
                  </div>
                </Link>
              );
            })}
          </div>
        </>
      )}
    </div>
  );
}
