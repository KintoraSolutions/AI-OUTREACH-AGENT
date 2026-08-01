"use client";

import { useActionState, useEffect, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { RecommendedService } from "@prisma/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { Field } from "@/components/ui/field";
import { SubmitButton } from "@/components/app/submit-button";
import { SERVICE_LABELS } from "@/lib/leads/constants";
import { initialFormState } from "@/lib/actions/form";
import {
  clearScoreOverride,
  overrideScore,
  recalculateClinicScore,
} from "@/app/(dashboard)/leads/audit-actions";

export function RecalcButton({ clinicId }: { clinicId: string }) {
  const [pending, start] = useTransition();
  const router = useRouter();
  return (
    <Button
      variant="outline"
      size="sm"
      disabled={pending}
      onClick={() =>
        start(async () => {
          const res = await recalculateClinicScore(clinicId);
          if (res.ok) {
            toast.success(res.message ?? "Recalculated.");
            router.refresh();
          } else toast.error(res.error ?? "Could not recalculate.");
        })
      }
    >
      {pending ? "Recalculating…" : "Recalculate"}
    </Button>
  );
}

export function ClearOverrideButton({ clinicId }: { clinicId: string }) {
  const [pending, start] = useTransition();
  const router = useRouter();
  return (
    <Button
      variant="ghost"
      size="sm"
      disabled={pending}
      onClick={() => {
        const reason = window.prompt("Reason for clearing the override:");
        if (!reason) return;
        start(async () => {
          const res = await clearScoreOverride(clinicId, reason);
          if (res.ok) {
            toast.success(res.message ?? "Override cleared.");
            router.refresh();
          } else toast.error(res.error ?? "Could not clear override.");
        });
      }}
    >
      Clear override
    </Button>
  );
}

export function ScoreOverrideForm({ clinicId }: { clinicId: string }) {
  const [state, formAction] = useActionState(overrideScore, initialFormState);
  const [open, setOpen] = useState(false);
  const router = useRouter();
  const err = state.fieldErrors ?? {};

  useEffect(() => {
    if (state.ok) {
      toast.success(state.message ?? "Override applied.");
      setOpen(false);
      router.refresh();
    } else if (state.error) toast.error(state.error);
  }, [state, router]);

  if (!open) {
    return (
      <Button variant="outline" size="sm" onClick={() => setOpen(true)}>
        Override
      </Button>
    );
  }

  return (
    <form action={formAction} className="w-full space-y-3 rounded-md border p-3">
      <input type="hidden" name="clinicId" value={clinicId} />
      <p className="text-sm font-medium">Override score / recommendation</p>
      <div className="grid gap-3 sm:grid-cols-2">
        <Field label="Override overall (0-100)" htmlFor="overrideOverall" error={err.overrideOverall}>
          <Input id="overrideOverall" name="overrideOverall" type="number" min={0} max={100} placeholder="e.g. 72" />
        </Field>
        <Field label="Override service" htmlFor="overrideService" error={err.overrideService}>
          <Select id="overrideService" name="overrideService" defaultValue="">
            <option value="">Keep recommended</option>
            {Object.values(RecommendedService).map((s) => (
              <option key={s} value={s}>
                {SERVICE_LABELS[s]}
              </option>
            ))}
          </Select>
        </Field>
      </div>
      <Field label="Reason" htmlFor="overrideReason" required error={err.reason}>
        <Textarea id="overrideReason" name="reason" rows={2} required placeholder="Why is a manual override warranted?" />
      </Field>
      <div className="flex items-center gap-2">
        <SubmitButton size="sm" pendingText="Saving…">Save override</SubmitButton>
        <Button type="button" size="sm" variant="ghost" onClick={() => setOpen(false)}>
          Cancel
        </Button>
      </div>
    </form>
  );
}
