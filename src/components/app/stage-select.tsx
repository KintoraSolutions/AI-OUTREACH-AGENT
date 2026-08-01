"use client";

import { useState, useTransition } from "react";
import { toast } from "sonner";
import { PipelineStage } from "@prisma/client";
import { Select } from "@/components/ui/select";
import { STAGE_LABELS, STAGE_ORDER } from "@/lib/leads/constants";
import { setStage } from "@/app/(dashboard)/leads/actions";
import { cn } from "@/lib/utils";

interface StageSelectProps {
  clinicId: string;
  stage: PipelineStage;
  disabled?: boolean;
  className?: string;
}

export function StageSelect({ clinicId, stage, disabled, className }: StageSelectProps) {
  const [value, setValue] = useState<PipelineStage>(stage);
  const [pending, startTransition] = useTransition();

  function onChange(next: PipelineStage) {
    const prev = value;
    setValue(next);
    startTransition(async () => {
      try {
        await setStage(clinicId, next);
      } catch {
        setValue(prev);
        toast.error("Could not update stage.");
      }
    });
  }

  return (
    <Select
      aria-label="Stage"
      className={cn("h-8 text-xs", className)}
      value={value}
      disabled={disabled || pending}
      onChange={(e) => onChange(e.target.value as PipelineStage)}
    >
      {STAGE_ORDER.map((s) => (
        <option key={s} value={s}>
          {STAGE_LABELS[s]}
        </option>
      ))}
    </Select>
  );
}
