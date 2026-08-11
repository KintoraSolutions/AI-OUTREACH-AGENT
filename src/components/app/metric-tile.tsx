import * as React from "react";
import type { LucideIcon } from "lucide-react";
import { cn } from "@/lib/utils";

interface MetricTileProps {
  label: string;
  value: number | string;
  hint?: string;
  icon?: LucideIcon;
  /** Highlight the value in mint (reserved for a few important metrics). */
  accent?: boolean;
}

export function MetricTile({ label, value, hint, icon: Icon, accent }: MetricTileProps) {
  return (
    <div className="glass flex min-h-[92px] items-center justify-between gap-3 rounded-[7px] px-4 py-3.5">
      <div className="min-w-0">
        <p className="text-[11px] font-medium uppercase tracking-[0.03em] text-muted-foreground">
          {label}
        </p>
        <p
          className={cn(
            "mt-1.5 text-[30px] font-semibold leading-none tabular-nums",
            accent ? "text-[var(--mint)]" : "text-foreground",
          )}
        >
          {value}
        </p>
        {hint ? <p className="mt-1.5 text-[12.5px] text-muted-foreground">{hint}</p> : null}
      </div>
      {Icon ? (
        <Icon className="size-7 shrink-0 text-[var(--faint-foreground)]" strokeWidth={1.5} />
      ) : null}
    </div>
  );
}
