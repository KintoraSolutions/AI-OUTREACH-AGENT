import * as React from "react";
import { cn } from "@/lib/utils";
import { inputBaseClasses } from "@/components/ui/input";

/** Shares `inputBaseClasses` with Input/Select so the three stay in step. */
const Textarea = React.forwardRef<
  HTMLTextAreaElement,
  React.TextareaHTMLAttributes<HTMLTextAreaElement>
>(({ className, ...props }, ref) => {
  return (
    <textarea
      ref={ref}
      className={cn(
        inputBaseClasses,
        "min-h-20 resize-y py-2.5 leading-relaxed [height:auto]",
        className,
      )}
      {...props}
    />
  );
});
Textarea.displayName = "Textarea";

export { Textarea };
