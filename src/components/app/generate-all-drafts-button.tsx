"use client";

import { useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Sparkles } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Spinner } from "@/components/ui/spinner";
import { bulkGenerateAllDraftsAction } from "@/app/(dashboard)/leads/draft-actions";

/**
 * Starts an org-wide bulk drafting job for every qualified lead that has no
 * draft yet. Idempotent by construction, so the label says "missing" rather
 * than "all" once some drafts exist — pressing it never regenerates work that
 * is already in the queue.
 */
export function GenerateAllDraftsButton({
  count,
  disabled,
  disabledReason,
}: {
  count: number;
  disabled?: boolean;
  disabledReason?: string;
}) {
  const [pending, start] = useTransition();
  const router = useRouter();

  if (count === 0) return null;

  return (
    <Button
      disabled={pending || disabled}
      title={disabled ? disabledReason : undefined}
      onClick={() =>
        start(async () => {
          const res = await bulkGenerateAllDraftsAction();
          if (res.ok) {
            toast.success(res.message ?? "Drafting started.");
            router.refresh();
          } else toast.error(res.error ?? "Could not start drafting.");
        })
      }
    >
      {pending ? (
        <Spinner size="xs" label="Starting bulk drafting" />
      ) : (
        <Sparkles aria-hidden="true" />
      )}
      {pending ? "Starting…" : `Generate ${count} draft${count === 1 ? "" : "s"}`}
    </Button>
  );
}
