import { notFound } from "next/navigation";
import { Role } from "@prisma/client";
import { prisma } from "@/lib/db";
import { requireOrgContext, roleAtLeast } from "@/lib/auth/rbac";
import { formatDate } from "@/lib/format";
import { loadScoringConfig, loadScoringOverrides } from "@/lib/scoring/config";
import { isProviderConfigured } from "@/lib/env";
import {
  listOrgConnections,
  toPublicConnection,
} from "@/lib/integrations/google-connections";
import { PageHeader } from "@/components/app/page-header";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { OrgIdentityForm } from "@/components/app/org-identity-form";
import { ScoringRulesForm } from "@/components/app/scoring-rules-form";
import { SystemStatus } from "@/components/app/system-status";
import { ComplianceAck } from "@/components/app/compliance-ack";
import { GoogleIntegrations } from "@/components/app/google-integrations";
import { RetentionSettings } from "@/components/app/retention-settings";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";

const CONNECT_ERRORS: Record<string, string> = {
  google_not_configured: "Google integration is not configured on this server.",
  token_encryption_not_configured: "Set TOKEN_ENCRYPTION_KEY before connecting Google.",
  google_denied: "The Google connection was cancelled.",
  google_connect_failed: "The Google connection could not be completed. Please try again.",
};

export default async function SettingsPage({
  searchParams,
}: {
  searchParams: Promise<{ connected?: string; error?: string }>;
}) {
  const ctx = await requireOrgContext();
  const canEdit = roleAtLeast(ctx.role, Role.ADMIN);
  const sp = await searchParams;

  const org = await prisma.organization.findUnique({ where: { id: ctx.orgId } });
  if (!org) notFound();

  const [scoringConfig, scoringOverrides, connections, retentionRuns] = await Promise.all([
    loadScoringConfig(ctx.orgId),
    loadScoringOverrides(ctx.orgId),
    listOrgConnections(ctx.orgId),
    prisma.retentionRun.findMany({
      where: { orgId: ctx.orgId },
      orderBy: { startedAt: "desc" },
      take: 8,
    }),
  ]);

  const retentionRunRows = retentionRuns.map((r) => ({
    id: r.id,
    status: r.status,
    dryRun: r.dryRun,
    clinicsPurged: r.clinicsPurged,
    jobsPurged: r.jobsPurged,
    protectedSkipped: r.protectedSkipped,
    message: r.message,
    actorName: r.actorName,
    startedAt: r.startedAt.toISOString(),
  }));

  const publicConnections = connections.map((c) => toPublicConnection(c, ctx.userId));
  const myConnection = publicConnections.find((c) => c.isMine) ?? null;
  const googleConfigured = isProviderConfigured("google_integrations");

  return (
    <div className="space-y-8">
      <PageHeader title="Settings" description="Organization identity, scoring, integrations, and compliance." />

      {sp.connected === "google" && (
        <Alert variant="info">
          <AlertTitle>Google account connected</AlertTitle>
          <AlertDescription>You can now create Gmail drafts and sync follow-ups to Calendar.</AlertDescription>
        </Alert>
      )}
      {sp.error && CONNECT_ERRORS[sp.error] && (
        <Alert variant="warning">
          <AlertTitle>Connection issue</AlertTitle>
          <AlertDescription>{CONNECT_ERRORS[sp.error]}</AlertDescription>
        </Alert>
      )}

      <Card>
        <CardContent className="pt-6">
          <OrgIdentityForm
            canEdit={canEdit}
            defaults={{
              name: org.name,
              companyName: org.companyName,
              portfolioUrl: org.portfolioUrl,
              contactUrl: org.contactUrl,
              senderName: org.senderName,
              senderEmail: org.senderEmail,
              klearqProductName: org.klearqProductName,
              klearqTagline: org.klearqTagline,
              klearqUrl: org.klearqUrl,
              klearqCapabilities: org.klearqCapabilities,
            }}
          />
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Lead scoring</CardTitle>
        </CardHeader>
        <CardContent>
          <ScoringRulesForm config={scoringConfig} revision={scoringOverrides.revision} canEdit={canEdit} />
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Integrations</CardTitle>
        </CardHeader>
        <CardContent>
          <GoogleIntegrations
            configured={googleConfigured}
            myConnection={myConnection}
            orgConnections={publicConnections}
            canManageDefault={canEdit}
          />
        </CardContent>
      </Card>

      <section className="space-y-3">
        <div>
          <h2 className="text-sm font-semibold">System status</h2>
          <p className="text-sm text-muted-foreground">
            Which providers are configured. Unconfigured providers disable their dependent features
            rather than producing placeholder data.
          </p>
        </div>
        <SystemStatus />
      </section>

      <Card>
        <CardHeader>
          <CardTitle>Data retention</CardTitle>
        </CardHeader>
        <CardContent>
          <RetentionSettings
            canEdit={canEdit}
            retentionDays={org.retentionDays}
            runs={retentionRunRows}
          />
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Compliance</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <Alert variant="warning">
            <AlertTitle>You are responsible for compliant outreach</AlertTitle>
            <AlertDescription>
              You are responsible for ensuring each outreach campaign complies with the privacy,
              anti-spam, and electronic-communications laws that apply to you and your recipients.
              The system creates drafts for human review and never sends automatically.
            </AlertDescription>
          </Alert>
          <div className="flex items-center justify-between gap-4">
            <p className="text-sm text-muted-foreground">
              {org.complianceAckAt
                ? `Acknowledged on ${formatDate(org.complianceAckAt)}.`
                : "Not yet acknowledged for this organization."}
            </p>
            <ComplianceAck canEdit={canEdit} />
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
