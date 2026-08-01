"use client";

import { useActionState, useEffect, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Confidence, FindingCategory } from "@prisma/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { Field } from "@/components/ui/field";
import { SubmitButton } from "@/components/app/submit-button";
import { CONFIDENCE_LABELS, FINDING_CATEGORY_LABELS } from "@/lib/leads/constants";
import { initialFormState } from "@/lib/actions/form";
import { addManualFinding, dismissFinding, restoreFinding } from "@/app/(dashboard)/leads/audit-actions";

export function FindingDismissButton({
  findingId,
  dismissed,
}: {
  findingId: string;
  dismissed: boolean;
}) {
  const [pending, start] = useTransition();
  const router = useRouter();
  return (
    <Button
      variant="ghost"
      size="sm"
      disabled={pending}
      onClick={() => {
        const reason = window.prompt(
          dismissed ? "Reason for restoring this finding:" : "Reason for dismissing this finding:",
        );
        if (!reason) return;
        start(async () => {
          const res = dismissed
            ? await restoreFinding(findingId, reason)
            : await dismissFinding(findingId, reason);
          if (res.ok) {
            toast.success(res.message ?? "Updated.");
            router.refresh();
          } else toast.error(res.error ?? "Could not update finding.");
        });
      }}
    >
      {dismissed ? "Restore" : "Dismiss"}
    </Button>
  );
}

export function AddFindingForm({ clinicId }: { clinicId: string }) {
  const [state, formAction] = useActionState(addManualFinding, initialFormState);
  const [open, setOpen] = useState(false);
  const router = useRouter();
  const err = state.fieldErrors ?? {};

  useEffect(() => {
    if (state.ok) {
      toast.success(state.message ?? "Finding added.");
      setOpen(false);
      router.refresh();
    } else if (state.error) toast.error(state.error);
  }, [state, router]);

  if (!open) {
    return (
      <Button variant="outline" size="sm" onClick={() => setOpen(true)}>
        Add manual finding
      </Button>
    );
  }

  return (
    <form action={formAction} className="space-y-3 rounded-md border p-3">
      <input type="hidden" name="clinicId" value={clinicId} />
      <p className="text-sm font-medium">Add a manual finding</p>
      <div className="grid gap-3 sm:grid-cols-2">
        <Field label="Category" htmlFor="mf-category" required error={err.category}>
          <Select id="mf-category" name="category" defaultValue={FindingCategory.WEBSITE}>
            {Object.values(FindingCategory).map((c) => (
              <option key={c} value={c}>
                {FINDING_CATEGORY_LABELS[c]}
              </option>
            ))}
          </Select>
        </Field>
        <Field label="Confidence" htmlFor="mf-confidence" required error={err.confidence}>
          <Select id="mf-confidence" name="confidence" defaultValue={Confidence.STRONG_INFERENCE}>
            {Object.values(Confidence).map((c) => (
              <option key={c} value={c}>
                {CONFIDENCE_LABELS[c]}
              </option>
            ))}
          </Select>
        </Field>
      </div>
      <Field label="Finding" htmlFor="mf-finding" required error={err.finding}>
        <Input id="mf-finding" name="finding" required maxLength={300} placeholder="Neutral observation" />
      </Field>
      <Field label="Evidence" htmlFor="mf-evidence" required error={err.evidence}>
        <Textarea id="mf-evidence" name="evidence" rows={2} required placeholder="What supports this finding" />
      </Field>
      <div className="grid gap-3 sm:grid-cols-2">
        <Field label="Source URL" htmlFor="mf-source" error={err.sourceUrl}>
          <Input id="mf-source" name="sourceUrl" type="url" placeholder="https://…" />
        </Field>
        <Field label="Points (0-30)" htmlFor="mf-points" required error={err.points}>
          <Input id="mf-points" name="points" type="number" min={0} max={30} defaultValue={3} required />
        </Field>
      </div>
      <Field label="Reason (audit log)" htmlFor="mf-reason" required error={err.reason}>
        <Input id="mf-reason" name="reason" required maxLength={500} placeholder="Why add this finding" />
      </Field>
      <div className="flex items-center gap-2">
        <SubmitButton size="sm" pendingText="Adding…">Add finding</SubmitButton>
        <Button type="button" size="sm" variant="ghost" onClick={() => setOpen(false)}>
          Cancel
        </Button>
      </div>
    </form>
  );
}
