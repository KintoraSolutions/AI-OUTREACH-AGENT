"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import {
  Confidence,
  DraftStatus,
  FindingCategory,
  RecommendedService,
} from "@prisma/client";
import { ExternalLink } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { EmptyState } from "@/components/app/empty-state";
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

function SourceLink({ href }: { href: string }) {
  if (!href || href === "manual-entry" || !/^https?:\/\//.test(href)) {
    return <span className="text-xs text-muted-foreground">{href || "—"}</span>;
  }
  return (
    <a
      href={href}
      target="_blank"
      rel="noopener noreferrer"
      className="inline-flex items-center gap-1 text-xs text-primary hover:underline break-all"
    >
      {href.replace(/^https?:\/\//, "").slice(0, 48)}
      <ExternalLink className="size-3 shrink-0" />
    </a>
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
}: {
  clinicId: string;
  draft: DraftView | null;
  versions: DraftVersionView[];
  aiConfigured: boolean;
  aiModel: string;
  canEdit: boolean;
  canApprove: boolean;
}) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [editing, setEditing] = useState(false);
  const [showVersions, setShowVersions] = useState(false);

  function runAction(fn: () => Promise<{ ok: boolean; message?: string; error?: string }>) {
    start(async () => {
      const res = await fn();
      if (res.ok) {
        toast.success(res.message ?? "Done.");
        router.refresh();
      } else {
        toast.error(res.error ?? "Something went wrong.");
      }
    });
  }

  // Configuration state: no credentials, nothing can be generated.
  if (!aiConfigured) {
    return (
      <Alert variant="warning">
        <AlertTitle>AI drafting is not configured</AlertTitle>
        <AlertDescription>
          Set <code>ANTHROPIC_API_KEY</code> to enable evidence-grounded email drafts. Drafts are never
          fabricated when the provider is unavailable.
        </AlertDescription>
      </Alert>
    );
  }

  // Loading state (generation in progress).
  if (pending && !draft) {
    return <p className="text-sm text-muted-foreground">Generating draft…</p>;
  }

  // Empty state: no draft yet.
  if (!draft) {
    return (
      <div className="space-y-4">
        <EmptyState
          title="No draft yet"
          description="Generate an evidence-grounded outreach email from this lead's strongest supported opportunity."
        />
        {canEdit ? (
          <Button size="sm" disabled={pending} onClick={() => runAction(() => generateDraftAction(clinicId))}>
            {pending ? "Generating…" : "Generate draft"}
          </Button>
        ) : null}
      </div>
    );
  }

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-center gap-2">
        <Badge tone={STATUS_TONES[draft.status]}>{STATUS_LABELS[draft.status]}</Badge>
        <Badge tone={SERVICE_TONES[draft.service]}>{SERVICE_LABELS[draft.service]}</Badge>
        <span className="text-xs text-muted-foreground">Confidence {draft.confidence}/100</span>
        <span className="text-xs text-muted-foreground">v{draft.version}</span>
        {draft.wordCount != null ? (
          <span className="text-xs text-muted-foreground">{draft.wordCount} words</span>
        ) : null}
      </div>

      {draft.status === "BLOCKED" && draft.blockedReason ? (
        <Alert variant="destructive">
          <AlertTitle>Draft blocked</AlertTitle>
          <AlertDescription>{draft.blockedReason}</AlertDescription>
        </Alert>
      ) : null}

      {draft.status === "APPROVED" ? (
        <Alert>
          <AlertTitle>Approved</AlertTitle>
          <AlertDescription>
            Approved {draft.approvedAt ? formatDateTime(draft.approvedAt) : ""}. Editing returns it to review.
          </AlertDescription>
        </Alert>
      ) : null}

      {draft.status === "REJECTED" && draft.rejectedReason ? (
        <Alert variant="warning">
          <AlertTitle>Rejected</AlertTitle>
          <AlertDescription>{draft.rejectedReason}</AlertDescription>
        </Alert>
      ) : null}

      {draft.reviewWarnings.length > 0 ? (
        <div className="rounded-md border border-amber-300/50 bg-amber-50/50 p-3 dark:bg-amber-950/20">
          <p className="text-xs font-medium text-amber-700 dark:text-amber-500">Review warnings</p>
          <ul className="mt-1 list-disc space-y-0.5 pl-4 text-xs text-muted-foreground">
            {draft.reviewWarnings.map((w, i) => (
              <li key={i}>{w}</li>
            ))}
          </ul>
        </div>
      ) : null}

      {editing ? (
        <EditForm draft={draft} onDone={() => setEditing(false)} />
      ) : (
        <div className="space-y-2">
          {draft.subject ? (
            <div className="rounded-md border">
              <div className="border-b px-3 py-2 text-sm">
                <span className="text-muted-foreground">Subject: </span>
                <span className="font-medium">{draft.subject}</span>
              </div>
              <p className="whitespace-pre-wrap px-3 py-3 text-sm">{draft.body}</p>
            </div>
          ) : (
            <p className="text-sm text-muted-foreground">This draft has no body (it was blocked before generation).</p>
          )}
          {draft.recipientEmail ? (
            <p className="text-xs text-muted-foreground">
              To: {draft.recipientName ? `${draft.recipientName}, ` : ""}
              {draft.recipientEmail}
            </p>
          ) : (
            <p className="text-xs text-amber-600">No recipient email on file.</p>
          )}
        </div>
      )}

      {draft.strategyReason ? (
        <p className="text-xs text-muted-foreground">Strategy: {draft.strategyReason}</p>
      ) : null}

      {/* Actions */}
      {canEdit && !editing ? (
        <div className="flex flex-wrap items-center gap-2">
          {draft.subject ? (
            <>
              <Button size="sm" variant="outline" onClick={() => setEditing(true)}>
                Edit
              </Button>
              <Button
                size="sm"
                variant="outline"
                onClick={() => {
                  void navigator.clipboard
                    .writeText(`Subject: ${draft.subject}\n\n${draft.body}`)
                    .then(() => toast.success("Copied to clipboard."))
                    .catch(() => toast.error("Could not copy."));
                }}
              >
                Copy
              </Button>
            </>
          ) : null}
          <Button
            size="sm"
            variant="outline"
            disabled={pending}
            onClick={() => runAction(() => regenerateDraftAction(clinicId))}
          >
            {pending ? "Working…" : "Regenerate"}
          </Button>
          {canApprove && (draft.status === "GENERATED" || draft.status === "EDITED") ? (
            <Button size="sm" disabled={pending} onClick={() => runAction(() => approveDraftAction(draft.id))}>
              Approve
            </Button>
          ) : null}
          {draft.status === "GENERATED" || draft.status === "EDITED" ? (
            <Button
              size="sm"
              variant="ghost"
              disabled={pending}
              onClick={() => {
                const reason = window.prompt("Reason for rejecting this draft:");
                if (!reason) return;
                runAction(() => rejectDraftAction(draft.id, reason));
              }}
            >
              Reject
            </Button>
          ) : null}
        </div>
      ) : null}

      {/* Evidence used */}
      {draft.evidence.length > 0 ? (
        <div className="space-y-2">
          <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
            Evidence used ({draft.evidence.length})
          </p>
          <ul className="space-y-2">
            {draft.evidence.map((e, i) => (
              <li key={`${e.code}-${i}`} className="rounded-md border p-2 text-sm">
                <p>{e.claim}</p>
                <div className="mt-1 flex flex-wrap items-center gap-2">
                  <Badge tone="neutral">{FINDING_CATEGORY_LABELS[e.category]}</Badge>
                  <Badge tone={CONFIDENCE_TONES[e.confidence]}>{CONFIDENCE_LABELS[e.confidence]}</Badge>
                  <Badge tone={e.isFact ? "success" : "neutral"}>{e.isFact ? "Fact" : "Inference"}</Badge>
                  <SourceLink href={e.sourceUrl} />
                </div>
              </li>
            ))}
          </ul>
        </div>
      ) : null}

      {/* Version history */}
      {versions.length > 0 ? (
        <div className="space-y-2">
          <button
            type="button"
            className="text-xs font-medium text-primary hover:underline"
            onClick={() => setShowVersions((v) => !v)}
          >
            {showVersions ? "Hide" : "Show"} version history ({versions.length})
          </button>
          {showVersions ? (
            <ul className="space-y-2">
              {versions.map((v) => (
                <li key={v.id} className="rounded-md border p-3 text-sm">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <span className="font-medium">
                      v{v.version} · {v.changeType} · {STATUS_LABELS[v.status]}
                    </span>
                    <span className="text-xs text-muted-foreground">
                      {v.createdByName ?? "System"} · {formatDateTime(v.createdAt)}
                    </span>
                  </div>
                  {v.reason ? <p className="text-xs text-muted-foreground">{v.reason}</p> : null}
                  <details className="mt-1">
                    <summary className="cursor-pointer text-xs text-muted-foreground">Preview</summary>
                    <p className="mt-1 text-xs">
                      <span className="text-muted-foreground">Subject: </span>
                      {v.subject}
                    </p>
                    <p className="mt-1 whitespace-pre-wrap text-xs">{v.body}</p>
                  </details>
                  {canEdit ? (
                    <Button
                      className="mt-2"
                      size="sm"
                      variant="outline"
                      disabled={pending}
                      onClick={() => runAction(() => restoreDraftVersionAction(v.id))}
                    >
                      Restore this version
                    </Button>
                  ) : null}
                </li>
              ))}
            </ul>
          ) : null}
        </div>
      ) : null}

      <p className="text-xs text-muted-foreground">
        {draft.aiProvider ?? "provider"} · {draft.aiModel ?? aiModel} · prompt {draft.promptVersion ?? "n/a"} ·
        generated {formatDateTime(draft.generatedAt)}
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
      className="space-y-3 rounded-md border p-3"
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
      <div className="space-y-1">
        <label className="text-xs text-muted-foreground" htmlFor="draft-subject">
          Subject
        </label>
        <Input id="draft-subject" name="subject" value={subject} onChange={(e) => setSubject(e.target.value)} />
      </div>
      <div className="space-y-1">
        <label className="text-xs text-muted-foreground" htmlFor="draft-body">
          Body
        </label>
        <Textarea id="draft-body" name="body" rows={8} value={body} onChange={(e) => setBody(e.target.value)} />
      </div>
      <div className="flex items-center gap-2">
        <Button type="submit" size="sm" disabled={pending}>
          {pending ? "Saving…" : "Save"}
        </Button>
        <Button type="button" size="sm" variant="ghost" onClick={onDone}>
          Cancel
        </Button>
      </div>
    </form>
  );
}
