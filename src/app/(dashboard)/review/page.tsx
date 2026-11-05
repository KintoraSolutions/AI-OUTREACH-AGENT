import Link from "next/link";
import { Role } from "@prisma/client";
import { ChevronLeft, ChevronRight, ExternalLink, Inbox, Sparkles } from "lucide-react";
import { requireOrgContext, roleAtLeast } from "@/lib/auth/rbac";
import { describeAiProvider } from "@/lib/ai/provider";
import { isProviderConfigured } from "@/lib/env";
import { getGmailDraftForEmailDraft } from "@/lib/integrations/gmail";
import { getUsableConnection } from "@/lib/integrations/google-connections";
import {
  countDraftableWithoutDraft,
  DEFAULT_BUCKET,
  isReviewBucket,
  loadBucketCounts,
  loadQueue,
  REVIEW_BUCKETS,
} from "@/lib/drafts/queue";
import { loadDraftScreen } from "@/lib/drafts/view";
import { PageHeader } from "@/components/app/page-header";
import { ReviewQueue } from "@/components/app/review-queue";
import { GenerateAllDraftsButton } from "@/components/app/generate-all-drafts-button";
import { DraftPanel } from "@/components/app/draft-panel";
import { GmailDraftSection } from "@/components/app/gmail-draft-section";
import { EmptyState } from "@/components/app/empty-state";
import { HelpTip } from "@/components/app/help-tip";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { cn } from "@/lib/utils";

/**
 * Draft review queue.
 *
 * Bulk drafting could always produce many drafts at once, but nothing let you
 * work through them: the leads list has no draft filter, so reviewing meant
 * opening leads one by one and guessing which had something waiting. This is
 * the other half — generate in bulk, then step through.
 *
 * The right-hand pane renders the SAME `DraftPanel` as the lead detail page, so
 * approve, reject, edit, regenerate and the pop-up-safe Gmail hand-off all
 * behave identically here. There is no second implementation to drift.
 */
export default async function ReviewPage({
  searchParams,
}: {
  searchParams: Promise<{ bucket?: string; id?: string }>;
}) {
  const sp = await searchParams;
  const ctx = await requireOrgContext();
  const canEdit = roleAtLeast(ctx.role, Role.MEMBER);
  const canManage = roleAtLeast(ctx.role, Role.ADMIN);

  const bucket = isReviewBucket(sp.bucket) ? sp.bucket : DEFAULT_BUCKET;

  const [counts, queue, draftableCount] = await Promise.all([
    loadBucketCounts(ctx.orgId),
    loadQueue(ctx.orgId, bucket),
    countDraftableWithoutDraft(ctx.orgId),
  ]);

  // An `id` that is not in the current bucket — usually because you just
  // approved it — falls back to the top of the queue rather than 404-ing.
  const selectedId =
    sp.id && queue.some((q) => q.clinicId === sp.id) ? sp.id : (queue[0]?.clinicId ?? null);
  const position = queue.findIndex((q) => q.clinicId === selectedId);
  const previous = position > 0 ? queue[position - 1] : null;
  const next = position >= 0 && position < queue.length - 1 ? queue[position + 1] : null;

  const ai = describeAiProvider();
  const googleConfigured = isProviderConfigured("google_integrations");

  const screen = selectedId ? await loadDraftScreen(ctx.orgId, selectedId) : null;
  const draft = screen?.draft ?? null;

  const [gmailDraft, gmailConnection] = await Promise.all([
    draft ? getGmailDraftForEmailDraft(draft.id) : Promise.resolve(null),
    draft && googleConfigured
      ? getUsableConnection(ctx.orgId, ctx.userId, "gmail")
      : Promise.resolve(null),
  ]);

  function href(b: string, id?: string | null) {
    const suffix = id ? "&id=" + id : "";
    return "/review?bucket=" + b + suffix;
  }

  return (
    <div className="space-y-4">
      <PageHeader
        title="Review drafts"
        description="Work through generated emails one at a time. Nothing is sent from here."
        actions={
          <>
            <GenerateAllDraftsButton
              count={draftableCount}
              disabled={!ai.configured || !canManage}
              disabledReason={
                !ai.configured
                  ? "AI drafting is not configured (set ANTHROPIC_API_KEY)."
                  : "You need an Admin role to start bulk drafting."
              }
            />
            <Button asChild variant="outline" size="sm">
              <Link href="/jobs">
                <Sparkles aria-hidden="true" />
                Drafting progress
              </Link>
            </Button>
          </>
        }
      />

      {!ai.configured ? (
        <Alert variant="warning">
          <AlertTitle>AI drafting is not configured</AlertTitle>
          <AlertDescription>
            Set <code>ANTHROPIC_API_KEY</code> to generate drafts. Existing drafts stay reviewable.
          </AlertDescription>
        </Alert>
      ) : null}

      {/* Buckets are links rather than a client tab control, so a queue
          position is shareable and survives a refresh. */}
      <nav
        aria-label="Draft status"
        className="flex items-center gap-1 overflow-x-auto border-b border-[var(--fl-stroke-2)]"
      >
        {REVIEW_BUCKETS.map((b) => {
          const active = b.value === bucket;
          return (
            <Link
              key={b.value}
              href={href(b.value)}
              aria-current={active ? "page" : undefined}
              className={cn(
                "relative shrink-0 whitespace-nowrap rounded-t-md px-3 py-2.5 text-body1 font-medium transition-colors",
                "after:absolute after:inset-x-3 after:bottom-0 after:h-[2px] after:rounded-full",
                active
                  ? "font-semibold text-[var(--fl-brand-text)] after:bg-[var(--fl-brand-text)]"
                  : "text-[var(--fl-fg-2)] after:bg-transparent hover:bg-[var(--muted)] hover:text-foreground",
              )}
            >
              {b.label}
              <span className="ml-1.5 tabular-nums text-[var(--fl-fg-3)]">{counts[b.value]}</span>
            </Link>
          );
        })}
      </nav>

      {queue.length === 0 ? (
        <EmptyState
          icon={Inbox}
          title={bucket === "review" ? "Nothing waiting for review" : "No drafts in this state"}
          description={
            draftableCount > 0
              ? draftableCount +
                " lead" +
                (draftableCount === 1 ? " is" : "s are") +
                " ready to draft. Generating them puts them in this queue."
              : "Drafts appear here once a lead has been scored and drafted. A lead with no findings cannot be drafted."
          }
        />
      ) : (
        <div className="grid gap-4 lg:grid-cols-[minmax(0,19rem)_minmax(0,1fr)]">
          <Card
            elevation="flat"
            className="overflow-hidden lg:sticky lg:top-24 lg:max-h-[calc(100vh-8rem)] lg:overflow-y-auto"
          >
            <div className="flex items-center justify-between gap-2 border-b border-[var(--fl-stroke-2)] px-3 py-2">
              <h2 className="text-caption1 font-semibold text-[var(--fl-fg-3)]">
                {queue.length} draft{queue.length === 1 ? "" : "s"}
              </h2>
              <span className="text-caption2 text-[var(--fl-fg-3)]">j / k to move</span>
            </div>
            <ReviewQueue items={queue} activeClinicId={selectedId} bucket={bucket} />
          </Card>

          <div className="min-w-0 space-y-3">
            {screen ? (
              <>
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <div className="min-w-0">
                    <h2 className="truncate font-display text-subtitle1 font-semibold">
                      {screen.clinicName}
                    </h2>
                    <p className="text-caption1 text-[var(--fl-fg-3)]">
                      {position + 1} of {queue.length}
                      {screen.category ? " · " + screen.category : ""}
                      {screen.overallScore !== null ? " · score " + screen.overallScore : ""}
                    </p>
                  </div>

                  <div className="flex items-center gap-1.5">
                    <Button asChild variant="ghost" size="sm" disabled={!previous}>
                      <Link
                        href={previous ? href(bucket, previous.clinicId) : "#"}
                        scroll={false}
                        aria-disabled={!previous}
                        aria-label="Previous draft"
                      >
                        <ChevronLeft aria-hidden="true" />
                        Previous
                      </Link>
                    </Button>
                    <Button asChild variant="outline" size="sm" disabled={!next}>
                      <Link
                        href={next ? href(bucket, next.clinicId) : "#"}
                        scroll={false}
                        aria-disabled={!next}
                        aria-label="Next draft"
                      >
                        Next
                        <ChevronRight aria-hidden="true" />
                      </Link>
                    </Button>
                    <Button asChild variant="ghost" size="icon-sm">
                      <Link
                        href={"/leads/" + screen.clinicId}
                        aria-label={"Open the full lead page for " + screen.clinicName}
                      >
                        <ExternalLink aria-hidden="true" />
                      </Link>
                    </Button>
                  </div>
                </div>

                {screen.doNotContact ? (
                  <Alert variant="destructive">
                    <AlertTitle>Do not contact</AlertTitle>
                    <AlertDescription>
                      This clinic is marked do-not-contact. Approving will not create a Gmail draft.
                    </AlertDescription>
                  </Alert>
                ) : null}

                <Card elevation="raised">
                  <CardContent className="pt-5">
                    <div className="mb-3 flex items-center gap-1.5">
                      <h3 className="text-caption1 font-semibold text-[var(--fl-fg-3)]">
                        Email draft
                      </h3>
                      <HelpTip slug="evidence-and-claims" />
                    </div>

                    <DraftPanel
                      clinicId={screen.clinicId}
                      draft={draft}
                      versions={screen.versions}
                      aiConfigured={ai.configured}
                      aiModel={ai.model}
                      canEdit={canEdit}
                      canApprove={canManage}
                      googleConfigured={googleConfigured}
                      gmailConnected={gmailConnection != null}
                    />

                    {draft ? (
                      <div className="mt-4">
                        <GmailDraftSection
                          draftId={draft.id}
                          isApproved={draft.status === "APPROVED"}
                          currentVersion={draft.version}
                          recipientName={draft.recipientName}
                          recipientEmail={draft.recipientEmail}
                          subject={draft.subject}
                          body={draft.body}
                          senderEmail={gmailConnection?.accountEmail ?? null}
                          googleConfigured={googleConfigured}
                          gmailConnected={gmailConnection != null}
                          gmailDraft={gmailDraft}
                          canCreate={canEdit}
                        />
                      </div>
                    ) : null}
                  </CardContent>
                </Card>
              </>
            ) : (
              <EmptyState
                icon={Inbox}
                title="Select a draft"
                description="Pick one from the queue."
              />
            )}
          </div>
        </div>
      )}
    </div>
  );
}
