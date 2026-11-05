"use client";

import { useTransition } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { ArrowRight, Loader2, ShieldCheck, Sparkles } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { bulkGenerateDraftsAction } from "@/app/(dashboard)/leads/draft-actions";
import { formatUsd, type CampaignCostEstimate } from "@/lib/campaigns/cost";

/**
 * The end of the workflow: start drafting, with the consequences stated.
 *
 * This is the one place that says, in one sentence, exactly what pressing the
 * button does — how many emails, at what cost, and where they land. It also
 * says what it will NOT do, because "launch a campaign" reasonably sounds like
 * it sends something, and this product never does.
 *
 * Approved drafts are deliberately excluded by `loadTargets`, so a re-run after
 * approving some work cannot overwrite it. That is surfaced here rather than
 * left as a pleasant surprise.
 */
export function CampaignLaunch({
  campaignId,
  draftableLeads,
  alreadyDrafted,
  approvedDrafts,
  cost,
  canLaunch,
  canManage,
  aiConfigured,
  hasActiveJob,
  unresolved,
}: {
  campaignId: string;
  draftableLeads: number;
  alreadyDrafted: number;
  approvedDrafts: number;
  cost: CampaignCostEstimate;
  canLaunch: boolean;
  canManage: boolean;
  aiConfigured: boolean;
  hasActiveJob: boolean;
  /** Issues that remain; shown as a last chance to go back, never a hard block. */
  unresolved: number;
}) {
  const [pending, start] = useTransition();
  const router = useRouter();

  const blocked = !canLaunch || !canManage || !aiConfigured || hasActiveJob;

  const reason = !canManage
    ? "You need an Admin role to start drafting."
    : !aiConfigured
      ? "AI drafting is not configured. Set ANTHROPIC_API_KEY to enable it."
      : hasActiveJob
        ? "A job for this campaign is already running. Watch it on the Jobs page."
        : !canLaunch
          ? "No lead in this campaign is ready to draft yet. Run research, or resolve the issues above."
          : null;

  return (
    <Card elevation="raised">
      <CardContent className="space-y-4 pt-6">
        <div>
          <h2 className="font-display text-subtitle1 font-semibold">Ready to draft</h2>
          <p className="mt-1 text-body1 leading-relaxed text-[var(--fl-fg-2)]">
            {canLaunch ? (
              <>
                This will write{" "}
                <strong className="font-semibold text-foreground">
                  {draftableLeads} email{draftableLeads === 1 ? "" : "s"}
                </strong>
                {cost.priced ? (
                  <>
                    {" "}
                    at an estimated{" "}
                    <strong className="font-semibold text-foreground">
                      {formatUsd(cost.totalUsd)}
                    </strong>
                  </>
                ) : null}
                , then put them in your review queue.
              </>
            ) : (
              "Nothing is ready to draft yet."
            )}
          </p>
        </div>

        {approvedDrafts > 0 ? (
          <p className="text-caption1 leading-relaxed text-[var(--fl-fg-3)]">
            {approvedDrafts} already-approved draft{approvedDrafts === 1 ? " is" : "s are"}{" "}
            protected and will not be rewritten.
            {alreadyDrafted > approvedDrafts
              ? ` ${alreadyDrafted - approvedDrafts} unapproved draft${alreadyDrafted - approvedDrafts === 1 ? "" : "s"} will be regenerated.`
              : ""}
          </p>
        ) : alreadyDrafted > 0 ? (
          <p className="text-caption1 leading-relaxed text-[var(--fl-fg-3)]">
            {alreadyDrafted} existing draft{alreadyDrafted === 1 ? "" : "s"} will be regenerated.
          </p>
        ) : null}

        {unresolved > 0 && canLaunch ? (
          <p className="text-caption1 leading-relaxed text-[var(--fl-warning-fg)]">
            {unresolved} lead{unresolved === 1 ? "" : "s"} still ha{unresolved === 1 ? "s" : "ve"} an
            unresolved issue and will be skipped. You can launch anyway and come back to them.
          </p>
        ) : null}

        <div className="flex flex-wrap items-center gap-2">
          <Button
            size="lg"
            disabled={blocked || pending}
            title={reason ?? undefined}
            onClick={() =>
              start(async () => {
                const res = await bulkGenerateDraftsAction(campaignId);
                if (res.ok) {
                  toast.success(res.message ?? "Drafting started.");
                  router.push("/jobs");
                } else {
                  toast.error(res.error ?? "Could not start drafting.");
                }
              })
            }
          >
            {pending ? (
              <Loader2 aria-hidden="true" className="animate-spin" />
            ) : (
              <Sparkles aria-hidden="true" />
            )}
            {pending ? "Starting…" : `Draft ${draftableLeads} email${draftableLeads === 1 ? "" : "s"}`}
          </Button>

          <Button asChild variant="outline" size="lg">
            <Link href="/review">
              Review queue
              <ArrowRight aria-hidden="true" />
            </Link>
          </Button>
        </div>

        {reason ? <p className="text-caption1 text-[var(--fl-fg-3)]">{reason}</p> : null}

        <p className="flex items-start gap-2 border-t border-[var(--fl-stroke-2)] pt-3 text-caption1 leading-relaxed text-[var(--fl-fg-3)]">
          <ShieldCheck aria-hidden="true" className="mt-0.5 size-3.5 shrink-0" />
          <span>
            Nothing is sent. Each email is written as a draft for you to read, edit and approve —
            an approved one lands in your own Gmail drafts, and the send button stays in your inbox.
          </span>
        </p>
      </CardContent>
    </Card>
  );
}
