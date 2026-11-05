import * as React from "react";
import { cn } from "@/lib/utils";

/**
 * Fluent input.
 *
 * The signature Fluent detail is the focus treatment: instead of a ring, the
 * field grows a 2px brand stroke along its bottom edge. It is drawn as an
 * inset box-shadow rather than a real border so focusing never shifts layout.
 *
 * `aria-invalid:` styling is new. `Field` (src/components/ui/field.tsx) has
 * always injected `aria-invalid` onto its child, but no control styled it — so
 * an invalid field looked identical to a valid one and the error was
 * text-only. Now the control itself turns red.
 */
export const inputBaseClasses =
  "flex h-10 w-full rounded-md border border-[var(--fl-stroke-1)] bg-[var(--fl-bg-1)] px-3 text-body1 text-foreground transition-[box-shadow,border-color] duration-100 placeholder:text-[var(--fl-fg-4)] hover:border-[var(--fl-fg-4)] focus-visible:border-[var(--fl-stroke-1)] focus-visible:shadow-[inset_0_-2px_0_0_var(--fl-brand-text)] disabled:cursor-not-allowed disabled:opacity-50 aria-[invalid=true]:border-[var(--fl-danger-fg)] aria-[invalid=true]:shadow-[inset_0_-2px_0_0_var(--fl-danger-fg)]";

const Input = React.forwardRef<HTMLInputElement, React.InputHTMLAttributes<HTMLInputElement>>(
  ({ className, type, ...props }, ref) => {
    return (
      <input
        type={type}
        ref={ref}
        className={cn(
          inputBaseClasses,
          "py-1 file:mr-3 file:border-0 file:bg-transparent file:text-body1 file:font-semibold file:text-[var(--fl-brand-text)]",
          className,
        )}
        {...props}
      />
    );
  },
);
Input.displayName = "Input";

export { Input };
