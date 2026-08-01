import { providerStatus, type ProviderKey } from "@/lib/env";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";

/**
 * Inline configuration state for a provider. When the provider is unconfigured
 * it names exactly which functionality is unavailable and which env vars enable
 * it — never a fake "success" state (plan.md Section 2B, decision 6). Renders
 * nothing when the provider is configured.
 */
export function ConfigWarning({ providerKey }: { providerKey: ProviderKey }) {
  const info = providerStatus().find((p) => p.key === providerKey);
  if (!info || info.configured) return null;
  return (
    <Alert variant="warning">
      <AlertTitle>{info.label} is not configured</AlertTitle>
      <AlertDescription>
        {info.unavailable} Set {info.requiredEnv.join(", ")} to enable it.
      </AlertDescription>
    </Alert>
  );
}
