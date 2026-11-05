import * as React from "react";
import Link from "next/link";
import { ChevronRight, type LucideIcon } from "lucide-react";
import { Card } from "@/components/ui/card";
import { cn } from "@/lib/utils";

/**
 * Fluent KPI tile.
 *
 * The previous tile was a `min-h-[92px]` box with a `text-[30px]` number and a
 * `text-[11px]` uppercase label — three hardcoded sizes, none of them on a
 * scale, and no way to act on the number it showed. Eight of them stacked in a
 * two-column grid was the main reason the dashboard read as a wall of digits.
 *
 * This version puts the number on the Fluent type ramp, gives the icon a real
 * brand-tinted container (Fluent's KPI pattern), and — the important part —
 * accepts an `href` so a tile becomes a link into the pre-filtered list it
 * counts. A metric you cannot click is a dead end.
 *
 * `label` / `value` / `icon` / `hint` / `accent` keep their original meaning so
 * existing call sites are unaffected.
 */

export interface MetricTileProps {
  label: string;
  value: number | string;
  /** Short clarifier under the value, e.g. the filter the number represents. */
  hint?: string;
  icon?: LucideIcon;
  /** Promote the tile: solid brand icon container and a brand-colored value. */
  accent?: boolean;
  /** Turn the whole tile into a link to the list this metric represents. */
  href?: string;
  /** Dense single-row variant for a secondary metrics strip. */
  compact?: boolean;
  className?: string;
}

function IconChip({
  icon: Icon,
  accent,
  compact,
}: {
  icon?: LucideIcon;
  accent?: boolean;
  compact?: boolean;
}) {
  if (!Icon) return null;
  return (
    <span
      aria-hidden="true"
      className={cn(
        "flex shrink-0 items-center justify-center rounded-md transition-colors duration-150 ease-[var(--ease-easy)]",
        compact ? "size-8" : "size-9",
        accent
          ? "bg-[var(--fl-brand)] text-[var(--fl-on-brand)]"
          : "bg-[var(--fl-brand-tint)] text-[var(--fl-brand-text)]",
      )}
    >
      <Icon className={compact ? "size-4" : "size-[18px]"} strokeWidth={1.75} />
    </span>
  );
}

export function MetricTile({
  label,
  value,
  hint,
  icon,
  accent,
  href,
  compact,
  className,
}: MetricTileProps) {
  const body = compact ? (
    <div className="flex items-center gap-3 px-3.5 py-3">
      <IconChip icon={icon} accent={accent} compact />
      {/* The compact row shows the label only. Stacking the hint under it left
          both strings fighting over ~110px and truncated them to "New le…" /
          "Discove…". The hint still reaches assistive tech through the link's
          aria-label below, where it costs no width. */}
      <span className="min-w-0 flex-1 truncate text-caption1 text-[var(--fl-fg-2)]">{label}</span>
      <span
        className={cn(
          "stat shrink-0 text-subtitle1 font-semibold",
          accent ? "text-[var(--fl-brand-text)]" : "text-[var(--fl-fg-1)]",
        )}
      >
        {value}
      </span>
      {href ? (
        <ChevronRight
          aria-hidden="true"
          className="size-4 shrink-0 text-[var(--fl-fg-3)] transition-transform duration-150 ease-[var(--ease-decelerate)] group-hover:translate-x-0.5"
          strokeWidth={2}
        />
      ) : null}
    </div>
  ) : (
    <div className="flex h-full flex-col gap-3 p-4">
      <div className="flex items-start justify-between gap-3">
        <p className="min-w-0 text-caption1 font-semibold text-[var(--fl-fg-3)]">{label}</p>
        <IconChip icon={icon} accent={accent} />
      </div>
      <p
        className={cn(
          "stat text-title2 font-semibold leading-none",
          accent ? "text-[var(--fl-brand-text)]" : "text-[var(--fl-fg-1)]",
        )}
      >
        {value}
      </p>
      <div className="mt-auto flex items-center gap-1">
        {hint ? <p className="min-w-0 truncate text-caption1 text-[var(--fl-fg-3)]">{hint}</p> : null}
        {href ? (
          <ChevronRight
            aria-hidden="true"
            className="ml-auto size-4 shrink-0 text-[var(--fl-fg-3)] transition-transform duration-150 ease-[var(--ease-decelerate)] group-hover:translate-x-0.5"
            strokeWidth={2}
          />
        ) : null}
      </div>
    </div>
  );

  if (!href) {
    return (
      <Card elevation="flat" className={cn("h-full", className)}>
        {body}
      </Card>
    );
  }

  // The link carries the full reading of the tile, so assistive tech announces
  // "High priority, 12, Score 70 or higher" instead of three loose fragments.
  const spoken = [label, String(value), hint].filter(Boolean).join(", ");

  return (
    <Link
      href={href}
      aria-label={spoken}
      className={cn("group block h-full rounded-md focus-visible:outline-offset-2", className)}
    >
      <Card elevation="interactive" className="h-full">
        {body}
      </Card>
    </Link>
  );
}
