import Link from "next/link";
import { notFound } from "next/navigation";
import { Role } from "@prisma/client";
import { ArrowLeft, CircleCheckBig, CircleX, Settings2 } from "lucide-react";
import { requireOrgContext, roleAtLeast } from "@/lib/auth/rbac";
import { loadCampaignReview } from "@/lib/campaigns/review";
import { PageHeader } from "@/components/app/page-header";
import { CampaignSenderCard } from "@/components/app/campaign-sender-card";
import { CampaignCostCard } from "@/components/app/campaign-cost";
import { CampaignLaunch } from "@/components/app/campaign-launch";
import { IssueGroupCard } from "@/components/app/issue-group";
import { CampaignSteps, type CampaignStep } from "@/components/app/campaign-steps";
import { CampaignControls } from "@/components/app/campaign-controls";
import { CrumbSlot } from "@/components/app/app-header";
import { AutoRefresh } from "@/components/app/auto-refresh";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";

export const dynamic = "force-dynamic";

/**
 * Pre-launch review.
 *
 * The campaign workflow used to end in a row of buttons with no sense of
 * whether anything was ready: you pressed "Draft emails" and found out
 * afterwards how many leads it had actually covered, what it had skipped, and
 * what it had cost. This screen answers all of that first, and — the part that
 * matters most — lets every problem it finds be fixed without leaving it.
 */
export default async function CampaignReviewPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const ctx = await requireOrgContext();
  const canManage = roleAtLeast(ctx.role, Role.ADMIN);
  const canEdit = roleAtLeast(ctx.role, Role.MEMBER);

  const data = await loadCampaignReview(ctx.orgId, ctx.userId, id);
  if (!data) notFound();

  const { campaign, readiness, checks, cost, sender, profile } = data;
  const failing = checks.filter((c) => !c.ok);
  const blockingConfig = failing.filter((c) => c.severity === "blocking");
  const senderMissing = failing
    .filter((c) => ["company_name", "sender_name", "sender_email", "company_profile"].includes(c.kind))
    .map((c) => c.label);

  // Issues worth a human's attention before launch. `no_service_fit` and
  // `do_not_contact` are normal outcomes, not problems, so they are reported in
  // the summary rather than as things to fix.
  const actionable = readiness.groups.filter(
    (g) => g.severity === "blocking" || g.severity === "attention",
  );
  const informational = readiness.groups.filter((g) => g.severity === "info");
  const unresolvedBlocking = actionable
    .filter((g) => g.severity === "blocking")
    .reduce((n, g) => n + g.count, 0);

  const steps: CampaignStep[] = [
    {
      key: "criteria",
      label: "Criteria",
      detail: campaign.categories.slice(0, 2).join(", ") || "Any category",
      done: true,
      href: `/campaigns/${campaign.id}`,
    },
    {
      key: "discover",
      label: "Discover",
      detail:
        readiness.totalLeads > 0 ? `${readiness.totalLeads} leads found` : "No leads yet",
      done: readiness.totalLeads > 0,
      href: `/campaigns/${campaign.id}`,
    },
    {
      key: "score",
      label: "Research & score",
      detail:
        readiness.draftableLeads > 0
          ? `${readiness.draftableLeads} ready`
          : "Nothing scored yet",
      done: readiness.draftableLeads > 0,
      href: `/campaigns/${campaign.id}`,
    },
    {
      key: "resolve",
      label: "Resolve issues",
      detail:
        actionable.length === 0
          ? "Nothing outstanding"
          : `${actionable.reduce((n, g) => n + g.count, 0)} to look at`,
      done: actionable.length === 0,
    },
    {
      key: "launch",
      label: "Draft emails",
      detail: readiness.draftableLeads > 0 ? `${readiness.draftableLeads} queued` : "Not ready",
      done: false,
    },
  ];

  const current = actionable.length > 0 ? "resolve" : "launch";

  return (
    <div className="space-y-6">
      <AutoRefresh active={data.hasActiveJob} />
      {/* This page is titled "Review and launch", so the campaign crumb has to
          be named explicitly or it reads a generic "Campaign". */}
      <CrumbSlot slot="campaign" label={campaign.name} />

      <PageHeader
        title="Review and launch"
        description={`Everything this campaign will do, before it does it. Nothing is sent from here.`}
        actions={
          <Button asChild variant="outline" size="sm">
            <Link href={`/campaigns/${campaign.id}`}>
              <ArrowLeft aria-hidden="true" />
              Back to campaign
            </Link>
          </Button>
        }
      />

      <CampaignSteps steps={steps} current={current} />

      {data.hasActiveJob ? (
        <Alert variant="info">
          <AlertTitle>A job is already running for this campaign</AlertTitle>
          <AlertDescription>
            Wait for it to finish before starting another.{" "}
            <Link href="/jobs" className="underline">
              Watch its progress
            </Link>
            .
          </AlertDescription>
        </Alert>
      ) : null}

      {/* --- Summary --------------------------------------------------- */}
      <Card>
        <CardHeader>
          <CardTitle>{campaign.name}</CardTitle>
          <CardDescription>
            {campaign.categories.join(", ") || "Any category"}
            {campaign.location ? ` · ${campaign.location}` : ""}
            {campaign.radiusKm ? ` · within ${campaign.radiusKm} km` : ""}
            {` · up to ${campaign.maxLeads} leads`}
          </CardDescription>
        </CardHeader>
        <CardContent>
          <dl className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
            <Stat label="Leads in campaign" value={readiness.totalLeads} />
            <Stat
              label="Will be drafted"
              value={readiness.draftableLeads}
              tone={readiness.draftableLeads > 0 ? "good" : "warn"}
            />
            <Stat
              label="Will be skipped"
              value={readiness.skippedLeads}
              tone={readiness.skippedLeads > 0 ? "warn" : undefined}
            />
            <Stat label="Already approved" value={data.approvedDrafts} />
          </dl>
        </CardContent>
      </Card>

      {/* --- Campaign-wide settings ------------------------------------ */}
      <CampaignSenderCard
        identity={{
          name: sender.orgName,
          companyName: sender.companyName,
          portfolioUrl: sender.portfolioUrl,
          contactUrl: sender.contactUrl,
          senderName: sender.senderName,
          senderEmail: sender.senderEmail,
        }}
        profile={profile}
        canEdit={canManage}
        missing={senderMissing}
      />

      {/* --- Configuration checks -------------------------------------- */}
      <Card>
        <CardHeader>
          <CardTitle>Configuration</CardTitle>
          <CardDescription>
            What drafting depends on. Anything unset here changes what the emails say.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <ul className="divide-y divide-[var(--fl-stroke-2)]">
            {checks.map((c) => (
              <li key={c.kind} className="flex items-start gap-2.5 py-2.5">
                {c.ok ? (
                  <CircleCheckBig
                    aria-hidden="true"
                    className="mt-0.5 size-4 shrink-0 text-[var(--fl-success-fg)]"
                  />
                ) : (
                  <CircleX
                    aria-hidden="true"
                    className="mt-0.5 size-4 shrink-0"
                    style={{
                      color:
                        c.severity === "info"
                          ? "var(--fl-fg-3)"
                          : "var(--fl-warning-fg)",
                    }}
                  />
                )}
                <div className="min-w-0">
                  <p className="text-body1 font-medium">{c.label}</p>
                  {!c.ok ? (
                    <p className="text-caption1 leading-relaxed text-[var(--fl-fg-3)]">
                      {c.detail}
                    </p>
                  ) : null}
                </div>
              </li>
            ))}
          </ul>

          {blockingConfig.some((c) => c.kind === "ai_provider") ? (
            <Alert variant="warning" className="mt-4">
              <AlertTitle>AI drafting is not configured</AlertTitle>
              <AlertDescription>
                Set <code>ANTHROPIC_API_KEY</code> on the server. Research and scoring still work
                without it.
              </AlertDescription>
            </Alert>
          ) : null}

          {!data.gmailConnected ? (
            <div className="mt-4">
              <Button asChild variant="outline" size="sm">
                <Link href="/settings?tab=integrations">
                  <Settings2 aria-hidden="true" />
                  Connect Gmail
                </Link>
              </Button>
            </div>
          ) : null}
        </CardContent>
      </Card>

      {/* --- Issues, each with its fix --------------------------------- */}
      <section className="space-y-3">
        <div>
          <h2 className="font-display text-subtitle2 font-semibold">
            {actionable.length === 0 ? "No outstanding issues" : "Needs your attention"}
          </h2>
          <p className="text-body1 text-[var(--fl-fg-3)]">
            {actionable.length === 0
              ? "Every lead in this campaign is either ready to draft or deliberately excluded."
              : "Fix these here — there is no need to go to the leads list."}
          </p>
        </div>

        {actionable.map((group) => (
          <IssueGroupCard
            key={group.kind}
            group={group}
            canEdit={canEdit}
            onRunResearch={
              <CampaignControls
                campaignId={campaign.id}
                status={campaign.status}
                discoveryConfigured={data.discoveryConfigured}
                canManage={canManage}
                compact
              />
            }
            researchDisabledReason={
              data.discoveryConfigured
                ? undefined
                : "Automated discovery is not configured, so these leads need a finding added by hand."
            }
          />
        ))}

        {informational.length > 0 ? (
          <Card elevation="flat">
            <CardContent className="space-y-2 pt-5">
              {informational.map((g) => (
                <div key={g.kind}>
                  <p className="text-body1 font-medium">{g.title}</p>
                  <p className="text-caption1 leading-relaxed text-[var(--fl-fg-3)]">
                    {g.consequence}
                  </p>
                </div>
              ))}
            </CardContent>
          </Card>
        ) : null}
      </section>

      {/* --- Cost and launch ------------------------------------------- */}
      <div className="grid gap-4 lg:grid-cols-2 lg:items-start">
        <CampaignCostCard cost={cost} research={data.researchCost} />
        <CampaignLaunch
          campaignId={campaign.id}
          draftableLeads={readiness.draftableLeads}
          alreadyDrafted={data.alreadyDrafted}
          approvedDrafts={data.approvedDrafts}
          cost={cost}
          canLaunch={readiness.canLaunch}
          canManage={canManage}
          aiConfigured={data.aiConfigured}
          hasActiveJob={data.hasActiveJob}
          unresolved={unresolvedBlocking}
        />
      </div>
    </div>
  );
}

function Stat({
  label,
  value,
  tone,
}: {
  label: string;
  value: number;
  tone?: "good" | "warn";
}) {
  const color =
    tone === "good"
      ? "text-[var(--fl-brand-text)]"
      : tone === "warn"
        ? "text-[var(--fl-warning-fg)]"
        : "text-foreground";
  return (
    <div>
      <dt className="text-caption1 text-[var(--fl-fg-3)]">{label}</dt>
      <dd className={`font-mono text-title3 font-semibold tabular-nums ${color}`}>{value}</dd>
    </div>
  );
}
