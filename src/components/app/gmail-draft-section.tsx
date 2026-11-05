"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { toast } from "sonner";
import { Mail, ExternalLink, ShieldCheck, AlertTriangle, CheckCircle2, Lock } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Spinner } from "@/components/ui/spinner";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { createGmailDraftAction } from "@/app/(dashboard)/leads/draft-actions";
import type { GmailDraftView } from "@/lib/integrations/gmail";
import { GMAIL_DRAFTS_URL } from "@/lib/integrations/gmail-web";

/**
 * Approved-draft → Gmail draft creation. Shows the exact recipient, subject,
 * sender, and final body for review before creating a DRAFT only. There is no
 * "send" control anywhere: the email is created in Gmail for the user to send.
 */
export function GmailDraftSection({
  draftId,
  isApproved,
  currentVersion,
  recipientName,
  recipientEmail,
  subject,
  body,
  senderEmail,
  googleConfigured,
  gmailConnected,
  gmailDraft,
  canCreate,
}: {
  draftId: string;
  isApproved: boolean;
  currentVersion: number;
  recipientName: string | null;
  recipientEmail: string | null;
  subject: string;
  body: string;
  senderEmail: string | null;
  googleConfigured: boolean;
  gmailConnected: boolean;
  gmailDraft: GmailDraftView | null;
  canCreate: boolean;
}) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [open, setOpen] = useState(false);

  // An up-to-date Gmail draft already exists for the current approved version.
  const created =
    gmailDraft && gmailDraft.status === "CREATED" && gmailDraft.sourceVersion === currentVersion
      ? gmailDraft
      : null;

  // Only relevant once approved (or when a Gmail draft already exists).
  if (!isApproved && !gmailDraft) return null;

  function create() {
    // Open the Gmail drafts tab synchronously, inside this click gesture, so the
    // browser does not treat it as a blocked pop-up. If creation fails, close it.
    const gmailTab = window.open(GMAIL_DRAFTS_URL, "_blank");
    start(async () => {
      const res = await createGmailDraftAction(draftId);
      if (res.ok) {
        toast.success(res.message ?? "Gmail draft created.");
        setOpen(false);
        router.refresh();
      } else {
        gmailTab?.close();
        toast.error(res.error ?? "Could not create the Gmail draft.");
      }
    });
  }

  return (
    <section
      aria-labelledby="gmail-draft-heading"
      className="rounded-md border border-[var(--fl-stroke-2)] bg-[var(--fl-bg-1)] p-4 shadow-2"
    >
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h4
          id="gmail-draft-heading"
          className="flex items-center gap-2 text-body1 font-semibold text-[var(--fl-fg-1)]"
        >
          <Mail aria-hidden="true" className="size-4 text-[var(--fl-brand-text)]" />
          Gmail draft
        </h4>
        {created ? (
          <Badge tone="success">
            <CheckCircle2 aria-hidden="true" className="size-3" />
            Created
          </Badge>
        ) : gmailDraft && gmailDraft.status === "FAILED" ? (
          <Badge tone="danger">
            <AlertTriangle aria-hidden="true" className="size-3" />
            Failed
          </Badge>
        ) : null}
      </div>

      {created ? (
        <div className="mt-3 space-y-2">
          <p className="text-body1 leading-relaxed text-[var(--fl-fg-2)]">
            A Gmail draft was created
            {created.connectionEmail ? ` in ${created.connectionEmail}` : ""} for{" "}
            <span className="font-semibold text-[var(--fl-fg-1)]">{created.recipientEmail}</span>.
            Review and send it from Gmail. Nothing is sent automatically.
          </p>
          <a
            href={GMAIL_DRAFTS_URL}
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex items-center gap-1 rounded-sm text-caption1 font-semibold text-[var(--fl-brand-text)] hover:underline"
          >
            Open Gmail drafts
            <ExternalLink aria-hidden="true" className="size-3" />
          </a>
        </div>
      ) : !isApproved ? (
        <p className="mt-3 text-body1 text-[var(--fl-fg-2)]">
          Approve the draft to create a Gmail draft.
        </p>
      ) : !googleConfigured ? (
        <p className="mt-3 text-body1 text-[var(--fl-fg-2)]">
          Gmail integration is not configured on this server.
        </p>
      ) : !gmailConnected ? (
        <p className="mt-3 text-body1 text-[var(--fl-fg-2)]">
          Connect a Google account with Gmail access in{" "}
          <Link
            href="/settings"
            className="rounded-sm font-semibold text-[var(--fl-brand-text)] hover:underline"
          >
            Settings
          </Link>{" "}
          to create a Gmail draft.
        </p>
      ) : (
        <div className="mt-3 space-y-3">
          {gmailDraft && gmailDraft.status === "FAILED" && gmailDraft.error ? (
            <Alert variant="destructive">
              <AlertTriangle aria-hidden="true" />
              <AlertTitle>Last attempt failed</AlertTitle>
              <AlertDescription>{gmailDraft.error}</AlertDescription>
            </Alert>
          ) : null}
          <p className="text-body1 leading-relaxed text-[var(--fl-fg-2)]">
            Creates a draft in Gmail for you to review and send. No email is sent automatically.
          </p>
          {canCreate ? (
            <Dialog open={open} onOpenChange={setOpen}>
              <DialogTrigger asChild>
                <Button size="sm" disabled={pending}>
                  <Mail aria-hidden="true" />
                  Create Gmail draft
                </Button>
              </DialogTrigger>
              <DialogContent className="max-w-lg">
                <DialogHeader>
                  <DialogTitle>Review before creating the Gmail draft</DialogTitle>
                  <DialogDescription>
                    This creates a draft in your Gmail account. It is not sent.
                  </DialogDescription>
                </DialogHeader>

                <dl className="grid grid-cols-[72px_1fr] gap-x-3 gap-y-1.5 text-body1">
                  <dt className="text-[var(--fl-fg-3)]">From</dt>
                  <dd className="flex items-center gap-1.5 text-[var(--fl-fg-1)]">
                    <ShieldCheck
                      aria-hidden="true"
                      className="size-4 shrink-0 text-[var(--fl-success-fg)]"
                    />
                    {senderEmail ?? "your connected account"}
                  </dd>
                  <dt className="text-[var(--fl-fg-3)]">To</dt>
                  <dd className="text-[var(--fl-fg-1)]">
                    {recipientName ? `${recipientName}, ` : ""}
                    {recipientEmail}
                  </dd>
                  <dt className="text-[var(--fl-fg-3)]">Subject</dt>
                  <dd className="font-semibold text-[var(--fl-fg-1)]">{subject}</dd>
                </dl>

                <div className="max-h-56 overflow-auto whitespace-pre-wrap rounded-md border border-[var(--fl-stroke-2)] bg-[var(--fl-bg-2)] p-3 text-body1 leading-relaxed text-[var(--fl-fg-1)]">
                  {body}
                </div>

                <p className="flex items-center gap-1.5 text-caption1 text-[var(--fl-fg-3)]">
                  <Lock aria-hidden="true" className="size-3.5 shrink-0" />
                  This creates a Gmail draft only. It will not be sent.
                </p>

                <DialogFooter>
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => setOpen(false)}
                    disabled={pending}
                  >
                    Cancel
                  </Button>
                  <Button size="sm" onClick={create} disabled={pending}>
                    {pending ? (
                      <Spinner size="xs" label="Creating Gmail draft" />
                    ) : (
                      <Mail aria-hidden="true" />
                    )}
                    {pending ? "Creating…" : "Create Gmail draft"}
                  </Button>
                </DialogFooter>
              </DialogContent>
            </Dialog>
          ) : (
            <p className="text-caption1 text-[var(--fl-fg-3)]">
              You do not have permission to create Gmail drafts.
            </p>
          )}
        </div>
      )}
    </section>
  );
}
