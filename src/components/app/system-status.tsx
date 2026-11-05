import { CheckCircle2, CircleAlert } from "lucide-react";
import { providerStatus } from "@/lib/env";
import { Badge } from "@/components/ui/badge";

/**
 * Renders the configured/unconfigured state of each provider (docs/planning/build-plan.md 2B).
 * When a provider is not configured the dependent functionality is named as
 * unavailable rather than faked.
 *
 * State is never carried by color alone: each row pairs its tint with an icon
 * and a written status, so it survives color-vision deficiency, grayscale
 * printing, and Windows High Contrast.
 */
export function SystemStatus() {
  const providers = providerStatus();
  return (
    <ul className="divide-y divide-[var(--fl-stroke-2)] overflow-hidden rounded-md border border-[var(--fl-stroke-2)] bg-[var(--fl-bg-1)]">
      {providers.map((p) => (
        <li
          key={p.key}
          className="flex flex-wrap items-start justify-between gap-x-4 gap-y-2 px-4 py-3"
        >
          <div className="min-w-0 flex-1">
            <div className="flex flex-wrap items-center gap-2">
              <span className="text-body1 font-semibold text-[var(--fl-fg-1)]">{p.label}</span>
              <Badge tone="neutral">{p.phase}</Badge>
            </div>
            <p className="mt-1 text-caption1 leading-relaxed text-[var(--fl-fg-3)]">
              {p.configured ? (
                "Configured and available."
              ) : (
                <>
                  Unavailable: {p.unavailable}{" "}
                  <span className="font-semibold text-[var(--fl-fg-2)]">
                    Set {p.requiredEnv.join(", ")}.
                  </span>
                </>
              )}
            </p>
          </div>
          {p.configured ? (
            <span className="inline-flex shrink-0 items-center gap-1.5 rounded-md border border-[var(--fl-success-stroke)] bg-[var(--fl-success-bg)] px-2 py-0.5 text-caption1 font-semibold text-[var(--fl-success-fg)]">
              <CheckCircle2 aria-hidden="true" className="size-3.5" />
              Ready
            </span>
          ) : (
            <span className="inline-flex shrink-0 items-center gap-1.5 rounded-md border border-[var(--fl-warning-stroke)] bg-[var(--fl-warning-bg)] px-2 py-0.5 text-caption1 font-semibold text-[var(--fl-warning-fg)]">
              <CircleAlert aria-hidden="true" className="size-3.5" />
              Not configured
            </span>
          )}
        </li>
      ))}
    </ul>
  );
}
