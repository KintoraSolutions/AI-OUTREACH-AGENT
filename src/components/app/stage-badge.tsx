import { PipelineStage } from "@prisma/client";
import { Badge } from "@/components/ui/badge";
import { STAGE_LABELS, STAGE_TONES } from "@/lib/leads/constants";

export function StageBadge({ stage }: { stage: PipelineStage }) {
  return <Badge tone={STAGE_TONES[stage]}>{STAGE_LABELS[stage]}</Badge>;
}
