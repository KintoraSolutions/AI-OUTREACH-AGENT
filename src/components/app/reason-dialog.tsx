"use client";

import * as React from "react";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Field } from "@/components/ui/field";
import { Spinner } from "@/components/ui/spinner";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";

/**
 * Captures a required audit reason.
 *
 * Several actions in this app write an immutable `AuditLogEntry` and demand a
 * reason for it. Three of them collected that reason with a native
 * `window.prompt()` — unstyled, untranslatable, outside the app's focus
 * management, and impossible to mark up as a required field. This replaces
 * them with one dialog so every reason is captured the same way.
 *
 * The submit button stays disabled until the reason has real content, which
 * makes the requirement visible instead of failing on the server.
 */
export function ReasonDialog({
  open,
  onOpenChange,
  title,
  description,
  label,
  placeholder,
  confirmLabel,
  pendingLabel,
  pending,
  destructive,
  onConfirm,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  title: string;
  description?: string;
  label: string;
  placeholder?: string;
  confirmLabel: string;
  pendingLabel: string;
  pending?: boolean;
  destructive?: boolean;
  onConfirm: (reason: string) => void;
}) {
  const [reason, setReason] = React.useState("");
  const id = React.useId();
  const trimmed = reason.trim();

  // Clear between openings so a previous reason is never silently reused.
  React.useEffect(() => {
    if (!open) setReason("");
  }, [open]);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent
        onOpenAutoFocus={(e) => {
          e.preventDefault();
          document.getElementById(id)?.focus();
        }}
      >
        <DialogHeader>
          <DialogTitle>{title}</DialogTitle>
          {description ? <DialogDescription>{description}</DialogDescription> : null}
        </DialogHeader>

        <Field label={label} htmlFor={id} required hint="Recorded in the audit history.">
          <Textarea
            id={id}
            rows={3}
            value={reason}
            placeholder={placeholder}
            onChange={(e) => setReason(e.target.value)}
          />
        </Field>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={pending}>
            Cancel
          </Button>
          <Button
            variant={destructive ? "destructive" : "default"}
            disabled={pending || trimmed.length === 0}
            onClick={() => onConfirm(trimmed)}
          >
            {pending ? <Spinner size="xs" label={pendingLabel} /> : null}
            {pending ? pendingLabel : confirmLabel}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
