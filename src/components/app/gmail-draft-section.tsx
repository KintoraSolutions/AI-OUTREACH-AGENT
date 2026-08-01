"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { toast } from "sonner";
import { Mail, ExternalLink, ShieldCheck } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { createGmailDraftAction } from "@/app/(dashboard)/leads/draft-actions";
import type { GmailDraftView } from "@/lib/integrations/gmail";

const GMAIL_DRAFTS_URL = "https://mail.google.com/mail/u/0/#drafts";

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
    start(async () => {
      const res = await createGmailDraftAction(draftId);
      if (res.ok) {
        toast.success(res.message ?? "Gmail draft created.");
        setOpen(false);
        router.refresh();
      } else {
        toast.error(res.error ?? "Could not create the Gmail draft.");
      }
    });
  }

  return (
    <div className="rounded-md border p-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex items-center gap-2 text-sm font-medium">
          <Mail className="h-4 w-4" /> Gmail draft
        </div>
        {created ? (
          <Badge tone="success">Created</Badge>
        ) : gmailDraft && gmailDraft.status === "FAILED" ? (
          <Badge tone="danger">Failed</Badge>
        ) : null}
      </div>

      {created ? (
        <div className="mt-2 space-y-2 text-sm">
          <p className="text-muted-foreground">
            A Gmail draft was created{created.connectionEmail ? ` in ${created.connectionEmail}` : ""} for{" "}
            {created.recipientEmail}. Review and send it from Gmail. Nothing is sent automatically.
          </p>
          <a
            href={GMAIL_DRAFTS_URL}
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex items-center gap-1 text-xs text-primary hover:underline"
          >
            Open Gmail drafts <ExternalLink className="size-3" />
          </a>
        </div>
      ) : !isApproved ? (
        <p className="mt-2 text-sm text-muted-foreground">
          Approve the draft to create a Gmail draft.
        </p>
      ) : !googleConfigured ? (
        <p className="mt-2 text-sm text-muted-foreground">
          Gmail integration is not configured on this server.
        </p>
      ) : !gmailConnected ? (
        <p className="mt-2 text-sm text-muted-foreground">
          Connect a Google account with Gmail access in{" "}
          <Link href="/settings" className="text-primary hover:underline">
            Settings
          </Link>{" "}
          to create a Gmail draft.
        </p>
      ) : (
        <div className="mt-2 space-y-2">
          {gmailDraft && gmailDraft.status === "FAILED" && gmailDraft.error ? (
            <p className="text-xs text-red-600">Last attempt failed: {gmailDraft.error}</p>
          ) : null}
          <p className="text-sm text-muted-foreground">
            Creates a draft in Gmail for you to review and send. No email is sent automatically.
          </p>
          {canCreate ? (
            <Dialog open={open} onOpenChange={setOpen}>
              <DialogTrigger asChild>
                <Button size="sm" disabled={pending}>
                  <Mail className="mr-1.5 h-4 w-4" /> Create Gmail draft
                </Button>
              </DialogTrigger>
              <DialogContent className="max-w-lg">
                <DialogHeader>
                  <DialogTitle>Review before creating the Gmail draft</DialogTitle>
                </DialogHeader>
                <div className="space-y-3 text-sm">
                  <div className="grid grid-cols-[64px_1fr] gap-1">
                    <span className="text-muted-foreground">From</span>
                    <span className="flex items-center gap-1">
                      <ShieldCheck className="h-3.5 w-3.5 text-emerald-600" />
                      {senderEmail ?? "your connected account"}
                    </span>
                    <span className="text-muted-foreground">To</span>
                    <span>
                      {recipientName ? `${recipientName}, ` : ""}
                      {recipientEmail}
                    </span>
                    <span className="text-muted-foreground">Subject</span>
                    <span className="font-medium">{subject}</span>
                  </div>
                  <div className="max-h-56 overflow-auto whitespace-pre-wrap rounded-md border bg-muted/30 p-2 text-sm">
                    {body}
                  </div>
                  <p className="text-xs text-muted-foreground">
                    This creates a Gmail draft only. It will not be sent.
                  </p>
                </div>
                <DialogFooter>
                  <Button size="sm" onClick={create} disabled={pending}>
                    {pending ? "Creating…" : "Create Gmail draft"}
                  </Button>
                </DialogFooter>
              </DialogContent>
            </Dialog>
          ) : (
            <p className="text-xs text-muted-foreground">
              You do not have permission to create Gmail drafts.
            </p>
          )}
        </div>
      )}
    </div>
  );
}
