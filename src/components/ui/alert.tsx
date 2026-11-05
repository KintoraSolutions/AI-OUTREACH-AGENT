import * as React from "react";
import { cva, type VariantProps } from "class-variance-authority";
import { cn } from "@/lib/utils";

/**
 * Fluent MessageBar. Square 4px corners, a tinted body, and a 3px accent bar
 * on the leading edge so the severity is legible from the shape alone — not
 * only from hue. That matters for color-vision deficiency and it is what keeps
 * the bar readable in Windows High Contrast, where our tints are discarded.
 *
 * `success` is new: the old theme defined a `--success` token but never gave
 * Alert a variant that used it, so "it worked" messages had to borrow the
 * neutral default.
 */
const alertVariants = cva(
  "relative w-full overflow-hidden rounded-md border py-3 pl-11 pr-4 text-body1 [&>svg]:absolute [&>svg]:left-4 [&>svg]:top-3.5 [&>svg]:size-4 before:absolute before:inset-y-0 before:left-0 before:w-[3px]",
  {
    variants: {
      variant: {
        default: "glass text-card-foreground before:bg-[var(--fl-stroke-1)]",
        success:
          "border-[var(--fl-success-stroke)] bg-[var(--fl-success-bg)] text-[var(--fl-success-fg)] before:bg-[var(--fl-success-fg)] [&>svg]:text-[var(--fl-success-fg)]",
        warning:
          "border-[var(--fl-warning-stroke)] bg-[var(--fl-warning-bg)] text-[var(--fl-warning-fg)] before:bg-[var(--fl-warning-fg)] [&>svg]:text-[var(--fl-warning-fg)]",
        destructive:
          "border-[var(--fl-danger-stroke)] bg-[var(--fl-danger-bg)] text-[var(--fl-danger-fg)] before:bg-[var(--fl-danger-fg)] [&>svg]:text-[var(--fl-danger-fg)]",
        info: "border-[var(--fl-info-stroke)] bg-[var(--fl-info-bg)] text-[var(--fl-info-fg)] before:bg-[var(--fl-info-fg)] [&>svg]:text-[var(--fl-info-fg)]",
      },
    },
    defaultVariants: { variant: "default" },
  },
);

function Alert({
  className,
  variant,
  ...props
}: React.HTMLAttributes<HTMLDivElement> & VariantProps<typeof alertVariants>) {
  return <div role="alert" className={cn(alertVariants({ variant }), className)} {...props} />;
}

function AlertTitle({ className, ...props }: React.HTMLAttributes<HTMLHeadingElement>) {
  return <h5 className={cn("mb-1 font-semibold leading-tight", className)} {...props} />;
}

function AlertDescription({ className, ...props }: React.HTMLAttributes<HTMLParagraphElement>) {
  return <div className={cn("text-body1 [&_p]:leading-relaxed", className)} {...props} />;
}

export { Alert, AlertTitle, AlertDescription, alertVariants };
