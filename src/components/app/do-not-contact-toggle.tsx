"use client";

import { useState, useTransition } from "react";
import { toast } from "sonner";
import { Checkbox } from "@/components/ui/checkbox";
import { setDoNotContact } from "@/app/(dashboard)/leads/actions";

export function DoNotContactToggle({
  clinicId,
  value,
  disabled,
}: {
  clinicId: string;
  value: boolean;
  disabled?: boolean;
}) {
  const [checked, setChecked] = useState(value);
  const [pending, startTransition] = useTransition();

  function onToggle(next: boolean) {
    setChecked(next);
    startTransition(async () => {
      try {
        await setDoNotContact(clinicId, next);
        toast.success(next ? "Marked do-not-contact." : "Cleared do-not-contact.");
      } catch {
        setChecked(!next);
        toast.error("Could not update.");
      }
    });
  }

  return (
    <label className="flex items-center gap-2 text-sm">
      <Checkbox
        checked={checked}
        disabled={disabled || pending}
        onChange={(e) => onToggle(e.target.checked)}
      />
      Do not contact
    </label>
  );
}
