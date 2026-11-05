import * as React from "react";
import { cva, type VariantProps } from "class-variance-authority";
import { cn } from "@/lib/utils";

/**
 * Fluent Card.
 *
 * The previous card had no variants at all, so every surface in the app —
 * a metric tile, a chart panel, a dialog body — rendered at the same
 * elevation. On a flat canvas that reads as a field of identical rectangles
 * with no hierarchy, which was the main reason the console looked "dull".
 *
 * `elevation` maps to the Fluent shadow ramp: `flat` for dense grids that
 * should recede, `rest` (shadow-2) for ordinary content, `raised` (shadow-8)
 * for the one thing on a page that should lead.
 */
const cardVariants = cva("rounded-md text-card-foreground transition-shadow duration-150", {
  variants: {
    elevation: {
      flat: "border border-[var(--hairline)] bg-[var(--surface)]",
      rest: "border border-[var(--hairline)] bg-[var(--surface)] shadow-2",
      raised: "border border-[var(--hairline)] bg-[var(--surface)] shadow-8",
      interactive:
        "border border-[var(--hairline)] bg-[var(--surface)] shadow-2 hover:shadow-8 hover:border-[var(--hairline-strong)]",
    },
    padding: {
      none: "",
      sm: "[&>*]:px-4 [&>*:first-child]:pt-4 [&>*:last-child]:pb-4",
      default: "",
    },
  },
  defaultVariants: { elevation: "rest", padding: "default" },
});

function Card({
  className,
  elevation,
  padding,
  ...props
}: React.HTMLAttributes<HTMLDivElement> & VariantProps<typeof cardVariants>) {
  return <div className={cn(cardVariants({ elevation, padding }), className)} {...props} />;
}

function CardHeader({ className, ...props }: React.HTMLAttributes<HTMLDivElement>) {
  return <div className={cn("flex flex-col gap-1 p-5", className)} {...props} />;
}

function CardTitle({ className, ...props }: React.HTMLAttributes<HTMLHeadingElement>) {
  return <h3 className={cn("text-subtitle2 font-semibold leading-tight", className)} {...props} />;
}

function CardDescription({ className, ...props }: React.HTMLAttributes<HTMLParagraphElement>) {
  return <p className={cn("text-body1 text-muted-foreground", className)} {...props} />;
}

function CardContent({ className, ...props }: React.HTMLAttributes<HTMLDivElement>) {
  return <div className={cn("p-5 pt-0", className)} {...props} />;
}

function CardFooter({ className, ...props }: React.HTMLAttributes<HTMLDivElement>) {
  return <div className={cn("flex items-center p-5 pt-0", className)} {...props} />;
}

export {
  Card,
  CardHeader,
  CardTitle,
  CardDescription,
  CardContent,
  CardFooter,
  cardVariants,
};
