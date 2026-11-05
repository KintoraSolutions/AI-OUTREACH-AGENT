import * as React from "react";
import Link from "next/link";
import { ChevronRight } from "lucide-react";
import { cn } from "@/lib/utils";

/**
 * Fluent breadcrumb. The app had no way back from a detail page other than the
 * browser button — `/leads/[id]` showed the clinic name as the page title with
 * no link to the list it came from.
 *
 * The trail is a real <nav aria-label="Breadcrumb">/<ol>, and the last crumb
 * is rendered as plain text with `aria-current="page"` rather than as a link
 * to the page you are already on.
 */

export interface Crumb {
  label: string;
  href?: string;
}

export function Breadcrumb({
  items,
  className,
}: {
  items: Crumb[];
  className?: string;
}) {
  if (items.length === 0) return null;

  return (
    <nav aria-label="Breadcrumb" className={cn("min-w-0", className)}>
      <ol className="flex min-w-0 items-center gap-1 text-caption1">
        {items.map((item, i) => {
          const isLast = i === items.length - 1;
          return (
            <li key={`${item.label}-${i}`} className="flex min-w-0 items-center gap-1">
              {i > 0 ? (
                <ChevronRight
                  aria-hidden="true"
                  className="size-3.5 shrink-0 text-[var(--fl-fg-4)]"
                  strokeWidth={2}
                />
              ) : null}
              {isLast || !item.href ? (
                <span
                  aria-current={isLast ? "page" : undefined}
                  className="truncate font-semibold text-foreground"
                >
                  {item.label}
                </span>
              ) : (
                <Link
                  href={item.href}
                  className="truncate rounded-sm text-[var(--fl-fg-2)] transition-colors hover:text-[var(--fl-brand-text)] hover:underline"
                >
                  {item.label}
                </Link>
              )}
            </li>
          );
        })}
      </ol>
    </nav>
  );
}
