import * as React from "react";
import { Label } from "@/components/ui/label";
import { cn } from "@/lib/utils";

interface FieldProps {
  label: string;
  htmlFor: string;
  error?: string[];
  hint?: string;
  required?: boolean;
  className?: string;
  children: React.ReactNode;
}

export function Field({ label, htmlFor, error, hint, required, className, children }: FieldProps) {
  const message = error?.[0];
  const errorId = `${htmlFor}-error`;
  const hintId = `${htmlFor}-hint`;
  const describedBy = message ? errorId : hint ? hintId : undefined;

  // Associate the error/hint with the control and mark it invalid, so screen
  // readers announce the message and the field's error state.
  const isSingleElement = React.isValidElement(children);
  const control = isSingleElement
    ? React.cloneElement(children as React.ReactElement<React.HTMLAttributes<HTMLElement>>, {
        "aria-describedby": describedBy,
        "aria-invalid": message ? true : undefined,
      })
    : // Multiple children (e.g. an input plus a <datalist>, or a pair of range
      // inputs) cannot be cloned, so the association would silently vanish.
      // Wrap them in a labelled group instead of dropping it.
      (
        <div role="group" aria-labelledby={`${htmlFor}-label`} aria-describedby={describedBy}>
          {children}
        </div>
      );

  return (
    <div className={cn("flex flex-col gap-1.5", className)}>
      <Label id={`${htmlFor}-label`} htmlFor={htmlFor} className="text-body1 font-semibold">
        {label}
        {required ? (
          <>
            <span aria-hidden="true" className="text-[var(--fl-danger-fg)]">
              {" *"}
            </span>
            {/* The asterisk alone conveys "required" by glyph and color only. */}
            <span className="sr-only"> (required)</span>
          </>
        ) : null}
      </Label>
      {control}
      {hint && !message ? (
        <p id={hintId} className="text-caption1 text-[var(--fl-fg-3)]">
          {hint}
        </p>
      ) : null}
      {message ? (
        // role="alert" so a validation error returned by a server action is
        // announced when it appears, not only when the field regains focus.
        <p
          id={errorId}
          role="alert"
          className="flex items-start gap-1 text-caption1 font-medium text-[var(--fl-danger-fg)]"
        >
          {message}
        </p>
      ) : null}
    </div>
  );
}
