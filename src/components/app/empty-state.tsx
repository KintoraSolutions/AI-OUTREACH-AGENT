import * as React from "react";
import type { LucideIcon } from "lucide-react";

interface EmptyStateProps {
  icon?: LucideIcon;
  title: string;
  description?: string;
  action?: React.ReactNode;
}

export function EmptyState({ icon: Icon, title, description, action }: EmptyStateProps) {
  return (
    <div className="glass flex flex-col items-center justify-center gap-3 rounded-[10px] px-6 py-16 text-center">
      {Icon ? (
        <div className="flex size-12 items-center justify-center rounded-[10px] bg-[var(--mint-dim)] text-[var(--mint)]">
          <Icon className="size-6" strokeWidth={1.75} />
        </div>
      ) : null}
      <div className="space-y-1">
        <p className="text-[15px] font-semibold tracking-[-0.01em]">{title}</p>
        {description ? (
          <p className="mx-auto max-w-sm text-[14px] text-muted-foreground">{description}</p>
        ) : null}
      </div>
      {action ? <div className="mt-2">{action}</div> : null}
    </div>
  );
}
