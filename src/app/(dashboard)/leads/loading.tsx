import { Skeleton } from "@/components/ui/skeleton";
import { Spinner } from "@/components/ui/spinner";

/**
 * Mirrors the real page's rhythm: header, pipeline strip, one filter bar, table.
 * The Spinner supplies the `role="status"` / `aria-live` announcement, so the
 * wait is reported rather than only drawn.
 */
export default function LeadsLoading() {
  return (
    <div className="space-y-3">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div className="space-y-2">
          <Skeleton className="h-7 w-28 rounded-md" />
          <Skeleton className="h-4 w-56 rounded-md" />
        </div>
        <div className="flex gap-2">
          <Skeleton className="h-8 w-24 rounded-md" />
          <Skeleton className="h-8 w-20 rounded-md" />
          <Skeleton className="h-8 w-20 rounded-md" />
        </div>
      </div>

      {/* Pipeline health strip */}
      <div className="rounded-md border border-[var(--hairline)] bg-[var(--fl-bg-1)] px-2.5 py-2 shadow-2">
        <Skeleton className="h-5 w-64 rounded-md" />
      </div>

      {/* Filter bar */}
      <div className="flex flex-wrap items-center gap-2 rounded-md border border-[var(--hairline)] bg-[var(--fl-bg-1)] p-2.5 shadow-2">
        <Skeleton className="h-9 w-full max-w-xs rounded-md" />
        <Skeleton className="h-9 w-24 rounded-md" />
        <Skeleton className="h-9 w-40 rounded-md" />
        <Skeleton className="h-9 w-32 rounded-md" />
        <Skeleton className="h-9 w-36 rounded-md" />
      </div>

      <div className="overflow-hidden rounded-md border border-[var(--hairline)] bg-[var(--fl-bg-1)] shadow-2">
        <div className="flex items-center gap-4 border-b border-[var(--hairline-strong)] px-3 py-2.5">
          <Skeleton className="h-3.5 w-20 rounded-sm" />
          <Skeleton className="h-3.5 w-16 rounded-sm" />
          <Skeleton className="ml-auto h-3.5 w-24 rounded-sm" />
        </div>
        {Array.from({ length: 8 }).map((_, i) => (
          <div
            key={i}
            className="flex items-center gap-4 border-b border-[var(--hairline)] px-3 py-3 last:border-0"
          >
            <Skeleton className="size-4 rounded-sm" />
            <Skeleton className="h-4 w-48 rounded-md" />
            <Skeleton className="h-4 w-10 rounded-md" />
            <Skeleton className="ml-auto h-8 w-32 rounded-md" />
          </div>
        ))}
      </div>

      <Spinner size="sm" label="Loading leads" showLabel className="text-[var(--fl-fg-2)]" />
    </div>
  );
}
