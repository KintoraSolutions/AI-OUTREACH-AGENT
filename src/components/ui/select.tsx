import * as React from "react";
import { ChevronDown } from "lucide-react";
import { cn } from "@/lib/utils";
import { inputBaseClasses } from "@/components/ui/input";

/**
 * A styled native <select>. Native is intentional: it keeps the dependency
 * surface small, is fully accessible, works inside plain form submissions, and
 * on Windows it renders the real system dropdown — which is exactly right for
 * a Fluent interface.
 *
 * Shares `inputBaseClasses` with Input so the two never drift apart.
 */
const Select = React.forwardRef<
  HTMLSelectElement,
  React.SelectHTMLAttributes<HTMLSelectElement>
>(({ className, children, ...props }, ref) => {
  return (
    <div className="relative">
      <select
        ref={ref}
        className={cn(inputBaseClasses, "cursor-pointer appearance-none pr-9", className)}
        {...props}
      >
        {children}
      </select>
      <ChevronDown
        aria-hidden="true"
        className="pointer-events-none absolute right-2.5 top-1/2 size-4 -translate-y-1/2 text-[var(--fl-fg-3)]"
        strokeWidth={2}
      />
    </div>
  );
});
Select.displayName = "Select";

export { Select };
