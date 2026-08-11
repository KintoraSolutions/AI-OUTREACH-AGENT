import * as React from "react";
import { cva, type VariantProps } from "class-variance-authority";
import { cn } from "@/lib/utils";

const alertVariants = cva(
  "relative w-full rounded-[10px] border px-4 py-3.5 text-sm [&>svg]:absolute [&>svg]:left-4 [&>svg]:top-4 [&>svg]:size-4 [&>svg~*]:pl-7",
  {
    variants: {
      variant: {
        default: "glass text-card-foreground",
        warning:
          "border-[color-mix(in_srgb,var(--amber)_40%,transparent)] bg-[var(--amber-dim)] text-[var(--amber-bright)] [&>svg]:text-[var(--amber)]",
        destructive:
          "border-[color-mix(in_srgb,var(--red)_40%,transparent)] bg-[var(--red-dim)] text-[var(--red-bright)] [&>svg]:text-[var(--red)]",
        info: "border-[color-mix(in_srgb,var(--cyan)_40%,transparent)] bg-[var(--cyan-dim)] text-[var(--cyan-bright)] [&>svg]:text-[var(--cyan)]",
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
  return <h5 className={cn("mb-1 font-medium leading-none", className)} {...props} />;
}

function AlertDescription({ className, ...props }: React.HTMLAttributes<HTMLParagraphElement>) {
  return <div className={cn("text-sm [&_p]:leading-relaxed", className)} {...props} />;
}

export { Alert, AlertTitle, AlertDescription };
