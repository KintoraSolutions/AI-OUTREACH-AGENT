import * as React from "react";
import { cn } from "@/lib/utils";

/** Styled native checkbox, suitable for plain form submissions. */
const Checkbox = React.forwardRef<
  HTMLInputElement,
  Omit<React.InputHTMLAttributes<HTMLInputElement>, "type">
>(({ className, ...props }, ref) => {
  return (
    <input
      type="checkbox"
      ref={ref}
      className={cn(
        "size-4 cursor-pointer rounded-sm border-[var(--fl-stroke-1)] accent-[var(--fl-brand)] disabled:cursor-not-allowed disabled:opacity-50",
        className,
      )}
      {...props}
    />
  );
});
Checkbox.displayName = "Checkbox";

export { Checkbox };
