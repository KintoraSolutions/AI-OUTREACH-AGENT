import * as React from "react";
import { cn } from "@/lib/utils";

/**
 * Fluent DetailsList-style table.
 *
 * The old header style was 10.5px uppercase mono in `--faint-foreground`,
 * which measured roughly 3.5:1 against the card surface — below AA for text
 * that small. Headers are now 12px semibold in `--fl-fg-3`, which clears 4.5:1
 * in both themes.
 *
 * `TableCaption` is new: the primitive previously had no way to give a table
 * an accessible description.
 */

function Table({ className, ...props }: React.HTMLAttributes<HTMLTableElement>) {
  return (
    <div className="relative w-full overflow-x-auto">
      <table className={cn("w-full caption-bottom text-body1", className)} {...props} />
    </div>
  );
}

function TableHeader({ className, ...props }: React.HTMLAttributes<HTMLTableSectionElement>) {
  return (
    <thead
      className={cn("border-b border-[var(--fl-stroke-1)] [&_tr]:border-b-0", className)}
      {...props}
    />
  );
}

function TableBody({ className, ...props }: React.HTMLAttributes<HTMLTableSectionElement>) {
  return <tbody className={cn("[&_tr:last-child]:border-0", className)} {...props} />;
}

function TableRow({ className, ...props }: React.HTMLAttributes<HTMLTableRowElement>) {
  return (
    <tr
      className={cn(
        "border-b border-[var(--fl-stroke-2)] transition-colors hover:bg-[var(--fl-subtle-hover)] data-[state=selected]:bg-[var(--fl-brand-tint)]",
        className,
      )}
      {...props}
    />
  );
}

function TableHead({ className, ...props }: React.ThHTMLAttributes<HTMLTableCellElement>) {
  return (
    <th
      className={cn(
        "h-10 whitespace-nowrap px-3 text-left align-middle text-caption1 font-semibold text-[var(--fl-fg-3)]",
        className,
      )}
      {...props}
    />
  );
}

function TableCell({ className, ...props }: React.TdHTMLAttributes<HTMLTableCellElement>) {
  return <td className={cn("px-3 py-2.5 align-middle", className)} {...props} />;
}

function TableCaption({ className, ...props }: React.HTMLAttributes<HTMLTableCaptionElement>) {
  return (
    <caption className={cn("mt-3 text-caption1 text-[var(--fl-fg-3)]", className)} {...props} />
  );
}

export { Table, TableHeader, TableBody, TableRow, TableHead, TableCell, TableCaption };
