import * as React from "react";
import { cva, type VariantProps } from "class-variance-authority";
import { cn } from "@/lib/utils";

const badgeVariants = cva(
  "inline-flex items-center gap-1 rounded-[5px] border px-2 py-0.5 font-mono text-[10.5px] font-medium uppercase tracking-[0.08em]",
  {
    variants: {
      tone: {
        neutral: "border-[var(--hairline-strong)] bg-[var(--surface-3)] text-muted-foreground",
        info: "border-[color-mix(in_srgb,var(--cyan)_35%,transparent)] bg-[var(--cyan-dim)] text-[var(--cyan-bright)]",
        progress:
          "border-[color-mix(in_srgb,var(--cyan)_35%,transparent)] bg-[var(--cyan-dim)] text-[var(--cyan-bright)]",
        success:
          "border-[color-mix(in_srgb,var(--mint)_35%,transparent)] bg-[var(--mint-dim)] text-[var(--mint-bright)]",
        warning:
          "border-[color-mix(in_srgb,var(--amber)_35%,transparent)] bg-[var(--amber-dim)] text-[var(--amber-bright)]",
        danger:
          "border-[color-mix(in_srgb,var(--red)_35%,transparent)] bg-[var(--red-dim)] text-[var(--red-bright)]",
      },
    },
    defaultVariants: {
      tone: "neutral",
    },
  },
);

export interface BadgeProps
  extends React.HTMLAttributes<HTMLSpanElement>,
    VariantProps<typeof badgeVariants> {}

function Badge({ className, tone, ...props }: BadgeProps) {
  return <span className={cn(badgeVariants({ tone }), className)} {...props} />;
}

export { Badge, badgeVariants };
