import Link from "next/link";
import { Role } from "@prisma/client";
import { CircleAlert, Settings2 } from "lucide-react";
import { prisma } from "@/lib/db";
import { requireOrgContext, roleAtLeast } from "@/lib/auth/rbac";
import { isProviderConfigured } from "@/lib/env";
import { loadCompanyProfile } from "@/lib/ai/company-profile";
import { getUsableConnection } from "@/lib/integrations/google-connections";
import { buildConfigChecks, configBlockers } from "@/lib/campaigns/readiness";
import { hasUsableProfile } from "@/lib/campaigns/review";
import { PageHeader } from "@/components/app/page-header";
import { CampaignForm } from "@/components/app/campaign-form";
import { ConfigWarning } from "@/components/app/config-warning";
import { CampaignSteps, type CampaignStep } from "@/components/app/campaign-steps";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { createCampaign } from "@/app/(dashboard)/campaigns/actions";

export default async function NewCampaignPage() {
  const ctx = await requireOrgContext();
  const canEdit = roleAtLeast(ctx.role, Role.MEMBER);
  const canManage = roleAtLeast(ctx.role, Role.ADMIN);

  // Checked here, at the start, rather than only at the review screen: finding
  // out that drafts will have no company name *after* building a campaign and
  // researching forty clinics is the expensive way to learn it.
  const [org, profile, gmail] = await Promise.all([
    prisma.organization.findUnique({ where: { id: ctx.orgId } }),
    loadCompanyProfile(ctx.orgId),
    isProviderConfigured("google_integrations")
      ? getUsableConnection(ctx.orgId, ctx.userId, "gmail")
      : Promise.resolve(null),
  ]);

  const checks = buildConfigChecks({
    companyName: org?.companyName ?? null,
    senderName: org?.senderName ?? null,
    senderEmail: org?.senderEmail ?? null,
    hasCompanyProfile: hasUsableProfile(profile),
    aiConfigured: isProviderConfigured("ai"),
    gmailConnected: gmail != null,
  });
  // Only the sender-side gaps belong here. A missing API key is a server
  // concern, not something to fix mid-form.
  const senderGaps = configBlockers(checks).filter((c) => c.kind !== "ai_provider");

  const steps: CampaignStep[] = [
    { key: "criteria", label: "Criteria", detail: "You are here", done: false },
    { key: "discover", label: "Discover", detail: "Find matching clinics", done: false },
    { key: "score", label: "Research & score", detail: "Audit and rank them", done: false },
    { key: "resolve", label: "Resolve issues", detail: "Fix anything missing", done: false },
    { key: "launch", label: "Draft emails", detail: "Review cost, then draft", done: false },
  ];

  return (
    <div className="mx-auto max-w-3xl space-y-6">
      <PageHeader
        title="New campaign"
        description="Define who to look for. You can save a campaign now and run research once discovery is configured."
      />

      <CampaignSteps steps={steps} current="criteria" />

      <ConfigWarning providerKey="discovery" />

      {senderGaps.length > 0 ? (
        <Alert variant="warning">
          <CircleAlert aria-hidden="true" />
          <AlertTitle>
            {senderGaps.length === 1
              ? `${senderGaps[0]!.label} is not set yet`
              : `${senderGaps.length} email settings are not set yet`}
          </AlertTitle>
          <AlertDescription className="space-y-2">
            <p>
              {senderGaps.map((c) => c.label).join(" and ")} feed into every draft this campaign
              writes. You can create the campaign now and set {senderGaps.length === 1 ? "it" : "them"}{" "}
              on the review screen before drafting.
            </p>
            {canManage ? (
              <Button asChild variant="outline" size="sm">
                <Link href="/settings?tab=organization">
                  <Settings2 aria-hidden="true" />
                  Set them now
                </Link>
              </Button>
            ) : null}
          </AlertDescription>
        </Alert>
      ) : null}

      {canEdit ? (
        <CampaignForm action={createCampaign} cancelHref="/campaigns" />
      ) : (
        <Alert variant="warning">
          <AlertDescription>
            You have read-only access. Ask an Admin to grant you member access to create campaigns.
          </AlertDescription>
        </Alert>
      )}
    </div>
  );
}
