"use client";

import { useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { rescoreCampaign } from "@/app/(dashboard)/leads/audit-actions";

/** Recalculate every lead in a campaign against the current scoring rules. */
export function RescoreCampaignButton({ campaignId }: { campaignId: string }) {
  const [pending, start] = useTransition();
  const router = useRouter();
  return (
    <Button
      variant="outline"
      size="sm"
      disabled={pending}
      onClick={() =>
        start(async () => {
          const res = await rescoreCampaign(campaignId);
          if (res.ok) {
            toast.success(res.message ?? "Rescored.");
            router.refresh();
          } else toast.error(res.error ?? "Could not rescore.");
        })
      }
    >
      {pending ? "Rescoring…" : "Rescore leads"}
    </Button>
  );
}
