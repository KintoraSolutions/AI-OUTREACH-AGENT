import * as React from "react";
import { cn } from "@/lib/utils";

interface CommandBarProps {
  /** Primary commands, left-aligned in source order. */
  children?: React.ReactNode;
  /** Secondary commands (overflow menu, destructive actions), pushed right. */
  overflow?: React.ReactNode;
  /** Names the group for assistive tech. Defaults to "Page actions". */
  label?: string;
  className?: string;
}

/**
 * Fluent command bar: a single row of commands directly under the page title,
 * separated from the content by a hairline.
 *
 * Deliberately `role="group"` and not `role="toolbar"` — a toolbar promises
 * arrow-key roving focus, and the commands here are arbitrary children this
 * component cannot manage focus for. A group keeps the accessible name without
 * promising keyboard behaviour that does not exist.
 */
export function CommandBar({ children, overflow, label, className }: CommandBarProps) {
  if (!children && !overflow) return null;

  return (
    <div
      role="group"
      aria-label={label ?? "Page actions"}
      className={cn(
        "flex flex-wrap items-center gap-1 border-b border-[var(--fl-stroke-2)] pb-2",
        className,
      )}
    >
      {children ? <div className="flex flex-wrap items-center gap-1">{children}</div> : null}
      {overflow ? (
        <div className="ml-auto flex flex-wrap items-center gap-1">{overflow}</div>
      ) : null}
    </div>
  );
}
