"use client";

import { useTransition } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { acknowledgeCompliance } from "@/app/(dashboard)/settings/actions";

export function ComplianceAck({ canEdit }: { canEdit: boolean }) {
  const [pending, startTransition] = useTransition();
  if (!canEdit) return null;
  return (
    <Button
      size="sm"
      variant="outline"
      disabled={pending}
      onClick={() =>
        startTransition(async () => {
          try {
            await acknowledgeCompliance();
            toast.success("Acknowledged.");
          } catch {
            toast.error("Could not save acknowledgement.");
          }
        })
      }
    >
      {pending ? "Saving..." : "Acknowledge"}
    </Button>
  );
}
