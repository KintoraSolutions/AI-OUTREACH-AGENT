import { notFound } from "next/navigation";
import { CircleAlert, CircleCheckBig, Info, ShieldAlert } from "lucide-react";
import { Role } from "@prisma/client";
import { prisma } from "@/lib/db";
import { requireOrgContext, roleAtLeast } from "@/lib/auth/rbac";
import { formatDate } from "@/lib/format";
import { loadScoringConfigAndOverrides } from "@/lib/scoring/config";
import { loadEmailVoice } from "@/lib/ai/email-voice";
import { loadCompanyProfile } from "@/lib/ai/company-profile";
import { effectiveGuardrails, loadOrgAiProfile } from "@/lib/ai/org-ai-profile";
import { getUseCase } from "@/lib/ai/use-cases";
import { isProviderConfigured } from "@/lib/env";
import {
  listOrgConnections,
  toPublicConnection,
} from "@/lib/integrations/google-connections";
import { PageHeader } from "@/components/app/page-header";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { OrgIdentityForm } from "@/components/app/org-identity-form";
import { CompanyProfileForm } from "@/components/app/company-profile-form";
import { OrgAiForm } from "@/components/app/org-ai-form";
import { EmailVoiceForm } from "@/components/app/email-voice-form";
import { ScoringRulesForm } from "@/components/app/scoring-rules-form";
import { SystemStatus } from "@/components/app/system-status";
import { ComplianceAck } from "@/components/app/compliance-ack";
import { GoogleIntegrations } from "@/components/app/google-integrations";
import { RetentionSettings } from "@/components/app/retention-settings";
import { HelpTip } from "@/components/app/help-tip";
import { SettingsTabs, SettingsSectionHeader } from "@/components/app/settings-tabs";
// From lib, not from the tab component: this page is a server component, and a
// function exported by a "use client" module cannot be called on the server.
import { isSettingsTab, type SettingsTabValue } from "@/lib/settings/tabs";
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
  searchParams: Promise<{ connected?: string; error?: string; tab?: string }>;
}) {
  const ctx = await requireOrgContext();
  const canEdit = roleAtLeast(ctx.role, Role.ADMIN);
  const sp = await searchParams;

  // Single parallel batch: scoring (one read for both config+overrides), the org
  // record, connections, and retention history — previously the org was a serial
  // pre-fetch and scoring was read twice.
  const [
    { config: scoringConfig, overrides: scoringOverrides },
    org,
    connections,
    retentionRuns,
    emailVoice,
    companyProfile,
    orgAiProfile,
  ] = await Promise.all([
    loadScoringConfigAndOverrides(ctx.orgId),
    prisma.organization.findUnique({ where: { id: ctx.orgId } }),
    listOrgConnections(ctx.orgId),
    prisma.retentionRun.findMany({
      where: { orgId: ctx.orgId },
      orderBy: { startedAt: "desc" },
      take: 8,
    }),
    loadEmailVoice(ctx.orgId),
    loadCompanyProfile(ctx.orgId),
    loadOrgAiProfile(ctx.orgId),
  ]);
  if (!org) notFound();

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

  // An explicit ?tab= wins; otherwise the Google OAuth callback (which returns
  // with ?connected= or ?error= and no tab) lands on Integrations, where the
  // connection it just changed actually lives.
  const connectionOutcome = Boolean(sp.connected || sp.error);
  const defaultTab: SettingsTabValue = isSettingsTab(sp.tab)
    ? sp.tab
    : connectionOutcome
      ? "integrations"
      : "organization";

  return (
    <div className="space-y-5">
      <PageHeader
        title="Settings"
        description="Organization identity, your AI, scoring, integrations, and compliance."
        actions={<HelpTip slug="settings-overview" label="About these settings" />}
      />

      {/* Outcome messages stay outside the tabs: a result the user just caused
          must never be hidden behind an inactive tab. */}
      {sp.connected === "google" && (
        <Alert variant="success">
          <CircleCheckBig aria-hidden="true" />
          <AlertTitle>Google account connected</AlertTitle>
          <AlertDescription>
            You can now create Gmail drafts and sync follow-ups to Calendar. Drafts are still never
            sent for you.
          </AlertDescription>
        </Alert>
      )}
      {sp.error && CONNECT_ERRORS[sp.error] && (
        <Alert variant="warning">
          <CircleAlert aria-hidden="true" />
          <AlertTitle>Connection issue</AlertTitle>
          <AlertDescription>{CONNECT_ERRORS[sp.error]}</AlertDescription>
        </Alert>
      )}
      {!canEdit && (
        <Alert variant="info">
          <Info aria-hidden="true" />
          <AlertTitle>Read-only access</AlertTitle>
          <AlertDescription>
            You can read every section here. Only Admins and Owners can change these settings.
          </AlertDescription>
        </Alert>
      )}

      <SettingsTabs
        defaultTab={defaultTab}
        organization={
          <>
            <SettingsSectionHeader
              title="Organization"
              description="Who you are on an outreach email, and what your company does. Both are fed to the AI as sender context."
            />
            <Card>
              <CardContent className="pt-5">
                <OrgIdentityForm
                  canEdit={canEdit}
                  defaults={{
                    name: org.name,
                    companyName: org.companyName,
                    portfolioUrl: org.portfolioUrl,
                    contactUrl: org.contactUrl,
                    senderName: org.senderName,
                    senderEmail: org.senderEmail,
                  }}
                />
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle>Company profile</CardTitle>
                <CardDescription>
                  What your company does, what you sell, how you do it, and who you target. Fed to
                  the AI as sender context when drafting emails. Collected when you first set up
                  your account.
                </CardDescription>
              </CardHeader>
              <CardContent>
                <CompanyProfileForm profile={companyProfile} canEdit={canEdit} />
              </CardContent>
            </Card>
          </>
        }
        ai={
          <>
            <SettingsSectionHeader
              title="Your AI"
              description="What you offer, who you are writing to, and the words and rules your emails follow."
              help={<HelpTip slug="your-ai" label="About your AI profile" />}
            />
            <Card>
              <CardHeader>
                <CardTitle>AI profile</CardTitle>
                <CardDescription>
                  This configuration is yours alone and is fed to the AI on every draft.
                </CardDescription>
              </CardHeader>
              <CardContent>
                <OrgAiForm
                  profile={orgAiProfile}
                  presetGuardrails={effectiveGuardrails(
                    orgAiProfile,
                    getUseCase(orgAiProfile.useCase),
                  ).filter((g) => !orgAiProfile.customGuardrails.includes(g))}
                  canEdit={canEdit}
                />
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle>Email voice</CardTitle>
                <CardDescription>
                  Customize how outreach emails are written: tone, objective, signature, and length.
                  Applies to every generated draft. Evidence and grounding rules always still apply.
                </CardDescription>
              </CardHeader>
              <CardContent>
                <EmailVoiceForm
                  voice={emailVoice}
                  senderName={org.senderName}
                  companyName={org.companyName}
                  canEdit={canEdit}
                />
              </CardContent>
            </Card>
          </>
        }
        scoring={
          <>
            <SettingsSectionHeader
              title="Lead scoring"
              description="The rules that turn research findings into a score and a recommended service."
              help={<HelpTip slug="how-scoring-works" label="How scoring works" />}
            />
            <Card>
              <CardHeader>
                <CardTitle>Scoring rules</CardTitle>
                <CardDescription>
                  A lead is only scored once a campaign has researched it or someone has added a
                  finding by hand.
                </CardDescription>
              </CardHeader>
              <CardContent>
                <ScoringRulesForm
                  config={scoringConfig}
                  revision={scoringOverrides.revision}
                  canEdit={canEdit}
                />
              </CardContent>
            </Card>
          </>
        }
        integrations={
          <>
            <SettingsSectionHeader
              title="Integrations and data"
              description="Google access, which providers are configured, how long data is kept, and your compliance acknowledgement."
            />
            <Card>
              <CardHeader>
                <CardTitle>Google</CardTitle>
                <CardDescription>
                  Connect Gmail and Calendar to create drafts and follow-up events. Approved drafts
                  are placed in your Gmail Drafts folder for you to send yourself.
                </CardDescription>
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

            <Card>
              <CardHeader>
                <CardTitle>System status</CardTitle>
                <CardDescription>
                  Which providers are configured. Unconfigured providers disable their dependent
                  features rather than producing placeholder data.
                </CardDescription>
              </CardHeader>
              <CardContent>
                <SystemStatus />
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle>Data retention</CardTitle>
                <CardDescription>
                  Set how long research data is kept. Purges run only when you start one here.
                </CardDescription>
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
                  <ShieldAlert aria-hidden="true" />
                  <AlertTitle>You are responsible for compliant outreach</AlertTitle>
                  <AlertDescription>
                    You are responsible for ensuring each outreach campaign complies with the
                    privacy, anti-spam, and electronic-communications laws that apply to you and
                    your recipients. The system creates drafts for human review and never sends
                    automatically.
                  </AlertDescription>
                </Alert>
                <div className="flex flex-wrap items-center justify-between gap-4">
                  <p className="text-body1 text-[var(--fl-fg-2)]">
                    {org.complianceAckAt
                      ? `Acknowledged on ${formatDate(org.complianceAckAt)}.`
                      : "Not yet acknowledged for this organization."}
                  </p>
                  <ComplianceAck canEdit={canEdit} />
                </div>
              </CardContent>
            </Card>
          </>
        }
      />
    </div>
  );
}
