import { Skeleton } from "@/components/ui/skeleton";

export default function ReviewLoading() {
  return (
    <div role="status" className="space-y-4">
      <span className="sr-only">Loading the draft review queue</span>
      <Skeleton className="h-9 w-48" />
      <Skeleton className="h-10 w-full max-w-md" />
      <div className="grid gap-4 lg:grid-cols-[minmax(0,19rem)_minmax(0,1fr)]">
        <Skeleton className="h-96" />
        <Skeleton className="h-96" />
      </div>
    </div>
  );
}
