import * as React from "react";
import { Inbox, type LucideIcon } from "lucide-react";
import { cn } from "@/lib/utils";

/**
 * Fluent empty state.
 *
 * Two changes over the previous version:
 *
 * 1. It no longer renders a solid `glass` card. Most call sites put this
 *    INSIDE a card, so a second opaque, shadowed rectangle produced a
 *    box-in-a-box. A dashed hairline on the parent's own surface reads as
 *    "this region is empty" instead of "here is another panel".
 * 2. `icon` is optional in the type (several existing call sites omit it) but
 *    never optional on screen — it falls back to a neutral inbox glyph, so an
 *    empty state can no longer render as a half-empty box.
 *
 * `size="sm"` is for empty states nested inside a card's content area, where
 * the full-height version wastes a screen of space.
 */

export interface EmptyStateProps {
  icon?: LucideIcon;
  title: string;
  description?: string;
  action?: React.ReactNode;
  /** `sm` for an empty state nested inside a card. */
  size?: "default" | "sm";
  className?: string;
}

export function EmptyState({
  icon: Icon = Inbox,
  title,
  description,
  action,
  size = "default",
  className,
}: EmptyStateProps) {
  const sm = size === "sm";
  return (
    <div
      className={cn(
        "flex flex-col items-center justify-center gap-3 rounded-md border border-dashed border-[var(--fl-stroke-1)] text-center",
        sm ? "px-4 py-7" : "px-6 py-12",
        className,
      )}
    >
      <span
        aria-hidden="true"
        className={cn(
          "flex items-center justify-center rounded-md border border-[var(--fl-brand-tint-stroke)] bg-[var(--fl-brand-tint)] text-[var(--fl-brand-text)]",
          sm ? "size-9" : "size-11",
        )}
      >
        <Icon className={sm ? "size-4" : "size-5"} strokeWidth={1.75} />
      </span>
      <div className="space-y-1">
        <p className={cn("font-semibold text-[var(--fl-fg-1)]", sm ? "text-body1" : "text-subtitle2")}>
          {title}
        </p>
        {description ? (
          <p className="mx-auto max-w-sm text-body1 text-[var(--fl-fg-2)]">{description}</p>
        ) : null}
      </div>
      {action ? <div className="mt-1">{action}</div> : null}
    </div>
  );
}
