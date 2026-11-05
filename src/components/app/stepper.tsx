import { Check } from "lucide-react";
import { cn } from "@/lib/utils";

/**
 * Fluent wizard stepper for the onboarding flow.
 *
 * Replaces the hardcoded literal "Step 2 of 2" that step two rendered as a
 * plain string — step one showed no progress indicator at all, so the flow
 * never told you how long it was.
 *
 * Completion is carried by an icon and by visually-hidden text, never by color
 * alone, and the list is a real <ol> so the count is exposed to assistive tech.
 */

export interface Step {
  id: string;
  label: string;
}

export function Stepper({
  steps,
  currentIndex,
  className,
}: {
  steps: Step[];
  /** Zero-based index of the step the user is on. */
  currentIndex: number;
  className?: string;
}) {
  return (
    <nav aria-label="Setup progress" className={className}>
      <ol className="flex items-center gap-2">
        {steps.map((step, i) => {
          const done = i < currentIndex;
          const current = i === currentIndex;

          return (
            <li key={step.id} className="flex min-w-0 flex-1 items-center gap-2 last:flex-none">
              <span
                aria-hidden="true"
                className={cn(
                  "flex size-6 shrink-0 items-center justify-center rounded-full text-caption1 font-semibold transition-colors",
                  done && "bg-[var(--fl-brand)] text-[var(--fl-on-brand)]",
                  current &&
                    "border-2 border-[var(--fl-brand-text)] bg-[var(--fl-brand-tint)] text-[var(--fl-brand-text)]",
                  !done && !current && "bg-[var(--fl-bg-4)] text-[var(--fl-fg-3)]",
                )}
              >
                {done ? <Check className="size-3.5" strokeWidth={3} /> : i + 1}
              </span>

              <span
                aria-current={current ? "step" : undefined}
                className={cn(
                  "truncate text-caption1",
                  current ? "font-semibold text-foreground" : "text-[var(--fl-fg-3)]",
                )}
              >
                {step.label}
                <span className="sr-only">
                  {done ? " (completed)" : current ? " (current step)" : " (not started)"}
                </span>
              </span>

              {i < steps.length - 1 ? (
                <span
                  aria-hidden="true"
                  className={cn(
                    "h-px min-w-4 flex-1 rounded-full",
                    done ? "bg-[var(--fl-brand)]" : "bg-[var(--fl-stroke-2)]",
                  )}
                />
              ) : null}
            </li>
          );
        })}
      </ol>
    </nav>
  );
}

/** The two-step first-run flow, shared by both onboarding pages. */
export const ONBOARDING_STEPS: Step[] = [
  { id: "about", label: "About your company" },
  { id: "review", label: "Review your AI" },
];
