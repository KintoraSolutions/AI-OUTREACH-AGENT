import { Skeleton } from "@/components/ui/skeleton";
import { Spinner } from "@/components/ui/spinner";

/**
 * Mirrors the tabbed settings page: header, one tab strip, then the cards of a
 * single section — not the nine-card scroll the page no longer has.
 */
export default function SettingsLoading() {
  return (
    <div className="space-y-5">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div className="space-y-2">
          <Skeleton className="h-7 w-32 rounded-md" />
          <Skeleton className="h-4 w-80 rounded-md" />
        </div>
        <Skeleton className="size-8 rounded-md" />
      </div>

      {/* Tab strip */}
      <div className="flex items-center gap-4 border-b border-[var(--hairline)] pb-2.5">
        <Skeleton className="h-5 w-28 rounded-md" />
        <Skeleton className="h-5 w-20 rounded-md" />
        <Skeleton className="h-5 w-20 rounded-md" />
        <Skeleton className="h-5 w-36 rounded-md" />
      </div>

      <div className="space-y-1">
        <Skeleton className="h-6 w-44 rounded-md" />
        <Skeleton className="h-4 w-96 max-w-full rounded-md" />
      </div>

      {Array.from({ length: 2 }).map((_, i) => (
        <div
          key={i}
          className="space-y-4 rounded-md border border-[var(--hairline)] bg-[var(--fl-bg-1)] p-5 shadow-2"
        >
          <Skeleton className="h-5 w-40 rounded-md" />
          <div className="grid gap-4 sm:grid-cols-2">
            <Skeleton className="h-10 w-full rounded-md" />
            <Skeleton className="h-10 w-full rounded-md" />
            <Skeleton className="h-10 w-full rounded-md" />
            <Skeleton className="h-10 w-full rounded-md" />
          </div>
        </div>
      ))}

      <Spinner size="sm" label="Loading settings" showLabel className="text-[var(--fl-fg-2)]" />
    </div>
  );
}
