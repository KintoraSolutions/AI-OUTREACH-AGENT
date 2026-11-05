import * as React from "react";
import { cva, type VariantProps } from "class-variance-authority";
import { cn } from "@/lib/utils";

/**
 * Fluent Badge.
 *
 * Was a 10.5px uppercase mono chip with 0.08em tracking — a terminal
 * convention that fought the rest of the interface and set stage names in
 * shouty caps. Now a Fluent badge: 12px, semibold, sentence case, 4px radius,
 * so "Meeting booked" reads as a status rather than as a log level.
 *
 * `progress` is retained as an alias of `info` because STAGE_TONES in
 * src/lib/leads/constants.ts maps stages onto it.
 */
const badgeVariants = cva(
  "inline-flex items-center gap-1 whitespace-nowrap rounded-md border px-2 py-0.5 text-caption1 font-semibold [&_svg]:size-3 [&_svg]:shrink-0",
  {
    variants: {
      tone: {
        neutral: "border-[var(--fl-stroke-1)] bg-[var(--fl-bg-4)] text-[var(--fl-fg-2)]",
        info: "border-[var(--fl-info-stroke)] bg-[var(--fl-info-bg)] text-[var(--fl-info-fg)]",
        progress: "border-[var(--fl-info-stroke)] bg-[var(--fl-info-bg)] text-[var(--fl-info-fg)]",
        success:
          "border-[var(--fl-success-stroke)] bg-[var(--fl-success-bg)] text-[var(--fl-success-fg)]",
        warning:
          "border-[var(--fl-warning-stroke)] bg-[var(--fl-warning-bg)] text-[var(--fl-warning-fg)]",
        danger:
          "border-[var(--fl-danger-stroke)] bg-[var(--fl-danger-bg)] text-[var(--fl-danger-fg)]",
        brand:
          "border-[var(--fl-brand-tint-stroke)] bg-[var(--fl-brand-tint)] text-[var(--fl-brand-text)]",
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
