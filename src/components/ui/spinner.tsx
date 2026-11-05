import * as React from "react";
import { cn } from "@/lib/utils";

/**
 * Fluent Spinner — a brand arc rotating on a neutral track.
 *
 * `label` is REQUIRED and is what assistive tech announces. The app previously
 * signalled every async state with a bare text swap and no live region, so a
 * screen-reader user got no notification that anything was happening.
 * Rendering the spinner inside `role="status"` fixes that at the primitive.
 */

const SIZES = {
  xs: "size-3.5 border-[1.5px]",
  sm: "size-4 border-2",
  md: "size-5 border-2",
  lg: "size-8 border-[3px]",
} as const;

export interface SpinnerProps extends React.HTMLAttributes<HTMLDivElement> {
  size?: keyof typeof SIZES;
  /** Announced to assistive tech. Also shown when `showLabel` is set. */
  label: string;
  showLabel?: boolean;
}

export function Spinner({
  size = "sm",
  label,
  showLabel = false,
  className,
  ...props
}: SpinnerProps) {
  return (
    <div
      role="status"
      aria-live="polite"
      className={cn("inline-flex items-center gap-2", className)}
      {...props}
    >
      <span
        aria-hidden="true"
        className={cn(
          "inline-block animate-spin rounded-full border-[var(--fl-stroke-1)] border-t-[var(--fl-brand-text)]",
          SIZES[size],
        )}
      />
      {showLabel ? (
        <span className="text-body1 text-[var(--fl-fg-2)]">{label}</span>
      ) : (
        <span className="sr-only">{label}</span>
      )}
    </div>
  );
}
