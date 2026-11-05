"use client";

import { useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import {
  Confidence,
  DraftStatus,
  FindingCategory,
  RecommendedService,
} from "@prisma/client";
import {
  AlertTriangle,
  Ban,
  CheckCircle2,
  ChevronDown,
  Copy,
  CircleAlert,
  ExternalLink,
  History,
  Lightbulb,
  Mail,
  Pencil,
  RefreshCw,
  RotateCcw,
  ShieldAlert,
  Sparkles,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Skeleton } from "@/components/ui/skeleton";
import { Spinner } from "@/components/ui/spinner";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { EmptyState } from "@/components/app/empty-state";
import { HelpTip } from "@/components/app/help-tip";
import {
  CONFIDENCE_LABELS,
  FINDING_CATEGORY_LABELS,
  SERVICE_LABELS,
  SERVICE_TONES,
  type BadgeTone,
} from "@/lib/leads/constants";
import { formatDateTime } from "@/lib/format";
import {
  approveDraftAction,
  editDraftAction,
  generateDraftAction,
  regenerateDraftAction,
  rejectDraftAction,
  restoreDraftVersionAction,
} from "@/app/(dashboard)/leads/draft-actions";
import { GMAIL_DRAFTS_URL } from "@/lib/integrations/gmail-web";

export interface DraftEvidenceView {
  code: string;
  claim: string;
  sourceUrl: string;
  category: FindingCategory;
  confidence: Confidence;
  isFact: boolean;
}

export interface DraftView {
  id: string;
  status: DraftStatus;
  service: RecommendedService;
  strategyReason: string | null;
  subject: string;
  body: string;
  confidence: number;
  reviewWarnings: string[];
  blockedReason: string | null;
  wordCount: number | null;
  version: number;
  aiModel: string | null;
  aiProvider: string | null;
  promptVersion: string | null;
  recipientName: string | null;
  recipientEmail: string | null;
  generatedAt: string;
  approvedAt: string | null;
  rejectedReason: string | null;
  rejectedAt: string | null;
  evidence: DraftEvidenceView[];
}

export interface DraftVersionView {
  id: string;
  version: number;
  changeType: string;
  status: DraftStatus;
  subject: string;
  body: string;
  createdByName: string | null;
  createdAt: string;
  reason: string | null;
}

const STATUS_LABELS: Record<DraftStatus, string> = {
  GENERATED: "In review",
  EDITED: "In review (edited)",
  BLOCKED: "Blocked",
  APPROVED: "Approved",
  REJECTED: "Rejected",
  SENT_EXTERNAL: "Sent externally",
};

const STATUS_TONES: Record<DraftStatus, BadgeTone> = {
  GENERATED: "info",
  EDITED: "info",
  BLOCKED: "danger",
  APPROVED: "success",
  REJECTED: "danger",
  SENT_EXTERNAL: "neutral",
};

const CONFIDENCE_TONES: Record<Confidence, BadgeTone> = {
  VERIFIED: "success",
  STRONG_INFERENCE: "info",
  WEAK_INFERENCE: "warning",
  UNKNOWN: "neutral",
};

/** Which action is currently in flight, so the right control shows the spinner. */
type BusyAction = "generate" | "regenerate" | "approve" | "reject" | "restore" | null;

function SourceLink({ href }: { href: string }) {
  if (!href || href === "manual-entry" || !/^https?:\/\//.test(href)) {
    return <span className="text-caption1 text-[var(--fl-fg-3)]">{href || "Added by hand"}</span>;
  }
  return (
    <a
      href={href}
      target="_blank"
      rel="noopener noreferrer"
      className="inline-flex items-center gap-1 break-all rounded-sm text-caption1 text-[var(--fl-brand-text)] hover:underline"
    >
      {href.replace(/^https?:\/\//, "").slice(0, 48)}
      <ExternalLink aria-hidden="true" className="size-3 shrink-0" />
    </a>
  );
}

/** A caption-sized metadata chip used in the draft's status row. */
function MetaChip({ label, value }: { label: string; value: string }) {
  return (
    <span className="inline-flex items-baseline gap-1 text-caption1 text-[var(--fl-fg-3)]">
      <span>{label}</span>
      <span className="stat font-semibold text-[var(--fl-fg-2)]">{value}</span>
    </span>
  );
}

/**
 * Generation is a single server action: it cannot stream, so the client has no
 * honest way to know which internal stage the model is in. This state therefore
 * shows a real skeleton of the draft that is coming plus a static description of
 * the stages, and never animates a fake step-by-step progress.
 */
function GeneratingDraft() {
  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-x-4 gap-y-1">
        <Spinner size="sm" label="Generating draft" showLabel />
        <span className="text-caption1 text-[var(--fl-fg-3)]">
          This usually takes 10-20 seconds.
        </span>
      </div>

      <div aria-hidden="true" className="space-y-4">
        <div className="flex flex-wrap items-center gap-2">
          <Skeleton className="h-5 w-20 rounded-sm bg-[var(--fl-bg-4)]" />
          <Skeleton className="h-5 w-28 rounded-sm bg-[var(--fl-bg-4)]" />
          <Skeleton className="h-4 w-24 rounded-sm bg-[var(--fl-bg-4)]" />
        </div>

        <div className="overflow-hidden rounded-md border border-[var(--fl-stroke-2)] bg-[var(--fl-bg-1)]">
          <div className="space-y-2 border-b border-[var(--fl-stroke-2)] bg-[var(--fl-bg-2)] px-4 py-3">
            <Skeleton className="h-2.5 w-14 rounded-sm bg-[var(--fl-bg-4)]" />
            <Skeleton className="h-4 w-3/5 rounded-sm bg-[var(--fl-bg-4)]" />
          </div>
          <div className="space-y-2.5 px-4 py-4">
            <Skeleton className="h-3 w-[92%] rounded-sm bg-[var(--fl-bg-4)]" />
            <Skeleton className="h-3 w-[97%] rounded-sm bg-[var(--fl-bg-4)]" />
            <Skeleton className="h-3 w-[78%] rounded-sm bg-[var(--fl-bg-4)]" />
            <Skeleton className="h-3 w-[88%] rounded-sm bg-[var(--fl-bg-4)]" />
            <Skeleton className="h-3 w-[40%] rounded-sm bg-[var(--fl-bg-4)]" />
          </div>
          <div className="border-t border-[var(--fl-stroke-2)] bg-[var(--fl-bg-2)] px-4 py-2.5">
            <Skeleton className="h-2.5 w-48 rounded-sm bg-[var(--fl-bg-4)]" />
          </div>
        </div>
      </div>

      <p className="text-caption1 leading-relaxed text-[var(--fl-fg-3)]">
        We pick the angle from the evidence already stored on this lead, write the email, then check
        every claim in it back against that evidence. Nothing is sent: you get a draft to review.
      </p>
    </div>
  );
}

/**
 * Rejection reason capture. This replaced a native `window.prompt()`, which was
 * unstyled, untranslatable, invisible to the app's focus management, and the one
 * place in the product that broke out of the interface.
 */
function RejectDraftDialog({
  open,
  onOpenChange,
  pending,
  onConfirm,
}: {
  open: boolean;
  onOpenChange: (next: boolean) => void;
  pending: boolean;
  onConfirm: (reason: string) => void;
}) {
  const [reason, setReason] = useState("");
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const trimmed = reason.trim();

  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        if (!next) setReason("");
        onOpenChange(next);
      }}
    >
      <DialogContent
        className="max-w-md"
        onOpenAutoFocus={(event) => {
          event.preventDefault();
          textareaRef.current?.focus();
        }}
      >
        <DialogHeader>
          <DialogTitle>Reject this draft</DialogTitle>
          <DialogDescription>
            The reason is stored with the draft and shown in its version history, so whoever picks
            this lead up next knows what was wrong.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-1.5">
          <label
            htmlFor="reject-reason"
            className="block text-caption1 font-semibold text-[var(--fl-fg-2)]"
          >
            Reason for rejecting
          </label>
          <Textarea
            id="reject-reason"
            ref={textareaRef}
            rows={4}
            value={reason}
            onChange={(event) => setReason(event.target.value)}
            placeholder="For example: the opening claim is not supported by the findings."
            aria-describedby="reject-reason-hint"
          />
          <p id="reject-reason-hint" className="text-caption1 text-[var(--fl-fg-3)]">
            Required. Rejecting does not delete the draft; you can still regenerate or edit it.
          </p>
        </div>

        <DialogFooter>
          <Button variant="ghost" onClick={() => onOpenChange(false)} disabled={pending}>
            Cancel
          </Button>
          <Button
            variant="destructive"
            disabled={pending || trimmed.length === 0}
            onClick={() => {
              onConfirm(trimmed);
              setReason("");
            }}
          >
            {pending ? <Spinner size="xs" label="Rejecting draft" /> : <Ban aria-hidden="true" />}
            {pending ? "Rejecting…" : "Reject draft"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

export function DraftPanel({
  clinicId,
  draft,
  versions,
  aiConfigured,
  aiModel,
  canEdit,
  canApprove,
  googleConfigured,
  gmailConnected,
}: {
  clinicId: string;
  draft: DraftView | null;
  versions: DraftVersionView[];
  aiConfigured: boolean;
  aiModel: string;
  canEdit: boolean;
  canApprove: boolean;
  googleConfigured: boolean;
  gmailConnected: boolean;
}) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [busy, setBusy] = useState<BusyAction>(null);
  const [editing, setEditing] = useState(false);
  const [showVersions, setShowVersions] = useState(false);
  const [rejectOpen, setRejectOpen] = useState(false);

  function runAction(
    action: Exclude<BusyAction, null>,
    fn: () => Promise<{ ok: boolean; message?: string; error?: string }>,
  ) {
    setBusy(action);
    start(async () => {
      const res = await fn();
      if (res.ok) {
        toast.success(res.message ?? "Done.");
        router.refresh();
      } else {
        toast.error(res.error ?? "Something went wrong.");
      }
      setBusy(null);
    });
  }

  // Approve = approve + create the Gmail draft + jump to Gmail drafts. The tab is
  // opened synchronously in this click gesture (pop-up-safe) when Gmail can create
  // a draft, and closed again if the draft was not actually created.
  //
  // Do not move this window.open into a promise callback or behind an await: the
  // browser only trusts a pop-up opened inside the click gesture itself.
  function approve() {
    if (!draft) return;
    const gmailTab =
      googleConfigured && gmailConnected ? window.open(GMAIL_DRAFTS_URL, "_blank") : null;
    setBusy("approve");
    start(async () => {
      const res = await approveDraftAction(draft.id);
      if (res.ok) {
        toast.success(res.message ?? "Draft approved.");
        if (!res.gmailCreated) gmailTab?.close();
        router.refresh();
      } else {
        gmailTab?.close();
        toast.error(res.error ?? "Could not approve the draft.");
      }
      setBusy(null);
    });
  }

  // Configuration state: no credentials, nothing can be generated.
  if (!aiConfigured) {
    return (
      <Alert variant="warning">
        <CircleAlert aria-hidden="true" />
        <AlertTitle>AI drafting is not configured</AlertTitle>
        <AlertDescription>
          Set <code className="font-mono">ANTHROPIC_API_KEY</code> to enable evidence-grounded email
          drafts. Drafts are never fabricated when the provider is unavailable.
        </AlertDescription>
      </Alert>
    );
  }

  // First generation in progress: the card chrome stays, and the shape of the
  // draft that is coming is previewed as a skeleton.
  if (pending && !draft) {
    return <GeneratingDraft />;
  }

  // Empty state: no draft yet.
  if (!draft) {
    return (
      <div className="space-y-4">
        <EmptyState
          title="No draft yet"
          description="Generate an evidence-grounded outreach email from this lead's strongest supported opportunity. It is written from findings already on the lead, and it is only ever a draft."
        />
        {canEdit ? (
          <div className="flex flex-wrap items-center gap-3">
            <Button onClick={() => runAction("generate", () => generateDraftAction(clinicId))}>
              <Sparkles aria-hidden="true" />
              Generate draft
            </Button>
            <span className="text-caption1 text-[var(--fl-fg-3)]">
              Takes about 10-20 seconds. Nothing is sent.
            </span>
          </div>
        ) : null}
      </div>
    );
  }

  const isReviewable = draft.status === "GENERATED" || draft.status === "EDITED";
  const approveLabel =
    googleConfigured && gmailConnected ? "Approve & open in Gmail" : "Approve draft";

  return (
    <div className="space-y-5" aria-busy={pending}>
      {/* Status / metadata row */}
      <div className="flex flex-wrap items-center gap-x-4 gap-y-2">
        <div className="flex flex-wrap items-center gap-2">
          <Badge tone={STATUS_TONES[draft.status]}>{STATUS_LABELS[draft.status]}</Badge>
          <Badge tone={SERVICE_TONES[draft.service]}>{SERVICE_LABELS[draft.service]}</Badge>
        </div>
        <div className="flex flex-wrap items-center gap-x-4 gap-y-1">
          <MetaChip label="Confidence" value={`${draft.confidence}/100`} />
          <MetaChip label="Version" value={`v${draft.version}`} />
          {draft.wordCount != null ? (
            <MetaChip label="Length" value={`${draft.wordCount} words`} />
          ) : null}
        </div>
      </div>

      {draft.status === "BLOCKED" && draft.blockedReason ? (
        <Alert variant="destructive">
          <ShieldAlert aria-hidden="true" />
          <AlertTitle className="flex items-center gap-1">
            Draft blocked
            <HelpTip slug="why-drafts-get-blocked" label="Why drafts get blocked" />
          </AlertTitle>
          <AlertDescription>{draft.blockedReason}</AlertDescription>
        </Alert>
      ) : null}

      {draft.status === "APPROVED" ? (
        <Alert variant="success">
          <CheckCircle2 aria-hidden="true" />
          <AlertTitle>Approved</AlertTitle>
          <AlertDescription>
            Approved {draft.approvedAt ? formatDateTime(draft.approvedAt) : ""}. Editing it returns
            it to review.
          </AlertDescription>
        </Alert>
      ) : null}

      {draft.status === "REJECTED" && draft.rejectedReason ? (
        <Alert variant="warning">
          <Ban aria-hidden="true" />
          <AlertTitle>Rejected</AlertTitle>
          <AlertDescription>{draft.rejectedReason}</AlertDescription>
        </Alert>
      ) : null}

      {draft.reviewWarnings.length > 0 ? (
        <Alert variant="warning">
          <AlertTriangle aria-hidden="true" />
          <AlertTitle className="flex items-center gap-1">
            Review warnings ({draft.reviewWarnings.length})
            <HelpTip slug="review-warnings" label="About review warnings" />
          </AlertTitle>
          <AlertDescription>
            <ul className="list-disc space-y-1 pl-4">
              {draft.reviewWarnings.map((warning, index) => (
                <li key={index}>{warning}</li>
              ))}
            </ul>
          </AlertDescription>
        </Alert>
      ) : null}

      {editing ? (
        <EditForm draft={draft} onDone={() => setEditing(false)} />
      ) : (
        <div className="space-y-2">
          {draft.subject ? (
            <article className="overflow-hidden rounded-md border border-[var(--fl-stroke-2)] bg-[var(--fl-bg-1)] shadow-2">
              <header className="border-b border-[var(--fl-stroke-2)] bg-[var(--fl-bg-2)] px-4 py-3">
                <p className="text-caption1 text-[var(--fl-fg-3)]">Subject</p>
                <h4 className="text-subtitle2 font-semibold text-[var(--fl-fg-1)]">
                  {draft.subject}
                </h4>
              </header>
              <p className="whitespace-pre-wrap px-4 py-4 text-body1 leading-relaxed text-[var(--fl-fg-1)]">
                {draft.body}
              </p>
              <footer className="border-t border-[var(--fl-stroke-2)] bg-[var(--fl-bg-2)] px-4 py-2.5">
                {draft.recipientEmail ? (
                  <p className="flex flex-wrap items-center gap-1.5 text-caption1 text-[var(--fl-fg-3)]">
                    <Mail aria-hidden="true" className="size-3.5 shrink-0" />
                    <span>
                      To {draft.recipientName ? `${draft.recipientName}, ` : ""}
                      <span className="font-semibold text-[var(--fl-fg-2)]">
                        {draft.recipientEmail}
                      </span>
                    </span>
                  </p>
                ) : (
                  <p className="flex flex-wrap items-center gap-1.5 text-caption1 font-semibold text-[var(--fl-warning-fg)]">
                    <AlertTriangle aria-hidden="true" className="size-3.5 shrink-0" />
                    No recipient email on file. Add a contact before approving.
                  </p>
                )}
              </footer>
            </article>
          ) : (
            <p className="text-body1 text-[var(--fl-fg-2)]">
              This draft has no body: it was blocked before generation.
            </p>
          )}
        </div>
      )}

      {draft.strategyReason ? (
        <p className="text-caption1 leading-relaxed text-[var(--fl-fg-3)]">
          <span className="font-semibold text-[var(--fl-fg-2)]">Strategy </span>
          {draft.strategyReason}
        </p>
      ) : null}

      {/* Command bar. Primary action first, secondary group next, the one
          destructive action separated to the far end so it is never a slip. */}
      {canEdit && !editing ? (
        <div
          role="group"
          aria-label="Draft actions"
          className="flex flex-wrap items-center gap-2 border-t border-[var(--fl-stroke-2)] pt-4"
        >
          {canApprove && isReviewable ? (
            <>
              <Button onClick={approve} disabled={pending}>
                {busy === "approve" ? (
                  <Spinner size="xs" label="Approving draft" />
                ) : (
                  <CheckCircle2 aria-hidden="true" />
                )}
                {busy === "approve" ? "Approving…" : approveLabel}
              </Button>
              <span aria-hidden="true" className="h-6 w-px shrink-0 bg-[var(--fl-stroke-2)]" />
            </>
          ) : null}

          {draft.subject ? (
            <Button variant="outline" size="sm" onClick={() => setEditing(true)} disabled={pending}>
              <Pencil aria-hidden="true" />
              Edit
            </Button>
          ) : null}

          <Tooltip>
            <TooltipTrigger asChild>
              <Button
                variant="outline"
                size="sm"
                disabled={pending}
                onClick={() => runAction("regenerate", () => regenerateDraftAction(clinicId))}
              >
                {busy === "regenerate" ? (
                  <Spinner size="xs" label="Regenerating draft" />
                ) : (
                  <RefreshCw aria-hidden="true" />
                )}
                {busy === "regenerate" ? "Regenerating…" : "Regenerate"}
              </Button>
            </TooltipTrigger>
            <TooltipContent>
              Writes a new version from the same evidence. The current version is kept in history.
            </TooltipContent>
          </Tooltip>

          {draft.subject ? (
            <Tooltip>
              <TooltipTrigger asChild>
                <Button
                  variant="outline"
                  size="sm"
                  disabled={pending}
                  onClick={() => {
                    void navigator.clipboard
                      .writeText(`Subject: ${draft.subject}\n\n${draft.body}`)
                      .then(() => toast.success("Copied to clipboard."))
                      .catch(() => toast.error("Could not copy."));
                  }}
                >
                  <Copy aria-hidden="true" />
                  Copy
                </Button>
              </TooltipTrigger>
              <TooltipContent>Copies the subject and body as plain text.</TooltipContent>
            </Tooltip>
          ) : null}

          {isReviewable ? (
            <div className="ml-auto">
              <Button
                variant="ghost"
                size="sm"
                disabled={pending}
                onClick={() => setRejectOpen(true)}
                className="text-[var(--fl-danger-fg)] hover:bg-[var(--fl-danger-bg)] hover:text-[var(--fl-danger-fg)]"
              >
                <Ban aria-hidden="true" />
                Reject…
              </Button>
            </div>
          ) : null}

          <RejectDraftDialog
            open={rejectOpen}
            onOpenChange={setRejectOpen}
            pending={pending && busy === "reject"}
            onConfirm={(reason) => {
              setRejectOpen(false);
              runAction("reject", () => rejectDraftAction(draft.id, reason));
            }}
          />
        </div>
      ) : null}

      {/* Evidence used */}
      {draft.evidence.length > 0 ? (
        <section className="space-y-2">
          <h4 className="flex items-center gap-1 text-caption1 font-semibold text-[var(--fl-fg-3)]">
            Evidence used ({draft.evidence.length})
            <HelpTip slug="evidence-and-claims" label="About evidence and claims" />
          </h4>
          <ul className="space-y-2">
            {draft.evidence.map((item, index) => (
              <li
                key={`${item.code}-${index}`}
                className="rounded-md border border-[var(--fl-stroke-2)] bg-[var(--fl-bg-1)] p-3"
              >
                <p className="text-body1 leading-relaxed text-[var(--fl-fg-1)]">{item.claim}</p>
                <div className="mt-2 flex flex-wrap items-center gap-2">
                  <span
                    className={
                      item.isFact
                        ? "inline-flex items-center gap-1 text-caption1 font-semibold text-[var(--fl-success-fg)]"
                        : "inline-flex items-center gap-1 text-caption1 font-semibold text-[var(--fl-fg-2)]"
                    }
                  >
                    {item.isFact ? (
                      <CheckCircle2 aria-hidden="true" className="size-3.5 shrink-0" />
                    ) : (
                      <Lightbulb aria-hidden="true" className="size-3.5 shrink-0" />
                    )}
                    {item.isFact ? "Fact" : "Inference"}
                  </span>
                  <Badge tone="neutral">{FINDING_CATEGORY_LABELS[item.category]}</Badge>
                  <Badge tone={CONFIDENCE_TONES[item.confidence]}>
                    {CONFIDENCE_LABELS[item.confidence]}
                  </Badge>
                  <SourceLink href={item.sourceUrl} />
                </div>
              </li>
            ))}
          </ul>
        </section>
      ) : null}

      {/* Version history */}
      {versions.length > 0 ? (
        <section className="space-y-2">
          <Button
            variant="ghost"
            size="sm"
            className="-ml-3"
            aria-expanded={showVersions}
            aria-controls="draft-version-history"
            onClick={() => setShowVersions((value) => !value)}
          >
            <History aria-hidden="true" />
            Version history ({versions.length})
            <ChevronDown
              aria-hidden="true"
              className={
                showVersions
                  ? "rotate-180 transition-transform duration-150 ease-[var(--ease-easy)]"
                  : "transition-transform duration-150 ease-[var(--ease-easy)]"
              }
            />
          </Button>
          {showVersions ? (
            <ul
              id="draft-version-history"
              className="animate-in fade-in-0 slide-in-from-top-2 space-y-2 duration-150"
            >
              {versions.map((version) => (
                <li
                  key={version.id}
                  className="rounded-md border border-[var(--fl-stroke-2)] bg-[var(--fl-bg-1)] p-3"
                >
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <span className="text-body1 font-semibold text-[var(--fl-fg-1)]">
                      v{version.version} · {version.changeType} · {STATUS_LABELS[version.status]}
                    </span>
                    <span className="text-caption1 text-[var(--fl-fg-3)]">
                      {version.createdByName ?? "System"} · {formatDateTime(version.createdAt)}
                    </span>
                  </div>
                  {version.reason ? (
                    <p className="mt-1 text-caption1 text-[var(--fl-fg-2)]">{version.reason}</p>
                  ) : null}
                  <details className="group mt-2">
                    <summary className="inline-flex cursor-pointer list-none items-center gap-1 rounded-sm text-caption1 font-semibold text-[var(--fl-brand-text)] [&::-webkit-details-marker]:hidden">
                      Preview
                      <ChevronDown
                        aria-hidden="true"
                        className="size-3.5 transition-transform duration-150 ease-[var(--ease-easy)] group-open:rotate-180"
                      />
                    </summary>
                    <div className="mt-2 rounded-md border border-[var(--fl-stroke-2)] bg-[var(--fl-bg-2)] p-3">
                      <p className="text-caption1">
                        <span className="text-[var(--fl-fg-3)]">Subject </span>
                        <span className="font-semibold text-[var(--fl-fg-1)]">
                          {version.subject}
                        </span>
                      </p>
                      <p className="mt-1.5 whitespace-pre-wrap text-caption1 leading-relaxed text-[var(--fl-fg-2)]">
                        {version.body}
                      </p>
                    </div>
                  </details>
                  {canEdit ? (
                    <Button
                      className="mt-2"
                      size="sm"
                      variant="outline"
                      disabled={pending}
                      onClick={() => runAction("restore", () => restoreDraftVersionAction(version.id))}
                    >
                      <RotateCcw aria-hidden="true" />
                      Restore this version
                    </Button>
                  ) : null}
                </li>
              ))}
            </ul>
          ) : null}
        </section>
      ) : null}

      <p className="text-caption1 text-[var(--fl-fg-3)]">
        {draft.aiProvider ?? "provider"} · {draft.aiModel ?? aiModel} · prompt{" "}
        {draft.promptVersion ?? "n/a"} · generated {formatDateTime(draft.generatedAt)}
      </p>
    </div>
  );
}

function EditForm({ draft, onDone }: { draft: DraftView; onDone: () => void }) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [subject, setSubject] = useState(draft.subject);
  const [body, setBody] = useState(draft.body);

  return (
    <form
      className="space-y-3 rounded-md border border-[var(--fl-stroke-2)] bg-[var(--fl-bg-1)] p-4 shadow-2"
      action={(formData) => {
        start(async () => {
          const res = await editDraftAction({ ok: false }, formData);
          if (res.ok) {
            toast.success(res.message ?? "Saved.");
            onDone();
            router.refresh();
          } else {
            toast.error(res.error ?? "Could not save.");
          }
        });
      }}
    >
      <input type="hidden" name="draftId" value={draft.id} />
      <div className="space-y-1.5">
        <label
          className="block text-caption1 font-semibold text-[var(--fl-fg-2)]"
          htmlFor="draft-subject"
        >
          Subject
        </label>
        <Input
          id="draft-subject"
          name="subject"
          value={subject}
          onChange={(event) => setSubject(event.target.value)}
        />
      </div>
      <div className="space-y-1.5">
        <label
          className="block text-caption1 font-semibold text-[var(--fl-fg-2)]"
          htmlFor="draft-body"
        >
          Body
        </label>
        <Textarea
          id="draft-body"
          name="body"
          rows={10}
          value={body}
          onChange={(event) => setBody(event.target.value)}
          aria-describedby="draft-body-hint"
        />
        <p id="draft-body-hint" className="text-caption1 text-[var(--fl-fg-3)]">
          Editing an approved draft returns it to review. Claims you add by hand are not checked
          against the lead&apos;s evidence.
        </p>
      </div>
      <div className="flex items-center gap-2 border-t border-[var(--fl-stroke-2)] pt-3">
        <Button type="submit" size="sm" disabled={pending}>
          {pending ? <Spinner size="xs" label="Saving draft" /> : null}
          {pending ? "Saving…" : "Save changes"}
        </Button>
        <Button type="button" size="sm" variant="ghost" onClick={onDone} disabled={pending}>
          Cancel
        </Button>
      </div>
    </form>
  );
}
