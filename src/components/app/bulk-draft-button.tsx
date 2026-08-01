"use client";

import { useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { bulkGenerateDraftsAction } from "@/app/(dashboard)/leads/draft-actions";

/**
 * Start a durable bulk-drafting job for a campaign's qualified leads (scored with
 * an effective service other than None, not do-not-contact). Progress is tracked
 * on the Jobs page.
 */
export function BulkDraftButton({
  campaignId,
  disabled,
}: {
  campaignId: string;
  disabled?: boolean;
}) {
  const [pending, start] = useTransition();
  const router = useRouter();
  return (
    <Button
      variant="outline"
      size="sm"
      disabled={pending || disabled}
      title={disabled ? "AI drafting is not configured (set ANTHROPIC_API_KEY)." : undefined}
      onClick={() =>
        start(async () => {
          const res = await bulkGenerateDraftsAction(campaignId);
          if (res.ok) {
            toast.success(res.message ?? "Bulk drafting started.");
            router.refresh();
          } else toast.error(res.error ?? "Could not start drafting.");
        })
      }
    >
      {pending ? "Starting…" : "Draft emails"}
    </Button>
  );
}
