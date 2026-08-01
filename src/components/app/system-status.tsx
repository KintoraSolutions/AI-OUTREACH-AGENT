import { CheckCircle2, CircleAlert } from "lucide-react";
import { providerStatus } from "@/lib/env";
import { Badge } from "@/components/ui/badge";

/**
 * Renders the configured/unconfigured state of each provider (plan.md 2B).
 * When a provider is not configured the dependent functionality is named as
 * unavailable rather than faked.
 */
export function SystemStatus() {
  const providers = providerStatus();
  return (
    <div className="divide-y rounded-lg border">
      {providers.map((p) => (
        <div key={p.key} className="flex items-start justify-between gap-4 px-4 py-3">
          <div className="min-w-0">
            <div className="flex items-center gap-2">
              <span className="text-sm font-medium">{p.label}</span>
              <Badge tone="neutral">{p.phase}</Badge>
            </div>
            {p.configured ? (
              <p className="mt-0.5 text-xs text-muted-foreground">Configured and available.</p>
            ) : (
              <p className="mt-0.5 text-xs text-muted-foreground">
                Unavailable: {p.unavailable} Set {p.requiredEnv.join(", ")}.
              </p>
            )}
          </div>
          {p.configured ? (
            <span className="flex shrink-0 items-center gap-1.5 text-xs font-medium text-emerald-600">
              <CheckCircle2 className="size-4" />
              Ready
            </span>
          ) : (
            <span className="flex shrink-0 items-center gap-1.5 text-xs font-medium text-amber-600">
              <CircleAlert className="size-4" />
              Not configured
            </span>
          )}
        </div>
      ))}
    </div>
  );
}
