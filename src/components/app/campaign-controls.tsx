"use client";

import { useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { CampaignStatus } from "@prisma/client";
import { Play, Pause, RotateCcw, Ban, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import type { FormState } from "@/lib/actions/form";
import {
  cancelCampaign,
  deleteCampaign,
  pauseCampaign,
  resumeCampaign,
  runCampaign,
} from "@/app/(dashboard)/campaigns/actions";

interface CampaignControlsProps {
  campaignId: string;
  status: CampaignStatus;
  discoveryConfigured: boolean;
  canManage: boolean;
}

export function CampaignControls({
  campaignId,
  status,
  discoveryConfigured,
  canManage,
}: CampaignControlsProps) {
  const [pending, startTransition] = useTransition();
  const router = useRouter();

  if (!canManage) {
    return (
      <p className="text-xs text-muted-foreground">
        You need an Admin role to run or manage research for this campaign.
      </p>
    );
  }

  const run = (fn: (id: string) => Promise<FormState>) => () =>
    startTransition(async () => {
      const res = await fn(campaignId);
      if (res.ok) {
        toast.success(res.message ?? "Done.");
        router.refresh();
      } else {
        toast.error(res.error ?? "Something went wrong.");
      }
    });

  const remove = () =>
    startTransition(async () => {
      if (!window.confirm("Delete this campaign? Discovered leads are kept but unlinked.")) return;
      await deleteCampaign(campaignId);
    });

  const isRunning = status === CampaignStatus.RUNNING;
  const isPaused = status === CampaignStatus.PAUSED;
  const canRun = !isRunning && !isPaused;

  return (
    <div className="flex flex-wrap items-center gap-2">
      {canRun ? (
        <Button
          size="sm"
          onClick={run(runCampaign)}
          disabled={pending || !discoveryConfigured}
          title={
            discoveryConfigured
              ? undefined
              : "Set GOOGLE_PLACES_API_KEY to enable automated discovery."
          }
        >
          <Play />
          {status === CampaignStatus.DRAFT ? "Run research" : "Run again"}
        </Button>
      ) : null}

      {isRunning ? (
        <>
          <Button size="sm" variant="outline" onClick={run(pauseCampaign)} disabled={pending}>
            <Pause />
            Pause
          </Button>
          <Button size="sm" variant="outline" onClick={run(cancelCampaign)} disabled={pending}>
            <Ban />
            Cancel
          </Button>
        </>
      ) : null}

      {isPaused ? (
        <>
          <Button size="sm" onClick={run(resumeCampaign)} disabled={pending || !discoveryConfigured}>
            <RotateCcw />
            Resume
          </Button>
          <Button size="sm" variant="outline" onClick={run(cancelCampaign)} disabled={pending}>
            <Ban />
            Cancel
          </Button>
        </>
      ) : null}

      <Button
        size="sm"
        variant="ghost"
        className="text-destructive hover:text-destructive"
        onClick={remove}
        disabled={pending || isRunning}
      >
        <Trash2 />
        Delete
      </Button>
    </div>
  );
}
