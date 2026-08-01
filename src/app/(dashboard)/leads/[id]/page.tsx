import Link from "next/link";
import { notFound } from "next/navigation";
import {
  Pencil,
  MapPin,
  Users,
  Link2,
  BarChart3,
} from "lucide-react";
import { Role } from "@prisma/client";
import { prisma } from "@/lib/db";
import { requireOrgContext, roleAtLeast } from "@/lib/auth/rbac";
import { EMAIL_STATUS_LABELS, LEAD_SOURCE_LABELS } from "@/lib/leads/constants";
import { formatDate } from "@/lib/format";
import type { ScoreBreakdown } from "@/lib/scoring/types";
import type { ScoreView } from "@/lib/scoring/view";
import type { PersonalizationEvidenceItem } from "@/lib/ai/draft-types";
import { describeAiProvider } from "@/lib/ai/provider";
import { isProviderConfigured } from "@/lib/env";
import { getGmailDraftForEmailDraft } from "@/lib/integrations/gmail";
import { getUsableConnection } from "@/lib/integrations/google-connections";
import {
  DraftPanel,
  type DraftView,
  type DraftVersionView,
} from "@/components/app/draft-panel";
import { GmailDraftSection } from "@/components/app/gmail-draft-section";
import { PageHeader } from "@/components/app/page-header";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { EmptyState } from "@/components/app/empty-state";
import { StageBadge } from "@/components/app/stage-badge";
import { StageSelect } from "@/components/app/stage-select";
import { DoNotContactToggle } from "@/components/app/do-not-contact-toggle";
import { ConfirmDeleteLead } from "@/components/app/confirm-delete-lead";
import { NotesEditor } from "@/components/app/notes-editor";
import { ActivityTimeline } from "@/components/app/activity-timeline";
import { AddContactForm, AddLocationForm } from "@/components/app/record-forms";
import { FollowUpManager, type FollowUpView } from "@/components/app/follow-up-manager";
import {
  AuditFindingsList,
  AuditHistoryList,
  ScoreBreakdownList,
  ScoreCard,
  type AuditLogRow,
  type FindingRow,
} from "@/components/app/audit-score";

function Detail({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div className="flex flex-col gap-0.5">
      <dt className="text-xs text-muted-foreground">{label}</dt>
      <dd className="text-sm">{value || <span className="text-muted-foreground">—</span>}</dd>
    </div>
  );
}

function ExternalLink({ href }: { href: string | null }) {
  if (!href) return <span className="text-muted-foreground">—</span>;
  return (
    <a href={href} target="_blank" rel="noopener noreferrer" className="text-primary hover:underline break-all">
      {href}
    </a>
  );
}

export default async function LeadDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const ctx = await requireOrgContext();
  const canEdit = roleAtLeast(ctx.role, Role.MEMBER);
  const canManage = roleAtLeast(ctx.role, Role.ADMIN);
  const canDelete = canManage;

  const clinic = await prisma.clinic.findFirst({
    where: { id, orgId: ctx.orgId },
    include: {
      contacts: { orderBy: { isDecisionMaker: "desc" } },
      locations: { orderBy: { collectedAt: "asc" } },
      sources: { orderBy: { retrievedAt: "desc" } },
      followUps: {
        orderBy: { dueDate: "asc" },
        include: { assignee: { select: { id: true, name: true, email: true } } },
      },
      activities: { orderBy: { createdAt: "desc" }, take: 50 },
      scores: { take: 1, orderBy: { computedAt: "desc" } },
      audits: {
        take: 1,
        orderBy: { checkedAt: "desc" },
        include: { findings: { orderBy: { scoreContribution: "desc" } } },
      },
      drafts: {
        take: 1,
        orderBy: { createdAt: "desc" },
        include: { versions: { orderBy: { version: "desc" } } },
      },
    },
  });

  if (!clinic) notFound();

  const auditLog = await prisma.auditLogEntry.findMany({
    where: { orgId: ctx.orgId, clinicId: clinic.id },
    orderBy: { createdAt: "desc" },
    take: 50,
  });

  const scoreRow = clinic.scores[0];
  const scoreView: ScoreView | null = scoreRow
    ? {
        websiteScore: scoreRow.websiteScore,
        softwareScore: scoreRow.softwareScore,
        klearqScore: scoreRow.klearqScore,
        contactabilityScore: scoreRow.contactabilityScore,
        businessFitScore: scoreRow.businessFitScore,
        overallScore: scoreRow.overallScore,
        recommendedService: scoreRow.recommendedService,
        recommendationReason: scoreRow.recommendationReason,
        confidence: scoreRow.confidence,
        weightsVersion: scoreRow.weightsVersion,
        computedAt: scoreRow.computedAt.toISOString(),
        manualOverride: scoreRow.manualOverride,
        overrideOverall: scoreRow.overrideOverall,
        overrideService: scoreRow.overrideService,
        overrideReason: scoreRow.overrideReason,
        breakdown: scoreRow.breakdown as unknown as ScoreBreakdown,
      }
    : null;

  const findingRows: FindingRow[] = (clinic.audits[0]?.findings ?? []).map((f) => ({
    id: f.id,
    category: f.category,
    code: f.code,
    finding: f.finding,
    evidence: f.evidence,
    sourceUrl: f.sourceUrl,
    confidence: f.confidence,
    isFact: f.isFact,
    scoreContribution: f.scoreContribution,
    manual: f.manual,
    dismissed: f.dismissed,
    subarea: f.subarea,
  }));

  const auditLogRows: AuditLogRow[] = auditLog.map((e) => ({
    id: e.id,
    action: e.action,
    entityType: e.entityType,
    reason: e.reason,
    actorName: e.actorName,
    createdAt: e.createdAt.toISOString(),
  }));

  const ai = describeAiProvider();
  const draftRow = clinic.drafts[0];
  const draftView: DraftView | null = draftRow
    ? {
        id: draftRow.id,
        status: draftRow.status,
        service: draftRow.service,
        strategyReason: draftRow.strategyReason,
        subject: draftRow.subject,
        body: draftRow.body,
        confidence: draftRow.confidence,
        reviewWarnings: draftRow.reviewWarnings,
        blockedReason: draftRow.blockedReason,
        wordCount: draftRow.wordCount,
        version: draftRow.version,
        aiModel: draftRow.aiModel,
        aiProvider: draftRow.aiProvider,
        promptVersion: draftRow.promptVersion,
        recipientName: draftRow.recipientName,
        recipientEmail: draftRow.recipientEmail,
        generatedAt: draftRow.generatedAt.toISOString(),
        approvedAt: draftRow.approvedAt?.toISOString() ?? null,
        rejectedReason: draftRow.rejectedReason,
        rejectedAt: draftRow.rejectedAt?.toISOString() ?? null,
        evidence: ((draftRow.personalizationEvidence as unknown as PersonalizationEvidenceItem[]) ?? []).map(
          (e) => ({
            code: e.code,
            claim: e.claim,
            sourceUrl: e.sourceUrl,
            category: e.category,
            confidence: e.confidence,
            isFact: e.isFact,
          }),
        ),
      }
    : null;

  const draftVersions: DraftVersionView[] = (draftRow?.versions ?? []).map((v) => ({
    id: v.id,
    version: v.version,
    changeType: v.changeType,
    status: v.status,
    subject: v.subject,
    body: v.body,
    createdByName: v.createdByName,
    createdAt: v.createdAt.toISOString(),
    reason: v.reason,
  }));

  // Gmail integration state for the draft card (no tokens are ever exposed).
  const googleConfigured = isProviderConfigured("google_integrations");
  const gmailDraftView = draftRow ? await getGmailDraftForEmailDraft(draftRow.id) : null;
  const gmailConnection =
    draftRow && googleConfigured ? await getUsableConnection(ctx.orgId, ctx.userId, "gmail") : null;

  // Follow-up management data.
  const now = new Date();
  const memberRows = await prisma.membership.findMany({
    where: { orgId: ctx.orgId },
    include: { user: { select: { id: true, name: true, email: true } } },
  });
  const followUpMembers = memberRows.map((m) => ({
    id: m.user.id,
    name: m.user.name ?? m.user.email,
  }));
  const followUpViews: FollowUpView[] = clinic.followUps.map((f) => ({
    id: f.id,
    title: f.title,
    dueDate: f.dueDate.toISOString(),
    note: f.note,
    priority: f.priority,
    status: f.status,
    assigneeName: f.assignee?.name ?? f.assignee?.email ?? null,
    calendarStatus: f.calendarStatus,
    overdue: f.status === "PENDING" && f.dueDate < now,
  }));
  const calendarConnected =
    googleConfigured && (await getUsableConnection(ctx.orgId, ctx.userId, "calendar")) != null;

  return (
    <div className="space-y-6">
      <PageHeader
        title={clinic.name}
        description={clinic.category ?? "Uncategorized"}
        actions={
          canEdit ? (
            <>
              <Button asChild variant="outline" size="sm">
                <Link href={`/leads/${clinic.id}/edit`}>
                  <Pencil className="size-4" />
                  Edit
                </Link>
              </Button>
              {canDelete ? <ConfirmDeleteLead clinicId={clinic.id} clinicName={clinic.name} /> : null}
            </>
          ) : null
        }
      />

      <div className="flex flex-wrap items-center gap-4 rounded-lg border px-4 py-3">
        <StageBadge stage={clinic.stage} />
        {clinic.isTestData ? <Badge tone="neutral">Test data</Badge> : null}
        {clinic.doNotContact ? <Badge tone="danger">Do not contact</Badge> : null}
        <span className="text-xs text-muted-foreground">
          Source: {LEAD_SOURCE_LABELS[clinic.leadSource]}
        </span>
        {canEdit ? (
          <div className="ml-auto flex items-center gap-4">
            <div className="w-44">
              <StageSelect clinicId={clinic.id} stage={clinic.stage} />
            </div>
            <DoNotContactToggle clinicId={clinic.id} value={clinic.doNotContact} />
          </div>
        ) : null}
      </div>

      <div className="grid gap-6 lg:grid-cols-3">
        <div className="space-y-6 lg:col-span-2">
          <Card>
            <CardHeader>
              <CardTitle>Clinic overview</CardTitle>
            </CardHeader>
            <CardContent>
              <dl className="grid gap-4 sm:grid-cols-2">
                <Detail label="Website" value={<ExternalLink href={clinic.websiteUrl} />} />
                <Detail label="Main phone" value={clinic.mainPhone} />
                <Detail label="Public email" value={clinic.publicEmail} />
                <Detail label="Contact page" value={<ExternalLink href={clinic.contactPageUrl} />} />
                <Detail label="Booking method" value={clinic.bookingMethod} />
                <Detail label="Online booking" value={<ExternalLink href={clinic.onlineBookingUrl} />} />
                <Detail label="Locations" value={clinic.locationCount} />
                <Detail label="Research date" value={formatDate(clinic.lastResearchedAt)} />
                <Detail label="Added" value={formatDate(clinic.createdAt)} />
                <Detail label="Follow-up date" value={formatDate(clinic.followUpDate)} />
              </dl>
              <p className="mt-4 text-xs text-muted-foreground">
                Confidence: fields entered manually or via CSV are self-reported and unverified until
                the research engine confirms them.
              </p>
            </CardContent>
          </Card>

          {scoreView ? (
            <ScoreCard view={scoreView} clinicId={clinic.id} canEdit={canEdit} canManage={canManage} />
          ) : (
            <Card>
              <CardHeader>
                <CardTitle>Lead score</CardTitle>
              </CardHeader>
              <CardContent>
                <EmptyState
                  icon={BarChart3}
                  title="Not scored yet"
                  description="Run research on a campaign, or add a manual finding, to produce a transparent rule-by-rule score."
                />
              </CardContent>
            </Card>
          )}

          {scoreView ? (
            <Card>
              <CardHeader>
                <CardTitle>Score breakdown</CardTitle>
              </CardHeader>
              <CardContent>
                <ScoreBreakdownList view={scoreView} />
              </CardContent>
            </Card>
          ) : null}

          <Card>
            <CardHeader>
              <CardTitle>Audit findings</CardTitle>
            </CardHeader>
            <CardContent>
              {findingRows.length > 0 || canEdit ? (
                <AuditFindingsList findings={findingRows} clinicId={clinic.id} canEdit={canEdit} />
              ) : (
                <EmptyState title="No findings yet" description="Findings appear here after research runs." />
              )}
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>Audit history</CardTitle>
            </CardHeader>
            <CardContent>
              <AuditHistoryList entries={auditLogRows} />
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>Email draft</CardTitle>
            </CardHeader>
            <CardContent>
              <DraftPanel
                clinicId={clinic.id}
                draft={draftView}
                versions={draftVersions}
                aiConfigured={ai.configured}
                aiModel={ai.model}
                canEdit={canEdit}
                canApprove={canManage}
              />
              {draftView ? (
                <div className="mt-4">
                  <GmailDraftSection
                    draftId={draftView.id}
                    isApproved={draftView.status === "APPROVED"}
                    currentVersion={draftView.version}
                    recipientName={draftView.recipientName}
                    recipientEmail={draftView.recipientEmail}
                    subject={draftView.subject}
                    body={draftView.body}
                    senderEmail={gmailConnection?.accountEmail ?? null}
                    googleConfigured={googleConfigured}
                    gmailConnected={gmailConnection != null}
                    gmailDraft={gmailDraftView}
                    canCreate={canEdit}
                  />
                </div>
              ) : null}
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>Notes &amp; activity</CardTitle>
            </CardHeader>
            <CardContent className="space-y-6">
              <NotesEditor clinicId={clinic.id} canEdit={canEdit} />
              <ActivityTimeline
                items={clinic.activities.map((a) => ({
                  id: a.id,
                  type: a.type,
                  note: a.note,
                  actorName: a.actorName,
                  createdAt: a.createdAt.toISOString(),
                }))}
              />
            </CardContent>
          </Card>
        </div>

        <div className="space-y-6">
          <Card>
            <CardHeader>
              <CardTitle>Contacts</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              {clinic.contacts.length > 0 ? (
                <ul className="space-y-3">
                  {clinic.contacts.map((c) => (
                    <li key={c.id} className="rounded-md border p-3 text-sm">
                      <div className="flex items-center justify-between gap-2">
                        <span className="font-medium">{c.name ?? "Unnamed contact"}</span>
                        {c.isDecisionMaker ? <Badge tone="info">Decision maker</Badge> : null}
                      </div>
                      {c.jobTitle ? <p className="text-muted-foreground">{c.jobTitle}</p> : null}
                      {c.email ? (
                        <p className="text-muted-foreground">
                          {c.email}{" "}
                          <span className="text-xs">({EMAIL_STATUS_LABELS[c.emailStatus]})</span>
                        </p>
                      ) : null}
                      {c.phone ? <p className="text-muted-foreground">{c.phone}</p> : null}
                    </li>
                  ))}
                </ul>
              ) : (
                <EmptyState icon={Users} title="No contacts" />
              )}
              {canEdit ? (
                <details className="rounded-md border p-3">
                  <summary className="cursor-pointer text-sm font-medium">Add contact</summary>
                  <div className="mt-3">
                    <AddContactForm clinicId={clinic.id} />
                  </div>
                </details>
              ) : null}
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>Locations</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              {clinic.locations.length > 0 ? (
                <ul className="space-y-2">
                  {clinic.locations.map((l) => (
                    <li key={l.id} className="rounded-md border p-3 text-sm">
                      {l.label ? <p className="font-medium">{l.label}</p> : null}
                      <p className="text-muted-foreground">{l.address ?? "No address"}</p>
                      {l.phone ? <p className="text-muted-foreground">{l.phone}</p> : null}
                    </li>
                  ))}
                </ul>
              ) : (
                <EmptyState icon={MapPin} title="No locations" />
              )}
              {canEdit ? (
                <details className="rounded-md border p-3">
                  <summary className="cursor-pointer text-sm font-medium">Add location</summary>
                  <div className="mt-3">
                    <AddLocationForm clinicId={clinic.id} />
                  </div>
                </details>
              ) : null}
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>Follow-ups</CardTitle>
            </CardHeader>
            <CardContent>
              <FollowUpManager
                clinicId={clinic.id}
                followUps={followUpViews}
                members={followUpMembers}
                currentUserId={ctx.userId}
                canEdit={canEdit}
                calendarConnected={calendarConnected}
              />
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>Sources</CardTitle>
            </CardHeader>
            <CardContent>
              {clinic.sources.length > 0 ? (
                <ul className="space-y-2 text-sm">
                  {clinic.sources.map((s) => (
                    <li key={s.id}>
                      <ExternalLink href={s.url} />
                      <span className="ml-1 text-xs text-muted-foreground">
                        ({s.type}, {formatDate(s.retrievedAt)})
                      </span>
                    </li>
                  ))}
                </ul>
              ) : (
                <EmptyState icon={Link2} title="No sources recorded" />
              )}
            </CardContent>
          </Card>
        </div>
      </div>

      {clinic.doNotContact ? (
        <Alert variant="warning">
          <AlertTitle>Do-not-contact</AlertTitle>
          <AlertDescription>
            This clinic is marked do-not-contact and is excluded from outreach.
          </AlertDescription>
        </Alert>
      ) : null}
    </div>
  );
}
