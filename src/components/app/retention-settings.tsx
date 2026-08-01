"use client";

import { useActionState, useEffect, useState, useTransition } from "react";
import { toast } from "sonner";
import { Loader2 } from "lucide-react";
import { Input } from "@/components/ui/input";
import { Field } from "@/components/ui/field";
import { Button } from "@/components/ui/button";
import { SubmitButton } from "@/components/app/submit-button";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { initialFormState, type FormState } from "@/lib/actions/form";
import {
  updateRetentionAction,
  retentionDryRunAction,
  retentionPurgeAction,
} from "@/app/(dashboard)/settings/retention-actions";

export interface RetentionRunRow {
  id: string;
  status: "DRY_RUN" | "COMPLETED" | "FAILED";
  dryRun: boolean;
  clinicsPurged: number;
  jobsPurged: number;
  protectedSkipped: number;
  message: string | null;
  actorName: string | null;
  startedAt: string;
}

const STATUS_LABEL: Record<RetentionRunRow["status"], string> = {
  DRY_RUN: "Dry run",
  COMPLETED: "Completed",
  FAILED: "Failed",
};

export function RetentionSettings({
  canEdit,
  retentionDays,
  runs,
}: {
  canEdit: boolean;
  retentionDays: number;
  runs: RetentionRunRow[];
}) {
  const [state, formAction] = useActionState<FormState, FormData>(updateRetentionAction, initialFormState);
  const [pending, startTransition] = useTransition();
  const [confirming, setConfirming] = useState(false);
  const err = state.fieldErrors ?? {};

  useEffect(() => {
    if (state.ok && state.message) toast.success(state.message);
    else if (state.error) toast.error(state.error);
  }, [state]);

  function runAction(fn: () => Promise<FormState>, doneLabel: string) {
    startTransition(async () => {
      try {
        const res = await fn();
        if (res.ok) toast.success(res.message ?? doneLabel);
        else toast.error(res.error ?? "Action failed.");
      } catch {
        toast.error("Action failed.");
      } finally {
        setConfirming(false);
      }
    });
  }

  return (
    <div className="space-y-6">
      <div>
        <p className="text-sm text-muted-foreground">
          Stale, unengaged research data older than the retention window is eligible for automatic
          purge. Engaged records are always protected: leads that are contacted, replied, meeting
          booked, marked do-not-contact, or have an approved draft, a created Gmail draft, or a
          pending follow-up are never purged. Set the window to <span className="font-medium">0</span>{" "}
          to disable retention entirely.
        </p>
      </div>

      {!canEdit ? (
        <Alert variant="warning">
          <AlertDescription>
            You have read-only access. Only Admins and Owners can change retention or run a purge.
          </AlertDescription>
        </Alert>
      ) : null}

      <form action={formAction} className="flex flex-wrap items-end gap-3">
        <fieldset disabled={!canEdit} className="flex flex-wrap items-end gap-3">
          <Field label="Retention window (days)" htmlFor="retentionDays" error={err.retentionDays}>
            <Input
              id="retentionDays"
              name="retentionDays"
              type="number"
              min={0}
              max={3650}
              defaultValue={retentionDays}
              className="w-40"
            />
          </Field>
          {canEdit ? <SubmitButton pendingText="Saving...">Save retention</SubmitButton> : null}
        </fieldset>
      </form>

      {canEdit ? (
        <div className="flex flex-wrap items-center gap-2 border-t pt-4">
          <Button
            variant="outline"
            size="sm"
            disabled={pending}
            onClick={() => runAction(retentionDryRunAction, "Dry run complete.")}
          >
            {pending ? <Loader2 className="size-4 animate-spin" /> : null}
            Preview purge (dry run)
          </Button>
          {confirming ? (
            <>
              <span className="text-sm text-muted-foreground">
                Permanently delete eligible stale data?
              </span>
              <Button
                variant="destructive"
                size="sm"
                disabled={pending}
                onClick={() => runAction(retentionPurgeAction, "Purge complete.")}
              >
                {pending ? <Loader2 className="size-4 animate-spin" /> : null}
                Confirm purge
              </Button>
              <Button variant="ghost" size="sm" disabled={pending} onClick={() => setConfirming(false)}>
                Cancel
              </Button>
            </>
          ) : (
            <Button variant="outline" size="sm" disabled={pending} onClick={() => setConfirming(true)}>
              Purge now
            </Button>
          )}
        </div>
      ) : null}

      <div className="space-y-2">
        <h3 className="text-sm font-semibold">Recent retention runs</h3>
        {runs.length === 0 ? (
          <p className="text-sm text-muted-foreground">No retention runs yet.</p>
        ) : (
          <div className="overflow-x-auto rounded-md border">
            <table className="w-full text-sm">
              <thead className="bg-muted/40 text-left text-xs text-muted-foreground">
                <tr>
                  <th className="px-3 py-2 font-medium">When</th>
                  <th className="px-3 py-2 font-medium">Type</th>
                  <th className="px-3 py-2 text-right font-medium">Leads</th>
                  <th className="px-3 py-2 text-right font-medium">Jobs</th>
                  <th className="px-3 py-2 text-right font-medium">Protected</th>
                  <th className="px-3 py-2 font-medium">By</th>
                </tr>
              </thead>
              <tbody className="divide-y">
                {runs.map((r) => (
                  <tr key={r.id}>
                    <td className="whitespace-nowrap px-3 py-2 text-muted-foreground">
                      {new Date(r.startedAt).toLocaleString(undefined, {
                        month: "short",
                        day: "numeric",
                        hour: "2-digit",
                        minute: "2-digit",
                      })}
                    </td>
                    <td className="px-3 py-2">
                      {STATUS_LABEL[r.status]}
                      {r.dryRun && r.status !== "DRY_RUN" ? " (dry)" : ""}
                    </td>
                    <td className="px-3 py-2 text-right tabular-nums">{r.clinicsPurged}</td>
                    <td className="px-3 py-2 text-right tabular-nums">{r.jobsPurged}</td>
                    <td className="px-3 py-2 text-right tabular-nums">{r.protectedSkipped}</td>
                    <td className="px-3 py-2 text-muted-foreground">{r.actorName ?? "System"}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}
