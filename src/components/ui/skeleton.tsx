import { cn } from "@/lib/utils";

/**
 * `aria-hidden` is deliberate: a skeleton is a visual placeholder, and without
 * it screen readers announce a run of empty boxes. Wrap a skeleton group in a
 * `role="status"` container with an sr-only label to announce loading instead.
 */
function Skeleton({ className, ...props }: React.HTMLAttributes<HTMLDivElement>) {
  return (
    <div
      aria-hidden="true"
      className={cn("animate-pulse rounded-md bg-[var(--fl-bg-4)]", className)}
      {...props}
    />
  );
}

export { Skeleton };
