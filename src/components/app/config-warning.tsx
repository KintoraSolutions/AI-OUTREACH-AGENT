import { CircleAlert } from "lucide-react";
import { providerStatus, type ProviderKey } from "@/lib/env";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";

/**
 * Inline configuration state for a provider. When the provider is unconfigured
 * it names exactly which functionality is unavailable and which env vars enable
 * it — never a fake "success" state (docs/planning/build-plan.md Section 2B, decision 6). Renders
 * nothing when the provider is configured.
 *
 * The leading icon is what fills the MessageBar's reserved icon column; without
 * it the copy sat against an empty indent, which is why these bars read as
 * unfinished.
 */
export function ConfigWarning({ providerKey }: { providerKey: ProviderKey }) {
  const info = providerStatus().find((p) => p.key === providerKey);
  if (!info || info.configured) return null;
  return (
    <Alert variant="warning">
      <CircleAlert aria-hidden="true" />
      <AlertTitle>{info.label} is not configured</AlertTitle>
      <AlertDescription>
        {info.unavailable} Set{" "}
        <span className="font-semibold">{info.requiredEnv.join(", ")}</span> to enable it.
      </AlertDescription>
    </Alert>
  );
}
