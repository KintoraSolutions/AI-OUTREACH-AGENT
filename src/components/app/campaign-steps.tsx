import Link from "next/link";
import { Check } from "lucide-react";
import { cn } from "@/lib/utils";

/**
 * Where you are in getting a campaign out the door.
 *
 * The workflow was previously implicit: a campaign page with a row of equally
 * weighted buttons and no indication of order, of what was already done, or of
 * what remained. This states the sequence and marks progress, so "what do I do
 * next" is answered by looking rather than by guessing.
 */

export type CampaignStepKey = "criteria" | "discover" | "score" | "resolve" | "launch";

export interface CampaignStep {
  key: CampaignStepKey;
  label: string;
  /** Short status line, e.g. "48 leads" or "4 to fix". */
  detail: string;
  done: boolean;
  href?: string;
}

export function CampaignSteps({
  steps,
  current,
}: {
  steps: CampaignStep[];
  current: CampaignStepKey;
}) {
  return (
    <nav aria-label="Campaign progress">
      <ol className="grid gap-x-3 gap-y-4 sm:grid-cols-3 lg:grid-cols-5">
        {steps.map((step, i) => {
          const active = step.key === current;
          const body = (
            <>
              <div className="flex items-center gap-2">
                <span
                  className={cn(
                    "grid size-6 shrink-0 place-items-center rounded-sm border text-caption2 font-semibold tabular-nums transition-colors",
                    active
                      ? "border-[var(--fl-brand)] bg-[var(--fl-brand)] text-[var(--fl-on-brand)]"
                      : step.done
                        ? "border-[var(--fl-success-stroke)] bg-[var(--fl-success-bg)] text-[var(--fl-success-fg)]"
                        : "border-[var(--fl-stroke-1)] text-[var(--fl-fg-3)]",
                  )}
                >
                  {step.done && !active ? <Check aria-hidden="true" className="size-3.5" /> : i + 1}
                </span>
                <span
                  className="h-px min-w-0 flex-1"
                  style={{
                    background: step.done ? "var(--fl-success-stroke)" : "var(--fl-stroke-2)",
                  }}
                />
              </div>
              <div
                className={cn(
                  "mt-2 text-body1 font-medium",
                  active ? "text-foreground" : "text-[var(--fl-fg-2)]",
                )}
              >
                {step.label}
              </div>
              <div className="text-caption1 text-[var(--fl-fg-3)]">{step.detail}</div>
            </>
          );

          return (
            <li key={step.key}>
              {step.href ? (
                <Link
                  href={step.href}
                  aria-current={active ? "step" : undefined}
                  className="block rounded-md transition-colors hover:bg-[var(--muted)]"
                >
                  {body}
                </Link>
              ) : (
                <div aria-current={active ? "step" : undefined} className="block rounded-md">
                  {body}
                </div>
              )}
            </li>
          );
        })}
      </ol>
    </nav>
  );
}
