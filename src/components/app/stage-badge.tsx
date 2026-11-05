import { PipelineStage } from "@prisma/client";
import { Badge } from "@/components/ui/badge";
import { STAGE_LABELS, STAGE_TONES } from "@/lib/leads/constants";
import { cn } from "@/lib/utils";

/**
 * Fluent badge geometry, layered over the Badge primitive's tone colors.
 *
 * The primitive still ships the old signature (10.5px uppercase mono, 0.08em
 * tracking) which reads as a terminal readout rather than as Microsoft, and is
 * hard to read at a glance. These classes win through tailwind-merge, so the
 * tone palette is reused without touching a primitive owned by another agent.
 */
export const FLUENT_BADGE_CLASS =
  "rounded-md px-2 py-0.5 font-sans text-caption1 font-semibold normal-case tracking-normal";

export function StageBadge({
  stage,
  className,
}: {
  stage: PipelineStage;
  className?: string;
}) {
  return (
    <Badge tone={STAGE_TONES[stage]} className={cn(FLUENT_BADGE_CLASS, className)}>
      {/* Decorative: the stage name beside it is what carries the meaning, so
          the badge never depends on hue alone. */}
      <span
        aria-hidden="true"
        className="size-1.5 shrink-0 rounded-full bg-current opacity-70 fl-keep-color"
      />
      {STAGE_LABELS[stage]}
    </Badge>
  );
}
