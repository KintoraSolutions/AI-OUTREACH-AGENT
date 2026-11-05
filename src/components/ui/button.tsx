import * as React from "react";
import { Slot } from "@radix-ui/react-slot";
import { cva, type VariantProps } from "class-variance-authority";
import { cn } from "@/lib/utils";

/**
 * Fluent 2 button. Square-ish 4px corners, a flat brand fill, and discrete
 * hover/pressed colors rather than a brightness filter — Fluent moves between
 * named ramp steps, which keeps contrast predictable in both themes (a
 * brightness filter on a dark fill can silently drop text contrast).
 */
const buttonVariants = cva(
  "inline-flex cursor-pointer select-none items-center justify-center gap-2 whitespace-nowrap rounded-md text-body1 font-semibold transition-colors duration-100 ease-[var(--ease-easy)] focus-visible:outline-offset-2 disabled:pointer-events-none disabled:opacity-45 [&_svg]:size-4 [&_svg]:shrink-0",
  {
    variants: {
      variant: {
        default:
          "bg-[var(--fl-brand)] text-[var(--fl-on-brand)] hover:bg-[var(--fl-brand-hover)] active:bg-[var(--fl-brand-pressed)]",
        destructive:
          "bg-[var(--fl-danger-fg)] text-white hover:brightness-110 active:brightness-95",
        // Fluent "secondary": neutral surface, accessible stroke.
        outline:
          "border border-[var(--fl-stroke-1)] bg-[var(--fl-bg-1)] text-foreground hover:bg-[var(--fl-bg-1-hover)] active:bg-[var(--fl-bg-4)]",
        secondary:
          "bg-[var(--fl-bg-4)] text-secondary-foreground hover:bg-[var(--fl-bg-5)] active:bg-[var(--fl-bg-6)]",
        // Fluent "subtle": transparent until hovered.
        ghost:
          "text-[var(--fl-fg-2)] hover:bg-[var(--muted)] hover:text-foreground active:bg-[var(--fl-subtle-pressed)]",
        link: "text-[var(--fl-brand-text)] underline-offset-4 hover:underline",
      },
      size: {
        default: "h-10 px-4",
        sm: "h-8 px-3 text-caption1",
        lg: "h-12 px-6 text-body2",
        icon: "size-10",
        "icon-sm": "size-8",
      },
    },
    defaultVariants: {
      variant: "default",
      size: "default",
    },
  },
);

export interface ButtonProps
  extends React.ButtonHTMLAttributes<HTMLButtonElement>,
    VariantProps<typeof buttonVariants> {
  asChild?: boolean;
}

const Button = React.forwardRef<HTMLButtonElement, ButtonProps>(
  ({ className, variant, size, asChild = false, ...props }, ref) => {
    const Comp = asChild ? Slot : "button";
    return (
      <Comp
        className={cn(buttonVariants({ variant, size, className }))}
        ref={ref}
        {...props}
      />
    );
  },
);
Button.displayName = "Button";

export { Button, buttonVariants };
