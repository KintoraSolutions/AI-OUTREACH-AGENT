"use client";

import { useFormStatus } from "react-dom";
import { Button, type ButtonProps } from "@/components/ui/button";
import { Spinner } from "@/components/ui/spinner";

interface SubmitButtonProps extends ButtonProps {
  /** Label shown in place of the children while the form action runs. */
  pendingText?: string;
  /**
   * What assistive tech announces while the action runs. Defaults to
   * `pendingText`, then to the children when they are plain text.
   */
  pendingLabel?: string;
}

/**
 * Submit button that shows a spinner while the enclosing form action runs.
 *
 * The spinner carries `role="status"` and `aria-live="polite"` from the Spinner
 * primitive, so the pending state is announced rather than only drawn, and
 * `aria-busy` marks the control itself as working.
 */
export function SubmitButton({
  children,
  pendingText,
  pendingLabel,
  disabled,
  ...props
}: SubmitButtonProps) {
  const { pending } = useFormStatus();
  const announced =
    pendingLabel ??
    pendingText ??
    (typeof children === "string" ? `${children} in progress` : "Working");

  return (
    <Button type="submit" disabled={pending || disabled} aria-busy={pending} {...props}>
      {pending ? <Spinner size="xs" label={announced} /> : null}
      {pending && pendingText ? pendingText : children}
    </Button>
  );
}
