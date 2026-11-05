import { Skeleton } from "@/components/ui/skeleton";

/**
 * Dashboard skeleton.
 *
 * The previous version described a layout the page never had (a four-up tile
 * grid over two wide cards, against a two-up grid and a three-column analytics
 * strip), so the content visibly jumped on arrival. This mirrors the real
 * structure block for block: header, setup checklist, primary KPI row, compact
 * secondary strip, analytics strip, three breakdowns, follow-ups.
 *
 * The shapes are decoration, so they are hidden from assistive tech and the
 * whole thing is announced once as "Loading dashboard" instead of as a few
 * dozen anonymous boxes.
 */
export default function DashboardLoading() {
  return (
    <div role="status" aria-live="polite" className="space-y-5">
      <span className="sr-only">Loading dashboard</span>

      <div aria-hidden="true" className="space-y-5">
        {/* Page header */}
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div className="space-y-2">
            <Skeleton className="h-7 w-40" />
            <Skeleton className="h-4 w-60" />
          </div>
          <div className="flex gap-2">
            <Skeleton className="h-10 w-32" />
            <Skeleton className="h-10 w-28" />
          </div>
        </div>

        {/* Getting-started checklist */}
        <Skeleton className="h-64 w-full" />

        {/* Primary KPI row: four-up on lg, two-up on sm */}
        <div className="space-y-3">
          <div className="flex items-baseline justify-between">
            <Skeleton className="h-5 w-44" />
            <Skeleton className="h-4 w-32" />
          </div>
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
            {Array.from({ length: 4 }).map((_, i) => (
              <Skeleton key={i} className="h-[116px] w-full" />
            ))}
          </div>
          {/* Compact secondary strip */}
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
            {Array.from({ length: 4 }).map((_, i) => (
              <Skeleton key={i} className="h-14 w-full" />
            ))}
          </div>
        </div>

        {/* Analytics strip: wide chart + two stacked panels */}
        <div className="grid gap-3 lg:grid-cols-3">
          <Skeleton className="h-[340px] w-full lg:col-span-2" />
          <div className="flex flex-col gap-3">
            <Skeleton className="h-[164px] w-full" />
            <Skeleton className="h-[164px] w-full" />
          </div>
        </div>

        {/* Three breakdowns */}
        <div className="space-y-3">
          <Skeleton className="h-5 w-32" />
          <div className="grid gap-3 lg:grid-cols-3">
            {Array.from({ length: 3 }).map((_, i) => (
              <Skeleton key={i} className="h-60 w-full" />
            ))}
          </div>
        </div>

        {/* Follow-up reminders */}
        <Skeleton className="h-48 w-full" />
      </div>
    </div>
  );
}
